import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@exp/config';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { loadRepoEnv } from './config/load-env';

loadRepoEnv();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  const maxBodySize = config.get<string>('app.maxRequestBodySize') ?? '100kb';
  app.use(json({ limit: maxBodySize }));
  app.use(urlencoded({ extended: true, limit: maxBodySize }));

  app.use(
    helmet({
      // Content-Security-Policy is owned by the Nginx edge config so that
      // Swagger UI and the web origin are not fought over twice.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? [];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Expenditure Tracker API')
    .setDescription(
      'Personal income & expense tracking API. All responses use the shared ' +
        '`{ ok, data }` / `{ ok, error }` envelope. Monetary values are decimal strings.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Expenditure Tracker API',
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get<number>('app.port') ?? 4000;
  const host = config.get<string>('app.host') ?? '0.0.0.0';
  await app.listen(port, host);

  const logger = new Logger('Bootstrap');
  logger.log(`API ready on http://${host}:${port}${API_PREFIX}`);
  logger.log(`Swagger UI  http://${host}:${port}/docs`);
}

bootstrap().catch((error: unknown) => {
  Logger.error('Failed to start API', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
