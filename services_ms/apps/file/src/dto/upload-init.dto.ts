import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class UploadInitDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsNumber()
  @IsPositive()
  fileSize: number;

  @IsString()
  @IsNotEmpty()
  mimeType: string;
}
