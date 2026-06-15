import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { UsersModule } from './users.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UsersModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0', // Lắng nghe trên tất cả các card mạng
        port: 3001, // Port giao tiếp TCP
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

  await app.listen();
  console.log('🚀 Users Microservice is listening on TCP port 3001');
}
bootstrap();
