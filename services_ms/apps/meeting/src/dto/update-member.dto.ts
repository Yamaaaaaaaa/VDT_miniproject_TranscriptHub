import { IsEnum, IsNotEmpty } from 'class-validator';
import { MeetingRole } from '@prisma/client';

export class UpdateMemberDto {
  @IsEnum(MeetingRole)
  @IsNotEmpty({ message: 'Role must not be null' })
  role: MeetingRole;
}
