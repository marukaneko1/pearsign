/**
 * Sample PDF API
 * Generates a professional-looking sample PDF for demo signing purposes
 */

import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function GET() {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Add a page
    const page = pdfDoc.addPage([612, 792]); // Letter size

    // Get fonts
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();

    // Header with teal background
    page.drawRectangle({
      x: 0,
      y: height - 80,
      width: width,
      height: 80,
      color: rgb(0.078, 0.722, 0.651), // Teal color
    });

    // Company name
    page.drawText("PearSign", {
      x: 50,
      y: height - 50,
      size: 28,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    // Document title
    page.drawText("SAMPLE AGREEMENT", {
      x: 50,
      y: height - 130,
      size: 24,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Date line
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    page.drawText(`Date: ${today}`, {
      x: 50,
      y: height - 160,
      size: 12,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Horizontal line
    page.drawLine({
      start: { x: 50, y: height - 180 },
      end: { x: width - 50, y: height - 180 },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });

    // Agreement text
    const paragraphs = [
      "This Sample Agreement (\"Agreement\") is entered into as of the date signed below,",
      "by and between the undersigned parties.",
      "",
      "1. PURPOSE",
      "This document serves as a demonstration of the PearSign electronic signature",
      "platform. It showcases the ability to review, sign, and complete documents",
      "digitally in a secure and legally binding manner.",
      "",
      "2. TERMS",
      "By signing this document electronically, you acknowledge that:",
      "   a) Electronic signatures have the same legal validity as handwritten signatures",
      "   b) You have reviewed the contents of this document",
      "   c) You agree to the terms outlined herein",
      "",
      "3. SECURITY",
      "All signatures are secured with bank-level 256-bit encryption and are",
      "timestamped for authenticity. A complete audit trail is maintained for",
      "compliance and verification purposes.",
      "",
      "4. ACCEPTANCE",
      "Your electronic signature below indicates your acceptance of these terms.",
    ];

    let yPosition = height - 210;
    for (const line of paragraphs) {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 11,
        font: line.startsWith("1.") || line.startsWith("2.") || line.startsWith("3.") || line.startsWith("4.") ? helveticaBold : helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      yPosition -= 18;
    }

    // Signature section
    yPosition = 180;

    page.drawText("SIGNATURES", {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Signature line
    page.drawLine({
      start: { x: 50, y: yPosition - 60 },
      end: { x: 250, y: yPosition - 60 },
      thickness: 1,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText("Signature", {
      x: 50,
      y: yPosition - 75,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Date line
    page.drawLine({
      start: { x: 350, y: yPosition - 60 },
      end: { x: 550, y: yPosition - 60 },
      thickness: 1,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText("Date", {
      x: 350,
      y: yPosition - 75,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Footer
    page.drawText("This is a sample document for demonstration purposes only.", {
      x: 50,
      y: 50,
      size: 9,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });

    page.drawText("Powered by PearSign - Secure Electronic Signatures", {
      x: 50,
      y: 35,
      size: 9,
      font: helveticaBold,
      color: rgb(0.078, 0.722, 0.651),
    });

    // Serialize to bytes
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="sample-agreement.pdf"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error generating sample PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
