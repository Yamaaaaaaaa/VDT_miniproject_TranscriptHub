import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MeetingStatus } from '@prisma/client';

export class UpdateMeetingDto {
  @IsString()
  @IsNotEmpty({ message: 'Title must not be blank' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(MeetingStatus)
  @IsOptional()
  status?: MeetingStatus;

  @IsString()
  @IsOptional()
  audioFileId?: string;
}
