import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class KafkaGateway implements OnModuleInit {
  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    console.log('📡 Kafka Gateway connected to Kafka client');
  }

  emit(topic: string, data: { key: string; value: string }) {
    return this.kafkaClient.emit(topic, data);
  }
}
