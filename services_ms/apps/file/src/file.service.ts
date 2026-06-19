import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException, ErrorCodes } from '../../../libs/common/src/exceptions/error-code';
import { FileRepository } from './repositories/file.repository';
import { KafkaGateway } from './gateways/kafka.gateway';
import * as Minio from 'minio';
import * as crypto from 'crypto';
import { UploadInitDto } from './dto/upload-init.dto';

@Injectable()
export class FileService implements OnModuleInit {
  private readonly minioClient: Minio.Client;
  private readonly bucketName: string;

  constructor(
    private readonly fileRepo: FileRepository,
    private readonly kafkaGateway: KafkaGateway,
    private readonly configService: ConfigService,
  ) {
    this.bucketName = this.configService.get<string>('MINIO_BUCKET', 'transcripthub-bucket');
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: this.configService.get<number>('MINIO_PORT', 9000),
      useSSL: false,
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  /**
   * Tạo SigV4 Presigned PUT URL thuần crypto — KHÔNG cần kết nối TCP đến MinIO.
   *
   * Tại sao không dùng minioClient.presignedPutObject():
   *   MinIO JS SDK gọi getBucketRegion() (network call) trước khi ký.
   *   Từ bên trong Docker container, "localhost:9000" không resolve được,
   *   nên mọi client dùng endpoint "localhost" đều bị ECONNREFUSED.
   *
   * Giải pháp: Tự ký theo chuẩn AWS SigV4 bằng crypto built-in của Node.js.
   *   - Dùng host = MINIO_PUBLIC_ENDPOINT (localhost:9000) trong chữ ký
   *   - Browser PUT đến localhost:9000 với Host: localhost:9000 → khớp chữ ký ✅
   */
  private generatePresignedPutUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): string {
    const publicHost = this.configService.get<string>('MINIO_PUBLIC_ENDPOINT', 'localhost');
    const publicPort =
      this.configService.get<string>('MINIO_PUBLIC_PORT') ||
      this.configService.get<string>('MINIO_PORT') ||
      '9000';
    const host = `${publicHost}:${publicPort}`;
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin');
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin');
    const region = 'us-east-1'; // MinIO luôn dùng region mặc định này
    const service = 's3';

    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const amzdate = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, ''); // YYYYMMDDTHHMMSSZ

    const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
    const credential = `${accessKey}/${credentialScope}`;

    // URI encode mỗi phần của objectKey nhưng giữ nguyên dấu "/" (Sử dụng chuẩn mã hóa nghiêm ngặt SigV4)
    const strictUriEncode = (str: string) =>
      encodeURIComponent(str).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
    const encodedKey = objectKey
      .split('/')
      .map((p) => strictUriEncode(p))
      .join('/');
    const canonicalUri = `/${this.bucketName}/${encodedKey}`;

