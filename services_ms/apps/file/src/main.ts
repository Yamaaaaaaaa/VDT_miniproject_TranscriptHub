import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { FileModule } from './file.module';

async function bootstrap() {
  const app = await NestFactory.create(FileModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const tcpPort = parseInt(process.env.FILE_SERVICE_TCP_PORT || '3004', 10);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  await app.startAllMicroservices();
  console.log(`🚀 File Microservice TCP listener is active on port: ${tcpPort}`);

  const port = process.env.FILE_SERVICE_PORT || 3003;
  await app.listen(port);
  console.log(`🚀 File Service is running on HTTP port: http://localhost:${port}`);
}
bootstrap();