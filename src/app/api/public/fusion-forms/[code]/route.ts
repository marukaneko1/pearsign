/**
 * Public FusionForm Access API
 * Returns form data for public signing
 *
 * Multi-tenancy: Tenant ID is extracted from the FusionForm record (form.orgId)
 */

import { NextRequest, NextResponse } from "next/server";
import { FusionFormsService } from "@/lib/fusion-forms";
import { sql } from "@/lib/db";

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { code } = await context.params;
    console.log('[FusionForm Public API] GET request for code:', code);

    const form = await FusionFormsService.getFormByAccessCode(code);

    if (!form) {
      console.log('[FusionForm Public API] Form not found for code:', code);
      return NextResponse.json(
        { error: "Form not found or inactive" },
        { status: 404 }
      );
    }

    console.log('[FusionForm Public API] Found form:', form.id, form.name);

    // Return public-safe form data
    return NextResponse.json({
      id: form.id,
      name: form.name,
      description: form.description,
      templateName: form.templateName,
      templateFields: form.templateFields || [],
      requireName: form.requireName,
      requireEmail: form.requireEmail,
      customBranding: form.customBranding,
    });
  } catch (error) {
    console.error("[FusionForm Public API] Error fetching fusion form:", error);
    return NextResponse.json(
      { error: "Failed to load form", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Start a new submission - creates a real envelope and redirects to existing signing flow
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { code } = await context.params;
    const body = await request.json();

    const form = await FusionFormsService.getFormByAccessCode(code);

    if (!form) {
      return NextResponse.json(
        { error: "Form not found or inactive" },
        { status: 404 }
      );
    }

    // Extract tenant ID from the form
    const tenantId = form.orgId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenant context' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (form.requireName && !body.signerName) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (form.requireEmail && !body.signerEmail) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const signerName = body.signerName || 'Signer';
    const signerEmail = body.signerEmail || '';

    // Get IP and user agent
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Get the template to get the PDF data
    const templates = await sql`
      SELECT document_data, fields, signer_roles FROM templates WHERE id = ${form.templateId}::uuid
    `;

    if (templates.length === 0 || !templates[0].document_data) {
      return NextResponse.json(
        { error: "Template document not found" },
        { status: 404 }
      );
    }

    const templatePdfData = templates[0].document_data;
    const templateFields = templates[0].fields || form.templateFields || [];

    // Create a unique envelope ID
    const envelopeId = `env-ff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const signingToken = `${envelopeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Ensure envelope_documents table exists
    await sql`
      CREATE TABLE IF NOT EXISTS envelope_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id VARCHAR(255) NOT NULL,
        envelope_id VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        pdf_data TEXT,
        signature_fields JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Ensure envelope_signing_sessions table exists
    await sql`
      CREATE TABLE IF NOT EXISTS envelope_signing_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id VARCHAR(255) NOT NULL,
        envelope_id VARCHAR(255) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        recipient_name VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        field_values JSONB DEFAULT '{}',
        signature_data TEXT,
        signed_pdf_data TEXT,
        ip_address VARCHAR(100),
        user_agent TEXT,
        viewed_at TIMESTAMP,
        signed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `;

    // Map template fields to signature fields format expected by signing page
    // The first signer role gets all fields (FusionForms are single-signer)
    const signatureFields = templateFields.map((field: {
      id: string;
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
      page: number;
      required?: boolean;
      placeholder?: string;
    }) => ({
      id: field.id,
      type: field.type,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      page: field.page,
      recipientId: 'signer-1',
      required: field.required !== false,
      prefillValue: '',
      placeholder: field.placeholder || '',
    }));

    // Create envelope document - use tenant ID from form
    await sql`
      INSERT INTO envelope_documents (org_id, envelope_id, title, pdf_data, signature_fields)
      VALUES (${tenantId}, ${envelopeId}, ${form.name}, ${templatePdfData}, ${JSON.stringify(signatureFields)}::jsonb)
    `;

    // Create signing session - use tenant ID from form
    await sql`
      INSERT INTO envelope_signing_sessions (
        org_id, envelope_id, token, recipient_name, recipient_email,
        status, ip_address, user_agent
      ) VALUES (
        ${tenantId},
        ${envelopeId},
        ${signingToken},
        ${signerName},
        ${signerEmail},
        'pending',
        ${ipAddress},
        ${userAgent}
      )
    `;

    // Update FusionForm submission count
    await sql`
      UPDATE fusion_forms
      SET submission_count = submission_count + 1, last_submission_at = NOW()
      WHERE id = ${form.id}::uuid
    `;

    console.log('[FusionForm] Created envelope and signing session:', envelopeId, signingToken);

    // Redirect to the EXISTING signing page (not the separate FusionForm signing page)
    return NextResponse.json({
      success: true,
      envelopeId,
      signingToken,
      // Use the existing signing flow!
      redirectUrl: `/sign/${signingToken}`,
    });
  } catch (error) {
    console.error("Error creating FusionForm submission:", error);
    return NextResponse.json(
      { error: "Failed to start signing session", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
