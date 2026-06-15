import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMeetingDto {
  @ApiProperty({
    description: 'The title of the meeting',
    example: 'VDT Mini Project Sync',
  })
  @IsString()
  @IsNotEmpty({ message: 'Title must not be blank' })
  title: string;

  @ApiProperty({
    description: 'Optional description of the meeting topics',
    example: 'Discussing final presentation and deployment architecture.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'The UUID of the uploaded audio file to link with this meeting',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID(4, { message: 'Audio file ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Audio file ID must not be null' })
  audioFileId: string;
}
