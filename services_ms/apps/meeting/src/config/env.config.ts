import { IsNumber, IsOptional, IsString } from 'class-validator';
import { validateEnv } from '../../../../libs/common/src/config/env.validation';

export class MeetingEnv {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  MEETING_SERVICE_TCP_PORT: number = 3006;

  @IsString()
  @IsOptional()
  USERS_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  USERS_SERVICE_PORT: number = 3001;

  @IsString()
  @IsOptional()
  FILE_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  FILE_SERVICE_TCP_PORT: number = 3004;

  @IsString()
  @IsOptional()
  TRANSCRIPT_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  TRANSCRIPT_SERVICE_TCP_PORT: number = 3005;

  @IsString()
  @IsOptional()
  KAFKA_BOOTSTRAP_SERVERS: string = 'kafka:9092';

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'redis';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;
}

export function validate(config: Record<string, any>) {
  return validateEnv(MeetingEnv, config);
}
