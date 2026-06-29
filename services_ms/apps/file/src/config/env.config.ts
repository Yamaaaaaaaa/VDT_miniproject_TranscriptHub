import { IsNumber, IsOptional, IsString } from 'class-validator';
import { validateEnv } from '../../../../libs/common/src/config/env.validation';

export class FileEnv {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  FILE_SERVICE_TCP_PORT: number = 3004;

  @IsNumber()
  @IsOptional()
  FILE_SERVICE_PORT: number = 3003;

  @IsString()
  @IsOptional()
  KAFKA_BOOTSTRAP_SERVERS: string = 'kafka:9092';

  @IsString()
  @IsOptional()
  MINIO_BUCKET: string = 'transcripthub-bucket';

  @IsString()
  @IsOptional()
  MINIO_ENDPOINT: string = 'localhost';

  @IsNumber()
  @IsOptional()
  MINIO_PORT: number = 9000;

  @IsString()
  @IsOptional()
  MINIO_ACCESS_KEY: string = 'minioadmin';

  @IsString()
  @IsOptional()
  MINIO_SECRET_KEY: string = 'minioadmin';

  @IsString()
  @IsOptional()
  MINIO_PUBLIC_ENDPOINT: string = 'localhost';

  @IsNumber()
  @IsOptional()
  MINIO_PUBLIC_PORT?: number;
}

export function validate(config: Record<string, any>) {
  return validateEnv(FileEnv, config);
}
