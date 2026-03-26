/**
 * HTML / Markdown / Plain-text → PDF Generator
 *
 * Produces a professional, black-and-white legal document using Times Roman
 * (the standard typeface for US legal documents).
 *
 * Layout conventions:
 *  - 1-inch margins on all four sides
 *  - 12 pt body text, 18 pt leading (1.5×)
 *  - Document title centered, bold, 15 pt on the first page
 *  - Article / section headings numbered and bold
 *  - Running header (title + page number) on pages 2+
 *  - "Page X of Y" footer centered on every page
 *  - Two-column signature block with proper legal formatting
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';

// ─── Page geometry (US Letter, points) ───────────────────────────────────────
const PAGE_W   = 612;
const PAGE_H   = 792;
const MARGIN   = 72;   // 1-inch on every side
const TEXT_W   = PAGE_W - MARGIN * 2;   // 468 pt usable width

// ─── Typography ───────────────────────────────────────────────────────────────
const SZ_TITLE  = 15;   // centered document title on page 1
const SZ_H1     = 13;   // major article heading (all-caps)
const SZ_H2     = 12;   // section heading (bold)
const SZ_H3     = 12;   // subsection heading (bold-italic)
const SZ_BODY   = 12;   // body text
const SZ_SMALL  = 10;   // date / subtitle
const SZ_FOOTER =  9;   // footer / running header

const LH_TITLE  = 22;   // line-height for title
const LH_H1     = 18;
const LH_H2     = 17;
const LH_H3     = 16;
const LH_BODY   = 18;   // 1.5× body leading
const LH_LIST   = 17;

// Spacing between blocks
const SP_BEFORE_H1   = 20;
const SP_AFTER_H1    = 10;
const SP_BEFORE_H2   = 14;
const SP_AFTER_H2    =  6;
const SP_BEFORE_H3   =  8;
const SP_AFTER_H3    =  4;
const SP_AFTER_PARA  = 12;
const SP_AFTER_RULE  = 12;
const SP_AFTER_ITEM  =  3;

const INDENT_BULLET = 24;   // hanging indent for bullets
const INDENT_NUMBER = 28;   // hanging indent for numbered items

// ─── Colours — black & white only ────────────────────────────────────────────
const BLACK    = rgb(0,    0,    0   );
const DARK     = rgb(0.15, 0.15, 0.15);  // near-black for body
const MID      = rgb(0.35, 0.35, 0.35);  // medium gray for labels
const RULE_CLR = rgb(0,    0,    0   );  // black rules

// ─── Block types ──────────────────────────────────────────────────────────────
type BlockKind =
  | 'h1' | 'h2' | 'h3'
  | 'body'
  | 'bullet'
  | 'numbered'
  | 'rule'
  | 'signature_section';

interface Block {
  kind: BlockKind;
  text: string;
  rawText: string;
  bold?: boolean;
  indent?: number;
  number?: string;
}

// ─── WinAnsi sanitiser ────────────────────────────────────────────────────────
function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/[═─━┄┅┈┉┼╪╫╬╭╮╯╰]/g, '-')
    .replace(/[║│┃┆┇┊┋]/g, '|')
    .replace(/[╔╗╚╝╠╣╦╩]/g, '+')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')
    .replace(/\u00B7/g, '.')
    .replace(/[^\x00-\xFF]/g, '');
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1');
}

// ─── Document parser ──────────────────────────────────────────────────────────
function parseDocument(raw: string): Block[] {
  const lines  = raw.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line    = lines[i];
    const trimmed = line.trim();
    i++;

    if (!trimmed) continue;

    // Markdown headings
    if (/^#{1,6}\s/.test(trimmed)) {
      const m = trimmed.match(/^(#{1,6})\s+(.*)/);
      if (m) {
        const level = m[1].length;
        const text  = sanitizeForWinAnsi(stripInlineMarkdown(m[2]));
        const kind: BlockKind = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
        blocks.push({ kind, text, rawText: trimmed, bold: true });
        continue;
      }
    }

    // Horizontal rules
    if (/^(-{3,}|={3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ kind: 'rule', text: '', rawText: trimmed });
      continue;
    }

    // Explicit SIGNATURES section marker
    if (/^(signatures?|signature\s+block|sign\s+here)\s*:?\s*$/i.test(trimmed) ||
        /^-+\s*(signatures?)\s*-+$/i.test(trimmed) ||
        /^##\s*signatures?/i.test(trimmed)) {
      blocks.push({ kind: 'signature_section', text: trimmed, rawText: trimmed, bold: true });
      continue;
    }

    // Bullet list
    const bulletMatch = trimmed.match(/^([-*•])\s+(.*)/);
    if (bulletMatch) {
      const indent = line.match(/^\s+/) ? 1 : 0;
      const text   = sanitizeForWinAnsi(stripInlineMarkdown(bulletMatch[2]));
      blocks.push({ kind: 'bullet', text, rawText: trimmed, indent });
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+\.|[a-z]\))\s+(.*)/);
    if (numMatch) {
      const indent = line.match(/^\s+/) ? 1 : 0;
      const text   = sanitizeForWinAnsi(stripInlineMarkdown(numMatch[2]));
      blocks.push({ kind: 'numbered', text, rawText: trimmed, number: numMatch[1], indent });
      continue;
    }

    // All-caps ARTICLE / SECTION headings
    if (
      trimmed.length < 80 &&
      /^(ARTICLE|SECTION|CHAPTER|PART|SCHEDULE|EXHIBIT|APPENDIX)\s/i.test(trimmed) &&
      trimmed === trimmed.toUpperCase()
    ) {
      blocks.push({ kind: 'h1', text: sanitizeForWinAnsi(trimmed), rawText: trimmed, bold: true });
      continue;
    }

    // Generic short ALL-CAPS line
    if (
      trimmed.length > 2 &&
      trimmed.length < 70 &&
      /^[A-Z0-9][A-Z0-9 ,.&'-]+$/.test(trimmed) &&
      !/^\d+$/.test(trimmed)
    ) {
      const isFirst = blocks.filter(b => b.kind !== 'rule').length === 0;
      blocks.push({
        kind: isFirst ? 'h1' : 'h2',
        text: sanitizeForWinAnsi(trimmed),
        rawText: trimmed,
        bold: true,
      });
      continue;
    }

    // Short label ending with colon
    if (trimmed.endsWith(':') && trimmed.length < 60 && trimmed.includes(' ')) {
      const text = sanitizeForWinAnsi(stripInlineMarkdown(trimmed.slice(0, -1)));
      blocks.push({ kind: 'h3', text, rawText: trimmed, bold: true });
      continue;
    }

    // Inline bold-only line
    if (/^\*\*[^*]+\*\*\s*$/.test(trimmed) && trimmed.length < 100) {
      const text = sanitizeForWinAnsi(stripInlineMarkdown(trimmed));
      blocks.push({ kind: 'h3', text, rawText: trimmed, bold: true });
      continue;
    }

    // Regular paragraph — collect continuation lines
    let para = trimmed;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        /^#{1,6}\s/.test(next) ||
        /^(-{3,}|={3,}|_{3,})$/.test(next) ||
        /^[-*•]\s/.test(next) ||
        /^\d+\.\s/.test(next)
      ) break;
      para += ' ' + next;
      i++;
    }

    blocks.push({
      kind: 'body',
      text: sanitizeForWinAnsi(stripInlineMarkdown(para)),
      rawText: para,
    });
  }

  return blocks;
}

// ─── Text wrapping ────────────────────────────────────────────────────────────
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text.trim()) return [''];
  const words   = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Return the x offset that centres `text` horizontally on the page. */
