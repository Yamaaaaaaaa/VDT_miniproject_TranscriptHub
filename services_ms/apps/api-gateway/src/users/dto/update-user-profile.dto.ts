import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateUserProfileDto {
  @ApiProperty({
    description: 'New full name of the user',
    example: 'John Doe Updated',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'New phone number of the user',
    example: '0912345678',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: 'New avatar URL or path',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiProperty({
    description: 'New short bio of the user',
    example: 'Software Engineer and Developer.',
    required: false,
  })
  @IsString()
  @IsOptional()
  bio?: string;
}
