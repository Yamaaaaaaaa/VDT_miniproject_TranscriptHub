import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientKafka } from '@nestjs/microservices';
import { AppException, ErrorCodes } from '../../../libs/common/src/exceptions/error-code';
import { TranscriptRepository } from './repositories/transcript.repository';
import { FileGateway } from './gateways/file.gateway';

// Simple custom Semaphore for concurrency control without extra dependencies
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.permits++;
    }
  }
}

@Injectable()
export class TranscriptService implements OnModuleInit {
  private readonly semaphore = new Semaphore(3); // MAX_CONCURRENT_TRANSCRIPTIONS = 3

  constructor(
    private readonly transcriptRepo: TranscriptRepository,
    private readonly fileGateway: FileGateway,
    private readonly configService: ConfigService,
    @Inject('TRANSCRIPT_KAFKA_PRODUCER') private readonly kafkaProducer: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaProducer.connect();
    console.log('📡 TranscriptService connected to Kafka Producer client');
    
    // Recovery of stuck processing jobs on startup
    await this.recoverStuckJobs();
  }

  private async recoverStuckJobs() {
    try {
      console.log('[Startup Recovery] Checking for stuck PROCESSING transcriptions...');
      const stuckTranscripts = await this.transcriptRepo.findByStatus('PROCESSING');
      if (stuckTranscripts.length > 0) {
        console.log(`[Startup Recovery] Found ${stuckTranscripts.length} stuck PROCESSING transcriptions. Re-enqueueing...`);
        for (const transcript of stuckTranscripts) {
          const jobPayload = {
            fileId: transcript.audioFileId,
            transcriptId: transcript.id,
            attempt: 1,
          };
          console.log(`[Startup Recovery] Re-enqueueing job for fileId: ${transcript.audioFileId}, transcriptId: ${transcript.id}`);
          this.kafkaProducer.emit('transcription-jobs', {
            key: String(transcript.id),
            value: JSON.stringify(jobPayload),
          });
        }
      } else {
        console.log('[Startup Recovery] No stuck PROCESSING transcriptions found.');
      }
    } catch (err) {
      console.error('[Startup Recovery] Failed to recover stuck transcriptions:', err);
    }
  }

  async getTranscriptByAudioFileId(audioFileId: string) {
    console.log(`Fetching transcript for audioFileId: ${audioFileId}`);
    const transcript = await this.transcriptRepo.findByAudioFileId(audioFileId);
    if (!transcript) {
      throw new AppException(
        ErrorCodes.TRANSCRIPT_NOT_FOUND,
        `Transcript not found for audio file ${audioFileId}`,
      );
    }
    return transcript;
  }

  async getAllTranscripts(page: number, size: number, search?: string) {
    console.log(`Fetching all transcripts - page: ${page}, size: ${size}, search: ${search}`);
    const skip = page * size;
    const take = size;

    let matchedFileIds: string[] | undefined = undefined;
    if (search) {
      try {
        const matchedFiles = await this.fileGateway.searchFiles(search);
        if (matchedFiles && matchedFiles.length > 0) {
          matchedFileIds = matchedFiles.map((f) => f.id);
        }
      } catch (err) {
        console.warn('Failed to search files in TranscriptService:', err.message);
      }
    }

    const [items, total] = await Promise.all([
      this.transcriptRepo.findMany(skip, take, search, matchedFileIds),
      this.transcriptRepo.count(search, matchedFileIds),
    ]);

    const totalPages = Math.ceil(total / size);

    return {
      content: items,
      totalElements: total,
      pageNumber: page,
      pageSize: size,
      totalPages: totalPages,
      first: page === 0,
      last: page >= totalPages - 1 || totalPages === 0,
    };
  }

  async generateTranscriptAsync(fileId: string) {
    console.log(`Checking transcript status for fileId: ${fileId}`);
    await this.enqueueTranscriptionJob(fileId);
  }

