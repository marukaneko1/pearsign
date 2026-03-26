import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * StorageModule
 *
 * Provides S3-compatible storage for all document artifacts
 */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
