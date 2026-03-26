/**
 * HTML/Text to PDF Generator
 *
 * Converts text or HTML content to a PDF document using pdf-lib.
 * This is used when sending generated documents that don't have an uploaded PDF file.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';

// Page dimensions (Letter size in points)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const PARAGRAPH_SPACING = 20;

// Colors
const HEADER_COLOR = rgb(0.145, 0.392, 0.918); // PearSign blue #2464ea
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);
const SECONDARY_COLOR = rgb(0.4, 0.4, 0.4);

interface TextToPageOptions {
  font: PDFFont;
  boldFont: PDFFont;
  fontSize: number;
  maxWidth: number;
}

/**
 * Wrap text to fit within a maximum width
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Convert plain text content to PDF bytes
 */
export async function textToPdf(content: string, title: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const maxWidth = PAGE_WIDTH - (MARGIN * 2);

  // Split content into paragraphs
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());

  let currentPage: PDFPage | null = null;
  let yPosition = 0;

  const createNewPage = (): PDFPage => {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    // Draw header on first page
    if (pdfDoc.getPageCount() === 1) {
      // Header background
      page.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - 70,
        width: PAGE_WIDTH,
        height: 70,
        color: HEADER_COLOR,
      });

      // Title
      page.drawText('PearSign', {
        x: MARGIN,
        y: PAGE_HEIGHT - 45,
        size: 22,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });

      // Document title
      const titleLines = wrapText(title, helveticaBold, 18, maxWidth);
      let titleY = PAGE_HEIGHT - 100;
      for (const line of titleLines) {
        page.drawText(line, {
          x: MARGIN,
          y: titleY,
          size: 18,
          font: helveticaBold,
          color: TEXT_COLOR,
        });
        titleY -= 22;
      }

      // Date
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      page.drawText(`Date: ${today}`, {
        x: MARGIN,
        y: titleY - 5,
        size: 10,
        font: helvetica,
        color: SECONDARY_COLOR,
      });

      // Divider line
      page.drawLine({
        start: { x: MARGIN, y: titleY - 20 },
        end: { x: PAGE_WIDTH - MARGIN, y: titleY - 20 },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });

      return page;
    }

    return page;
  };

  // Process each paragraph
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    if (!paragraph) continue;

    // Check if this is a heading (short line, possibly ending with :)
    const isHeading = paragraph.length < 60 && (
      paragraph.endsWith(':') ||
      paragraph.match(/^[0-9]+\./) ||
      paragraph.match(/^[A-Z][A-Z\s]+$/) ||
      paragraph.match(/^(Article|Section|Chapter|Part)\s/i)
    );

    const font = isHeading ? helveticaBold : helvetica;
    const fontSize = isHeading ? 12 : 11;

    // Wrap the paragraph text
    const lines = wrapText(paragraph, font, fontSize, maxWidth);

    // Calculate space needed for this paragraph
    const spaceNeeded = (lines.length * LINE_HEIGHT) + PARAGRAPH_SPACING;

    // Create new page if needed
    if (!currentPage || yPosition - spaceNeeded < MARGIN + 50) {
      currentPage = createNewPage();
      yPosition = pdfDoc.getPageCount() === 1 ? PAGE_HEIGHT - 180 : PAGE_HEIGHT - MARGIN;
    }

    // Draw lines
    for (const line of lines) {
      currentPage.drawText(line, {
        x: MARGIN,
        y: yPosition,
        size: fontSize,
        font,
        color: TEXT_COLOR,
      });
      yPosition -= LINE_HEIGHT;
    }

    // Add paragraph spacing
    yPosition -= PARAGRAPH_SPACING - LINE_HEIGHT;
  }

  // Add signature section on the last page
  if (currentPage) {
    const sigY = Math.min(yPosition - 40, 200);

    // Only add signature section if there's room
    if (sigY > MARGIN + 100) {
      currentPage.drawText('SIGNATURES', {
        x: MARGIN,
        y: sigY,
        size: 12,
        font: helveticaBold,
        color: TEXT_COLOR,
      });

      // Signature line
      currentPage.drawLine({
        start: { x: MARGIN, y: sigY - 50 },
        end: { x: MARGIN + 200, y: sigY - 50 },
        thickness: 1,
        color: rgb(0.3, 0.3, 0.3),
      });

      currentPage.drawText('Signature', {
        x: MARGIN,
        y: sigY - 65,
        size: 9,
        font: helvetica,
        color: SECONDARY_COLOR,
      });

      // Date line
      currentPage.drawLine({
        start: { x: PAGE_WIDTH - MARGIN - 180, y: sigY - 50 },
        end: { x: PAGE_WIDTH - MARGIN, y: sigY - 50 },
        thickness: 1,
        color: rgb(0.3, 0.3, 0.3),
      });

      currentPage.drawText('Date', {
        x: PAGE_WIDTH - MARGIN - 180,
        y: sigY - 65,
        size: 9,
        font: helvetica,
        color: SECONDARY_COLOR,
      });
    }
  }

  // Add footer to all pages
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Footer text
    page.drawText('Powered by PearSign - Secure Electronic Signatures', {
      x: MARGIN,
      y: 30,
      size: 8,
      font: helvetica,
      color: HEADER_COLOR,
    });

    // Page number
    page.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 60,
      y: 30,
      size: 8,
      font: helvetica,
      color: SECONDARY_COLOR,
    });
  }

  return pdfDoc.save();
}

/**
 * Convert HTML content to plain text for PDF generation
 * This is a simple implementation - for complex HTML, consider using a proper parser
 */
export function htmlToPlainText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert common HTML elements
  text = text.replace(/<h[1-6][^>]*>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '\n\n');
  text = text.replace(/<\/p>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  text = text.replace(/<\/li>/gi, '');
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<\/ul>/gi, '\n');
  text = text.replace(/<ol[^>]*>/gi, '\n');
  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '\n');
  text = text.replace(/<\/div>/gi, '');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&hellip;/g, '...');

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Convert any content (HTML or plain text) to PDF bytes
 */
export async function contentToPdf(content: string, title: string): Promise<Uint8Array> {
  // Check if content looks like HTML
  const isHtml = /<[a-z][\s\S]*>/i.test(content);

  const plainText = isHtml ? htmlToPlainText(content) : content;

  return textToPdf(plainText, title);
}

/**
 * Convert PDF bytes to base64 string
 */
export function pdfBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
