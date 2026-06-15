import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TranscriptRepository } from './repositories/transcript.repository';
import { FileGateway } from './gateways/file.gateway';

@Injectable()
export class TranscriptService {
  constructor(
    private readonly transcriptRepo: TranscriptRepository,
    private readonly fileGateway: FileGateway,
  ) {}

  async getTranscriptByAudioFileId(audioFileId: string) {
    console.log(`Fetching transcript for audioFileId: ${audioFileId}`);
    const transcript = await this.transcriptRepo.findByAudioFileId(audioFileId);
    if (!transcript) {
      throw new NotFoundException(
        `Transcript not found for audio file ${audioFileId}`,
      );
    }
    return transcript;
  }

  async getAllTranscripts() {
    console.log('Fetching all transcripts');
    return this.transcriptRepo.findAll();
  }

  async generateTranscriptAsync(fileId: string) {
    console.log(`Checking transcript status for fileId: ${fileId}`);
    let transcript = await this.transcriptRepo.findByAudioFileId(fileId);

    if (!transcript) {
      transcript = await this.transcriptRepo.create(fileId);
      this.triggerBackgroundTranscription(fileId, transcript.id);
    } else if (transcript.status === 'FAILED') {
      transcript = await this.transcriptRepo.updateStatusAndContent(
        transcript.id,
        'PROCESSING',
      );
      this.triggerBackgroundTranscription(fileId, transcript.id);
    } else {
      console.log(
        `Transcript for fileId ${fileId} already exists in state: ${transcript.status}`,
      );
    }
  }

  async generateTranscriptManually(fileId: string) {
    console.log(
      `Manually requesting transcript generation for fileId: ${fileId}`,
    );

    // Verify file exists in file service
    try {
      const exists = await this.fileGateway.checkFileExists(fileId);
      if (!exists) {
        throw new NotFoundException('Audio file not found in File Service');
      }
    } catch (error) {
      console.error('Failed to check file existence in file-service', error);
      throw new BadRequestException('Failed to verify audio file existence');
    }

    let transcript = await this.transcriptRepo.findByAudioFileId(fileId);

    if (!transcript) {
      transcript = await this.transcriptRepo.create(fileId);
      this.triggerBackgroundTranscription(fileId, transcript.id);
    } else if (transcript.status === 'FAILED') {
      transcript = await this.transcriptRepo.updateStatusAndContent(
        transcript.id,
        'PROCESSING',
      );
      this.triggerBackgroundTranscription(fileId, transcript.id);
    } else {
      console.log(
        `Transcript for fileId ${fileId} already exists in state: ${transcript.status}`,
      );
    }

    return transcript;
  }

  private triggerBackgroundTranscription(fileId: string, transcriptId: number) {
    setImmediate(async () => {
      console.log(
        `Background thread started transcription for fileId: ${fileId}, transcriptId: ${transcriptId}`,
      );
      try {
        const result = await this.transcribe(fileId);
        await this.updateTranscriptStatus(
          transcriptId,
          'COMPLETED',
          result.rawText,
          { segments: result.segments },
        );
      } catch (err) {
        console.error(
          `Failed to transcribe fileId: ${fileId}, transcriptId: ${transcriptId}`,
          err,
        );
        await this.updateTranscriptStatus(transcriptId, 'FAILED', '', {
          segments: [],
        });
      }
    });
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

  private async transcribe(
    fileId: string,
  ): Promise<{ rawText: string; segments: any[] }> {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (
      !apiKey ||
      apiKey.trim() === '' ||
      apiKey === 'your_actual_gemini_api_key_here'
    ) {
      console.error('Gemini API Key is not configured correctly.');
      throw new Error('Gemini API Key is not configured correctly.');
    }

    let mimeType = 'audio/mp3';
    try {
      const fileMetadata = await this.fileGateway.getFileMetadata(fileId);
      if (fileMetadata && fileMetadata.mimeType) {
        mimeType = fileMetadata.mimeType;
      }
    } catch (error) {
      console.warn(
        `Could not retrieve file metadata from file-service for fileId: ${fileId}. Using fallback mimeType.`,
        error,
      );
    }

    // Tải file âm thanh từ file-service
    const fileServiceHost = process.env.FILE_SERVICE_HOST || 'localhost';
    const fileServicePort = process.env.FILE_SERVICE_PORT || '3003';
    const fileUrl = `http://${fileServiceHost}:${fileServicePort}/api/v1/files/stream/${fileId}`;

    console.log(`Downloading file bytes for fileId: ${fileId} from ${fileUrl}`);
    const downloadResponse = await fetch(fileUrl);
    if (!downloadResponse.ok) {
      throw new Error(
        `Failed to download file from file-service. HTTP status: ${downloadResponse.status}`,
      );
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const fileBytes = Buffer.from(arrayBuffer);
    const base64Audio = fileBytes.toString('base64');
    console.log(
      `Successfully encoded audio to Base64 (length: ${base64Audio.length} characters)`,
    );

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
4. CRITICAL: Make sure all string values (especially the "text" fields and "rawText") are properly escaped for JSON. Do not include unescaped double quotes; use \\\" instead. Do not include literal newlines inside strings; use \\n instead.`;

    const payload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    console.log(`Sending request to Gemini API for fileId: ${fileId}`);
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `Gemini API returned non-success code: ${response.status} - ${errBody}`,
      );
    }

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

    try {
      const result = JSON.parse(sanitizedText);
      console.log(
        `Completed AI transcription using Gemini for fileId: ${fileId}. Extracted ${result.segments?.length || 0} segments.`,
      );
      return result;
    } catch (parseError) {
      console.error(`JSON Parse Error. Raw sanitized text:`, sanitizedText);
      throw parseError;
    }
  }

  async deleteTranscript(id: number) {
    console.log(`Deleting transcript with ID: ${id}`);
    const transcript = await this.transcriptRepo.findById(id);
    if (!transcript) {
      throw new NotFoundException(`Transcript with ID ${id} not found`);
    }
    await this.transcriptRepo.delete(id);
    return { message: 'Transcript deleted successfully', id };
  }
}
