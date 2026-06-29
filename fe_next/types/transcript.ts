export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  content: string;
}

export interface TranscriptDetail {
  id: string;
  audioFileId: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
}

export interface AudioFileMetadata {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  durationSeconds: number;
  status: string;
}
