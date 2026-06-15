import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { PrismaModule } from './prisma/prisma.module';
import { FileRepository } from './repositories/file.repository';
import { KafkaGateway } from './gateways/kafka.gateway';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'file-service',
            brokers: [process.env.KAFKA_BOOTSTRAP_SERVERS || 'kafka:9092'],
          },
          producer: {
            allowAutoTopicCreation: true,
          },
        },
      },
    ]),
  ],
  controllers: [FileController],
  providers: [FileService, FileRepository, KafkaGateway],
})
export class FileModule {}
