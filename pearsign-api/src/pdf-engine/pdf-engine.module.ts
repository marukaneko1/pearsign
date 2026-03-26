import { Module } from '@nestjs/common';
import { RenderMetadataService } from './render-metadata.service';
import { TextMapService } from './text-map.service';
import { ApplyEditsService } from './apply-edits.service';
import { FinalizePdfService } from './finalize-pdf.service';

/**
 * PdfEngineModule
 *
 * Provides PDF processing capabilities:
 * - Text extraction and positioning
 * - Text edit validation and application
 * - Drawing element flattening
 * - Document finalization with signatures
 *
 * ARCHITECTURE PRINCIPLE:
 * Frontend NEVER manipulates PDFs directly.
 * It submits "edit intents" to this backend service.
 */
@Module({
  providers: [
    RenderMetadataService,
    TextMapService,
    ApplyEditsService,
    FinalizePdfService,
  ],
  exports: [
    RenderMetadataService,
    TextMapService,
    ApplyEditsService,
    FinalizePdfService,
  ],
})
export class PdfEngineModule {}
