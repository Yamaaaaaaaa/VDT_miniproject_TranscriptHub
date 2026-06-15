import { IsNumber, IsOptional, IsString } from 'class-validator';
import { validateEnv } from '../../../../libs/common/src/config/env.validation';

export class ApiGatewayEnv {
  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  USERS_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  USERS_SERVICE_PORT: number = 3001;

  @IsString()
  @IsOptional()
  IDENTITY_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  IDENTITY_SERVICE_PORT: number = 3002;

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
  MEETING_SERVICE_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  MEETING_SERVICE_TCP_PORT: number = 3006;
}

export function validate(config: Record<string, any>) {
  return validateEnv(ApiGatewayEnv, config);
}
