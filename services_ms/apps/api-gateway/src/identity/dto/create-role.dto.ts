import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Name of the role',
    example: 'MANAGER',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
