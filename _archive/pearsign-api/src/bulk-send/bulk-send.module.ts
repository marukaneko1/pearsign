import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { BulkSendJob } from './entities/bulk-send-job.entity';
import { BulkSendController } from './bulk-send.controller';
import { BulkSendService } from './services/bulk-send.service';
import { CsvParserService } from './services/csv-parser.service';
import { EnvelopesModule } from '../envelopes/envelopes.module';

/**
 * BulkSendModule
 *
 * Provides bulk envelope creation from CSV
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BulkSendJob]),
    EnvelopesModule, // For creating envelopes
    MulterModule.register({
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
      },
    }),
  ],
  controllers: [BulkSendController],
  providers: [BulkSendService, CsvParserService],
  exports: [BulkSendService],
})
export class BulkSendModule {}
