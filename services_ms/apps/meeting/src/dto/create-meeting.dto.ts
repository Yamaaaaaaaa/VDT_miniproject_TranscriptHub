import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty({ message: 'Title must not be blank' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID(4, { message: 'Audio file ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Audio file ID must not be null' })
  audioFileId: string;
}
