import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { CollabModule } from './collab.module';
import { validate } from './config/env.config';
import { MicroserviceExceptionFilter } from '../../../libs/common/src/filters/microservice-exception.filter';

async function bootstrap() {
  const env = validate(process.env);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CollabModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: env.COLLAB_SERVICE_TCP_PORT,
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new MicroserviceExceptionFilter());

  await app.listen();
  console.log(
    `🚀 Collab Microservice is listening on TCP port ${env.COLLAB_SERVICE_TCP_PORT}`,
  );
}
bootstrap();
