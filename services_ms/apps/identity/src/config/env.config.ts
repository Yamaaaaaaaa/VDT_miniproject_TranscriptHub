import { IsNumber, IsOptional, IsString } from 'class-validator';
import { validateEnv } from '../../../../libs/common/src/config/env.validation';

export class IdentityEnv {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  IDENTITY_SERVICE_PORT: number = 3002;

  @IsString()
  @IsOptional()
  USERS_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  USERS_SERVICE_PORT: number = 3001;

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';
}

export function validate(config: Record<string, any>) {
  return validateEnv(IdentityEnv, config);
}
