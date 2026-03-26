import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PdfEngineModule } from './pdf-engine/pdf-engine.module';
import { EnvelopesModule } from './envelopes/envelopes.module';
import { EmailModule } from './email/email.module';
import { StorageModule } from './storage/storage.module';
import { AuditModule } from './audit/audit.module';
import { BulkSendModule } from './bulk-send/bulk-send.module';
import { TemplatesModule } from './templates/templates.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Configuration imports
import databaseConfig from './config/database.config';
import appConfig from './config/app.config';
import storageConfig from './config/storage.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig, storageConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get('database')!,
    }),

    // Event system (global)
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),

    // Task scheduling (global)
    ScheduleModule.forRoot(),

    // Feature modules
    AuthModule,
    PdfEngineModule,
    EnvelopesModule,
    EmailModule,
    StorageModule,
    AuditModule,
    BulkSendModule,
    TemplatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards - apply JWT auth to all routes by default
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
