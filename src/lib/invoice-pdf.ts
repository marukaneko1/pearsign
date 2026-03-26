/**
 * Invoice PDF Generator
 *
 * Generates professional PDF invoices for billing.
 * Uses pdf-lib for reliable serverless PDF generation.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { sql } from './db';

// ============== TYPES ==============

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  paidAt?: Date;

  // Organization (billed to)
  organization: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    email?: string;
    taxId?: string;
  };

  // Line items
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number; // in cents
    amount: number; // in cents
  }>;

  // Totals
  subtotal: number; // in cents
  discount?: number; // in cents (negative value)
  tax?: number; // in cents
  total: number; // in cents
  currency: string;

  // Payment info
  paymentMethod?: string;
  transactionId?: string;

  // Notes
  notes?: string;
  termsAndConditions?: string;
}

export interface InvoiceBranding {
  companyName: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyZip?: string;
  companyCountry?: string;
  companyEmail: string;
  companyPhone?: string;
  companyWebsite?: string;
  logoBase64?: string;
  primaryColor: string;
  accentColor: string;
}

// ============== DEFAULT BRANDING ==============

const DEFAULT_BRANDING: InvoiceBranding = {
  companyName: 'PearSign Inc.',
  companyAddress: '123 Innovation Way',
  companyCity: 'San Francisco',
  companyState: 'CA',
  companyZip: '94105',
  companyCountry: 'USA',
  companyEmail: 'billing@pearsign.com',
  companyWebsite: 'https://pearsign.com',
  primaryColor: '#2563eb',
  accentColor: '#1d4ed8',
};

// ============== HELPER FUNCTIONS ==============

function formatCurrency(cents: number, currency: string = 'usd'): string {
  const amount = cents / 100;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
  return formatter.format(amount);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 };
}

// ============== PDF GENERATOR ==============

export async function generateInvoicePDF(
  invoice: InvoiceData,
  branding: Partial<InvoiceBranding> = {}
): Promise<Buffer> {
  const brand = { ...DEFAULT_BRANDING, ...branding };
  const primaryRgb = hexToRgb(brand.primaryColor);

  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size

  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // ============== HEADER ==============

  // Company name
  page.drawText(brand.companyName, {
    x: margin,
    y: y,
    size: 24,
    font: helveticaBold,
    color: rgb(primaryRgb.r, primaryRgb.g, primaryRgb.b),
  });

  // Company details (right side)
  const companyDetails = [
    brand.companyAddress,
    `${brand.companyCity}, ${brand.companyState} ${brand.companyZip}`,
    brand.companyCountry,
    brand.companyEmail,
  ].filter(Boolean);

  let detailY = y;
  for (const detail of companyDetails) {
    page.drawText(detail || '', {
      x: width - margin - 150,
      y: detailY,
      size: 9,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    detailY -= 12;
  }

  y -= 60;

  // ============== INVOICE TITLE ==============

  page.drawText('INVOICE', {
    x: margin,
    y: y,
    size: 32,
    font: helveticaBold,
    color: rgb(primaryRgb.r, primaryRgb.g, primaryRgb.b),
  });

  // Status badge
  const statusColors: Record<string, { r: number; g: number; b: number }> = {
    draft: { r: 0.42, g: 0.45, b: 0.5 },
    open: { r: 0.96, g: 0.62, b: 0.04 },
    paid: { r: 0.06, g: 0.73, b: 0.51 },
    void: { r: 0.94, g: 0.27, b: 0.27 },
    uncollectible: { r: 0.86, g: 0.15, b: 0.15 },
  };

  const statusColor = statusColors[invoice.status] || statusColors.draft;
  const statusText = invoice.status.toUpperCase();
  const statusWidth = helveticaBold.widthOfTextAtSize(statusText, 10) + 16;

  page.drawRectangle({
    x: 145,
    y: y - 4,
    width: statusWidth,
    height: 22,
    color: rgb(statusColor.r, statusColor.g, statusColor.b),
  });

  page.drawText(statusText, {
    x: 153,
    y: y + 2,
    size: 10,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  y -= 50;

  // ============== INVOICE DETAILS ==============

  // Left column - Invoice info
  const invoiceDetails = [
    { label: 'Invoice Number:', value: invoice.invoiceNumber },
    { label: 'Invoice Date:', value: formatDate(invoice.invoiceDate) },
    { label: 'Due Date:', value: formatDate(invoice.dueDate) },
  ];

  if (invoice.paidAt) {
    invoiceDetails.push({ label: 'Paid On:', value: formatDate(invoice.paidAt) });
  }

  for (const detail of invoiceDetails) {
    page.drawText(detail.label, {
      x: margin,
      y: y,
      size: 10,
      font: helveticaBold,
      color: rgb(0.22, 0.25, 0.32),
    });
    page.drawText(detail.value, {
      x: margin + 100,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.12, 0.16, 0.22),
    });
    y -= 16;
  }

  // Right column - Bill To
  let billToY = y + 64;
  page.drawText('Bill To:', {
    x: 350,
    y: billToY,
    size: 10,
    font: helveticaBold,
    color: rgb(0.22, 0.25, 0.32),
  });

  billToY -= 16;
  page.drawText(invoice.organization.name, {
    x: 350,
    y: billToY,
    size: 10,
    font: helvetica,
    color: rgb(0.12, 0.16, 0.22),
  });

  const billToDetails = [
    invoice.organization.address,
    invoice.organization.city
      ? `${invoice.organization.city}, ${invoice.organization.state || ''} ${invoice.organization.zip || ''}`
      : null,
    invoice.organization.email,
  ].filter(Boolean);

  for (const detail of billToDetails) {
    billToY -= 14;
    page.drawText(detail || '', {
      x: 350,
      y: billToY,
      size: 9,
      font: helvetica,
      color: rgb(0.42, 0.45, 0.5),
    });
  }

  y -= 40;

  // ============== LINE ITEMS TABLE ==============

  const tableTop = y;
  const tableLeft = margin;
  const tableRight = width - margin;
  const colWidths = { desc: 250, qty: 50, unit: 80, amount: 80 };

  // Table header background
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - 20,
    width: tableRight - tableLeft,
    height: 24,
    color: rgb(primaryRgb.r, primaryRgb.g, primaryRgb.b),
  });

  // Table headers
  page.drawText('Description', {
    x: tableLeft + 10,
    y: tableTop - 14,
    size: 10,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('Qty', {
    x: tableLeft + colWidths.desc + 20,
    y: tableTop - 14,
    size: 10,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('Unit Price', {
    x: tableLeft + colWidths.desc + colWidths.qty + 30,
    y: tableTop - 14,
    size: 10,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('Amount', {
    x: tableRight - 60,
    y: tableTop - 14,
    size: 10,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  y = tableTop - 30;

  // Line items
  for (let i = 0; i < invoice.lineItems.length; i++) {
    const item = invoice.lineItems[i];
    const isEven = i % 2 === 0;

    if (isEven) {
      page.drawRectangle({
        x: tableLeft,
        y: y - 6,
        width: tableRight - tableLeft,
        height: 22,
        color: rgb(0.97, 0.98, 0.99),
      });
    }

    page.drawText(item.description.substring(0, 45), {
      x: tableLeft + 10,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.12, 0.16, 0.22),
    });
    page.drawText(String(item.quantity), {
      x: tableLeft + colWidths.desc + 20,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.12, 0.16, 0.22),
    });
    page.drawText(formatCurrency(item.unitPrice, invoice.currency), {
      x: tableLeft + colWidths.desc + colWidths.qty + 30,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.12, 0.16, 0.22),
    });
    page.drawText(formatCurrency(item.amount, invoice.currency), {
      x: tableRight - 60,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.12, 0.16, 0.22),
    });

    y -= 22;
  }

  // Table border
  page.drawRectangle({
    x: tableLeft,
    y: y,
    width: tableRight - tableLeft,
    height: tableTop - y,
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  });

  y -= 30;

  // ============== TOTALS ==============

  const totalsX = tableRight - 150;

  // Subtotal
  page.drawText('Subtotal:', {
    x: totalsX,
    y: y,
    size: 10,
    font: helvetica,
    color: rgb(0.42, 0.45, 0.5),
  });
  page.drawText(formatCurrency(invoice.subtotal, invoice.currency), {
    x: tableRight - 60,
    y: y,
    size: 10,
    font: helvetica,
    color: rgb(0.12, 0.16, 0.22),
  });
  y -= 18;

  // Discount
  if (invoice.discount && invoice.discount !== 0) {
    page.drawText('Discount:', {
      x: totalsX,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.06, 0.73, 0.51),
    });
    page.drawText(formatCurrency(invoice.discount, invoice.currency), {
      x: tableRight - 60,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.06, 0.73, 0.51),
    });
    y -= 18;
  }

  // Tax
  if (invoice.tax && invoice.tax !== 0) {
    page.drawText('Tax:', {
      x: totalsX,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.42, 0.45, 0.5),
    });
    page.drawText(formatCurrency(invoice.tax, invoice.currency), {
      x: tableRight - 60,
      y: y,
      size: 10,
      font: helvetica,
      color: rgb(0.12, 0.16, 0.22),
    });
    y -= 18;
  }

  // Divider line
  page.drawLine({
    start: { x: totalsX - 10, y: y + 8 },
    end: { x: tableRight, y: y + 8 },
    thickness: 1,
    color: rgb(0.9, 0.9, 0.9),
  });

  y -= 8;

  // Total
  page.drawText('Total:', {
    x: totalsX,
    y: y,
    size: 14,
    font: helveticaBold,
    color: rgb(primaryRgb.r, primaryRgb.g, primaryRgb.b),
  });
  page.drawText(formatCurrency(invoice.total, invoice.currency), {
    x: tableRight - 70,
    y: y,
    size: 14,
    font: helveticaBold,
    color: rgb(primaryRgb.r, primaryRgb.g, primaryRgb.b),
  });

  y -= 40;

  // ============== PAYMENT INFO ==============

  if (invoice.paymentMethod || invoice.transactionId) {
    page.drawText('Payment Information', {
      x: margin,
      y: y,
      size: 11,
      font: helveticaBold,
      color: rgb(0.22, 0.25, 0.32),
    });
    y -= 16;

    if (invoice.paymentMethod) {
      page.drawText(`Payment Method: ${invoice.paymentMethod}`, {
        x: margin,
        y: y,
        size: 10,
        font: helvetica,
        color: rgb(0.42, 0.45, 0.5),
      });
      y -= 14;
    }
    if (invoice.transactionId) {
      page.drawText(`Transaction ID: ${invoice.transactionId}`, {
        x: margin,
        y: y,
        size: 10,
        font: helvetica,
        color: rgb(0.42, 0.45, 0.5),
      });
      y -= 14;
    }
    y -= 20;
  }

  // ============== NOTES ==============

  if (invoice.notes) {
    page.drawText('Notes', {
      x: margin,
      y: y,
      size: 11,
      font: helveticaBold,
      color: rgb(0.22, 0.25, 0.32),
    });
    y -= 16;

    page.drawText(invoice.notes.substring(0, 100), {
      x: margin,
      y: y,
      size: 9,
      font: helvetica,
      color: rgb(0.42, 0.45, 0.5),
    });
  }

  // ============== FOOTER ==============

  const footerY = 60;

  page.drawLine({
    start: { x: margin, y: footerY + 20 },
    end: { x: width - margin, y: footerY + 20 },
    thickness: 1,
    color: rgb(0.9, 0.9, 0.9),
  });

  page.drawText('Thank you for your business!', {
    x: width / 2 - 70,
    y: footerY,
    size: 10,
    font: helvetica,
    color: rgb(0.6, 0.64, 0.67),
  });

  page.drawText(`Generated on ${formatDate(new Date())} • ${brand.companyWebsite}`, {
    x: width / 2 - 100,
    y: footerY - 14,
    size: 8,
    font: helvetica,
    color: rgb(0.6, 0.64, 0.67),
  });

  // Save and return
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ============== DATABASE INTEGRATION ==============

/**
 * Generate PDF for an invoice stored in the database
 */
