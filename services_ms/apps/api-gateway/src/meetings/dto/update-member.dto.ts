import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { MeetingRole } from '@prisma/client';

export class UpdateMemberDto {
  @ApiProperty({
    description: 'The updated meeting role of the member',
    enum: MeetingRole,
    example: 'VIEWER',
  })
  @IsEnum(MeetingRole)
  @IsNotEmpty({ message: 'Role must not be null' })
  role: MeetingRole;
}
