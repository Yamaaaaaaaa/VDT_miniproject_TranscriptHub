import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { TranscriptModule } from './transcript.module';

async function bootstrap() {
  // 1. Create a standard NestJS app context
  const app = await NestFactory.create(TranscriptModule);

  // 2. Connect the TCP Microservice (for API Gateway calls)
  const tcpPort = parseInt(
    process.env.TRANSCRIPT_SERVICE_TCP_PORT || '3005',
    10,
  );
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  // 3. Connect to Kafka Broker (for automatic transcription events)
  const kafkaBrokers = (
    process.env.KAFKA_BOOTSTRAP_SERVERS || 'kafka:9092'
  ).split(',');
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
