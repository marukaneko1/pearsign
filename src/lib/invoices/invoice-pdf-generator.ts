/**
 * Invoice PDF Generator for Signing
 *
 * Generates professional invoice PDFs that can be sent for e-signature.
 * Uses pdf-lib for serverless-compatible PDF generation.
 */

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import { sql } from '../db';
import type { Invoice } from './types';

// ============================================================================
// Types
// ============================================================================

interface TenantBranding {
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    };
  }
  return { r: 0.1, g: 0.4, b: 0.9 }; // Default blue
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// PDF Generation
// ============================================================================

/**
 * Generate a professional invoice PDF
 */
export async function generateInvoicePDF(
  invoice: Invoice,
  tenantId: string
): Promise<Buffer> {
  // Get tenant branding
  let branding: TenantBranding = {
    company_name: 'Your Company',
    company_address: null,
    company_phone: null,
    company_email: null,
    logo_url: null,
    primary_color: '#2563eb',
  };

  try {
    const brandingRows = await sql`
      SELECT company_name, company_address, company_phone, company_email, logo_url, primary_color
      FROM tenant_branding
      WHERE tenant_id = ${tenantId}
    `;
    if (brandingRows.length > 0) {
      branding = brandingRows[0] as TenantBranding;
    }
  } catch {
    // Use default branding if table doesn't exist
  }

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size

  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors
  const primaryColor = hexToRgb(branding.primary_color || '#2563eb');
  const textColor = rgb(0.2, 0.2, 0.2);
  const lightGray = rgb(0.6, 0.6, 0.6);
  const headerBg = rgb(primaryColor.r, primaryColor.g, primaryColor.b);

  let yPosition = 750;
  const margin = 50;
  const pageWidth = 612;
  const contentWidth = pageWidth - margin * 2;

  // ========== HEADER ==========
  // Header background
  page.drawRectangle({
    x: 0,
    y: 720,
    width: pageWidth,
    height: 72,
    color: headerBg,
  });

  // Company name
  page.drawText(branding.company_name || 'Your Company', {
    x: margin,
    y: 750,
    size: 20,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  // Invoice label
  page.drawText('INVOICE', {
    x: pageWidth - margin - 80,
    y: 750,
    size: 24,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  yPosition = 690;

  // ========== INVOICE DETAILS ==========
  // Left side - Bill To
  page.drawText('Bill To:', {
    x: margin,
    y: yPosition,
    size: 10,
    font: helveticaBold,
    color: lightGray,
  });

  yPosition -= 15;
  page.drawText(invoice.customer_name, {
    x: margin,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: textColor,
  });

  yPosition -= 15;
  page.drawText(invoice.customer_email, {
    x: margin,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: textColor,
  });

  if (invoice.customer_phone) {
    yPosition -= 12;
    page.drawText(invoice.customer_phone, {
      x: margin,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: textColor,
    });
  }

  // Right side - Invoice info
  const rightColumnX = pageWidth - margin - 150;
  let rightY = 690;

  const drawInfoRow = (label: string, value: string) => {
    page.drawText(label, {
      x: rightColumnX,
      y: rightY,
      size: 9,
      font: helvetica,
      color: lightGray,
    });
    page.drawText(value, {
      x: rightColumnX + 70,
      y: rightY,
      size: 10,
      font: helveticaBold,
      color: textColor,
    });
    rightY -= 16;
  };

  drawInfoRow('Invoice #:', invoice.invoice_number);
  drawInfoRow('Issue Date:', formatDate(invoice.issue_date));
  drawInfoRow('Due Date:', formatDate(invoice.due_date));
  drawInfoRow('Status:', invoice.status.toUpperCase());

  yPosition = Math.min(yPosition, rightY) - 30;

  // ========== LINE ITEMS TABLE ==========
  // Table header
  const tableTop = yPosition;
  page.drawRectangle({
    x: margin,
    y: tableTop - 5,
    width: contentWidth,
    height: 25,
    color: rgb(0.95, 0.95, 0.95),
  });

  const columns = {
    description: margin + 10,
    qty: margin + 280,
    price: margin + 350,
    tax: margin + 420,
    amount: margin + 470,
  };

  page.drawText('Description', {
    x: columns.description,
    y: tableTop + 5,
    size: 9,
    font: helveticaBold,
    color: textColor,
  });
  page.drawText('Qty', {
    x: columns.qty,
    y: tableTop + 5,
    size: 9,
    font: helveticaBold,
    color: textColor,
  });
  page.drawText('Price', {
    x: columns.price,
    y: tableTop + 5,
    size: 9,
    font: helveticaBold,
    color: textColor,
  });
  page.drawText('Tax', {
    x: columns.tax,
    y: tableTop + 5,
    size: 9,
    font: helveticaBold,
    color: textColor,
  });
  page.drawText('Amount', {
    x: columns.amount,
    y: tableTop + 5,
    size: 9,
    font: helveticaBold,
    color: textColor,
  });

  yPosition = tableTop - 25;

  // Line items
  for (const item of invoice.line_items) {
    // Description (truncate if too long)
    const description = item.description.length > 40
      ? item.description.substring(0, 37) + '...'
      : item.description;

    page.drawText(description, {
      x: columns.description,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: textColor,
    });

    page.drawText(item.quantity.toString(), {
      x: columns.qty,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: textColor,
    });

    page.drawText(formatCurrency(item.unit_price, invoice.currency), {
      x: columns.price,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: textColor,
    });

    page.drawText(item.tax_rate ? `${item.tax_rate}%` : '-', {
      x: columns.tax,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: textColor,
    });

    const lineAmount = item.amount || item.quantity * item.unit_price;
    page.drawText(formatCurrency(lineAmount, invoice.currency), {
      x: columns.amount,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: textColor,
    });

    yPosition -= 20;

    // Draw line separator
    page.drawLine({
      start: { x: margin, y: yPosition + 8 },
      end: { x: margin + contentWidth, y: yPosition + 8 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });
  }

  yPosition -= 20;

  // ========== TOTALS ==========
  const totalsX = margin + 350;

  const drawTotalRow = (label: string, value: string, isBold: boolean = false) => {
    page.drawText(label, {
      x: totalsX,
      y: yPosition,
      size: 10,
      font: isBold ? helveticaBold : helvetica,
      color: textColor,
    });
    page.drawText(value, {
      x: columns.amount,
      y: yPosition,
      size: 10,
      font: isBold ? helveticaBold : helvetica,
      color: textColor,
    });
    yPosition -= 18;
  };

  drawTotalRow('Subtotal:', formatCurrency(invoice.subtotal, invoice.currency));

  if (invoice.tax_total > 0) {
    drawTotalRow('Tax:', formatCurrency(invoice.tax_total, invoice.currency));
  }

  // Total line
  page.drawLine({
    start: { x: totalsX - 10, y: yPosition + 12 },
    end: { x: margin + contentWidth, y: yPosition + 12 },
    thickness: 1,
    color: headerBg,
  });

  yPosition -= 5;
  drawTotalRow('Total:', formatCurrency(invoice.total, invoice.currency), true);

  if (invoice.amount_paid > 0) {
    drawTotalRow('Paid:', formatCurrency(invoice.amount_paid, invoice.currency));
    const balance = invoice.total - invoice.amount_paid;
    drawTotalRow('Balance Due:', formatCurrency(balance, invoice.currency), true);
  }

  // ========== MEMO / TERMS ==========
  yPosition -= 30;

  if (invoice.memo) {
    page.drawText('Notes:', {
      x: margin,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: textColor,
    });
    yPosition -= 15;

    // Word wrap memo
    const words = invoice.memo.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + word + ' ';
      if (testLine.length > 80) {
        page.drawText(line.trim(), {
          x: margin,
          y: yPosition,
          size: 9,
          font: helvetica,
          color: lightGray,
        });
        yPosition -= 12;
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    if (line.trim()) {
      page.drawText(line.trim(), {
        x: margin,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: lightGray,
      });
      yPosition -= 12;
    }
    yPosition -= 10;
  }

  if (invoice.terms) {
    page.drawText('Terms & Conditions:', {
      x: margin,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: textColor,
    });
    yPosition -= 15;
    page.drawText(invoice.terms.substring(0, 100), {
      x: margin,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: lightGray,
    });
  }

  // ========== SIGNATURE BLOCK ==========
  yPosition = 120;

  page.drawText('Signature:', {
    x: margin,
    y: yPosition,
    size: 10,
    font: helveticaBold,
    color: textColor,
  });

  // Signature line
  page.drawLine({
    start: { x: margin + 70, y: yPosition - 5 },
    end: { x: margin + 250, y: yPosition - 5 },
    thickness: 1,
    color: textColor,
  });

  page.drawText('Date:', {
    x: margin + 280,
    y: yPosition,
    size: 10,
    font: helveticaBold,
    color: textColor,
  });

  page.drawLine({
    start: { x: margin + 320, y: yPosition - 5 },
    end: { x: margin + 450, y: yPosition - 5 },
    thickness: 1,
    color: textColor,
  });

  yPosition -= 25;
  page.drawText(`By signing, ${invoice.customer_name} agrees to the terms of this invoice.`, {
    x: margin,
    y: yPosition,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  // ========== FOOTER ==========
  page.drawText(`Invoice ${invoice.invoice_number} | Generated by PearSign`, {
    x: margin,
    y: 30,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  // Serialize to bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generate a preview URL for the invoice PDF (base64 data URL)
 */
export async function getInvoicePDFPreviewUrl(
  invoice: Invoice,
  tenantId: string
): Promise<string> {
  const pdfBuffer = await generateInvoicePDF(invoice, tenantId);
  const base64 = pdfBuffer.toString('base64');
  return `data:application/pdf;base64,${base64}`;
}
