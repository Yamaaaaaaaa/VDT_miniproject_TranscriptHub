import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IdentityModule } from './identity.module';
import { validate } from './config/env.config';
import { MicroserviceExceptionFilter } from '../../../libs/common/src/filters/microservice-exception.filter';

async function bootstrap() {
  const env = validate(process.env);

  // Create hybrid app: HTTP REST API + TCP microservice on same port
  const app = await NestFactory.create<NestExpressApplication>(IdentityModule);

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new MicroserviceExceptionFilter());

  // Attach TCP microservice on the same HTTP server (same port)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: env.IDENTITY_SERVICE_PORT,
    },
  });

  const HTTP_PORT = parseInt(process.env.IDENTITY_HTTP_PORT || '3009', 10);

  await app.startAllMicroservices();
  await app.listen(HTTP_PORT, '0.0.0.0');
  console.log(`🌐 Identity HTTP API listening on http://0.0.0.0:${HTTP_PORT}`);
  console.log(`🚀 Identity TCP Microservice listening on TCP port ${env.IDENTITY_SERVICE_PORT}`);
}
bootstrap();
