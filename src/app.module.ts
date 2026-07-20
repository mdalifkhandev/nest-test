import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { envValidationSchema } from './config/env.validation';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { winstonLogger } from './common/logger/winston.logger';
import { TaskModule } from './task/task.module';

@Module({
  imports: [
    // Env validation — missing variable হলে startup এই crash
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),

    // Winston logging
    WinstonModule.forRoot({ instance: winstonLogger }),

    // Rate limiting — 60 seconds এ max 20 requests globally
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60_000,
        limit: 20,
      },
    ]),

    PrismaModule,
    AuthModule,
    TaskModule,
  ],
  providers: [
    // Global rate limiting guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Global exception filter
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },

    // Global response interceptor
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
