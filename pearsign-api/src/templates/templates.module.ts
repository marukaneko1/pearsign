import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from './entities/template.entity';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { EnvelopesModule } from '../envelopes/envelopes.module';

/**
 * TemplatesModule
 *
 * Provides reusable document template management
 *
 * Features:
 * - Create and manage templates
 * - Template-to-envelope conversion
 * - Template sharing within organization
 * - Usage tracking
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Template]),
    EnvelopesModule, // For creating envelopes from templates
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