export async function generateInvoicePDFFromDb(
  invoiceId: string,
  orgId: string
): Promise<{ pdf: Buffer; filename: string } | null> {
  try {
    // Get invoice from database
    const invoiceResult = await sql`
      SELECT
        i.*,
        t.name as org_name,
        t.settings
      FROM invoices i
      JOIN tenants t ON i.tenant_id = t.id
      WHERE i.id = ${invoiceId} AND i.tenant_id = ${orgId}
    `;

    if (invoiceResult.length === 0) {
      console.error('[InvoicePDF] Invoice not found:', invoiceId);
      return null;
    }

    const inv = invoiceResult[0];

    // Get pricing info for line items
    const pricing = await sql`
      SELECT * FROM tenant_pricing WHERE org_id = ${orgId}
    `.catch(() => []);

    // Get usage for line items
    const usage = await sql`
      SELECT * FROM tenant_usage_counters
      WHERE org_id = ${orgId}
      ORDER BY period_start DESC
      LIMIT 1
    `.catch(() => []);

    // Build line items
    const lineItems: InvoiceData['lineItems'] = [];
    const pricingData = pricing[0] || {};
    const usageData = usage[0] || {};

    // Base fee
    if (pricingData.monthly_base_fee > 0) {
      lineItems.push({
        description: 'Monthly Subscription',
        quantity: 1,
        unitPrice: parseInt(pricingData.monthly_base_fee) || 0,
        amount: parseInt(pricingData.monthly_base_fee) || 0,
      });
    }

    // Envelope usage
    const envelopesSent = parseInt(usageData.envelopes_sent) || 0;
    const envelopesIncluded = parseInt(pricingData.envelopes_included) || 0;
    const envelopeOverage = Math.max(0, envelopesSent - envelopesIncluded);
    const envelopePrice = parseInt(pricingData.envelope_price) || 0;

    if (envelopeOverage > 0 && envelopePrice > 0) {
      lineItems.push({
        description: `Additional Envelopes (${envelopeOverage} @ ${formatCurrency(envelopePrice, 'usd')}/each)`,
        quantity: envelopeOverage,
        unitPrice: envelopePrice,
        amount: envelopeOverage * envelopePrice,
      });
    }

    // If no line items, add a default
    if (lineItems.length === 0) {
      lineItems.push({
        description: 'Subscription Services',
        quantity: 1,
        unitPrice: parseInt(inv.amount) || 0,
        amount: parseInt(inv.amount) || 0,
      });
    }

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const discount = parseInt(pricingData.discount) || 0;
    const discountAmount = discount > 0 ? Math.round(subtotal * (discount / 100)) : 0;
    const total = subtotal - discountAmount;

    // Build invoice data
    const invoiceData: InvoiceData = {
      invoiceNumber: inv.stripe_invoice_id || `INV-${inv.id.substring(0, 8).toUpperCase()}`,
      invoiceDate: new Date(inv.period_start || inv.created_at),
      dueDate: new Date(inv.period_end || Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: inv.status as InvoiceData['status'],
      paidAt: inv.status === 'paid' ? new Date(inv.created_at) : undefined,
      organization: {
        name: inv.org_name || 'Customer',
        email: inv.settings?.billingEmail,
      },
      lineItems,
      subtotal,
      discount: discountAmount > 0 ? -discountAmount : undefined,
      total: total,
      currency: inv.currency || 'usd',
      notes: 'Thank you for choosing PearSign for your document signing needs.',
      termsAndConditions: 'Payment terms: Net 30. All payments are non-refundable.',
    };

    // Generate PDF
    const pdf = await generateInvoicePDF(invoiceData);
    const filename = `invoice-${invoiceData.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;

    return { pdf, filename };
  } catch (error) {
    console.error('[InvoicePDF] Error generating PDF:', error);
    return null;
  }
}

/**
 * Generate a preview invoice PDF (for testing)
 */
export async function generatePreviewInvoice(): Promise<Buffer> {
  const sampleInvoice: InvoiceData = {
    invoiceNumber: 'INV-2026-0001',
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'open',
    organization: {
      name: 'Acme Corporation',
      address: '456 Business St',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA',
      email: 'billing@acme.com',
    },
    lineItems: [
      {
        description: 'Professional Plan - Monthly Subscription',
        quantity: 1,
        unitPrice: 4900,
        amount: 4900,
      },
      {
        description: 'Additional Envelopes (150 @ $0.50/each)',
        quantity: 150,
        unitPrice: 50,
        amount: 7500,
      },
      {
        description: 'SMS Notifications (75 @ $0.05/each)',
        quantity: 75,
        unitPrice: 5,
        amount: 375,
      },
    ],
    subtotal: 12775,
    discount: -1278, // 10% discount
    total: 11497,
    currency: 'usd',
    notes:
      'Thank you for your continued partnership.',
    termsAndConditions: 'Payment terms: Net 30. All payments are non-refundable.',
  };

  return generateInvoicePDF(sampleInvoice);
}
