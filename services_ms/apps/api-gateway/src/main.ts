import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { ApiGatewayModule } from './api-gateway.module';
import { GlobalHttpExceptionFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from '../../../libs/common/src/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule, { bodyParser: false });

  // 1. Configure custom body size limits to handle large transcripts (e.g. up to 50MB)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // 2. Configure CORS to allow all origins (needed when FE & BE run on different ports)
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 2. Validate JSON request payloads automatically
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 3. Đăng ký Global Interceptor và Filter cho định dạng Response/Error đồng bộ Java
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // 4. Set global prefix for API endpoints
  app.setGlobalPrefix('api');

  // 4. Setup Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('TranscriptHub API Documentation')
    .setDescription(
      'The API documentation for the TranscriptHub microservices backend',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'JWT',
      description: 'Enter JWT access token',
      in: 'header',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`🌐 API Gateway is running on: http://localhost:${port}/api`);
  console.log(
    `📑 API Documentation is available at: http://localhost:${port}/api/docs`,
  );
}
bootstrap();
