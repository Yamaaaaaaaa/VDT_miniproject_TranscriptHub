import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    description: 'Array of permission names to assign to the role',
    example: ['read_transcripts', 'create_transcripts'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}
