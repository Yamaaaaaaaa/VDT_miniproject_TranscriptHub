import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { CollabGatewayModule } from './collab-gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(CollabGatewayModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('collabGateway.port') ?? 3008;

  await app.listen(port);
  const logger = new Logger('CollabGateway');
  logger.log(`Collab Gateway running on port ${port}`);
}
bootstrap();