    // Query params phải được sắp xếp theo thứ tự alphabet
    const params: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzdate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    };
    const sortedKeys = Object.keys(params).sort();
    const canonicalQueryString = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');

    // Canonical request theo chuẩn SigV4
    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      'host', // signedHeaders
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    // String to sign
    const hashedCanonical = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzdate,
      credentialScope,
      hashedCanonical,
    ].join('\n');

    // Derive signing key (HMAC chain)
    const kDate = crypto
      .createHmac('sha256', `AWS4${secretKey}`)
      .update(datestamp)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto
      .createHmac('sha256', kRegion)
      .update(service)
      .digest();
    const kSigning = crypto
      .createHmac('sha256', kService)
      .update('aws4_request')
      .digest();

    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');

    const queryString = canonicalQueryString + `&X-Amz-Signature=${signature}`;
    return `http://${host}${canonicalUri}?${queryString}`;
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    try {
      const found = await this.minioClient.bucketExists(this.bucketName);
      if (!found) {
        await this.minioClient.makeBucket(this.bucketName);
        console.log(`📦 Created MinIO bucket: ${this.bucketName}`);
      } else {
        console.log(`📦 MinIO bucket exists: ${this.bucketName}`);
      }
    } catch (error) {
      console.error('Failed to verify/create MinIO bucket:', error);
    }
  }
  private async extractDurationFromStream(
    stream: any,
    mimeType: string,
    fileSize: number,
  ): Promise<number> {
    try {
      const { parseStream } = await (eval(
        'import("music-metadata")',
      ) as Promise<typeof import('music-metadata')>);
      const metadata = await parseStream(stream, { mimeType, size: fileSize });
      stream.destroy();
      return metadata.format.duration
        ? Math.round(metadata.format.duration)
        : 0;
    } catch (error) {
      console.error('Failed to parse duration from stream:', error);
      if (stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }
      return 0;
    }
  }

  private async extractDurationFromBuffer(
    buffer: Buffer,
    mimeType: string,
  ): Promise<number> {
    try {
      const { parseBuffer } = await (eval(
        'import("music-metadata")',
      ) as Promise<typeof import('music-metadata')>);
      const metadata = await parseBuffer(buffer, mimeType);
      return metadata.format.duration
        ? Math.round(metadata.format.duration)
        : 0;
    } catch (error) {
      console.error('Failed to parse duration from buffer:', error);
      return 0;
    }
  }

  async initializeUpload(dto: UploadInitDto, uploaderId: number) {
    await this.ensureBucketExists();
    const fileId = crypto.randomUUID();
    const objectKey = `${uploaderId}/${fileId}_${dto.fileName}`;

    try {
      // Dùng custom SigV4 generator (không cần TCP) để tạo presigned URL với public endpoint
      const presignedUrl = this.generatePresignedPutUrl(objectKey, 2 * 60 * 60);

      // Create pending metadata in Postgres via Repository
      const audioFile = await this.fileRepo.create({
        id: fileId,
        fileName: dto.fileName,
        bucketName: this.bucketName,
        objectKey,
        fileSize: BigInt(dto.fileSize),
        mimeType: dto.mimeType,
        durationSeconds: 0,
        status: 'UPLOADING',
        uploaderId,
      });

      const defaultChunkSize = 5 * 1024 * 1024; // 5MB chunk recommendation

      return {
        fileId: audioFile.id,
        presignedUrl,
        chunkSize: defaultChunkSize,
      };
    } catch (error) {
      console.error('Failed to initialize upload:', error);
      throw new AppException(ErrorCodes.FILE_UPLOAD_FAILED, 'Failed to initialize upload link');
    }
  }

  async completeUpload(fileId: string, uploaderId: number) {
    const audioFile = await this.fileRepo.findById(fileId);
    if (!audioFile) {
      throw new AppException(ErrorCodes.FILE_NOT_FOUND, `File with ID ${fileId} not found`);
    }
    if (audioFile.uploaderId !== uploaderId) {
      throw new AppException(
        ErrorCodes.UNAUTHORIZED,
        'You do not have permission to access this file',
      );
    }
    if (audioFile.status !== 'UPLOADING') {
      return audioFile;
    }

    try {
      // Lấy thông tin tệp từ MinIO để xác minh kích thước và sự tồn tại
      const stat = await this.minioClient.statObject(
        audioFile.bucketName,
        audioFile.objectKey,
      );
      const actualSize = stat.size;

      // Stream từ MinIO để trích xuất thời lượng âm thanh
      const stream = await this.minioClient.getObject(
        audioFile.bucketName,
        audioFile.objectKey,
      );
      const duration = await this.extractDurationFromStream(
        stream,
        audioFile.mimeType,
        actualSize,
      );

      // Cập nhật trạng thái và thông tin vào database via Repository
      const updated = await this.fileRepo.update(fileId, {
        fileSize: BigInt(actualSize),
        durationSeconds: duration,
        status: 'READY',
      });
      this.publishUploadedEvent(updated);
      return updated;
    } catch (error) {
      console.error(`Failed to complete upload for fileId: ${fileId}`, error);
      throw new AppException(ErrorCodes.FILE_MERGE_FAILED, 'Failed to complete upload');
    }
  }

  async uploadSingleFile(file: Express.Multer.File, uploaderId: number) {
    if (!file || !file.buffer) {
      throw new AppException(ErrorCodes.FILE_EMPTY, 'File buffer is empty');
    }
    await this.ensureBucketExists();

    const fileId = crypto.randomUUID();
    const originalName = file.originalname || `audio_${fileId}`;
    const objectKey = `${uploaderId}/${fileId}_${originalName}`;
    const fileSize = file.size;
    const mimeType = file.mimetype || 'audio/mpeg';

    try {
      // Upload to MinIO
      await this.minioClient.putObject(
        this.bucketName,
        objectKey,
        file.buffer,
        fileSize,
        { 'content-type': mimeType },
      );

      // Extract duration from buffer
      const duration = await this.extractDurationFromBuffer(
        file.buffer,
        mimeType,
      );

      // Save ready metadata in Postgres via Repository
      const created = await this.fileRepo.create({
        id: fileId,
        fileName: originalName,
        bucketName: this.bucketName,
        objectKey,
        fileSize: BigInt(fileSize),
        mimeType,
        durationSeconds: duration,
        status: 'READY',
        uploaderId,
      });
      this.publishUploadedEvent(created);
      return created;
    } catch (error) {
      console.error('Failed to upload single file:', error);
      throw new AppException(ErrorCodes.FILE_UPLOAD_FAILED, 'Failed to upload file');
    }
  }

  async streamAudio(fileId: string, rangeHeader: string | undefined, res: any) {
    const audioFile = await this.fileRepo.findById(fileId);
    if (!audioFile || audioFile.status !== 'READY') {
      throw new AppException(ErrorCodes.FILE_NOT_FOUND, 'Audio file not found or not ready');
    }

    const fileSize = Number(audioFile.fileSize);
    const mimeType = audioFile.mimeType;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
      // Return 200 OK for full file stream
      res.setHeader('Content-Length', fileSize.toString());
      try {
        const stream = await this.minioClient.getObject(
          audioFile.bucketName,
          audioFile.objectKey,
        );
        stream.pipe(res);
      } catch (error) {
        console.error('Failed to stream full file from MinIO:', error);
        if (!res.headersSent) {
          res.status(500).send('Streaming failed');
        }
      }
    } else {
      // Return 206 Partial Content for browser seeking
      try {
        const rangeValue = rangeHeader.replace(/bytes=/, '').trim();
        const parts = rangeValue.split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (
          isNaN(start) ||
          start < 0 ||
          start >= fileSize ||
          end >= fileSize ||
          start > end
        ) {
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          res.status(416).send('Requested range not satisfiable');
          return;
        }

        const contentLength = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', contentLength.toString());

        const stream = await this.minioClient.getPartialObject(
          audioFile.bucketName,
          audioFile.objectKey,
          start,
          contentLength,
        );
        stream.pipe(res);
      } catch (error) {
        console.error(
          `Failed to stream partial content for range: ${rangeHeader}`,
          error,
        );
        if (!res.headersSent) {
          res.status(500).send('Streaming failed');
        }
      }
    }
  }

  async getMetadata(fileId: string) {
    const audioFile = await this.fileRepo.findById(fileId);
    if (!audioFile) {
      throw new AppException(ErrorCodes.FILE_NOT_FOUND, `File with ID ${fileId} not found`);
    }
    return audioFile;
  }

  async deleteFile(fileId: string, uploaderId: number) {
    const audioFile = await this.fileRepo.findById(fileId);
    if (!audioFile) {
      throw new AppException(ErrorCodes.FILE_NOT_FOUND, `File with ID ${fileId} not found`);
    }
    if (audioFile.uploaderId !== uploaderId) {
      throw new AppException(
        ErrorCodes.UNAUTHORIZED,
        'You do not have permission to delete this file',
      );
    }

    try {
      await this.minioClient.removeObject(
        audioFile.bucketName,
        audioFile.objectKey,
      );
    } catch (error) {
      console.error(
        `Failed to delete object ${audioFile.objectKey} from MinIO:`,
        error,
      );
    }

    // Delete corresponding transcript if exists via Repository
    try {
      await this.fileRepo.deleteTranscriptsByFileId(fileId);
      console.log(`Deleted corresponding transcripts for fileId: ${fileId}`);
    } catch (error) {
      console.error(`Failed to delete transcript for fileId ${fileId}:`, error);
    }

    await this.fileRepo.delete(fileId);

    return { message: 'File deleted successfully' };
  }

  async updateMetadata(fileId: string, fileName: string, uploaderId: number) {
    const audioFile = await this.fileRepo.findById(fileId);
    if (!audioFile) {
      throw new AppException(ErrorCodes.FILE_NOT_FOUND, `File with ID ${fileId} not found`);
    }
    if (audioFile.uploaderId !== uploaderId) {
      throw new AppException(
        ErrorCodes.UNAUTHORIZED,
        'You do not have permission to modify this file',
      );
    }

    return await this.fileRepo.update(fileId, { fileName });
  }

  async listFiles(uploaderId: number, page: number, size: number) {
    const skip = page * size;
    const take = size;

    const [items, total] = await Promise.all([
      this.fileRepo.findMany(skip, take),
      this.fileRepo.count(),
    ]);

    return {
      items,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
    };
  }

  async checkFileExists(fileId: string) {
    const file = await this.fileRepo.findById(fileId);
    return !!file && (file.status === 'READY' || file.status === 'UPLOADING');
  }

  private publishUploadedEvent(audioFile: any) {
    try {
      const event = {
        eventId: crypto.randomUUID(),
        eventType: 'AUDIO_FILE_UPLOADED',
        timestamp: new Date().toISOString(),
        payload: {
          fileId: audioFile.id,
          fileName: audioFile.fileName,
          bucketName: audioFile.bucketName,
          objectKey: audioFile.objectKey,
          fileSize: Number(audioFile.fileSize),
          mimeType: audioFile.mimeType,
          durationSeconds: audioFile.durationSeconds,
          uploaderId: audioFile.uploaderId,
        },
      };
      this.kafkaGateway.emit('audio-file-events', {
        key: audioFile.id,
        value: JSON.stringify(event),
      });
      console.log(
        `📡 Published AUDIO_FILE_UPLOADED event to Kafka for file: ${audioFile.id}`,
      );
    } catch (err) {
      console.error('Failed to publish event to Kafka:', err);
    }
  }
}
