import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { TimingInterceptor } from './common/timing.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    // Keep original bytes for webhook HMAC (must not re-serialize JSON).
    rawBody: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new TimingInterceptor());

  const configService = app.get(ConfigService);
  app.enableCors({
    origin: configService.getOrThrow<string[]>('CORS_ORIGINS'),
    credentials: true,
  });

  const openApi = new DocumentBuilder()
    .setTitle('ReconcileOps API')
    .setDescription(
      'AED payment reconciliation backend: health, auth, payments, CSV imports, reconciliation, investigations, signed webhooks.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApi));

  // validateEnv already ran, so PORT is a number from configuration.
  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
}
await bootstrap();
