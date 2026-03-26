/**
 * PearSign FusionForms Service
 * Server-side FusionForms management with database persistence
 * Similar to DocuSign PowerForms - public reusable signing links
 *
 * Multi-tenancy: orgId is REQUIRED in all methods
 */

import { sql } from './db';
import { logEnvelopeEvent } from './audit-log';
import { TemplatesService } from './templates';

// ============== TYPES ==============

export type FusionFormStatus = 'active' | 'paused' | 'archived';
export type SubmissionStatus = 'pending' | 'in_progress' | 'completed' | 'expired' | 'cancelled';

export interface FusionForm {
  id: string;
  orgId: string;
  templateId: string;
  name: string;
  description: string | null;
  status: FusionFormStatus;
  accessCode: string;
  publicUrl: string;
  redirectUrl: string | null;
  expiresAt: string | null;
  submissionCount: number;
  lastSubmissionAt: string | null;
  requireName: boolean;
  requireEmail: boolean;
  allowMultipleSubmissions: boolean;
  customBranding: Record<string, unknown>;
  senderEmail: string | null;
  senderName: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FusionFormWithTemplate extends FusionForm {
  templateName: string;
  templateCategory: string;
  templateFields: TemplateField[];
}

export interface TemplateField {
  id: string;
  name: string;
  type: 'text' | 'email' | 'date' | 'signature' | 'company' | 'address' | 'phone' | 'number';
  required: boolean;
  x?: number;
  y?: number;
  placeholder?: string;
}

export interface FusionFormSubmission {
  id: string;
  fusionFormId: string;
  envelopeId: string | null;
  signerName: string;
  signerEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: SubmissionStatus;
  fieldValues: Record<string, string>;
  signatureData: string | null;
  signedAt: string | null;
  certificateUrl: string | null;
  documentUrl: string | null;
  accessToken: string;
  auditLog: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  action: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export interface CreateFusionFormInput {
  orgId: string; // REQUIRED - tenant isolation
  templateId: string;
  name: string;
  description?: string;
  redirectUrl?: string;
  expiresAt?: string;
  requireName?: boolean;
  requireEmail?: boolean;
  allowMultipleSubmissions?: boolean;
  customBranding?: Record<string, unknown>;
  senderEmail?: string;
  senderName?: string;
  createdBy: string;
}

export interface CreateSubmissionInput {
  fusionFormId: string;
  signerName: string;
  signerEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface FusionFormStats {
  totalForms: number;
  activeForms: number;
  totalSubmissions: number;
  completedSubmissions: number;
  avgCompletionRate: number;
  recentSubmissions: FusionFormSubmission[];
  topForms: Array<{
    id: string;
    name: string;
    submissionCount: number;
  }>;
}

// ============== HELPER: Generate Access Code ==============

function generateAccessCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateAccessToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ============== ENSURE TABLES EXIST ==============

async function ensureFusionFormTables(): Promise<void> {
  // Create fusion_forms table
  await sql`
    CREATE TABLE IF NOT EXISTS fusion_forms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      template_id UUID NOT NULL,
      name VARCHAR(500) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'active',
      access_code VARCHAR(50) UNIQUE NOT NULL,
      redirect_url TEXT,
      expires_at TIMESTAMP,
      submission_count INTEGER DEFAULT 0,
      last_submission_at TIMESTAMP,
      require_name BOOLEAN DEFAULT true,
      require_email BOOLEAN DEFAULT true,
      allow_multiple_submissions BOOLEAN DEFAULT true,
      custom_branding JSONB DEFAULT '{}',
      sender_email VARCHAR(255),
      sender_name VARCHAR(255),
      created_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create fusion_form_submissions table
  await sql`
    CREATE TABLE IF NOT EXISTS fusion_form_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fusion_form_id UUID NOT NULL REFERENCES fusion_forms(id) ON DELETE CASCADE,
      envelope_id VARCHAR(255),
      signer_name VARCHAR(255) NOT NULL,
      signer_email VARCHAR(255),
      ip_address VARCHAR(100),
      user_agent TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      field_values JSONB DEFAULT '{}',
      signature_data TEXT,
      signed_at TIMESTAMP,
      certificate_url TEXT,
      document_url TEXT,
      access_token VARCHAR(100) UNIQUE NOT NULL,
      audit_log JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create indexes for better performance
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_fusion_forms_access_code ON fusion_forms(access_code)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fusion_forms_org_id ON fusion_forms(org_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fusion_forms_template_id ON fusion_forms(template_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fusion_form_submissions_token ON fusion_form_submissions(access_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fusion_form_submissions_form_id ON fusion_form_submissions(fusion_form_id)`;
  } catch (e) {
    // Indexes might already exist
  }
}

// ============== FUSIONFORMS SERVICE ==============

export const FusionFormsService = {
  /**
   * Create a new FusionForm
   */
  async createForm(input: CreateFusionFormInput): Promise<FusionForm> {
    await ensureFusionFormTables();

    if (!input.orgId) {
      throw new Error('orgId is required');
    }

    const orgId = input.orgId;
    const accessCode = generateAccessCode();

    const result = await sql`
      INSERT INTO fusion_forms (
        org_id, template_id, name, description, status,
        access_code, redirect_url, expires_at,
        require_name, require_email, allow_multiple_submissions,
        custom_branding, sender_email, sender_name, created_by
      ) VALUES (
        ${orgId},
        ${input.templateId}::uuid,
        ${input.name},
        ${input.description || null},
        'active',
        ${accessCode},
        ${input.redirectUrl || null},
        ${input.expiresAt ? new Date(input.expiresAt).toISOString() : null},
        ${input.requireName !== false},
        ${input.requireEmail !== false},
        ${input.allowMultipleSubmissions !== false},
        ${JSON.stringify(input.customBranding || {})},
        ${input.senderEmail || null},
        ${input.senderName || null},
        ${input.createdBy}
      )
      RETURNING *
    `;

    return mapFormFromDb(result[0]);
  },

  /**
   * Get all FusionForms for an organization
   */
  async getForms(
    orgId: string,
    options: { limit?: number; offset?: number; status?: FusionFormStatus } = {}
  ): Promise<{ forms: FusionFormWithTemplate[]; total: number }> {
    await ensureFusionFormTables();

    if (!orgId) {
      throw new Error('orgId is required');
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let forms;
    let countResult;

    if (options.status) {
      forms = await sql`
        SELECT ff.*,
               COALESCE(t.name, ff.name) as template_name,
               COALESCE(t.category, 'General') as template_category,
               COALESCE(t.fields, '[]'::jsonb) as template_fields
        FROM fusion_forms ff
        LEFT JOIN templates t ON ff.template_id = t.id
        WHERE ff.org_id = ${orgId} AND ff.status = ${options.status}
        ORDER BY ff.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM fusion_forms
        WHERE org_id = ${orgId} AND status = ${options.status}
      `;
    } else {
      forms = await sql`
        SELECT ff.*,
               COALESCE(t.name, ff.name) as template_name,
               COALESCE(t.category, 'General') as template_category,
               COALESCE(t.fields, '[]'::jsonb) as template_fields
        FROM fusion_forms ff
        LEFT JOIN templates t ON ff.template_id = t.id
        WHERE ff.org_id = ${orgId}
        ORDER BY ff.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM fusion_forms
        WHERE org_id = ${orgId}
      `;
    }

    return {
      forms: forms.map(mapFormWithTemplateFromDb),
      total: parseInt(countResult[0].count, 10),
    };
  },

  /**
   * Get FusionForm by ID
   */
  async getForm(formId: string): Promise<FusionFormWithTemplate | null> {
    await ensureFusionFormTables();

    const result = await sql`
      SELECT ff.*,
             COALESCE(t.name, ff.name) as template_name,
             COALESCE(t.category, 'General') as template_category,
             COALESCE(t.fields, '[]'::jsonb) as template_fields
      FROM fusion_forms ff
      LEFT JOIN templates t ON ff.template_id = t.id
      WHERE ff.id = ${formId}::uuid
    `;
    if (result.length === 0) return null;
    return mapFormWithTemplateFromDb(result[0]);
  },

  /**
   * Get FusionForm by access code (for public access)
   */
  async getFormByAccessCode(accessCode: string): Promise<FusionFormWithTemplate | null> {
    await ensureFusionFormTables();

    // Ensure templates table exists too (for the JOIN) - just check existence
    try {
      await sql`SELECT 1 FROM templates LIMIT 1`;
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.log('[FusionForms] Templates table check:', e);
    }

    if (process.env.NODE_ENV !== 'production') console.log('[FusionForms] Looking up form by access code:', accessCode);

    const result = await sql`
      SELECT ff.*,
             COALESCE(t.name, ff.name) as template_name,
             COALESCE(t.category, 'General') as template_category,
             COALESCE(t.fields, '[]'::jsonb) as template_fields
      FROM fusion_forms ff
      LEFT JOIN templates t ON ff.template_id = t.id
      WHERE ff.access_code = ${accessCode} AND ff.status = 'active'
    `;

    if (process.env.NODE_ENV !== 'production') console.log('[FusionForms] Query result count:', result.length);

    if (result.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log('[FusionForms] No form found for access code:', accessCode);
      return null;
    }

    const form = mapFormWithTemplateFromDb(result[0]);

    // Check expiration
    if (form.expiresAt && new Date(form.expiresAt) < new Date()) {
      if (process.env.NODE_ENV !== 'production') console.log('[FusionForms] Form expired:', form.expiresAt);
      return null;
    }

    return form;
  },

  /**
   * Update FusionForm status
   */
  async updateFormStatus(formId: string, status: FusionFormStatus): Promise<FusionForm | null> {
    await ensureFusionFormTables();

    const result = await sql`
      UPDATE fusion_forms
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${formId}::uuid
      RETURNING *
    `;
    if (result.length === 0) return null;
    return mapFormFromDb(result[0]);
  },

  /**
   * Update FusionForm
   */
  async updateForm(
    formId: string,
    updates: Partial<Pick<FusionForm, 'name' | 'description' | 'redirectUrl' | 'expiresAt' | 'requireName' | 'requireEmail' | 'allowMultipleSubmissions' | 'customBranding'>>
  ): Promise<FusionForm | null> {
    await ensureFusionFormTables();

    const result = await sql`
      UPDATE fusion_forms
      SET
        name = COALESCE(${updates.name ?? null}, name),
        description = COALESCE(${updates.description ?? null}, description),
        redirect_url = COALESCE(${updates.redirectUrl ?? null}, redirect_url),
        expires_at = COALESCE(${updates.expiresAt ? new Date(updates.expiresAt).toISOString() : null}, expires_at),
        require_name = COALESCE(${updates.requireName ?? null}, require_name),
        require_email = COALESCE(${updates.requireEmail ?? null}, require_email),
        allow_multiple_submissions = COALESCE(${updates.allowMultipleSubmissions ?? null}, allow_multiple_submissions),
        custom_branding = COALESCE(${updates.customBranding ? JSON.stringify(updates.customBranding) : null}::jsonb, custom_branding),
        updated_at = NOW()
      WHERE id = ${formId}::uuid
      RETURNING *
    `;
    if (result.length === 0) return null;
    return mapFormFromDb(result[0]);
  },

  /**
   * Delete FusionForm
   */
  async deleteForm(formId: string): Promise<boolean> {
    await ensureFusionFormTables();

    const result = await sql`DELETE FROM fusion_forms WHERE id = ${formId}::uuid RETURNING id`;
    return result.length > 0;
  },

  /**
   * Create a new submission (when client opens the form link)
   */
  async createSubmission(input: CreateSubmissionInput): Promise<FusionFormSubmission> {
    await ensureFusionFormTables();

    const accessToken = generateAccessToken();
    const envelopeId = `env-ff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const auditEntry: AuditEntry = {
      action: 'submission_created',
      timestamp: new Date().toISOString(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    const result = await sql`
      INSERT INTO fusion_form_submissions (
        fusion_form_id, envelope_id, signer_name, signer_email,
        ip_address, user_agent, status, access_token, audit_log
      ) VALUES (
        ${input.fusionFormId}::uuid,
        ${envelopeId},
        ${input.signerName},
        ${input.signerEmail || null},
        ${input.ipAddress || null},
        ${input.userAgent || null},
        'pending',
        ${accessToken},
        ${JSON.stringify([auditEntry])}
      )
      RETURNING *
    `;

    // Update form submission count
    await sql`
      UPDATE fusion_forms
      SET submission_count = submission_count + 1, last_submission_at = NOW()
      WHERE id = ${input.fusionFormId}::uuid
    `;

    return mapSubmissionFromDb(result[0]);
  },

  /**
   * Get submission by access token (for public signing)
   */
  async getSubmissionByToken(accessToken: string): Promise<FusionFormSubmission | null> {
    await ensureFusionFormTables();

    const result = await sql`
      SELECT * FROM fusion_form_submissions WHERE access_token = ${accessToken}
    `;
    if (result.length === 0) return null;
    return mapSubmissionFromDb(result[0]);
  },

  /**
   * Get submission by ID
   */
  async getSubmission(submissionId: string): Promise<FusionFormSubmission | null> {
    await ensureFusionFormTables();

    const result = await sql`
      SELECT * FROM fusion_form_submissions WHERE id = ${submissionId}::uuid
    `;
    if (result.length === 0) return null;
    return mapSubmissionFromDb(result[0]);
  },

  /**
   * Get submissions for a FusionForm
   */
  async getFormSubmissions(
    formId: string,
    options: { limit?: number; offset?: number; status?: SubmissionStatus } = {}
  ): Promise<{ submissions: FusionFormSubmission[]; total: number }> {
    await ensureFusionFormTables();

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let submissions;
    let countResult;

    if (options.status) {
      submissions = await sql`
        SELECT * FROM fusion_form_submissions
        WHERE fusion_form_id = ${formId}::uuid AND status = ${options.status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM fusion_form_submissions
        WHERE fusion_form_id = ${formId}::uuid AND status = ${options.status}
      `;
    } else {
      submissions = await sql`
        SELECT * FROM fusion_form_submissions
        WHERE fusion_form_id = ${formId}::uuid
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM fusion_form_submissions
        WHERE fusion_form_id = ${formId}::uuid
      `;
    }

    return {
      submissions: submissions.map(mapSubmissionFromDb),
      total: parseInt(countResult[0].count, 10),
    };
  },

  /**
   * Get ALL submissions across all forms for a tenant (for dashboard view)
   */
  async getAllSubmissionsForOrg(
    orgId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ submissions: Array<FusionFormSubmission & { formName: string }>; total: number }> {
    await ensureFusionFormTables();

    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const submissions = await sql`
      SELECT ffs.*, ff.name as form_name
      FROM fusion_form_submissions ffs
      JOIN fusion_forms ff ON ffs.fusion_form_id = ff.id
      WHERE ff.org_id = ${orgId}
      ORDER BY ffs.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as count
      FROM fusion_form_submissions ffs
      JOIN fusion_forms ff ON ffs.fusion_form_id = ff.id
      WHERE ff.org_id = ${orgId}
    `;

    return {
      submissions: submissions.map(row => ({
        ...mapSubmissionFromDb(row),
        formName: row.form_name as string,
      })),
      total: parseInt(countResult[0].count, 10),
    };
  },

  /**
   * Update submission status
   */
  async updateSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
    additionalData?: {
      fieldValues?: Record<string, string>;
      signatureData?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<FusionFormSubmission | null> {
    await ensureFusionFormTables();

    // Get current submission for audit log
    const current = await this.getSubmission(submissionId);
    if (!current) return null;

    const auditEntry: AuditEntry = {
      action: `status_changed_to_${status}`,
      timestamp: new Date().toISOString(),
      ipAddress: additionalData?.ipAddress,
      userAgent: additionalData?.userAgent,
    };

    const updatedAuditLog = [...current.auditLog, auditEntry];

    let result;

    if (status === 'completed') {
      result = await sql`
        UPDATE fusion_form_submissions
        SET
          status = ${status},
          field_values = COALESCE(${additionalData?.fieldValues ? JSON.stringify(additionalData.fieldValues) : null}::jsonb, field_values),
          signature_data = COALESCE(${additionalData?.signatureData || null}, signature_data),
          signed_at = NOW(),
          audit_log = ${JSON.stringify(updatedAuditLog)}::jsonb,
          updated_at = NOW()
        WHERE id = ${submissionId}::uuid
        RETURNING *
      `;
    } else if (status === 'in_progress') {
      result = await sql`
        UPDATE fusion_form_submissions
        SET
          status = ${status},
          field_values = COALESCE(${additionalData?.fieldValues ? JSON.stringify(additionalData.fieldValues) : null}::jsonb, field_values),
          audit_log = ${JSON.stringify(updatedAuditLog)}::jsonb,
          updated_at = NOW()
        WHERE id = ${submissionId}::uuid
        RETURNING *
      `;
    } else {
      result = await sql`
        UPDATE fusion_form_submissions
        SET
          status = ${status},
          audit_log = ${JSON.stringify(updatedAuditLog)}::jsonb,
          updated_at = NOW()
        WHERE id = ${submissionId}::uuid
        RETURNING *
      `;
    }

    if (result.length === 0) return null;
    return mapSubmissionFromDb(result[0]);
  },

  /**
   * Complete a submission with signature
   */
  async completeSubmission(
    submissionId: string,
    data: {
      fieldValues: Record<string, string>;
      signatureData: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<FusionFormSubmission | null> {
    await ensureFusionFormTables();

    const submission = await this.getSubmission(submissionId);
    if (!submission) return null;

    // Generate certificate URL (in production, this would be a real certificate)
    const certificateUrl = `/certificates/${submission.envelopeId}.pdf`;
    const documentUrl = `/documents/${submission.envelopeId}-signed.pdf`;

    const auditEntry: AuditEntry = {
      action: 'signature_completed',
      timestamp: new Date().toISOString(),
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: {
        fieldsCompleted: Object.keys(data.fieldValues).length,
      },
    };

    const updatedAuditLog = [...submission.auditLog, auditEntry];

    const result = await sql`
      UPDATE fusion_form_submissions
      SET
        status = 'completed',
        field_values = ${JSON.stringify(data.fieldValues)}::jsonb,
        signature_data = ${data.signatureData},
        signed_at = NOW(),
        certificate_url = ${certificateUrl},
        document_url = ${documentUrl},
        audit_log = ${JSON.stringify(updatedAuditLog)}::jsonb,
        updated_at = NOW()
      WHERE id = ${submissionId}::uuid
      RETURNING *
    `;

    if (result.length === 0) return null;

    // Get the form to get the orgId
    const form = await this.getForm(submission.fusionFormId);

    // Log envelope event
    await logEnvelopeEvent('envelope.signed', {
      orgId: form?.orgId || 'unknown', // Get orgId from the form
      envelopeId: submission.envelopeId || submissionId,
      envelopeTitle: `FusionForm Submission`,
      actorId: submission.signerName,
      recipientEmail: submission.signerEmail || 'unknown',
      details: { fusionFormSubmissionId: submissionId },
    });

    return mapSubmissionFromDb(result[0]);
  },

  /**
   * Get FusionForms statistics
   */
  async getStats(orgId: string): Promise<FusionFormStats> {
    await ensureFusionFormTables();

    if (!orgId) {
      throw new Error('orgId is required');
    }

    // Basic counts
    const formStats = await sql`
      SELECT
        COUNT(*) as total_forms,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_forms,
        SUM(submission_count) as total_submissions
      FROM fusion_forms
      WHERE org_id = ${orgId}
    `;

    const completedStats = await sql`
      SELECT COUNT(*) as completed_submissions
      FROM fusion_form_submissions ffs
      JOIN fusion_forms ff ON ffs.fusion_form_id = ff.id
      WHERE ff.org_id = ${orgId} AND ffs.status = 'completed'
    `;

    const recentSubmissions = await sql`
      SELECT ffs.*
      FROM fusion_form_submissions ffs
      JOIN fusion_forms ff ON ffs.fusion_form_id = ff.id
      WHERE ff.org_id = ${orgId}
      ORDER BY ffs.created_at DESC
      LIMIT 5
    `;

    const topForms = await sql`
      SELECT id, name, submission_count
      FROM fusion_forms
      WHERE org_id = ${orgId}
      ORDER BY submission_count DESC
      LIMIT 5
    `;

    const stats = formStats[0];
    const totalSubmissions = parseInt(stats.total_submissions || '0', 10);
    const completedSubmissions = parseInt(completedStats[0].completed_submissions || '0', 10);

    return {
      totalForms: parseInt(stats.total_forms || '0', 10),
      activeForms: parseInt(stats.active_forms || '0', 10),
      totalSubmissions,
      completedSubmissions,
      avgCompletionRate: totalSubmissions > 0 ? Math.round((completedSubmissions / totalSubmissions) * 100) : 0,
      recentSubmissions: recentSubmissions.map(mapSubmissionFromDb),
      topForms: topForms.map(f => ({
        id: f.id,
        name: f.name,
        submissionCount: f.submission_count,
      })),
    };
  },

  /**
   * Add audit log entry to submission
   */
  async addAuditEntry(
    submissionId: string,
    entry: Omit<AuditEntry, 'timestamp'>
  ): Promise<boolean> {
    await ensureFusionFormTables();

    const submission = await this.getSubmission(submissionId);
    if (!submission) return false;

    const auditEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    const updatedAuditLog = [...submission.auditLog, auditEntry];

    await sql`
      UPDATE fusion_form_submissions
      SET audit_log = ${JSON.stringify(updatedAuditLog)}::jsonb, updated_at = NOW()
      WHERE id = ${submissionId}::uuid
    `;

    return true;
  },
};

// ============== HELPER FUNCTIONS ==============

function getPublicUrl(accessCode: string): string {
  // Return just the path - the client will construct the full URL
  // This allows it to work in any environment (localhost, Same.new preview, production)
  return `/f/${accessCode}`;
}

function mapFormFromDb(row: Record<string, unknown>): FusionForm {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    templateId: row.template_id as string,
    name: row.name as string,
    description: row.description as string | null,
    status: row.status as FusionFormStatus,
    accessCode: row.access_code as string,
    publicUrl: getPublicUrl(row.access_code as string),
    redirectUrl: row.redirect_url as string | null,
    expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : null,
    submissionCount: row.submission_count as number,
    lastSubmissionAt: row.last_submission_at ? (row.last_submission_at as Date).toISOString() : null,
    requireName: row.require_name as boolean,
    requireEmail: row.require_email as boolean,
    allowMultipleSubmissions: row.allow_multiple_submissions as boolean,
    customBranding: (row.custom_branding as Record<string, unknown>) || {},
    senderEmail: row.sender_email as string | null,
    senderName: row.sender_name as string | null,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function mapFormWithTemplateFromDb(row: Record<string, unknown>): FusionFormWithTemplate {
  return {
    ...mapFormFromDb(row),
    templateName: row.template_name as string,
    templateCategory: row.template_category as string,
    templateFields: (row.template_fields as TemplateField[]) || [],
  };
}

function mapSubmissionFromDb(row: Record<string, unknown>): FusionFormSubmission {
  return {
    id: row.id as string,
    fusionFormId: row.fusion_form_id as string,
    envelopeId: row.envelope_id as string | null,
    signerName: row.signer_name as string,
    signerEmail: row.signer_email as string | null,
    ipAddress: row.ip_address as string | null,
    userAgent: row.user_agent as string | null,
    status: row.status as SubmissionStatus,
    fieldValues: (row.field_values as Record<string, string>) || {},
    signatureData: row.signature_data as string | null,
    signedAt: row.signed_at ? (row.signed_at as Date).toISOString() : null,
    certificateUrl: row.certificate_url as string | null,
    documentUrl: row.document_url as string | null,
    accessToken: row.access_token as string,
    auditLog: (row.audit_log as AuditEntry[]) || [],
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}
