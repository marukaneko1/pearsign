import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface SignatureField {
  id: string;
  name: string;
  type: string;
  value?: string;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
  };
}

interface SignedDocumentOptions {
  pdfBytes?: Uint8Array;
  fields: SignatureField[];
  signatureData: string;
  signerName: string;
  signerEmail?: string;
  signedAt: Date;
}

/**
 * Generate a signed PDF document with embedded signatures
 */
export async function generateSignedPDF(options: SignedDocumentOptions): Promise<Uint8Array> {
  const { pdfBytes, fields, signatureData, signerName, signerEmail, signedAt } = options;

  let pdfDoc: PDFDocument;

  if (pdfBytes) {
    // Load existing PDF
    pdfDoc = await PDFDocument.load(pdfBytes);
  } else {
    // Create a new PDF document
    pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size

    // Add document content
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();

    // Header
    page.drawText("DOCUMENT", {
      x: 50,
      y: height - 60,
      size: 12,
      font: helveticaBold,
      color: rgb(0.03, 0.57, 0.7), // Cyan color
    });

    page.drawText("Service Agreement", {
      x: 50,
      y: height - 90,
      size: 24,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText(`Agreement Date: ${signedAt.toLocaleDateString()}`, {
      x: 50,
      y: height - 115,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Divider line
    page.drawLine({
      start: { x: 50, y: height - 130 },
      end: { x: width - 50, y: height - 130 },
      thickness: 1,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Sample content
    const sampleText = [
      "This Service Agreement (\"Agreement\") is entered into as of the date signed below,",
      "between the parties identified herein.",
      "",
      "1. SERVICES",
      "The Provider agrees to perform the services described in this agreement in a",
      "professional and timely manner.",
      "",
      "2. TERMS AND CONDITIONS",
      "Both parties agree to the terms and conditions set forth in this document.",
      "This agreement shall be binding upon execution by all parties.",
      "",
      "3. CONFIDENTIALITY",
      "All parties agree to maintain confidentiality regarding the terms of this",
      "agreement and any proprietary information shared during the course of services.",
    ];

    let yPos = height - 160;
    for (const line of sampleText) {
      page.drawText(line, {
        x: 50,
        y: yPos,
        size: 11,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      yPos -= 18;
    }
  }

  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Process each field
  for (const field of fields) {
    const pageIndex = (field.position?.page || 1) - 1;
    if (pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    // Calculate position (convert percentage to actual coordinates)
    const x = field.position?.x ? (field.position.x / 100) * width : 50;
    const y = field.position?.y ? height - ((field.position.y / 100) * height) : 200;

    if (field.type === "signature" && signatureData) {
      // Handle signature field
      if (signatureData.startsWith("data:image")) {
        // Embed drawn signature image
        try {
          const base64Data = signatureData.split(",")[1];
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

          let signatureImage;
          if (signatureData.includes("image/png")) {
            signatureImage = await pdfDoc.embedPng(imageBytes);
          } else {
            signatureImage = await pdfDoc.embedJpg(imageBytes);
          }

          const sigWidth = field.position?.width ? (field.position.width / 100) * width : 150;
          const sigHeight = sigWidth * (signatureImage.height / signatureImage.width);

          page.drawImage(signatureImage, {
            x,
            y: y - sigHeight,
            width: sigWidth,
            height: Math.min(sigHeight, 50),
          });
        } catch (err) {
          console.error("Error embedding signature image:", err);
          // Fallback to text
          page.drawText(signerName, {
            x,
            y: y - 20,
            size: 18,
            font: helvetica,
            color: rgb(0.03, 0.57, 0.7),
          });
        }
      } else {
        // Typed signature - render as stylized text
        page.drawText(signatureData, {
          x,
          y: y - 25,
          size: 24,
          font: helvetica,
          color: rgb(0.03, 0.57, 0.7),
        });
      }

      // Add signature line and label
      page.drawLine({
        start: { x, y: y - 35 },
        end: { x: x + 200, y: y - 35 },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });

      page.drawText(field.name || "Signature", {
        x,
        y: y - 50,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    } else if (field.type === "date" && field.value) {
      // Date field
      page.drawText(field.value, {
        x,
        y: y - 15,
        size: 12,
        font: helvetica,
        color: rgb(0.1, 0.1, 0.1),
      });

      page.drawText(field.name || "Date", {
        x,
        y: y - 30,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    } else if (field.value) {
      // Other text fields
      page.drawText(field.value, {
        x,
        y: y - 15,
        size: 12,
        font: helvetica,
        color: rgb(0.1, 0.1, 0.1),
      });

      page.drawText(field.name || "Field", {
        x,
        y: y - 30,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  // Add signature certification footer to the last page
  const lastPage = pages[pages.length - 1];
  const { width: lastWidth, height: lastHeight } = lastPage.getSize();

  // Certification box
  const certY = 80;
  lastPage.drawRectangle({
    x: 50,
    y: certY - 10,
    width: lastWidth - 100,
    height: 70,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
    color: rgb(0.98, 0.98, 0.98),
  });

  lastPage.drawText("ELECTRONIC SIGNATURE CERTIFICATION", {
    x: 60,
    y: certY + 45,
    size: 8,
    font: helveticaBold,
    color: rgb(0.03, 0.57, 0.7),
  });

  lastPage.drawText(`Signed by: ${signerName}`, {
    x: 60,
    y: certY + 30,
    size: 9,
    font: helvetica,
    color: rgb(0.3, 0.3, 0.3),
  });

  if (signerEmail) {
    lastPage.drawText(`Email: ${signerEmail}`, {
      x: 60,
      y: certY + 17,
      size: 9,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  lastPage.drawText(`Signed on: ${signedAt.toLocaleString()}`, {
    x: 60,
    y: certY + 4,
    size: 9,
    font: helvetica,
    color: rgb(0.3, 0.3, 0.3),
  });

  lastPage.drawText("This document was electronically signed via PearSign.", {
    x: 300,
    y: certY + 30,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  lastPage.drawText(`Document ID: ${generateDocumentId()}`, {
    x: 300,
    y: certY + 17,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Serialize the PDF
  return await pdfDoc.save();
}

/**
 * Generate a unique document ID
 */
function generateDocumentId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) result += "-";
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Download a PDF file
 */
export function downloadPDF(pdfBytes: Uint8Array, filename: string): void {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert PDF bytes to base64
 */
export function pdfToBase64(pdfBytes: Uint8Array): string {
  let binary = "";
  const len = pdfBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(pdfBytes[i]);
  }
  return btoa(binary);
}
