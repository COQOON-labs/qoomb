import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';
import { CORS_CONFIG, SECURITY_HEADERS } from './config/security.config';

async function bootstrap() {
  // Fail-fast: validate ALL required env vars before NestJS even starts.
  // This ensures misconfiguration surfaces immediately at boot, not at first request.
  validateEnv();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV === 'development',
      trustProxy: true, // Enable trust proxy for correct IP detection
    })
  );

  // Cookie support — must be registered first so that req.cookies and
  // reply.setCookie / reply.clearCookie are available to all handlers.
  await app.register(cookie);

  // Security Headers with Helmet
  const helmetOptions = {
    contentSecurityPolicy:
      process.env.NODE_ENV === 'development' ? false : SECURITY_HEADERS.contentSecurityPolicy,
    hsts: SECURITY_HEADERS.strictTransportSecurity,
    frameguard: SECURITY_HEADERS.frameguard,
    noSniff: SECURITY_HEADERS.noSniff,
    xssFilter: SECURITY_HEADERS.xssFilter,
  };
  await app.register(helmet, helmetOptions);

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

  logger.log(`
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

void bootstrap();
