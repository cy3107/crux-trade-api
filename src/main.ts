import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger 配置
  const config = new DocumentBuilder()
    .setTitle('Crux Trade API')
    .setDescription('AI-powered crypto prediction market')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableCors(); // 前端跨域必须

  await app.listen(process.env.PORT || 3000);
  console.log(`API running on http://localhost:3000`);
  console.log(`Swagger: http://localhost:3000/docs`);
}
bootstrap();
