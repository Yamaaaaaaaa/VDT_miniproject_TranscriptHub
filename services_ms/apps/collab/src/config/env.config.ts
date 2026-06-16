import { IsNumber, IsOptional, IsString } from 'class-validator';
import { validateEnv } from '../../../../libs/common/src/config/env.validation';

export class CollabEnv {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  COLLAB_SERVICE_TCP_PORT: number = 3007;

  @IsString()
  @IsOptional()
  MEETING_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  MEETING_SERVICE_TCP_PORT: number = 3006;

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;
}

export function validate(config: Record<string, any>) {
  return validateEnv(CollabEnv, config);
}
