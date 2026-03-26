import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DocumentTextMap } from './text-map.service';
import { TextSpan } from './render-metadata.service';
import * as crypto from 'crypto';

/**
 * ApplyEditsService
 *
 * Generates new PDF versions with text edits applied
 *
 * CRITICAL RULES:
 * - Original PDF is NEVER modified
 * - Creates new version with edits flattened
 * - Hashes output for integrity
 * - Preserves page layout and formatting
 */
@Injectable()
export class ApplyEditsService {
  /**
   * Apply text edits to PDF and generate new version
   */
  async applyEdits(
    originalPdfBytes: Uint8Array,
    textMap: DocumentTextMap,
  ): Promise<{
    pdfBytes: Uint8Array;
    hash: string;
    changedPages: number[];
  }> {
    // Load original PDF
    const pdfDoc = await PDFDocument.load(originalPdfBytes);

    // Embed font (use Helvetica for now, can be extended)
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(
      StandardFonts.HelveticaBold,
    );

    const changedPages = new Set<number>();

    // Apply edits page by page
    const totalPages = pdfDoc.getPageCount();

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = pdfDoc.getPage(pageNum - 1); // pdf-lib uses 0-indexed
      const { height } = page.getSize();

      // Get edited text spans for this page
      const editedSpans = this.getEditedSpansForPage(textMap, pageNum);

      if (editedSpans.length === 0) continue;

      // Mark page as changed
      changedPages.add(pageNum);

      // Remove original text (draw white rectangle over it)
      for (const span of editedSpans) {
        page.drawRectangle({
          x: span.baseX,
          y: height - span.baseY - span.baseHeight,
          width: span.baseWidth,
          height: span.baseHeight,
          color: rgb(1, 1, 1), // White
        });
      }

      // Draw new text
      for (const span of editedSpans) {
        page.drawText(span.content, {
          x: span.baseX,
          y: height - span.baseY - span.baseHeight,
          size: span.baseFontSize,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Save modified PDF
    const pdfBytes = await pdfDoc.save();

    // Generate hash
    const hash = this.generateHash(pdfBytes);

    return {
      pdfBytes,
      hash,
      changedPages: Array.from(changedPages),
    };
  }

  /**
   * Get edited text spans for a specific page
   */
  private getEditedSpansForPage(
    textMap: DocumentTextMap,
    pageNumber: number,
  ): TextSpan[] {
    const editedSpanIds = new Set(textMap.edits.map((e) => e.spanId));

    return Array.from(textMap.textSpans.values()).filter(
      (span) => span.pageNumber === pageNumber && editedSpanIds.has(span.id),
    );
  }

  /**
   * Generate SHA-256 hash of PDF bytes
   */
  private generateHash(pdfBytes: Uint8Array): string {
    return crypto.createHash('sha256').update(pdfBytes).digest('hex');
  }

  /**
   * Flatten drawing elements (shapes, highlights) to PDF
   */
  async flattenDrawingElements(
    pdfBytes: Uint8Array,
    drawElements: any[], // Will be properly typed in the future
  ): Promise<{
    pdfBytes: Uint8Array;
    hash: string;
  }> {
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Group elements by page
    const elementsByPage = new Map<number, any[]>();

    drawElements.forEach((element) => {
      const pageElements = elementsByPage.get(element.pageNumber) || [];
      pageElements.push(element);
      elementsByPage.set(element.pageNumber, pageElements);
    });

    // Draw elements page by page
    for (const [pageNum, elements] of elementsByPage) {
      const page = pdfDoc.getPage(pageNum - 1);
      const { height } = page.getSize();

      for (const element of elements) {
        switch (element.type) {
          case 'rectangle':
            page.drawRectangle({
              x: element.x,
              y: height - element.y - element.height,
              width: element.width,
              height: element.height,
              borderColor: this.hexToRgb(element.color),
              borderWidth: 2,
            });
            break;

          case 'circle':
            page.drawEllipse({
              x: element.x + element.width / 2,
              y: height - element.y - element.height / 2,
              xScale: element.width / 2,
              yScale: element.height / 2,
              borderColor: this.hexToRgb(element.color),
              borderWidth: 2,
            });
            break;

          case 'highlight':
            page.drawRectangle({
              x: element.x,
              y: height - element.y - element.height,
              width: element.width,
              height: element.height,
              color: this.hexToRgb(element.color, 0.3),
              opacity: 0.3,
            });
            break;

          // More drawing types can be added here
        }
      }
    }

    // Save modified PDF
    const finalPdfBytes = await pdfDoc.save();

    // Generate hash
    const hash = this.generateHash(finalPdfBytes);

    return {
      pdfBytes: finalPdfBytes,
      hash,
    };
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string, opacity: number = 1.0): any {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    if (!result) {
      return rgb(0, 0, 0); // Default to black
    }

    return rgb(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
    );
  }
}
