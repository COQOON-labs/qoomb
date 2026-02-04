import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { CORS_CONFIG, SECURITY_HEADERS } from './config/security.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV === 'development',
      trustProxy: true, // Enable trust proxy for correct IP detection
    })
  );

  // Security Headers with Helmet
  const helmetOptions = {
    contentSecurityPolicy:
      process.env.NODE_ENV === 'development' ? false : SECURITY_HEADERS.contentSecurityPolicy,
    hsts: SECURITY_HEADERS.strictTransportSecurity,
    frameguard: SECURITY_HEADERS.frameguard,
    noSniff: SECURITY_HEADERS.noSniff,
    xssFilter: SECURITY_HEADERS.xssFilter,
  };
  await app.register(helmet as any, helmetOptions);

  // Enable CORS with comprehensive configuration
  app.enableCors({
    origin: CORS_CONFIG.origins,
    credentials: CORS_CONFIG.credentials,
    methods: CORS_CONFIG.methods,
    allowedHeaders: CORS_CONFIG.allowedHeaders,
    exposedHeaders: CORS_CONFIG.exposedHeaders,
    maxAge: CORS_CONFIG.maxAge,
  });

  const port = process.env.API_PORT || 3001;
  const host = process.env.API_HOST || 'localhost';

  await app.listen(port, host);

  console.log(`
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   🚀 Qoomb API Server Running                          │
│                                                         │
│   Environment: ${process.env.NODE_ENV || 'development'}
│   URL: http://${host}:${port}                          │
│   Security: ✓ Rate Limiting                            │
│              ✓ Helmet Headers                          │
│              ✓ CORS Protection                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
  `);
}

bootstrap();