  /**
   * Force re-run AI transcription từ đầu — kể cả khi đã COMPLETED.
   * Reset nội dung cũ về rỗng, chuyển status về PROCESSING, rồi emit job mới.
   */
  async reTranscribe(fileId: string) {
    console.log(`[Re-Transcribe] Force re-transcription requested for fileId: ${fileId}`);

    // Verify file exists
    try {
      const exists = await this.fileGateway.checkFileExists(fileId);
      if (!exists) {
        throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND, 'Audio file not found in File Service');
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(ErrorCodes.INVALID_KEY, 'Failed to verify audio file existence');
    }

    let transcript = await this.transcriptRepo.findByAudioFileId(fileId);

    if (!transcript) {
      // Chưa có → tạo mới và enqueue bình thường
      transcript = await this.transcriptRepo.create(fileId);
    } else if (transcript.status === 'PROCESSING') {
      // Đang xử lý → tránh queue chồng
      console.log(`[Re-Transcribe] Transcript for fileId ${fileId} is already PROCESSING. Skipping.`);
      return { message: 'Transcript is already being processed', transcript };
    } else {
      // COMPLETED hoặc FAILED → force reset về PROCESSING, xóa nội dung cũ
      console.log(`[Re-Transcribe] Resetting transcript ID ${transcript.id} from ${transcript.status} to PROCESSING.`);
      transcript = await this.transcriptRepo.updateStatusAndContent(
        transcript.id,
        'PROCESSING',
        '',
        { segments: [] },
      );
    }

    const jobPayload = {
      fileId,
      transcriptId: transcript.id,
      attempt: 1,
      forceReRun: true, // Flag để worker biết đây là re-run
    };

    console.log(`[Re-Transcribe][Kafka] Publishing re-run job for fileId: ${fileId}, transcriptId: ${transcript.id}`);
    this.kafkaProducer.emit('transcription-jobs', {
      key: String(transcript.id),
      value: JSON.stringify(jobPayload),
    });

    return { message: 'Re-transcription job enqueued successfully', transcript };
  }

  async generateTranscriptManually(fileId: string) {
    console.log(
      `Manually requesting transcript generation for fileId: ${fileId}`,
    );

    // Verify file exists in file service
    try {
      const exists = await this.fileGateway.checkFileExists(fileId);
      if (!exists) {
        throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND, 'Audio file not found in File Service');
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      console.error('Failed to check file existence in file-service', error);
      throw new AppException(ErrorCodes.INVALID_KEY, 'Failed to verify audio file existence');
    }

    return this.enqueueTranscriptionJob(fileId);
  }

  async enqueueTranscriptionJob(fileId: string) {
    let transcript = await this.transcriptRepo.findByAudioFileId(fileId);

    if (!transcript) {
      transcript = await this.transcriptRepo.create(fileId);
    } else if (transcript.status === 'FAILED') {
      transcript = await this.transcriptRepo.updateStatusAndContent(
        transcript.id,
        'PROCESSING',
        '',
        { segments: [] },
      );
    } else if (transcript.status === 'PROCESSING') {
      console.log(`Transcript for fileId ${fileId} is already in PROCESSING state. Re-enqueueing.`);
    } else {
      console.log(
        `Transcript for fileId ${fileId} already exists in state: ${transcript.status}`,
      );
      return transcript;
    }

    const jobPayload = {
      fileId,
      transcriptId: transcript.id,
      attempt: 1,
    };

    console.log(`[Kafka Producer] Publishing job to transcription-jobs for fileId: ${fileId}, transcriptId: ${transcript.id}`);
    this.kafkaProducer.emit('transcription-jobs', {
      key: String(transcript.id),
      value: JSON.stringify(jobPayload),
    });

    return transcript;
  }

