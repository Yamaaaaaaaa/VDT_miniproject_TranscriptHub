import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { UsersModule } from './users.module';
import { validate } from './config/env.config';
import { ConfigService } from '@nestjs/config';
import { MicroserviceExceptionFilter } from '../../../libs/common/src/filters/microservice-exception.filter';

async function bootstrap() {
  // 1. Tạo standard NestJS app context
  const app = await NestFactory.create(UsersModule);

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

  const configService = app.get(ConfigService);

  // 2. Connect TCP Microservice
  const tcpPort = configService.get<number>('USERS_SERVICE_PORT', 3001);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  // 3. Connect Kafka Broker
  const kafkaBrokers = configService
    .get<string>('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092')
    .split(',');
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'users-service',
        brokers: kafkaBrokers,
      },
      consumer: {
        groupId: 'users-group',
        allowAutoTopicCreation: true,
      },
    },
  });

  // 4. Khởi chạy toàn bộ microservices kết nối
  await app.startAllMicroservices();
  console.log(`🚀 Users Microservice started with TCP port ${tcpPort} & Kafka`);
}
bootstrap();
