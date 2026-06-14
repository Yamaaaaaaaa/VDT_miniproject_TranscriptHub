import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { MeetingModule } from './meeting.module';

async function bootstrap() {
  const port = parseInt(process.env.MEETING_SERVICE_TCP_PORT ?? '3006', 10);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    MeetingModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: port,
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

  await app.listen();
  console.log(`🚀 Meeting Microservice is listening on TCP port ${port}`);
}
bootstrap();