  async processTranscriptionJob(payload: { fileId: string; transcriptId: number; attempt: number }) {
    const { fileId, transcriptId, attempt } = payload;
    
    // Acquire semaphore permit to respect the concurrency limit of 3
    console.log(`[Job Worker] Acquiring semaphore permit for transcript ID: ${transcriptId}`);
    await this.semaphore.acquire();
    console.log(`[Job Worker] Semaphore permit acquired. Processing transcript ID: ${transcriptId} (Attempt: ${attempt})`);
    
    try {
      // 1. Double check current DB status to avoid redundant processing if already COMPLETED
      //    Ngoại lệ: nếu forceReRun=true (từ re-transcribe endpoint), bỏ qua check COMPLETED
      const transcript = await this.transcriptRepo.findById(transcriptId);
      const isForceReRun = (payload as any).forceReRun === true;
      if (!transcript) {
        console.log(`[Job Worker] Transcript ID ${transcriptId} not found. Skipping.`);
        return;
      }
      if (transcript.status === 'COMPLETED' && !isForceReRun) {
        console.log(`[Job Worker] Transcript ID ${transcriptId} is already completed. Skipping.`);
        return;
      }

      // 2. Perform AI Transcription
      const result = await this.transcribe(fileId);
      
      // 3. Save successful result to database
      await this.updateTranscriptStatus(
        transcriptId,
        'COMPLETED',
        result.rawText,
        { segments: result.segments },
      );
      
      console.log(`[Job Worker] Successfully transcribed fileId: ${fileId}, transcriptId: ${transcriptId}`);
    } catch (err: any) {
      console.error(
        `[Job Worker] Error transcribing fileId: ${fileId}, transcriptId: ${transcriptId} (Attempt: ${attempt})`,
        err,
      );

      const isRateLimit = err?.status === 429 || err?.message?.includes('429');
      const maxRetries = 3;

      if (attempt < maxRetries) {
        const nextAttempt = attempt + 1;
        const backoffDelay = Math.pow(2, attempt) * 2000; // Exponential backoff: 2s, 4s, 8s
        
        console.log(`[Job Worker] Retrying in ${backoffDelay}ms (attempt ${nextAttempt}/${maxRetries})...`);
        
        // Wait for the backoff duration inside this asynchronous context
        await new Promise<void>((resolve) => setTimeout(resolve, backoffDelay));

        const retryPayload = {
          fileId,
          transcriptId,
          attempt: nextAttempt,
        };

        // Publish job back to queue
        this.kafkaProducer.emit('transcription-jobs', {
          key: String(transcriptId),
          value: JSON.stringify(retryPayload),
        });
      } else {
        console.error(`[Job Worker] Max retries (${maxRetries}) reached for transcript ID: ${transcriptId}. Sending to DLQ.`);

        // Update database to FAILED status
        await this.updateTranscriptStatus(transcriptId, 'FAILED', '', {
          segments: [],
          error: err?.message || String(err),
        });

        // Emit to Dead Letter Queue (DLQ)
        const dlqPayload = {
          fileId,
          transcriptId,
          attempt,
          error: err?.message || String(err),
          failedAt: new Date().toISOString(),
        };

        this.kafkaProducer.emit('transcription-dlq', {
          key: String(transcriptId),
          value: JSON.stringify(dlqPayload),
        });
      }
    } finally {
      // Always release semaphore permit
      this.semaphore.release();
      console.log(`[Job Worker] Released semaphore permit for transcript ID: ${transcriptId}`);
    }
  }

  private async updateTranscriptStatus(
    transcriptId: number,
    status: string,
    rawText: string,
    structuredContent: any,
  ) {
    try {
      await this.transcriptRepo.updateStatusAndContent(
        transcriptId,
        status,
        rawText,
        structuredContent,
      );
      console.log(
        `Updated transcript ID: ${transcriptId} to status: ${status}`,
      );
    } catch (err) {
      console.error(
        `Error updating transcript ID: ${transcriptId} status in DB`,
        err,
      );
    }
  }

  // ===========================================================================
  // GEMINI FILE API — Upload, poll, then generateContent
  // ===========================================================================
  //
  // Tại sao dùng File API thay vì inlineData (Base64)?
  //   - inlineData giới hạn ~20MB — file ghi âm thực tế thường lớn hơn nhiều
  //   - inlineData đọc toàn bộ file vào RAM dưới dạng Base64 (×1.33 dung lượng)
  //   - File API nhận stream binary, Google lưu tạm 48h, chỉ cần truyền URI
  //   - Hỗ trợ file tối đa 2 GB, không tốn RAM phía server để encode
  //
  // Tài liệu chi tiết: documents/gemini_convert/
  // ===========================================================================

