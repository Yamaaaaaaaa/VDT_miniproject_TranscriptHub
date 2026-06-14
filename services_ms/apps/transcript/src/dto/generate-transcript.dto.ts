import { IsUUID, IsNotEmpty } from 'class-validator';

export class GenerateTranscriptDto {
    @IsUUID()
    @IsNotEmpty()
    fileId: string;
}
