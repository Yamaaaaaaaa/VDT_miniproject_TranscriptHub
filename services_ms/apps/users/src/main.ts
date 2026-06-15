import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { UsersModule } from './users.module';
import { validate } from './config/env.config';
import { MicroserviceExceptionFilter } from '../../../libs/common/src/filters/microservice-exception.filter';

async function bootstrap() {
  const env = validate(process.env);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UsersModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0', // Lắng nghe trên tất cả các card mạng
        port: env.USERS_SERVICE_PORT, // Port giao tiếp TCP
      },
    },
  );

  // Validate tự động DTO nhận qua TCP
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
  console.log(`🚀 Users Microservice is listening on TCP port ${env.USERS_SERVICE_PORT}`);
}
bootstrap();
