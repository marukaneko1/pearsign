/**
 * Signed PDF Generator
 * Overlays signatures, dates, and field values onto the original PDF
 * AND applies a true PKI digital signature (PKCS#7/CMS) for Adobe Acrobat recognition
 *
 * Now includes PearSign Signature ID visible under each signature block
 * for public verification without certificates (like DocuSign).
 */

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, Color, RGB } from "pdf-lib";
import { signPdfDocument, SignatureFieldPosition } from "./pdf-digital-signature";

interface FieldValue {
  id: string;
  type: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface StoredField {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  required?: boolean;
  prefillValue?: string;
  placeholder?: string;
}

interface SignedPDFOptions {
  originalPdfBase64: string;
  signatureFields: StoredField[];
  fieldValues: Record<string, string>;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  ipAddress?: string;
  documentId: string;
  documentTitle: string;
  /** If false, only show document ID. If true, show full audit certification box. Default: true */
  includeAuditOnDocument?: boolean;
  /** Organization ID for digital signature certificate. If provided, applies PKI digital signature. */
  orgId?: string;
  /** Whether to apply PKI digital signature for Adobe recognition. Default: true */
  applyDigitalSignature?: boolean;
  /** Reason for signing (appears in Adobe signature panel) */
  signatureReason?: string;
  /** Map of fieldId -> PearSign Signature ID (PS-XXXXXXXX) for display under signatures */
  signatureIds?: Map<string, string>;
}

/**
 * Generate a signed PDF with all field values overlaid
 * AND optionally apply a true PKI digital signature for Adobe Acrobat recognition
 * Now includes visible PearSign Signature IDs under each signature block
 */
export async function generateSignedPDF(options: SignedPDFOptions): Promise<Uint8Array> {
  const {
    originalPdfBase64,
    signatureFields,
    fieldValues,
    signerName,
    signerEmail,
    signedAt,
    ipAddress,
    documentId,
    documentTitle,
    includeAuditOnDocument = true,
    orgId,
    applyDigitalSignature = true,
    signatureReason,
    signatureIds,
  } = options;

  // Load the original PDF - strip data URL prefix if present
  const base64Data = originalPdfBase64.includes(',')
    ? originalPdfBase64.split(',')[1]
    : originalPdfBase64;
  const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  // Format date for signature block
  const formattedSignDate = signedAt.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const formattedSignTime = signedAt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Process each field and overlay the value
  for (const field of signatureFields) {
    const value = fieldValues[field.id];
    if (!value) continue;

    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { height: pageHeight } = page.getSize();

    // Convert coordinates: stored coordinates are from top-left, PDF uses bottom-left
    const pdfX = field.x;
    const pdfY = pageHeight - field.y - field.height;

    if (field.type === 'signature' || field.type === 'initials') {
      // Handle signature/initials (image data)
      if (value.startsWith('data:image')) {
        try {
          const base64Data = value.split(',')[1];
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

          // Embed the signature image
          let signatureImage;
          if (value.includes('image/png')) {
            signatureImage = await pdfDoc.embedPng(imageBytes);
          } else {
            signatureImage = await pdfDoc.embedJpg(imageBytes);
          }

          // Calculate dimensions maintaining aspect ratio
          // Leave extra space at bottom for PearSign ID
          const signatureAreaHeight = field.height - 20; // Reserve 20px for ID text
          const aspectRatio = signatureImage.width / signatureImage.height;
          let drawWidth = field.width;
          let drawHeight = field.width / aspectRatio;

          // If height exceeds signature area height, scale down
          if (drawHeight > signatureAreaHeight) {
            drawHeight = signatureAreaHeight;
            drawWidth = signatureAreaHeight * aspectRatio;
          }

          // Center the signature in the field (above the ID area)
          const offsetX = (field.width - drawWidth) / 2;
          const offsetY = 20 + (signatureAreaHeight - drawHeight) / 2; // 20px offset for ID space

          page.drawImage(signatureImage, {
            x: pdfX + offsetX,
            y: pdfY + offsetY,
            width: drawWidth,
            height: drawHeight,
          });

          // Get the PearSign Signature ID for this field
          const pearsignId = signatureIds?.get(field.id);

          // Draw PearSign ID and date under the signature
          drawSignatureInfo(page, {
            x: pdfX,
            y: pdfY,
            width: field.width,
            pearsignId: pearsignId || `PS-${documentId.substring(0, 8).toUpperCase()}`,
            signedDate: formattedSignDate,
            signedTime: formattedSignTime,
            font: courier,
            boldFont: helveticaBold,
          });

        } catch (err) {
          console.error('[SignedPDF] Error embedding signature image:', err);
          // Fallback to text
          page.drawText(signerName, {
            x: pdfX + 5,
            y: pdfY + field.height / 2 - 6,
            size: 14,
            font: helvetica,
            color: rgb(0.1, 0.1, 0.2),
          });
        }
      }
    } else if (field.type === 'date') {
      const maxW = field.width - 6;
      let fontSize = Math.min(11, field.height * 0.65);
      const textWidth = helvetica.widthOfTextAtSize(value, fontSize);
      if (textWidth > maxW && maxW > 0) {
        fontSize = Math.max(6, fontSize * (maxW / textWidth));
      }
      page.drawText(value, {
        x: pdfX + 3,
        y: pdfY + (field.height - fontSize) / 2,
        size: fontSize,
        font: helvetica,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: maxW,
      });
    } else {
      const maxW = field.width - 6;
      let fontSize = Math.min(12, field.height * 0.65);
      const textWidth = helvetica.widthOfTextAtSize(value, fontSize);
      if (textWidth > maxW && maxW > 0) {
        fontSize = Math.max(6, fontSize * (maxW / textWidth));
      }
      page.drawText(value, {
        x: pdfX + 3,
        y: pdfY + (field.height - fontSize) / 2,
        size: fontSize,
        font: helvetica,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: maxW,
      });
    }
  }

  // Add compact signature badge to the first page (top right corner)
  const firstPage = pages[0];
  const { width: pageWidth, height: pageHeight } = firstPage.getSize();

  // Format date nicely
  const formattedDate = signedAt.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  if (includeAuditOnDocument) {
    // Compact signature badge at top right corner - wider to fit full ID
    const badgeWidth = 175;
    const badgeHeight = 42;
    const badgeX = pageWidth - badgeWidth - 10;
    const badgeY = pageHeight - badgeHeight - 10;

    // Draw badge background
    firstPage.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: badgeWidth,
      height: badgeHeight,
      color: rgb(0.98, 0.99, 0.99),
      borderColor: rgb(0.05, 0.47, 0.53),
      borderWidth: 0.5,
    });

