import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({
    description: 'New name of the role',
    example: 'SUPER_ADMIN',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
