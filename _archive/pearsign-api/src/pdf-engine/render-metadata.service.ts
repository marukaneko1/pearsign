import { Injectable } from '@nestjs/common';
import * as pdfjsLib from 'pdfjs-dist';

/**
 * Text span extracted from PDF
 * Stores base coordinates at scale 1.0
 */
export interface TextSpan {
  id: string;
  pageNumber: number;
  content: string;
  baseX: number; // X at scale 1.0
  baseY: number; // Y at scale 1.0
  baseWidth: number; // Width at scale 1.0
  baseHeight: number; // Height at scale 1.0
  baseFontSize: number; // Font size at scale 1.0
  fontFamily: string;
  color: string;
  transform: number[]; // Original PDF transform matrix
}

/**
 * PDF page metadata
 */
export interface PageMetadata {
  pageNumber: number;
  width: number;
  height: number;
  textSpans: TextSpan[];
}

/**
 * Complete PDF render metadata
 */
export interface PdfRenderMetadata {
  totalPages: number;
  pages: PageMetadata[];
  hasTextLayer: boolean;
}

/**
 * RenderMetadataService
 *
 * Extracts text positions and metadata from PDFs
 *
 * CRITICAL RULES:
 * - All coordinates stored at scale 1.0 (base coordinates)
 * - Frontend calculates display coordinates: displayX = baseX * zoom
 * - Text extraction happens ONCE per page
 * - Original PDF is NEVER modified by this service
 */
@Injectable()
export class RenderMetadataService {
  /**
   * Extract complete PDF metadata
   */
  async extractPdfMetadata(pdfBytes: Uint8Array): Promise<PdfRenderMetadata> {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdfDocument = await loadingTask.promise;

    const totalPages = pdfDocument.numPages;
    const pages: PageMetadata[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const pageMetadata = await this.extractPageMetadata(page, pageNum);
      pages.push(pageMetadata);
    }

    const hasTextLayer = pages.some((p) => p.textSpans.length > 0);

    return {
      totalPages,
      pages,
      hasTextLayer,
    };
  }

  /**
   * Extract metadata for a single page
   */
  private async extractPageMetadata(
    page: any,
    pageNumber: number,
  ): Promise<PageMetadata> {
    const viewport = page.getViewport({ scale: 1.0 }); // Base scale
    const textContent = await page.getTextContent();

    const textSpans: TextSpan[] = [];

    textContent.items.forEach((item: any, index: number) => {
      if (!item.str || item.str.trim() === '') return;

      const transform = item.transform;

      // Extract base coordinates at scale 1.0
      const baseX = transform[4];
      const baseY = viewport.height - transform[5];
      const baseFontSize = Math.sqrt(
        transform[0] * transform[0] + transform[1] * transform[1],
      );
      const baseWidth = item.width;
      const baseHeight = item.height;

      const textSpan: TextSpan = {
        id: `text-${pageNumber}-${index}`,
        pageNumber,
        content: item.str,
        baseX,
        baseY,
        baseWidth,
        baseHeight,
        baseFontSize,
        fontFamily: item.fontName || 'sans-serif',
        color: '#000000', // Default, can be extracted from PDF if needed
        transform,
      };

      textSpans.push(textSpan);
    });

    return {
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      textSpans,
    };
  }

  /**
   * Calculate display coordinates for a given zoom level
   */
  calculateDisplayCoordinates(
    baseSpan: TextSpan,
    zoom: number,
  ): {
    displayX: number;
    displayY: number;
    displayWidth: number;
    displayHeight: number;
    displayFontSize: number;
  } {
    return {
      displayX: baseSpan.baseX * zoom,
      displayY: baseSpan.baseY * zoom,
      displayWidth: baseSpan.baseWidth * zoom,
      displayHeight: baseSpan.baseHeight * zoom,
      displayFontSize: baseSpan.baseFontSize * zoom,
    };
  }
}
