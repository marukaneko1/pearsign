/**
 * Text to DOCX Generator
 *
 * Converts text content to a Word document using the docx library.
 * Produces professional legal document formatting.
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  BorderStyle,
  Packer,
  PageBreak,
  TableOfContents,
  convertInchesToTwip,
} from 'docx';

interface DocxOptions {
  title: string;
  author?: string;
  company?: string;
  createdAt?: Date;
}

/**
 * Parse text content and detect headings, paragraphs, etc.
 */
function parseContent(content: string): Array<{ type: 'title' | 'heading' | 'subheading' | 'paragraph' | 'divider' | 'signature-line' | 'empty' | 'list-item' | 'sub-list-item'; text: string }> {
  const lines = content.split('\n');
  const parsed: Array<{ type: 'title' | 'heading' | 'subheading' | 'paragraph' | 'divider' | 'signature-line' | 'empty' | 'list-item' | 'sub-list-item'; text: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      parsed.push({ type: 'empty', text: '' });
      continue;
    }

    // Divider lines (═══ or ─── or ___)
    if (/^[═─_]{10,}$/.test(trimmed)) {
      parsed.push({ type: 'divider', text: '' });
      continue;
    }

    // Document title (first major heading, all caps, centered)
    if (i < 5 && /^[A-Z][A-Z\s]+$/.test(trimmed) && trimmed.length > 5 && !trimmed.startsWith('ARTICLE')) {
      parsed.push({ type: 'title', text: trimmed });
      continue;
    }

    // Article headings (ARTICLE X - NAME)
    if (/^ARTICLE\s+\d+|^ARTICLE\s+[IVX]+/i.test(trimmed)) {
      parsed.push({ type: 'heading', text: trimmed });
      continue;
    }

    // Section headings (ALL CAPS, like PARTIES, RECITALS, SIGNATURES)
    if (/^[A-Z][A-Z\s:]+$/.test(trimmed) && trimmed.length < 60) {
      parsed.push({ type: 'heading', text: trimmed });
      continue;
    }

    // Subheadings (numbered like 1.1, 2.1, X.1, etc.)
    if (/^\d+\.\d+\s|^X\.\d+\s/i.test(trimmed)) {
      parsed.push({ type: 'subheading', text: trimmed });
      continue;
    }

    // Sub-list items (a), (b), (c)
    if (/^\s*\([a-z]\)/.test(trimmed)) {
      parsed.push({ type: 'sub-list-item', text: trimmed });
      continue;
    }

    // List items with bullets or dashes
    if (/^[•\-\*]\s/.test(trimmed)) {
      parsed.push({ type: 'list-item', text: trimmed });
      continue;
    }

    // Signature lines
    if (trimmed.includes('Signature:') || trimmed.includes('_________________________________') || trimmed.startsWith('Name:') || trimmed.startsWith('Title:') || trimmed.startsWith('Date:') || trimmed.startsWith('Printed Name:')) {
      parsed.push({ type: 'signature-line', text: trimmed });
      continue;
    }

    // Regular paragraphs
    parsed.push({ type: 'paragraph', text: trimmed });
  }

  return parsed;
}

/**
 * Convert text content to a Word DOCX document
 */
export async function textToDocx(content: string, options: DocxOptions): Promise<Uint8Array> {
  const parsed = parseContent(content);
  const children: Paragraph[] = [];

  let foundTitle = false;

  // Process content
  for (const item of parsed) {
    switch (item.type) {
      case 'title':
        if (!foundTitle) {
          foundTitle = true;
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: item.text,
                  bold: true,
                  size: 32, // 16pt
                  font: 'Times New Roman',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 400 },
            })
          );
        } else {
          // Secondary titles become headings
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: item.text,
                  bold: true,
                  size: 24,
                  font: 'Times New Roman',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 300, after: 200 },
            })
          );
        }
        break;

      case 'heading':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                bold: true,
                size: 24, // 12pt
                font: 'Times New Roman',
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
          })
        );
        break;

      case 'subheading':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                bold: true,
                size: 22, // 11pt
                font: 'Times New Roman',
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            indent: { left: convertInchesToTwip(0.25) },
          })
        );
        break;

      case 'paragraph':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                size: 22, // 11pt
                font: 'Times New Roman',
              }),
            ],
            spacing: { after: 120, line: 276 }, // 1.15 line spacing
            alignment: AlignmentType.JUSTIFIED,
          })
        );
        break;

      case 'list-item':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                size: 22,
                font: 'Times New Roman',
              }),
            ],
            indent: { left: convertInchesToTwip(0.5) },
            spacing: { after: 80 },
          })
        );
        break;

      case 'sub-list-item':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                size: 22,
                font: 'Times New Roman',
              }),
            ],
            indent: { left: convertInchesToTwip(1) },
            spacing: { after: 60 },
          })
        );
        break;

      case 'signature-line':
        if (item.text.includes('_________________________________') || item.text.includes('Signature:')) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: item.text.replace(/_+/g, ''),
                  size: 22,
                  font: 'Times New Roman',
                }),
              ],
              spacing: { before: 200, after: 40 },
              border: {
                bottom: {
                  color: '000000',
                  style: BorderStyle.SINGLE,
                  size: 6,
                  space: 1,
                },
              },
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: item.text,
                  size: 22,
                  font: 'Times New Roman',
                }),
              ],
              spacing: { after: 60 },
            })
          );
        }
        break;

      case 'divider':
        children.push(
          new Paragraph({
            children: [],
            spacing: { before: 100, after: 100 },
          })
        );
        break;

      case 'empty':
        children.push(new Paragraph({ children: [] }));
        break;
    }
  }

  // Create the document with professional legal formatting
  const doc = new Document({
    creator: options.author || 'PearSign',
    title: options.title,
    description: `Legal Document: ${options.title}`,
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 22, // 11pt default
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: options.title,
                    italics: true,
                    size: 18,
                    font: 'Times New Roman',
                    color: '666666',
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Page ',
                    size: 18,
                    font: 'Times New Roman',
                    color: '666666',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    font: 'Times New Roman',
                    color: '666666',
                  }),
                  new TextRun({
                    text: ' of ',
                    size: 18,
                    font: 'Times New Roman',
                    color: '666666',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    font: 'Times New Roman',
                    color: '666666',
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  // Generate the document as a Uint8Array
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

/**
 * Convert DOCX bytes to base64 string
 */
export function docxBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
