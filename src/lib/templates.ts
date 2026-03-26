/**
 * PearSign Templates Service
 * Server-side template management with database persistence
 * Enterprise-grade reusable document templates
 *
 * Multi-tenancy: orgId is REQUIRED in all methods
 */

import { sql } from './db';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// ============== TYPES ==============

export type TemplateStatus = 'draft' | 'active';

export interface TemplateFieldMapping {
  id: string;
  name: string;
  type: 'text' | 'email' | 'date' | 'signature' | 'initials' | 'company' | 'address' | 'phone' | 'number' | 'checkbox' | 'upload';
  required: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  placeholder?: string;
  signerRoleId: string; // ID of the signer role this field belongs to
  defaultValue?: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export interface SignerRole {
  id: string;
  name: string;
  order: number;
  color: string;
}

export interface Template {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  category: string;
  status: TemplateStatus;
  useCount: number;
  lastUsedAt: string | null;
  fields: TemplateFieldMapping[];
  signerRoles: SignerRole[];
  hasFusionForm: boolean;
  fusionFormId: string | null;
  fusionFormUrl: string | null;
  documentUrl: string | null;
  documentData: string | null; // Base64 PDF data
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface CreateTemplateInput {
  orgId: string; // REQUIRED - tenant isolation
  name: string;
  description?: string;
  category: string;
  status?: TemplateStatus;
  fields: TemplateFieldMapping[];
  signerRoles?: SignerRole[];
  documentUrl?: string;
  documentData?: string;
  createdBy: string;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  category?: string;
  status?: TemplateStatus;
  fields?: TemplateFieldMapping[];
  signerRoles?: SignerRole[];
  documentUrl?: string;
  documentData?: string;
}

// ============== DATABASE INITIALIZATION ==============

async function ensureTemplatesTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      name VARCHAR(500) NOT NULL,
      description TEXT,
      category VARCHAR(100) NOT NULL DEFAULT 'General',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      use_count INTEGER DEFAULT 0,
      last_used_at TIMESTAMP,
      fields JSONB DEFAULT '[]',
      signer_roles JSONB DEFAULT '[]',
      has_fusion_form BOOLEAN DEFAULT false,
      fusion_form_id UUID,
      fusion_form_url TEXT,
      document_url TEXT,
      document_data TEXT,
      created_by VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'
    )
  `;

  // Add any missing columns
  try {
    await sql`ALTER TABLE templates ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'`;
  } catch { /* Column might already exist */ }

  try {
    await sql`ALTER TABLE templates ADD COLUMN IF NOT EXISTS signer_roles JSONB DEFAULT '[]'`;
  } catch { /* Column might already exist */ }

  try {
    await sql`ALTER TABLE templates ADD COLUMN IF NOT EXISTS fusion_form_id UUID`;
  } catch { /* Column might already exist */ }

  try {
    await sql`ALTER TABLE templates ADD COLUMN IF NOT EXISTS document_data TEXT`;
  } catch { /* Column might already exist */ }

  try {
    await sql`ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`;
  } catch { /* Column might already exist */ }
}

// ============== DEFAULT SIGNER ROLES ==============

export const DEFAULT_SIGNER_ROLES: SignerRole[] = [
  { id: 'signer-1', name: 'Signer 1', order: 1, color: '#2563eb' },
  { id: 'signer-2', name: 'Signer 2', order: 2, color: '#7c3aed' },
  { id: 'signer-3', name: 'Signer 3', order: 3, color: '#059669' },
];

// ============== TEMPLATES SERVICE ==============

