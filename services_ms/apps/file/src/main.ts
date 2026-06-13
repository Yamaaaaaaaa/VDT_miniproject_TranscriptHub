import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

  const port = process.env.FILE_SERVICE_PORT || 3003;
  await app.listen(port);
  console.log(`🚀 File Service is running on HTTP port: http://localhost:${port}`);
}
bootstrap();