    // Signed by
    const displayName = signerName.length > 24 ? signerName.substring(0, 24) + '...' : signerName;
    firstPage.drawText(`Signed: ${displayName}`, {
      x: badgeX + 5,
      y: badgeY + badgeHeight - 9,
      size: 6,
      font: helveticaBold,
      color: rgb(0.15, 0.15, 0.15),
    });

    // Date
    firstPage.drawText(`Date: ${formattedDate}`, {
      x: badgeX + 5,
      y: badgeY + badgeHeight - 18,
      size: 5.5,
      font: helvetica,
      color: rgb(0.35, 0.35, 0.35),
    });

    // IP Address
    const displayIp = ipAddress || 'N/A';
    firstPage.drawText(`IP: ${displayIp}`, {
      x: badgeX + 5,
      y: badgeY + badgeHeight - 27,
      size: 5,
      font: helvetica,
      color: rgb(0.45, 0.45, 0.45),
    });

    // Full ID (no truncation since badge is wider now)
    firstPage.drawText(`ID: ${documentId}`, {
      x: badgeX + 5,
      y: badgeY + badgeHeight - 36,
      size: 5,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    // Minimal badge - only document ID at top right
    firstPage.drawText(`ID: ${documentId}`, {
      x: pageWidth - 180,
      y: pageHeight - 18,
      size: 5.5,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Save the PDF with visual overlays
  const pdfWithOverlays = await pdfDoc.save();

  // Apply PKI digital signature if enabled
  if (applyDigitalSignature && orgId) {
    try {
      if (process.env.NODE_ENV !== 'production') console.log('[SignedPDF] Applying PKI digital signature for Adobe recognition...');

      // Collect signature field positions for the digital signature
      const digitalSignatureFields: SignatureFieldPosition[] = [];

      for (const field of signatureFields) {
        if (field.type === 'signature' || field.type === 'initials') {
          const pageIndex = field.page - 1;
          if (pageIndex >= 0 && pageIndex < pages.length) {
            const page = pages[pageIndex];
            const { height: pageHeight } = page.getSize();

            // Convert coordinates: stored coordinates are from top-left, PDF uses bottom-left
            const pdfY = pageHeight - field.y - field.height;

            digitalSignatureFields.push({
              fieldName: `${field.type === 'signature' ? 'Signature' : 'Initials'}-${field.id}`,
              page: field.page,
              x: field.x,
              y: pdfY,
              width: field.width,
              height: field.height,
              signerName: signerName,
              signerEmail: signerEmail,
            });

            if (process.env.NODE_ENV !== 'production') console.log(`[SignedPDF] Digital signature field: ${field.type} at page ${field.page}, pos [${field.x}, ${pdfY}, ${field.x + field.width}, ${pdfY + field.height}]`);
          }
        }
      }

      // If no signature fields found, use a default invisible field
      if (digitalSignatureFields.length === 0) {
        if (process.env.NODE_ENV !== 'production') console.log('[SignedPDF] No signature fields found, using invisible signature');
      }

      const { signedPdfBytes, certificateInfo } = await signPdfDocument({
        pdfBytes: pdfWithOverlays,
        orgId,
        signerName,
        signerEmail,
        signedAt,
        reason: signatureReason || `Document "${documentTitle}" digitally signed by ${signerName}`,
        location: 'PearSign Electronic Signature Platform',
        signatureFields: digitalSignatureFields.length > 0 ? digitalSignatureFields : undefined,
      });

      if (process.env.NODE_ENV !== 'production') console.log('[SignedPDF] PKI digital signature applied successfully');
      if (process.env.NODE_ENV !== 'production') console.log(`[SignedPDF] Certificate: ${certificateInfo.subject}`);
      if (process.env.NODE_ENV !== 'production') console.log(`[SignedPDF] Valid until: ${certificateInfo.validTo.toISOString()}`);

      return signedPdfBytes;
    } catch (err) {
      console.error('[SignedPDF] CRITICAL: Digital signature FAILED:', err);
      console.error('[SignedPDF] SECURITY: Will NOT return unsigned PDF - throwing error');
      throw new Error(`Digital signature failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Return PDF with visual overlays only (no digital signature)
  return pdfWithOverlays;
}

/**
 * Draw PearSign Signature ID and date info under the signature
 */
function drawSignatureInfo(
  page: PDFPage,
  options: {
    x: number;
    y: number;
    width: number;
    pearsignId: string;
    signedDate: string;
    signedTime: string;
    font: PDFFont;
    boldFont: PDFFont;
  }
) {
  const { x, y, width, pearsignId, signedDate, signedTime, font, boldFont } = options;

  // PearSign brand color (blue - #2563EB)
  const brandColor = rgb(0.145, 0.388, 0.922);
  const textColor = rgb(0.35, 0.35, 0.35);

  // Draw a subtle line separator
  page.drawLine({
    start: { x: x + 2, y: y + 17 },
    end: { x: x + width - 2, y: y + 17 },
    thickness: 0.3,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Draw PearSign ID (prominent)
  page.drawText(`PearSign ID: ${pearsignId}`, {
    x: x + 3,
    y: y + 8,
    size: 6.5,
    font: boldFont,
    color: brandColor,
  });

  // Draw signed date/time on the right
  const dateText = `${signedDate} ${signedTime}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 5.5);
  page.drawText(dateText, {
    x: x + width - dateWidth - 3,
    y: y + 8,
    size: 5.5,
    font: font,
    color: textColor,
  });

  // Draw verification hint at bottom
  page.drawText('Verify at pearsign.com/verify', {
    x: x + 3,
    y: y + 1,
    size: 4.5,
    font: font,
    color: rgb(0.6, 0.6, 0.6),
  });
}

/**
 * Generate an Audit Trail PDF document
 */
export async function generateAuditTrailPDF(options: {
  documentTitle: string;
  documentId: string;
  envelopeId: string;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  viewedAt?: Date;
  createdAt: Date;
  ipAddress?: string;
  userAgent?: string;
  events: Array<{
    action: string;
    timestamp: string;
    actor: string;
    details: string;
  }>;
  fieldsSummary?: Array<{ name: string; type: string; value: string }>;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const { width, height } = page.getSize();
  let yPos = height - 50;

  // Header
  page.drawRectangle({
    x: 0,
    y: height - 90,
    width,
    height: 90,
    color: rgb(0.05, 0.47, 0.53),
  });

  page.drawText("Audit Trail", {
    x: 50,
    y: height - 50,
    size: 24,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Electronic Signature Record", {
    x: 50,
    y: height - 72,
    size: 12,
    font: helvetica,
    color: rgb(0.9, 0.95, 0.95),
  });

  // PearSign branding
  page.drawText("PearSign", {
    x: width - 100,
    y: height - 55,
    size: 14,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  yPos = height - 120;

  // Document Information Section
  page.drawText("DOCUMENT INFORMATION", {
    x: 50,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: rgb(0.05, 0.47, 0.53),
  });

  yPos -= 20;

  const drawInfoRow = (label: string, value: string, currentY: number): number => {
    page.drawText(label, {
      x: 50,
      y: currentY,
      size: 9,
      font: helveticaBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(value, {
      x: 160,
      y: currentY,
      size: 9,
      font: helvetica,
      color: rgb(0.1, 0.1, 0.1),
    });
    return currentY - 16;
  };

  yPos = drawInfoRow("Document Title:", options.documentTitle, yPos);
  yPos = drawInfoRow("Document ID:", options.documentId, yPos);
  yPos = drawInfoRow("Envelope ID:", options.envelopeId, yPos);
  yPos = drawInfoRow("Status:", "COMPLETED", yPos);

  // Divider
  yPos -= 10;
  page.drawLine({
    start: { x: 50, y: yPos },
    end: { x: width - 50, y: yPos },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  yPos -= 20;

  // Signer Information
  page.drawText("SIGNER INFORMATION", {
    x: 50,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: rgb(0.05, 0.47, 0.53),
  });
  yPos -= 20;

  yPos = drawInfoRow("Signer Name:", options.signerName, yPos);
  yPos = drawInfoRow("Signer Email:", options.signerEmail, yPos);
  yPos = drawInfoRow("IP Address:", options.ipAddress || "Not recorded", yPos);
  yPos = drawInfoRow("Signed At:", options.signedAt.toLocaleString(), yPos);

  if (options.viewedAt) {
    yPos = drawInfoRow("Viewed At:", options.viewedAt.toLocaleString(), yPos);
  }

  // User agent (truncated)
  if (options.userAgent) {
    const truncatedUA = options.userAgent.length > 50
      ? options.userAgent.substring(0, 50) + "..."
      : options.userAgent;
    yPos = drawInfoRow("Browser:", truncatedUA, yPos);
  }

  // Divider
  yPos -= 10;
  page.drawLine({
    start: { x: 50, y: yPos },
    end: { x: width - 50, y: yPos },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  yPos -= 20;

  // Timeline / Audit Trail
  page.drawText("SIGNING TIMELINE", {
    x: 50,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: rgb(0.05, 0.47, 0.53),
  });
  yPos -= 20;

  // Draw timeline events
  for (const event of options.events) {
    if (yPos < 120) break; // Prevent overflow

    // Timestamp
    const timestamp = new Date(event.timestamp).toLocaleString();
    page.drawText(timestamp, {
      x: 50,
      y: yPos,
      size: 8,
      font: courier,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Action badge
    const actionColor = getAuditActionColor(event.action);
    page.drawRectangle({
      x: 180,
      y: yPos - 2,
      width: 70,
      height: 12,
      color: actionColor,
      borderWidth: 0,
    });
    page.drawText(event.action.toUpperCase(), {
      x: 185,
      y: yPos,
      size: 7,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    // Actor
    page.drawText(event.actor, {
      x: 260,
      y: yPos,
      size: 8,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });

    // Details (truncated if needed)
    const details = event.details.length > 40 ? event.details.substring(0, 40) + "..." : event.details;
    page.drawText(details, {
      x: 360,
      y: yPos,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    yPos -= 20;
  }

  // Fields Summary (if provided)
  if (options.fieldsSummary && options.fieldsSummary.length > 0 && yPos > 180) {
    yPos -= 10;
    page.drawLine({
      start: { x: 50, y: yPos },
      end: { x: width - 50, y: yPos },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    yPos -= 20;

    page.drawText("FIELDS COMPLETED", {
      x: 50,
      y: yPos,
      size: 10,
      font: helveticaBold,
      color: rgb(0.05, 0.47, 0.53),
    });
    yPos -= 18;

    for (const field of options.fieldsSummary) {
      if (yPos < 100) break;
      yPos = drawInfoRow(`${field.name}:`, field.value || "—", yPos);
    }
  }

  // Footer
  const footerY = 60;
  page.drawLine({
    start: { x: 50, y: footerY },
    end: { x: width - 50, y: footerY },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });

  page.drawText("This audit trail provides a complete record of the electronic signature process.", {
    x: 50,
    y: footerY - 18,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText("The electronic signature is legally binding under the ESIGN Act and UETA.", {
    x: 50,
    y: footerY - 30,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: 50,
    y: footerY - 46,
    size: 7,
    font: helvetica,
    color: rgb(0.6, 0.6, 0.6),
  });

  page.drawText("PearSign - Electronic Signature Platform", {
    x: width - 180,
    y: footerY - 46,
    size: 7,
    font: helveticaBold,
    color: rgb(0.05, 0.47, 0.53),
  });

  return await pdfDoc.save();
}

function getAuditActionColor(action: string): RGB {
  const colors: Record<string, RGB> = {
    'created': rgb(0.2, 0.6, 0.86),
    'sent': rgb(0.05, 0.47, 0.53),
    'viewed': rgb(0.6, 0.4, 0.8),
    'signed': rgb(0.2, 0.7, 0.4),
    'completed': rgb(0.1, 0.6, 0.3),
    'declined': rgb(0.8, 0.3, 0.3),
    'voided': rgb(0.5, 0.5, 0.5),
  };
  return colors[action.toLowerCase()] || rgb(0.4, 0.4, 0.4);
}

/**
 * Convert PDF bytes to base64
 */
export function pdfBytesToBase64(pdfBytes: Uint8Array): string {
  let binary = "";
  const len = pdfBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(pdfBytes[i]);
  }
  return btoa(binary);
}
