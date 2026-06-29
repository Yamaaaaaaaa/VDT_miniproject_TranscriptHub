export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

export interface TranscriptContent {
  segments: TranscriptSegment[];
}