export const TemplatesService = {
  async getTemplates(
    orgId: string,
    options: { limit?: number; offset?: number; category?: string; status?: TemplateStatus } = {}
  ): Promise<{ templates: Template[]; total: number }> {
    await ensureTemplatesTable();

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let templates;
    let countResult;

    if (options.category && options.status) {
      templates = await sql`
        SELECT * FROM templates
        WHERE org_id = ${orgId} AND category = ${options.category} AND status = ${options.status}
        ORDER BY use_count DESC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM templates
        WHERE org_id = ${orgId} AND category = ${options.category} AND status = ${options.status}
      `;
    } else if (options.category) {
      templates = await sql`
        SELECT * FROM templates
        WHERE org_id = ${orgId} AND category = ${options.category}
        ORDER BY use_count DESC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM templates
        WHERE org_id = ${orgId} AND category = ${options.category}
      `;
    } else if (options.status) {
      templates = await sql`
        SELECT * FROM templates
        WHERE org_id = ${orgId} AND status = ${options.status}
        ORDER BY use_count DESC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM templates
        WHERE org_id = ${orgId} AND status = ${options.status}
      `;
    } else {
      templates = await sql`
        SELECT * FROM templates
        WHERE org_id = ${orgId}
        ORDER BY use_count DESC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM templates
        WHERE org_id = ${orgId}
      `;
    }

    return {
      templates: templates.map(mapTemplateFromDb),
      total: parseInt(countResult[0].count, 10),
    };
  },

  async getTemplateById(orgId: string, templateId: string): Promise<Template | null> {
    await ensureTemplatesTable();

    const result = await sql`
      SELECT * FROM templates WHERE id = ${templateId}::uuid AND org_id = ${orgId}
    `;
    if (result.length === 0) return null;
    return mapTemplateFromDb(result[0]);
  },

  async createTemplate(input: CreateTemplateInput): Promise<Template> {
    await ensureTemplatesTable();

    const orgId = input.orgId;
    const signerRoles = input.signerRoles || DEFAULT_SIGNER_ROLES;

    const result = await sql`
      INSERT INTO templates (
        org_id, name, description, category, status, fields, signer_roles,
        document_url, document_data, created_by
      ) VALUES (
        ${orgId},
        ${input.name},
        ${input.description || null},
        ${input.category},
        ${input.status || 'draft'},
        ${JSON.stringify(input.fields)},
        ${JSON.stringify(signerRoles)},
        ${input.documentUrl || null},
        ${input.documentData || null},
        ${input.createdBy}
      )
      RETURNING *
    `;

    return mapTemplateFromDb(result[0]);
  },

  async updateTemplate(orgId: string, templateId: string, input: UpdateTemplateInput): Promise<Template | null> {
    await ensureTemplatesTable();

    const result = await sql`
      UPDATE templates
      SET
        name = COALESCE(${input.name ?? null}, name),
        description = COALESCE(${input.description ?? null}, description),
        category = COALESCE(${input.category ?? null}, category),
        status = COALESCE(${input.status ?? null}, status),
        fields = COALESCE(${input.fields ? JSON.stringify(input.fields) : null}::jsonb, fields),
        signer_roles = COALESCE(${input.signerRoles ? JSON.stringify(input.signerRoles) : null}::jsonb, signer_roles),
        document_url = COALESCE(${input.documentUrl ?? null}, document_url),
        document_data = COALESCE(${input.documentData ?? null}, document_data),
        updated_at = NOW()
      WHERE id = ${templateId}::uuid AND org_id = ${orgId}
      RETURNING *
    `;

    if (result.length === 0) return null;
    return mapTemplateFromDb(result[0]);
  },

  async activateTemplate(orgId: string, templateId: string): Promise<Template | null> {
    return this.updateTemplate(orgId, templateId, { status: 'active' });
  },

  async deactivateTemplate(orgId: string, templateId: string): Promise<Template | null> {
    return this.updateTemplate(orgId, templateId, { status: 'draft' });
  },

  async duplicateTemplate(orgId: string, templateId: string, newName?: string): Promise<Template | null> {
    const original = await this.getTemplateById(orgId, templateId);
    if (!original) return null;

    const result = await sql`
      INSERT INTO templates (
        org_id, name, description, category, status, fields, signer_roles,
        document_url, document_data, created_by
      ) VALUES (
        ${original.orgId},
        ${newName || `${original.name} (Copy)`},
        ${original.description},
        ${original.category},
        'draft',
        ${JSON.stringify(original.fields)},
        ${JSON.stringify(original.signerRoles)},
        ${original.documentUrl},
        ${original.documentData},
        ${original.createdBy}
      )
      RETURNING *
    `;

    return mapTemplateFromDb(result[0]);
  },

  async incrementUseCount(orgId: string, templateId: string): Promise<void> {
    await sql`
      UPDATE templates
      SET use_count = use_count + 1, last_used_at = NOW()
      WHERE id = ${templateId}::uuid AND org_id = ${orgId}
    `;
  },

  async setFusionForm(orgId: string, templateId: string, fusionFormId: string, fusionFormUrl: string): Promise<Template | null> {
    const result = await sql`
      UPDATE templates
      SET has_fusion_form = true, fusion_form_id = ${fusionFormId}::uuid, fusion_form_url = ${fusionFormUrl}, updated_at = NOW()
      WHERE id = ${templateId}::uuid AND org_id = ${orgId}
      RETURNING *
    `;
    if (result.length === 0) return null;
    return mapTemplateFromDb(result[0]);
  },

  async removeFusionForm(orgId: string, templateId: string): Promise<Template | null> {
    const result = await sql`
      UPDATE templates
      SET has_fusion_form = false, fusion_form_id = NULL, fusion_form_url = NULL, updated_at = NOW()
      WHERE id = ${templateId}::uuid AND org_id = ${orgId}
      RETURNING *
    `;
    if (result.length === 0) return null;
    return mapTemplateFromDb(result[0]);
  },

  async deleteTemplate(orgId: string, templateId: string): Promise<boolean> {
    const result = await sql`DELETE FROM templates WHERE id = ${templateId}::uuid AND org_id = ${orgId} RETURNING id`;
    return result.length > 0;
  },

  async generateTemplatePdf(templateName: string, fields: { name: string; type: string; y: number }[], signerRoles: { name: string }[]): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { height } = page.getSize();

    page.drawRectangle({ x: 0, y: height - 80, width: 612, height: 80, color: rgb(0.12, 0.12, 0.18) });
    page.drawText(templateName.toUpperCase(), { x: 50, y: height - 50, size: 22, font: helveticaBold, color: rgb(1, 1, 1) });
    page.drawText('DOCUMENT TEMPLATE', { x: 50, y: height - 70, size: 10, font: helvetica, color: rgb(0.7, 0.7, 0.7) });

    page.drawLine({ start: { x: 50, y: height - 100 }, end: { x: 562, y: height - 100 }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });

    let yPos = height - 130;
    page.drawText('This document is a template for:', { x: 50, y: yPos, size: 11, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
    yPos -= 25;

    for (const role of signerRoles) {
      page.drawText(`• ${role.name}`, { x: 70, y: yPos, size: 11, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
      yPos -= 20;
    }

    yPos -= 15;
    page.drawLine({ start: { x: 50, y: yPos }, end: { x: 562, y: yPos }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    yPos -= 25;

    page.drawText('FIELDS', { x: 50, y: yPos, size: 12, font: helveticaBold, color: rgb(0.12, 0.12, 0.18) });
    yPos -= 25;

    for (const field of fields) {
      page.drawText(`${field.name}:`, { x: 50, y: yPos, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
      if (field.type === 'signature') {
        page.drawRectangle({ x: 160, y: yPos - 30, width: 200, height: 50, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1, color: rgb(0.97, 0.97, 0.97) });
        page.drawText('Sign here', { x: 230, y: yPos - 10, size: 9, font: helvetica, color: rgb(0.6, 0.6, 0.6) });
        yPos -= 55;
      } else {
        page.drawLine({ start: { x: 160, y: yPos - 2 }, end: { x: 400, y: yPos - 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        yPos -= 25;
      }
    }

    yPos = 60;
    page.drawLine({ start: { x: 50, y: yPos }, end: { x: 562, y: yPos }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    page.drawText('Generated by PearSign', { x: 50, y: yPos - 15, size: 8, font: helvetica, color: rgb(0.6, 0.6, 0.6) });

    const pdfBytes = await pdfDoc.save();
    const base64 = Buffer.from(pdfBytes).toString('base64');
    return `data:application/pdf;base64,${base64}`;
  },

  async seedSampleTemplates(orgId: string): Promise<Template[]> {
    await ensureTemplatesTable();

    // Check if templates already exist
    const existing = await sql`SELECT COUNT(*) as count FROM templates WHERE org_id = ${orgId}`;
    if (parseInt(existing[0].count, 10) > 0) {
      const result = await sql`SELECT * FROM templates WHERE org_id = ${orgId} ORDER BY created_at DESC`;
      return result.map(mapTemplateFromDb);
    }

    // Create sample templates
    const sampleTemplates = [
      {
        name: 'Employment Contract',
        description: 'Standard employee agreement template with all required legal clauses',
        category: 'HR',
        status: 'active' as TemplateStatus,
        fields: [
          { id: 'f1', name: 'Employee Name', type: 'text' as const, required: true, x: 100, y: 150, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f2', name: 'Email', type: 'email' as const, required: true, x: 100, y: 200, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f3', name: 'Start Date', type: 'date' as const, required: true, x: 100, y: 250, width: 150, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f4', name: 'Job Title', type: 'text' as const, required: true, x: 100, y: 300, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f5', name: 'Employee Signature', type: 'signature' as const, required: true, x: 100, y: 600, width: 200, height: 60, page: 1, signerRoleId: 'signer-1' },
          { id: 'f6', name: 'HR Signature', type: 'signature' as const, required: true, x: 350, y: 600, width: 200, height: 60, page: 1, signerRoleId: 'signer-2' },
        ],
        signerRoles: [
          { id: 'signer-1', name: 'Employee', order: 1, color: '#2563eb' },
          { id: 'signer-2', name: 'HR Manager', order: 2, color: '#7c3aed' },
        ],
      },
      {
        name: 'NDA Agreement',
        description: 'Non-disclosure agreement for contractors and partners',
        category: 'Legal',
        status: 'active' as TemplateStatus,
        fields: [
          { id: 'f1', name: 'Party Name', type: 'text' as const, required: true, x: 100, y: 150, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f2', name: 'Company', type: 'company' as const, required: true, x: 100, y: 200, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f3', name: 'Email', type: 'email' as const, required: true, x: 100, y: 250, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f4', name: 'Signature', type: 'signature' as const, required: true, x: 100, y: 500, width: 200, height: 60, page: 1, signerRoleId: 'signer-1' },
        ],
        signerRoles: [
          { id: 'signer-1', name: 'Contractor', order: 1, color: '#2563eb' },
        ],
      },
      {
        name: 'Service Agreement',
        description: 'Client service agreement for consultants',
        category: 'Sales',
        status: 'active' as TemplateStatus,
        fields: [
          { id: 'f1', name: 'Client Name', type: 'text' as const, required: true, x: 100, y: 150, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f2', name: 'Company', type: 'company' as const, required: true, x: 100, y: 200, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f3', name: 'Email', type: 'email' as const, required: true, x: 100, y: 250, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f4', name: 'Client Signature', type: 'signature' as const, required: true, x: 100, y: 500, width: 200, height: 60, page: 1, signerRoleId: 'signer-1' },
          { id: 'f5', name: 'Provider Signature', type: 'signature' as const, required: true, x: 350, y: 500, width: 200, height: 60, page: 1, signerRoleId: 'signer-2' },
        ],
        signerRoles: [
          { id: 'signer-1', name: 'Client', order: 1, color: '#2563eb' },
          { id: 'signer-2', name: 'Service Provider', order: 2, color: '#059669' },
        ],
      },
      {
        name: 'Vendor Onboarding',
        description: 'Vendor qualification and registration form',
        category: 'Procurement',
        status: 'draft' as TemplateStatus,
        fields: [
          { id: 'f1', name: 'Company Name', type: 'company' as const, required: true, x: 100, y: 150, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f2', name: 'Contact Person', type: 'text' as const, required: true, x: 100, y: 200, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f3', name: 'Email', type: 'email' as const, required: true, x: 100, y: 250, width: 200, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f4', name: 'Phone', type: 'phone' as const, required: true, x: 100, y: 300, width: 150, height: 30, page: 1, signerRoleId: 'signer-1' },
          { id: 'f5', name: 'Address', type: 'address' as const, required: true, x: 100, y: 350, width: 300, height: 60, page: 1, signerRoleId: 'signer-1' },
          { id: 'f6', name: 'Signature', type: 'signature' as const, required: true, x: 100, y: 500, width: 200, height: 60, page: 1, signerRoleId: 'signer-1' },
        ],
        signerRoles: [
          { id: 'signer-1', name: 'Vendor Representative', order: 1, color: '#2563eb' },
        ],
      },
    ];

    const createdTemplates: Template[] = [];

    for (const template of sampleTemplates) {
      let documentData: string | undefined;
      try {
        documentData = await this.generateTemplatePdf(
          template.name,
          template.fields.map(f => ({ name: f.name, type: f.type, y: f.y })),
          template.signerRoles.map(r => ({ name: r.name }))
        );
      } catch (pdfErr) {
        console.error(`[Templates] Failed to generate PDF for ${template.name}:`, pdfErr);
      }

      const created = await this.createTemplate({
        orgId,
        name: template.name,
        description: template.description,
        category: template.category,
        status: template.status,
        fields: template.fields,
        signerRoles: template.signerRoles,
        documentData,
        createdBy: 'system',
      });
      createdTemplates.push(created);
    }

    return createdTemplates;
  },
};

function mapTemplateFromDb(row: Record<string, unknown>): Template {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    description: row.description as string | null,
    category: row.category as string,
    status: (row.status as TemplateStatus) || 'draft',
    useCount: (row.use_count as number) || 0,
    lastUsedAt: row.last_used_at ? (row.last_used_at as Date).toISOString() : null,
    fields: (row.fields as TemplateFieldMapping[]) || [],
    signerRoles: (row.signer_roles as SignerRole[]) || DEFAULT_SIGNER_ROLES,
    hasFusionForm: (row.has_fusion_form as boolean) || false,
    fusionFormId: row.fusion_form_id as string | null,
    fusionFormUrl: row.fusion_form_url as string | null,
    documentUrl: row.document_url as string | null,
    documentData: row.document_data as string | null,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}
