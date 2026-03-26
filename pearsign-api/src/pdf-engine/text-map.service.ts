import { Injectable, BadRequestException } from '@nestjs/common';
import { TextSpan } from './render-metadata.service';

/**
 * Text edit operation
 */
export interface TextEdit {
  spanId: string;
  pageNumber: number;
  originalContent: string;
  newContent: string;
  timestamp: Date;
}

/**
 * Text map for a document
 * Tracks all text spans and their edit state
 */
export interface DocumentTextMap {
  documentId: string;
  version: number;
  textSpans: Map<string, TextSpan>;
  edits: TextEdit[];
  lastModified: Date;
}

/**
 * TextMapService
 *
 * Manages the editable text layer for PDFs
 *
 * CRITICAL RULES:
 * - Text spans extracted ONCE per page
 * - Edits stored as diffs (original → new)
 * - No re-extraction after edits (preserves changes)
 * - Validates edit ranges before applying
 */
@Injectable()
export class TextMapService {
  /**
   * Create a text map from extracted text spans
   */
  createTextMap(
    documentId: string,
    version: number,
    textSpans: TextSpan[],
  ): DocumentTextMap {
    const spanMap = new Map<string, TextSpan>();

    textSpans.forEach((span) => {
      spanMap.set(span.id, span);
    });

    return {
      documentId,
      version,
      textSpans: spanMap,
      edits: [],
      lastModified: new Date(),
    };
  }

  /**
   * Apply an edit to the text map
   * Validates the edit before applying
   */
  applyEdit(textMap: DocumentTextMap, edit: TextEdit): DocumentTextMap {
    const span = textMap.textSpans.get(edit.spanId);

    if (!span) {
      throw new BadRequestException(
        `Text span ${edit.spanId} not found in document`,
      );
    }

    if (span.content !== edit.originalContent) {
      throw new BadRequestException(
        `Original content mismatch for span ${edit.spanId}. ` +
          `Expected: "${edit.originalContent}", Found: "${span.content}"`,
      );
    }

    // Update the span content
    span.content = edit.newContent;

    // Record the edit
    textMap.edits.push(edit);
    textMap.lastModified = new Date();

    return textMap;
  }

  /**
   * Apply multiple edits in batch
   */
  applyEdits(textMap: DocumentTextMap, edits: TextEdit[]): DocumentTextMap {
    edits.forEach((edit) => {
      this.applyEdit(textMap, edit);
    });

    return textMap;
  }

  /**
   * Get all edited text spans
   */
  getEditedSpans(textMap: DocumentTextMap): TextSpan[] {
    const editedSpanIds = new Set(textMap.edits.map((e) => e.spanId));

    return Array.from(textMap.textSpans.values()).filter((span) =>
      editedSpanIds.has(span.id),
    );
  }

  /**
   * Get edit history for a specific span
   */
  getSpanEditHistory(textMap: DocumentTextMap, spanId: string): TextEdit[] {
    return textMap.edits.filter((edit) => edit.spanId === spanId);
  }

  /**
   * Validate that a page exists in the text map
   */
  validatePage(textMap: DocumentTextMap, pageNumber: number): void {
    const hasPage = Array.from(textMap.textSpans.values()).some(
      (span) => span.pageNumber === pageNumber,
    );

    if (!hasPage) {
      throw new BadRequestException(`Page ${pageNumber} not found in document`);
    }
  }

  /**
   * Get all text spans for a specific page
   */
  getPageSpans(textMap: DocumentTextMap, pageNumber: number): TextSpan[] {
    return Array.from(textMap.textSpans.values()).filter(
      (span) => span.pageNumber === pageNumber,
    );
  }

  /**
   * Export text map to JSON for storage
   */
  exportToJson(textMap: DocumentTextMap): string {
    return JSON.stringify({
      documentId: textMap.documentId,
      version: textMap.version,
      textSpans: Array.from(textMap.textSpans.entries()),
      edits: textMap.edits,
      lastModified: textMap.lastModified,
    });
  }

  /**
   * Import text map from JSON
   */
  importFromJson(json: string): DocumentTextMap {
    const data = JSON.parse(json);

    const spanMap = new Map<string, TextSpan>();
    data.textSpans.forEach(([id, span]: [string, TextSpan]) => {
      spanMap.set(id, span);
    });

    return {
      documentId: data.documentId,
      version: data.version,
      textSpans: spanMap,
      edits: data.edits,
      lastModified: new Date(data.lastModified),
    };
  }
}
