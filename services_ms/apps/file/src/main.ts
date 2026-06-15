import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { FileModule } from './file.module';
import { MicroserviceExceptionFilter } from '../../../libs/common/src/filters/microservice-exception.filter';
import { TransformInterceptor } from '../../../libs/common/src/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(FileModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Đăng ký Exception Filter và Interceptor toàn cục để định dạng response thống nhất
  app.useGlobalFilters(new MicroserviceExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const configService = app.get(ConfigService);

  const tcpPort = configService.get<number>('FILE_SERVICE_TCP_PORT', 3004);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  await app.startAllMicroservices();
  console.log(
    `🚀 File Microservice TCP listener is active on port: ${tcpPort}`,
  );

  const port = configService.get<number>('FILE_SERVICE_PORT', 3003);
  await app.listen(port);
  console.log(
    `🚀 File Service is running on HTTP port: http://localhost:${port}`,
  );
}
bootstrap();
