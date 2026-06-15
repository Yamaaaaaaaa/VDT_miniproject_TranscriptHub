import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export function validateEnv<T extends object>(cls: new () => T, config: Record<string, any>): T {
  const validatedConfig = plainToInstance(cls, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }
  return validatedConfig;
}
