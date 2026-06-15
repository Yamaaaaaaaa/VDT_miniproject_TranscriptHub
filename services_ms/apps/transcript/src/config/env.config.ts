import { IsNumber, IsOptional, IsString } from 'class-validator';
import { validateEnv } from '../../../../libs/common/src/config/env.validation';

export class TranscriptEnv {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  TRANSCRIPT_SERVICE_TCP_PORT: number = 3005;

  @IsString()
  @IsOptional()
  KAFKA_BOOTSTRAP_SERVERS: string = 'kafka:9092';

  @IsString()
  @IsOptional()
  FILE_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  FILE_SERVICE_PORT: number = 3003;

  @IsNumber()
  @IsOptional()
  FILE_SERVICE_TCP_PORT: number = 3004;

  @IsString()
  GEMINI_API_KEY: string;

  @IsString()
  @IsOptional()
  GEMINI_MODEL: string = 'gemini-2.5-flash';
}

export function validate(config: Record<string, any>) {
  return validateEnv(TranscriptEnv, config);
}