function cx(text: string, font: PDFFont, size: number): number {
  return (PAGE_W - font.widthOfTextAtSize(text, size)) / 2;
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function textToPdf(rawContent: string, title: string): Promise<Uint8Array> {
  const content   = sanitizeForWinAnsi(rawContent);
  const safeTitle = sanitizeForWinAnsi(title);

  const pdfDoc = await PDFDocument.create();

  // Times Roman family — the standard typeface for legal documents
  const regular   = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold      = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const italic    = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const boldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  const blocks = parseDocument(content);
  const hasSignatureSection = blocks.some(b => b.kind === 'signature_section');

  // ── Page management ───────────────────────────────────────────────────────
  let page: PDFPage | null = null;
  let y = 0;
  let pageIndex = 0;

  function newPage(): PDFPage {
    const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pageIndex = pdfDoc.getPageCount() - 1;

    if (pageIndex === 0) {
      // ── First page: centered title block ──────────────────────────────
      const titleLines = wrapText(safeTitle.toUpperCase(), bold, SZ_TITLE, TEXT_W);
      let ty = PAGE_H - MARGIN - 8;

      for (const tl of titleLines) {
        p.drawText(tl, {
          x: cx(tl, bold, SZ_TITLE),
          y: ty,
          size: SZ_TITLE,
          font: bold,
          color: BLACK,
        });
        ty -= LH_TITLE;
      }

      // Date centered in italics
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      ty -= 4;
      p.drawText(today, {
        x: cx(today, italic, SZ_SMALL),
        y: ty,
        size: SZ_SMALL,
        font: italic,
        color: DARK,
      });
      ty -= 16;

      // Double rule beneath header
      p.drawLine({ start: { x: MARGIN, y: ty }, end: { x: PAGE_W - MARGIN, y: ty }, thickness: 1.5, color: BLACK });
      ty -= 3;
      p.drawLine({ start: { x: MARGIN, y: ty }, end: { x: PAGE_W - MARGIN, y: ty }, thickness: 0.5, color: BLACK });

      y = ty - 18;  // content begins here
    } else {
      // ── Subsequent pages: running header ─────────────────────────────
      const headerY = PAGE_H - MARGIN + 14;
      // Title left, page number right
      const shortTitle = safeTitle.length > 60 ? safeTitle.substring(0, 57) + '...' : safeTitle;
      p.drawText(shortTitle, {
        x: MARGIN,
        y: headerY,
        size: SZ_FOOTER,
        font: italic,
        color: DARK,
      });
      const pageLabel = `Page ${pageIndex + 1}`;
      p.drawText(pageLabel, {
        x: PAGE_W - MARGIN - italic.widthOfTextAtSize(pageLabel, SZ_FOOTER),
        y: headerY,
        size: SZ_FOOTER,
        font: italic,
        color: DARK,
      });
      // Thin rule below header
      p.drawLine({
        start: { x: MARGIN, y: headerY - 6 },
        end:   { x: PAGE_W - MARGIN, y: headerY - 6 },
        thickness: 0.75,
        color: BLACK,
      });
      y = PAGE_H - MARGIN - 4;
    }

    return p;
  }

  function ensureSpace(needed: number): void {
    if (!page || y - needed < MARGIN + 36) {
      page = newPage();
    }
  }

  page = newPage();

  // ── Render blocks ─────────────────────────────────────────────────────────
  for (const block of blocks) {

    switch (block.kind) {

      // ── Horizontal rule ────────────────────────────────────────────────
      case 'rule': {
        ensureSpace(SP_AFTER_RULE + 8);
        y -= SP_AFTER_RULE / 2;
        page!.drawLine({
          start: { x: MARGIN, y },
          end:   { x: PAGE_W - MARGIN, y },
          thickness: 0.75,
          color: RULE_CLR,
        });
        y -= SP_AFTER_RULE;
        break;
      }

      // ── H1 — major article heading, all-caps, bold, centered ──────────
      case 'h1': {
        const text  = block.text.toUpperCase();
        const lines = wrapText(text, bold, SZ_H1, TEXT_W);
        ensureSpace(lines.length * LH_H1 + SP_BEFORE_H1 + SP_AFTER_H1);
        y -= SP_BEFORE_H1;
        for (const ln of lines) {
          page!.drawText(ln, {
            x: cx(ln, bold, SZ_H1),
            y,
            size: SZ_H1,
            font: bold,
            color: BLACK,
          });
          y -= LH_H1;
        }
        y -= SP_AFTER_H1;
        break;
      }

      // ── H2 — section heading, bold, left-aligned ──────────────────────
      case 'h2': {
        const lines = wrapText(block.text, bold, SZ_H2, TEXT_W);
        ensureSpace(lines.length * LH_H2 + SP_BEFORE_H2 + SP_AFTER_H2);
        y -= SP_BEFORE_H2;
        for (const ln of lines) {
          page!.drawText(ln, {
            x: MARGIN,
            y,
            size: SZ_H2,
            font: bold,
            color: BLACK,
          });
          y -= LH_H2;
        }
        y -= SP_AFTER_H2;
        break;
      }

      // ── H3 — subsection heading, bold-italic, left-aligned ───────────
      case 'h3': {
        const lines = wrapText(block.text, boldItalic, SZ_H3, TEXT_W);
        ensureSpace(lines.length * LH_H3 + SP_BEFORE_H3 + SP_AFTER_H3);
        y -= SP_BEFORE_H3;
        for (const ln of lines) {
          page!.drawText(ln, {
            x: MARGIN,
            y,
            size: SZ_H3,
            font: boldItalic,
            color: BLACK,
          });
          y -= LH_H3;
        }
        y -= SP_AFTER_H3;
        break;
      }

      // ── Body paragraph ────────────────────────────────────────────────
      case 'body': {
        const lines = wrapText(block.text, regular, SZ_BODY, TEXT_W);
        ensureSpace(lines.length * LH_BODY + SP_AFTER_PARA);
        for (const ln of lines) {
          page!.drawText(ln, {
            x: MARGIN,
            y,
            size: SZ_BODY,
            font: regular,
            color: DARK,
          });
          y -= LH_BODY;
        }
        y -= SP_AFTER_PARA;
        break;
      }

      // ── Bullet item ───────────────────────────────────────────────────
      case 'bullet': {
        const depth  = (block.indent ?? 0) + 1;
        const xText  = MARGIN + INDENT_BULLET * depth;
        const avail  = TEXT_W - INDENT_BULLET * depth;
        const lines  = wrapText(block.text, regular, SZ_BODY, avail);
        ensureSpace(lines.length * LH_LIST + SP_AFTER_ITEM);

        // Em dash bullet marker, flush left of text column
        page!.drawText('\u2022', {
          x: xText - 14,
          y,
          size: SZ_BODY,
          font: regular,
          color: BLACK,
        });
        for (let li = 0; li < lines.length; li++) {
          page!.drawText(lines[li], { x: xText, y, size: SZ_BODY, font: regular, color: DARK });
          y -= LH_LIST;
        }
        y -= SP_AFTER_ITEM;
        break;
      }

      // ── Numbered item ─────────────────────────────────────────────────
      case 'numbered': {
        const depth  = (block.indent ?? 0) + 1;
        const xText  = MARGIN + INDENT_NUMBER * depth;
        const avail  = TEXT_W - INDENT_NUMBER * depth;
        const lines  = wrapText(block.text, regular, SZ_BODY, avail);
        ensureSpace(lines.length * LH_LIST + SP_AFTER_ITEM);

        page!.drawText(block.number ?? '1.', {
          x: xText - bold.widthOfTextAtSize(block.number ?? '1.', SZ_BODY) - 4,
          y,
          size: SZ_BODY,
          font: bold,
          color: BLACK,
        });
        for (let li = 0; li < lines.length; li++) {
          page!.drawText(lines[li], { x: xText, y, size: SZ_BODY, font: regular, color: DARK });
          y -= LH_LIST;
        }
        y -= SP_AFTER_ITEM;
        break;
      }

      // ── Explicit SIGNATURES heading ───────────────────────────────────
      case 'signature_section': {
        ensureSpace(200);
        y -= SP_BEFORE_H1;
        drawSignatureBlock(page!, y, regular, bold, italic);
        y -= 190;
        break;
      }
    }
  }

  // ── Auto-append signature section if not already present ─────────────────
  if (!hasSignatureSection) {
    ensureSpace(210);
    y -= SP_BEFORE_H1;
    drawSignatureBlock(page!, y, regular, bold, italic);
  }

  // ── Footer on every page: "Page X of Y" centered ────────────────────────
  const totalPages = pdfDoc.getPageCount();
  for (let pi = 0; pi < totalPages; pi++) {
    const p = pdfDoc.getPage(pi);

    p.drawLine({
      start: { x: MARGIN,          y: MARGIN - 6 },
      end:   { x: PAGE_W - MARGIN, y: MARGIN - 6 },
      thickness: 0.75,
      color: BLACK,
    });

    const footerLabel = `Page ${pi + 1} of ${totalPages}`;
    p.drawText(footerLabel, {
      x: cx(footerLabel, regular, SZ_FOOTER),
      y: MARGIN - 20,
      size: SZ_FOOTER,
      font: regular,
      color: DARK,
    });
  }

  return pdfDoc.save();
}

// ─── Legal signature block ────────────────────────────────────────────────────
function drawSignatureBlock(
  page: PDFPage,
  topY: number,
  regular: PDFFont,
  bold: PDFFont,
  italic: PDFFont,
): void {
  const col1X = MARGIN;
  const col2X = PAGE_W / 2 + 10;
  const lineW = PAGE_W / 2 - MARGIN - 20;

  // Preamble
  const preamble =
    'IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.';
  const pLines = wrapText(preamble, italic, 11, PAGE_W - MARGIN * 2);
  let py = topY;
  for (const pl of pLines) {
    page.drawText(pl, { x: MARGIN, y: py, size: 11, font: italic, color: DARK });
    py -= 16;
  }
  py -= 14;

  // Column labels
  page.drawText('PARTY 1:', { x: col1X, y: py, size: 10, font: bold, color: BLACK });
  page.drawText('PARTY 2:', { x: col2X, y: py, size: 10, font: bold, color: BLACK });
  py -= 30;

  // Helper to draw one labelled signature line
  function sigLine(
    x: number,
    width: number,
    labelText: string,
    currentY: number,
  ): number {
    page.drawLine({
      start: { x, y: currentY },
      end:   { x: x + width, y: currentY },
      thickness: 0.75,
      color: BLACK,
    });
    page.drawText(labelText, {
      x,
      y: currentY - 13,
      size: 9,
      font: regular,
      color: MID,
    });
    return currentY - 34;
  }

  // Signature
  const r1 = sigLine(col1X, lineW, 'Signature', py);
  sigLine(col2X, lineW, 'Signature', py);

  // Printed Name
  const r2 = sigLine(col1X, lineW, 'Printed Name', r1);
  sigLine(col2X, lineW, 'Printed Name', r1);

  // Title
  const r3 = sigLine(col1X, lineW, 'Title', r2);
  sigLine(col2X, lineW, 'Title', r2);

  // Date (shorter line — 55% width)
  sigLine(col1X, lineW * 0.55, 'Date', r3);
  sigLine(col2X, lineW * 0.55, 'Date', r3);
}

// ─── HTML → plain text ────────────────────────────────────────────────────────
export function htmlToPlainText(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<h1[^>]*>/gi, '\n# ').replace(/<\/h1>/gi, '\n');
  text = text.replace(/<h2[^>]*>/gi, '\n## ').replace(/<\/h2>/gi, '\n');
  text = text.replace(/<h3[^>]*>/gi, '\n### ').replace(/<\/h3>/gi, '\n');
  text = text.replace(/<h[456][^>]*>/gi, '\n#### ').replace(/<\/h[456]>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n\n');
  text = text.replace(/<\/p>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  text = text.replace(/<\/li>/gi, '');
  text = text.replace(/<[ou]l[^>]*>/gi, '\n');
  text = text.replace(/<\/[ou]l>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '\n');
  text = text.replace(/<\/div>/gi, '');
  text = text.replace(/<strong[^>]*>/gi, '**');
  text = text.replace(/<\/strong>/gi, '**');
  text = text.replace(/<b[^>]*>/gi, '**');
  text = text.replace(/<\/b>/gi, '**');
  text = text.replace(/<[^>]+>/g, '');
  text = text
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&mdash;/g, '--').replace(/&ndash;/g, '-')
    .replace(/&hellip;/g, '...');
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert any content (HTML or plain/markdown text) to a professional PDF.
 */
export async function contentToPdf(content: string, title: string): Promise<Uint8Array> {
  const isHtml = /<[a-z][\s\S]*>/i.test(content);
  const text   = isHtml ? htmlToPlainText(content) : content;
  return textToPdf(text, title);
}

/**
 * Encode PDF bytes as a base64 string.
 */
export function pdfBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
