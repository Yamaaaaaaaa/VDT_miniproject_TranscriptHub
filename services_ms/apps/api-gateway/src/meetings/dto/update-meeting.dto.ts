import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MeetingStatus } from '@prisma/client';

export class UpdateMeetingDto {
  @ApiProperty({
    description: 'The title of the meeting',
    example: 'Updated VDT Mini Project Sync',
  })
  @IsString()
  @IsNotEmpty({ message: 'Title must not be blank' })
  title: string;

  @ApiProperty({
    description: 'Optional description of the meeting',
    example: 'Discussing project wrapping up and grading guidelines.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'The status of the meeting',
    enum: MeetingStatus,
    example: 'COMPLETED',
    required: false,
  })
  @IsEnum(MeetingStatus)
  @IsOptional()
  status?: MeetingStatus;
}
