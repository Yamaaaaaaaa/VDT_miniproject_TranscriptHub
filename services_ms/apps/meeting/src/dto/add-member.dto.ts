import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { MeetingRole } from '@prisma/client';

export class AddMemberDto {
  @IsInt()
  @IsOptional()
  userId?: number;

  @IsString()
  @IsOptional()
  email?: string;

  @IsEnum(MeetingRole)
  @IsNotEmpty({ message: 'Role must not be null' })
  role: MeetingRole;
}
