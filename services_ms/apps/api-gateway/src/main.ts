import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiGatewayModule } from './api-gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);

  // 1. Configure CORS to allow all origins (needed when FE & BE run on different ports)
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

  // 3. Set global prefix for API endpoints
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🌐 API Gateway is running on: http://localhost:${port}/api`);
  console.log(
    `📑 API Documentation is available at: http://localhost:${port}/api/docs`,
  );
}
bootstrap();
