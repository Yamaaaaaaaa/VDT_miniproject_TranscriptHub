import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { MeetingModule } from './meeting.module';
import { validate } from './config/env.config';
import { MicroserviceExceptionFilter } from '../../../libs/common/src/filters/microservice-exception.filter';

async function bootstrap() {
  const env = validate(process.env);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    MeetingModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: env.MEETING_SERVICE_TCP_PORT,
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

  // Đăng ký Exception Filter toàn cục để định dạng lỗi thống nhất
  app.useGlobalFilters(new MicroserviceExceptionFilter());

  await app.listen();
  console.log(`🚀 Meeting Microservice is listening on TCP port ${env.MEETING_SERVICE_TCP_PORT}`);
}
bootstrap();
