import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator';

export class GetTranscriptDto {
  @ApiProperty({ example: 'meeting-uuid-123' })
  @IsString()
  meetingId: string;
}

export class SaveTranscriptDto {
  @ApiProperty({ example: 'meeting-uuid-123' })
  @IsString()
  meetingId: string;


  @ApiProperty({ example: 'Speaker 1: Hello...' })
  @IsString()
  rawText: string;

  @ApiProperty({
    example: {
      segments: [
        {
          id: 'seg-001',
          startTime: 0,
          endTime: 15,
          speaker: 'Speaker 1',
          text: 'Hello...',
        },
      ],
    },
  })
  @IsObject()
  structuredContent: any;
}

export class CreateSnapshotDto {
  @ApiProperty({ example: 'meeting-uuid-123' })
  @IsString()
  meetingId: string;

  @ApiProperty({ example: 42 })
  @IsNumber()
  userId: number;

  @ApiProperty({ example: 'Bản chốt dịch lần 1' })
  @IsString()
  versionName: string;
}

export class GetVersionsDto {
  @ApiProperty({ example: 'meeting-uuid-123' })
  @IsString()
  meetingId: string;
}

export class RestoreVersionDto {
  @ApiProperty({ example: 'meeting-uuid-123' })
  @IsString()
  meetingId: string;

  @ApiProperty({ example: 15 })
  @IsNumber()
  versionId: number;
}
