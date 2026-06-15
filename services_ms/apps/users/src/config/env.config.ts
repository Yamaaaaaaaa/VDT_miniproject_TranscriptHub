import { IsNumber, IsOptional, IsString } from 'class-validator';
import { validateEnv } from '../../../../libs/common/src/config/env.validation';

export class UsersEnv {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  USERS_SERVICE_PORT: number = 3001;
}

export function validate(config: Record<string, any>) {
  return validateEnv(UsersEnv, config);
}
