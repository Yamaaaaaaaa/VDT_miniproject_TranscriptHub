import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MeetingRole } from '@prisma/client';

export class AddMemberDto {
  @ApiProperty({
    description: 'The user ID to add as a member (optional if email is provided)',
    example: 2,
    required: false,
  })
  @IsInt()
  @IsOptional()
  userId?: number;

  @ApiProperty({
    description: 'The user email to add as a member (optional if userId is provided)',
    example: 'user2@example.com',
    required: false,
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'The meeting role of the member',
    enum: MeetingRole,
    example: 'EDITOR',
  })
  @IsEnum(MeetingRole)
  @IsNotEmpty({ message: 'Role must not be null' })
  role: MeetingRole;
}
