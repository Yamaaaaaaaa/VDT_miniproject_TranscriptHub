import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { TranscriptModule } from './transcript.module';
import { MicroserviceExceptionFilter } from '../../../libs/common/src/filters/microservice-exception.filter';

async function bootstrap() {
  // 1. Create a standard NestJS app context
  const app = await NestFactory.create(TranscriptModule);

  // Đăng ký Exception Filter toàn cục để định dạng lỗi thống nhất
  app.useGlobalFilters(new MicroserviceExceptionFilter());

  const configService = app.get(ConfigService);

  // 2. Connect the TCP Microservice (for API Gateway calls)
  const tcpPort = configService.get<number>('TRANSCRIPT_SERVICE_TCP_PORT', 3005);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  // 3. Connect to Kafka Broker (for automatic transcription events)
  const kafkaBrokers = configService
    .get<string>('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092')
    .split(',');
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'transcript-service',
        brokers: kafkaBrokers,
      },
      consumer: {
        groupId: 'transcript-group',
        allowAutoTopicCreation: true,
        // Tăng timeout để tránh consumer bị kích khỏi group khi xử lý các task transcription chậm (ví dụ: file lớn, Gemini API phản hồi lâu)
        sessionTimeout: 90000,    // 90 giây
        rebalanceTimeout: 120000, // 120 giây
        heartbeatInterval: 25000, // 25 giây
      },
    },
  });

  // 4. Start all connected microservices
  await app.startAllMicroservices();
  console.log(`🚀 Transcript TCP listener is active on port: ${tcpPort}`);
  console.log(
    `🚀 Transcript Kafka consumer is connected to: ${kafkaBrokers.join(', ')}`,
  );
}
bootstrap();
