import { Injectable, BadRequestException, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import { UploadInitDto } from './dto/upload-init.dto';

@Injectable()
export class FileService implements OnModuleInit {
    private readonly minioClient: Minio.Client;
    private readonly bucketName = process.env.MINIO_BUCKET || 'transcripthub-bucket';

    constructor(private readonly prisma: PrismaService) {
        this.minioClient = new Minio.Client({
            endPoint: process.env.MINIO_ENDPOINT || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: false,
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        });
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
    private async extractDurationFromStream(stream: any, mimeType: string, fileSize: number): Promise<number> {
        try {
            const { parseStream } = await (eval('import("music-metadata")') as Promise<typeof import('music-metadata')>);
            const metadata = await parseStream(stream, { mimeType, size: fileSize });
            stream.destroy();
            return metadata.format.duration ? Math.round(metadata.format.duration) : 0;
        } catch (error) {
            console.error('Failed to parse duration from stream:', error);
            if (stream && typeof stream.destroy === 'function') {
                stream.destroy();
            }
            return 0;
        }
    }

    private async extractDurationFromBuffer(buffer: Buffer, mimeType: string): Promise<number> {
        try {
            const { parseBuffer } = await (eval('import("music-metadata")') as Promise<typeof import('music-metadata')>);
            const metadata = await parseBuffer(buffer, mimeType);
            return metadata.format.duration ? Math.round(metadata.format.duration) : 0;
        } catch (error) {
            console.error('Failed to parse duration from buffer:', error);
            return 0;
        }
    }

    async initializeUpload(dto: UploadInitDto, uploaderId: number) {
        await this.ensureBucketExists();
        const fileId = uuidv4();
        const objectKey = `${uploaderId}/${fileId}_${dto.fileName}`;

        try {
            const presignedUrl = await this.minioClient.presignedPutObject(
                this.bucketName, // Tên phân vùng lưu trữ (ví dụ: 'transcripthub-bucket')
                objectKey, // Đường dẫn/Tên định danh duy nhất của tệp tin trong bucket (ví dụ: 'audio/file_123.mp3')
                2 * 60 * 60, // Thời gian tồn tại của URL (tính bằng giây), ở đây là 2 giờ
            );

            // Create pending metadata in Postgres
            const audioFile = await this.prisma.audioFile.create({
                data: {
                    id: fileId,
                    fileName: dto.fileName,
                    bucketName: this.bucketName,
                    objectKey,
                    fileSize: BigInt(dto.fileSize),
                    mimeType: dto.mimeType,
                    durationSeconds: 0,
                    status: 'UPLOADING',
                    uploaderId,
                },
            });

            const defaultChunkSize = 5 * 1024 * 1024; // 5MB chunk recommendation

            return {
                fileId: audioFile.id,
                presignedUrl,
                chunkSize: defaultChunkSize,
            };
        } catch (error) {
            console.error('Failed to initialize upload:', error);
            throw new BadRequestException('Failed to initialize upload link');
        }
    }

    async completeUpload(fileId: string, uploaderId: number) {
        const audioFile = await this.prisma.audioFile.findUnique({
            where: { id: fileId },
        });
        if (!audioFile) {
            throw new NotFoundException(`File with ID ${fileId} not found`);
        }
        if (audioFile.uploaderId !== uploaderId) {
            throw new ForbiddenException('You do not have permission to access this file');
        }
        if (audioFile.status !== 'UPLOADING') {
            return audioFile;
        }

        try {
            // Lấy thông tin tệp từ MinIO để xác minh kích thước và sự tồn tại
            const stat = await this.minioClient.statObject(audioFile.bucketName, audioFile.objectKey);
            const actualSize = stat.size;

            // Stream từ MinIO để trích xuất thời lượng âm thanh
            const stream = await this.minioClient.getObject(audioFile.bucketName, audioFile.objectKey);
            const duration = await this.extractDurationFromStream(stream, audioFile.mimeType, actualSize);

            // Cập nhật trạng thái và thông tin vào database
            return await this.prisma.audioFile.update({
                where: { id: fileId },
                data: {
                    fileSize: BigInt(actualSize),
                    durationSeconds: duration,
                    status: 'READY',
                },
            });
        } catch (error) {
            console.error(`Failed to complete upload for fileId: ${fileId}`, error);
            throw new BadRequestException('Failed to complete upload');
        }
    }

    async uploadSingleFile(file: Express.Multer.File, uploaderId: number) {
        if (!file || !file.buffer) {
            throw new BadRequestException('File buffer is empty');
        }
        await this.ensureBucketExists();

        const fileId = uuidv4();
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
                { 'content-type': mimeType }
            );

            // Extract duration from buffer
            const duration = await this.extractDurationFromBuffer(file.buffer, mimeType);

            // Save ready metadata in Postgres
            return await this.prisma.audioFile.create({
                data: {
                    id: fileId,
                    fileName: originalName,
                    bucketName: this.bucketName,
                    objectKey,
                    fileSize: BigInt(fileSize),
                    mimeType,
                    durationSeconds: duration,
                    status: 'READY',
                    uploaderId,
                },
            });
        } catch (error) {
            console.error('Failed to upload single file:', error);
            throw new BadRequestException('Failed to upload file');
        }
    }

    async streamAudio(fileId: string, rangeHeader: string | undefined, res: any) {
        const audioFile = await this.prisma.audioFile.findUnique({
            where: { id: fileId },
        });
        if (!audioFile || audioFile.status !== 'READY') {
            throw new NotFoundException('Audio file not found or not ready');
        }

        const fileSize = Number(audioFile.fileSize);
        const mimeType = audioFile.mimeType;

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', mimeType);

        if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
            // Return 200 OK for full file stream
            res.setHeader('Content-Length', fileSize.toString());
            try {
                const stream = await this.minioClient.getObject(audioFile.bucketName, audioFile.objectKey);
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

                if (isNaN(start) || start < 0 || start >= fileSize || end >= fileSize || start > end) {
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
                console.error(`Failed to stream partial content for range: ${rangeHeader}`, error);
                if (!res.headersSent) {
                    res.status(500).send('Streaming failed');
                }
            }
        }
    }

    async getMetadata(fileId: string) {
        const audioFile = await this.prisma.audioFile.findUnique({
            where: { id: fileId },
        });
        if (!audioFile) {
            throw new NotFoundException(`File with ID ${fileId} not found`);
        }
        return audioFile;
    }

    async deleteFile(fileId: string, uploaderId: number) {
        const audioFile = await this.prisma.audioFile.findUnique({
            where: { id: fileId },
        });
        if (!audioFile) {
            throw new NotFoundException(`File with ID ${fileId} not found`);
        }
        if (audioFile.uploaderId !== uploaderId) {
            throw new ForbiddenException('You do not have permission to delete this file');
        }

        try {
            await this.minioClient.removeObject(audioFile.bucketName, audioFile.objectKey);
        } catch (error) {
            console.error(`Failed to delete object ${audioFile.objectKey} from MinIO:`, error);
        }

        await this.prisma.audioFile.delete({
            where: { id: fileId },
        });

        return { message: 'File deleted successfully' };
    }

    async updateMetadata(fileId: string, fileName: string, uploaderId: number) {
        const audioFile = await this.prisma.audioFile.findUnique({
            where: { id: fileId },
        });
        if (!audioFile) {
            throw new NotFoundException(`File with ID ${fileId} not found`);
        }
        if (audioFile.uploaderId !== uploaderId) {
            throw new ForbiddenException('You do not have permission to modify this file');
        }

        return await this.prisma.audioFile.update({
            where: { id: fileId },
            data: { fileName },
        });
    }

    async listFiles(uploaderId: number, page: number, size: number) {
        const skip = page * size;
        const take = size;

        const [items, total] = await Promise.all([
            this.prisma.audioFile.findMany({
                where: { uploaderId },
                orderBy: { createdAt: 'desc' },
                skip,
                take,
            }),
            this.prisma.audioFile.count({
                where: { uploaderId },
            }),
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
        const file = await this.prisma.audioFile.findUnique({
            where: { id: fileId },
        });
        return !!file && (file.status === 'READY' || file.status === 'UPLOADING');
    }
}