  /**
   * Upload file âm thanh lên Gemini File API dùng Resumable Upload Protocol.
   *
   * Luồng 2 bước:
   *   1. Initiate  — gửi metadata, nhận x-goog-upload-url
   *   2. Upload    — gửi binary bytes đến upload URL, nhận { name, uri }
   *
   * @param audioBuffer  Dữ liệu nhị phân của file âm thanh
   * @param mimeType     MIME type (ví dụ: audio/mp3, audio/wav)
   * @param displayName  Tên hiển thị trên Google File API
   */
  private async uploadToGeminiFileApi(
    audioBuffer: Buffer,
    mimeType: string,
    displayName: string,
  ): Promise<{ name: string; uri: string; mimeType: string }> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const numBytes = audioBuffer.length;

    // ── BƯỚC 1: Khởi tạo phiên Resumable Upload ──────────────────────────────
    // Gửi metadata để Google tạo upload session và trả về upload URL
    const initiateResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(numBytes),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { displayName } }),
      },
    );

    if (!initiateResponse.ok) {
      const errText = await initiateResponse.text();
      throw new Error(
        `[File API] Initiate failed: ${initiateResponse.status} - ${errText}`,
      );
    }

    // Upload URL nằm trong response header, không phải body
    const uploadUrl = initiateResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new Error('[File API] No x-goog-upload-url returned from initiate step');
    }

    console.log(`[File API] Initiate session successful. Uploading ${numBytes} bytes...`);

    // ── BƯỚC 2: Upload dữ liệu nhị phân ──────────────────────────────────────
    // "upload, finalize" = gửi toàn bộ bytes và hoàn tất upload trong 1 request
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
        'Content-Type': mimeType,
      },
      body: new Uint8Array(audioBuffer),
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(
        `[File API] Upload failed: ${uploadResponse.status} - ${errText}`,
      );
    }

    const uploadResult: any = await uploadResponse.json();
    const fileInfo = uploadResult.file;

    console.log(`[File API] Upload complete. File: ${fileInfo.name}, State: ${fileInfo.state}`);

    return {
      name: fileInfo.name, // ví dụ: "files/abc123xyz"
      uri: fileInfo.uri,   // URI dùng trong generateContent
      mimeType: fileInfo.mimeType,
    };
  }

  /**
   * Poll trạng thái của file trên Gemini File API cho đến khi ACTIVE.
   *
   * Sau khi upload, Gemini cần thời gian xử lý (state = PROCESSING).
   * Phải chờ state = ACTIVE trước khi gọi generateContent.
   *
   * @param fileName   Tên file (ví dụ: "files/abc123xyz")
   * @param maxWaitMs  Timeout tối đa tính bằng ms (mặc định: 60 giây)
   * @returns URI của file khi đã ACTIVE
   */
  private async waitForFileActive(
    fileName: string,
    maxWaitMs = 60_000,
  ): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const startTime = Date.now();
    const pollInterval = 2_000; // Kiểm tra mỗi 2 giây

    while (Date.now() - startTime < maxWaitMs) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
      );

      if (!res.ok) {
        throw new Error(`[File API] Status check failed: ${res.status}`);
      }

      const fileStatus: any = await res.json();

      if (fileStatus.state === 'ACTIVE') {
        console.log(`[File API] File ${fileName} is ACTIVE and ready.`);
        return fileStatus.uri;
      }

      if (fileStatus.state === 'FAILED') {
        throw new Error(`[File API] File ${fileName} processing FAILED on Google's side`);
      }

      // Còn PROCESSING — chờ tiếp
      console.log(
        `[File API] File ${fileName} is still ${fileStatus.state}. ` +
          `Waiting ${pollInterval / 1000}s... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `[File API] Timeout: file ${fileName} did not become ACTIVE within ${maxWaitMs}ms`,
    );
  }

  /**
   * Xóa file khỏi Google File API sau khi transcription hoàn tất.
   * File tự xóa sau 48h, nhưng xóa sớm là best practice bảo mật.
   * Lỗi khi xóa chỉ được log (warn), không ảnh hưởng luồng chính.
   */
  private async deleteGeminiFile(fileName: string): Promise<void> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        console.log(`[File API] Deleted temporary file: ${fileName}`);
      } else {
        console.warn(`[File API] Delete returned ${res.status} for file: ${fileName}`);
      }
    } catch (err) {
      // Không throw — transcript đã hoàn thành, lỗi xóa không nghiêm trọng
      console.warn(`[File API] Could not delete file ${fileName}:`, err);
    }
  }

  /**
   * Toàn bộ luồng transcription sử dụng Gemini File API.
   *
   * Thay thế hoàn toàn cơ chế Base64 inline cũ:
   *   1. Tải file từ file-service vào Buffer (1 lần duy nhất)
   *   2. Upload Buffer lên Gemini File API (Resumable 2-step)
   *   3. Poll cho đến khi file ACTIVE
   *   4. Gọi generateContent với fileUri (payload nhỏ, không chứa dữ liệu âm thanh)
   *   5. Cleanup — xóa file khỏi Google File API
   *   6. Parse và trả về kết quả
   */
  private async transcribe(
    fileId: string,
  ): Promise<{ rawText: string; segments: any[] }> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const modelName = this.configService.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');

    if (
      !apiKey ||
      apiKey.trim() === '' ||
      apiKey === 'your_actual_gemini_api_key_here'
    ) {
      console.error('Gemini API Key is not configured correctly.');
      throw new Error('Gemini API Key is not configured correctly.');
    }

    // ── BƯỚC 1: Lấy MIME type từ file-service ────────────────────────────────
    let mimeType = 'audio/mp3';
    try {
      const fileMetadata = await this.fileGateway.getFileMetadata(fileId);
      if (fileMetadata?.mimeType) {
        mimeType = fileMetadata.mimeType;
      }
    } catch (error) {
      console.warn(
        `[Transcript] Could not retrieve file metadata for fileId: ${fileId}. Using fallback mimeType.`,
        error,
      );
    }

    // ── BƯỚC 2: Tải file âm thanh từ file-service ────────────────────────────
    // Ghi chú: Đây là lần tải DUY NHẤT — không encode thêm Base64
    const fileServiceHost = this.configService.get<string>('FILE_SERVICE_HOST', 'localhost');
    const fileServicePort = this.configService.get<number>('FILE_SERVICE_PORT', 3003);
    const fileUrl = `http://${fileServiceHost}:${fileServicePort}/api/v1/files/stream/${fileId}`;

    console.log(`[Transcript] Downloading file bytes for fileId: ${fileId} from ${fileUrl}`);
    const downloadResponse = await fetch(fileUrl);
    if (!downloadResponse.ok) {
      throw new Error(
        `Failed to download file from file-service. HTTP status: ${downloadResponse.status}`,
      );
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    console.log(
      `[Transcript] Downloaded ${audioBuffer.length} bytes (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB) for fileId: ${fileId}`,
    );

    // ── BƯỚC 3: Upload lên Gemini File API ───────────────────────────────────
    console.log(`[Transcript] Uploading to Gemini File API...`);
    const uploadedFile = await this.uploadToGeminiFileApi(
      audioBuffer,
      mimeType,
      `transcripthub_${fileId}`,
    );

    // ── BƯỚC 4: Chờ file sẵn sàng ────────────────────────────────────────────
    // maxWaitMs = 90s — đủ cho file dài (>1 tiếng) mà không chờ quá lâu
    const fileUri = await this.waitForFileActive(uploadedFile.name, 90_000);

    // ── BƯỚC 5: Gọi generateContent với fileUri ───────────────────────────────
    // Payload này RẤT NHỎ — chỉ chứa URI string, không chứa dữ liệu âm thanh
    const systemPrompt = `Transcribe the following audio file. Return a JSON object matching this schema exactly:
{
  "rawText": "the full concatenated transcription text",
  "segments": [
    {
      "id": "seg-1",
      "startTime": 0.0,
      "endTime": 5.2,
      "speaker": "Speaker 1",
      "text": "segment text content"
    }
  ]
}
Requirements:
1. Split the transcription into logical segments based on speaker turns or natural pauses. Each segment must have startTime, endTime (in seconds), a speaker label (e.g. Speaker 1, Speaker 2), and the text.
2. Transcribe in the original language spoken in the audio.
3. Return ONLY valid JSON. Do not include markdown code block formatting (like \`\`\`json).
4. CRITICAL: Make sure all string values (especially the "text" fields and "rawText") are properly escaped for JSON. Do not include unescaped double quotes; use \\" instead. Do not include literal newlines inside strings; use \\n instead.`;

    const payload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              // 🎯 fileData thay vì inlineData — chỉ gửi URI, không gửi dữ liệu âm thanh
              fileData: {
                fileUri,    // URI của file đã upload (ví dụ: "https://generativelanguage.googleapis.com/v1beta/files/abc123")
                mimeType,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        // Đặt tối đa để tránh JSON bị truncate khi file âm thanh dài.
        // Gemini 2.5 Flash hỗ trợ tối đa 65536 output tokens.
        maxOutputTokens: 65536,
      },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    console.log(`[Transcript] Sending request to Gemini API using fileUri: ${fileUri}`);

    let response: Response;
    try {
      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } finally {
      // ── BƯỚC 6: Cleanup — xóa file dù thành công hay thất bại ────────────
      // Chạy trong finally để đảm bảo luôn được gọi
      await this.deleteGeminiFile(uploadedFile.name);
    }

    if (!response.ok) {
      const errBody = await response.text();
      const err = new Error(
        `Gemini API returned non-success code: ${response.status} - ${errBody}`,
      );
      (err as any).status = response.status;
      throw err;
    }

    // ── BƯỚC 7: Parse kết quả JSON ────────────────────────────────────────────
    const resJson: any = await response.json();
    const candidate = resJson.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No candidates or content returned from Gemini API');
    }

    let sanitizedText = text.trim();
    if (sanitizedText.startsWith('```json')) {
      sanitizedText = sanitizedText.substring(7);
    } else if (sanitizedText.startsWith('```')) {
      sanitizedText = sanitizedText.substring(3);
    }
    if (sanitizedText.endsWith('```')) {
      sanitizedText = sanitizedText.substring(0, sanitizedText.length - 3);
    }
    sanitizedText = sanitizedText.trim();

    // ── BƯỚC 8: Parse JSON với cơ chế recovery khi bị truncate ─────────────
    const result = this.tryParseTranscriptJson(sanitizedText, fileId);
    console.log(
      `[Transcript] Completed AI transcription using Gemini File API for fileId: ${fileId}. ` +
        `Extracted ${result.segments?.length || 0} segments.`,
    );
    return result;
  }

  /**
   * Parse JSON từ Gemini với cơ chế tự phục hồi (recovery) khi bị truncate.
   *
   * Nguyên nhân truncate: Gemini đạt giới hạn maxOutputTokens và cắt giữ chừng
   * → chuỗi JSON chưa đóng → JSON.parse() throw SyntaxError.
   *
   * Chiến lược recovery:
   *   1. Thử parse bình thường trước.
   *   2. Nếu lỗi → tìm segment cuối cùng hoàn chỉnh trong JSON bị cắt.
   *   3. Đóng array và object lại đúng cú pháp để có JSON hợp lệ.
   *   4. Nếu không recover được segments → lấy rawText từ phần đã đọc được.
   *   5. Nếu hoàn toàn không parse được → throw lỗi thật sự.
   */
  private tryParseTranscriptJson(
    rawText: string,
    fileId: string,
  ): { rawText: string; segments: any[] } {
    // Thử parse hoàn chỉnh trước
    try {
      return JSON.parse(rawText);
    } catch {
      // Tiếp tục với recovery
    }

    console.warn(
      `[Transcript] JSON truncated for fileId: ${fileId}. Attempting recovery...`,
    );

    try {
      // ── Recovery Strategy 1: Tìm segment cuối hoàn chỉnh ──────────────────
      // Mỗi segment kết thúc bằng "}" — tìm vị trí đóng ngoặc cuối hợp lệ
      // trong mảng segments và reconstruct JSON từ đó.

      // Tìm vị trí bắt đầu của mảng "segments"
      const segmentsStart = rawText.indexOf('"segments"');
      if (segmentsStart === -1) {
        throw new Error('No segments key found in truncated response');
      }

      // Tìm tất cả segment objects hoàn chỉnh (kết thúc bằng "}")
      // bằng cách tìm cặp ngoặc cân bằng từ đầu mảng
      const arrayStart = rawText.indexOf('[', segmentsStart);
      if (arrayStart === -1) {
        throw new Error('No segments array found in truncated response');
      }

      // Tìm vị trí kết thúc của segment cuối cùng hoàn chỉnh
      // Regex: tìm tất cả "}," hoặc "}" theo sau bởi khoảng trắng/newline/]
      const segmentEndRegex = /\}\s*(?:,|\])/g;
      let lastValidEnd = -1;
      let match: RegExpExecArray | null;

      const arrayContent = rawText.substring(arrayStart);
      while ((match = segmentEndRegex.exec(arrayContent)) !== null) {
        lastValidEnd = arrayStart + match.index + 1; // vị trí sau "}"
      }

      let segments: any[] = [];
      if (lastValidEnd > arrayStart) {
        // Reconstruct JSON với chỉ những segments đã hoàn chỉnh
        const partialSegmentsJson = rawText.substring(arrayStart, lastValidEnd) + ']';
        try {
          segments = JSON.parse(partialSegmentsJson);
          console.log(
            `[Transcript] Recovery: salvaged ${segments.length} complete segments from truncated response`,
          );
        } catch {
          segments = [];
        }
      }

      // ── Recovery Strategy 2: Lấy rawText từ phần đọc được ─────────────────
      // Tìm giá trị "rawText" trong JSON bị cắt
      let recoveredRawText = '';
      const rawTextMatch = rawText.match(/"rawText"\s*:\s*"((?:[^"\\]|\\[\s\S])*?)"/);
      if (rawTextMatch) {
        // Unescape JSON string
        recoveredRawText = rawTextMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      } else if (segments.length > 0) {
        // Reconstruct rawText từ segments nếu có
        recoveredRawText = segments.map((s: any) => `[${s.speaker}] ${s.text}`).join('\n');
      }

      console.warn(
        `[Transcript] Recovery complete for fileId: ${fileId}. ` +
          `Segments: ${segments.length}, rawText length: ${recoveredRawText.length}`,
      );

      return { rawText: recoveredRawText, segments };
    } catch (recoveryError) {
      // Recovery cũng thất bại — throw lỗi gốc để set status FAILED
      console.error(
        `[Transcript] JSON recovery failed for fileId: ${fileId}. Raw text (first 500 chars):`,
        rawText.substring(0, 500),
      );
      throw new SyntaxError(
        `Failed to parse Gemini response JSON (truncated at ${rawText.length} chars). ` +
          `Try with a shorter audio file or check maxOutputTokens setting.`,
      );
    }
  }

  async deleteTranscript(id: number) {
    console.log(`Deleting transcript with ID: ${id}`);
    const transcript = await this.transcriptRepo.findById(id);
    if (!transcript) {
      throw new AppException(ErrorCodes.TRANSCRIPT_NOT_FOUND, `Transcript with ID ${id} not found`);
    }
    await this.transcriptRepo.delete(id);
    return { message: 'Transcript deleted successfully', id };
  }
}
