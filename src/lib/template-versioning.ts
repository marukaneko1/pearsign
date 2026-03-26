/**
 * PearSign Template Versioning System
 *
 * Implements the Template → Instance model:
 * - Template = blueprint (editable)
 * - Envelope = frozen instance (copied on send)
 *
 * Editing templates NEVER affects sent envelopes.
 * Version templates silently in the background.
 */

import { sql } from './db';

// ============== TYPES ==============

export interface TemplateVersion {
  id: string;
  templateId: string;
  tenantId: string;
  version: number;
  name: string;
  description?: string;
  category?: string;
  fields: TemplateField[];
  signerRoles: SignerRole[];
  documentData?: string;
  createdBy?: string;
  createdAt: string;
}

export interface TemplateField {
  id: string;
  type: 'signature' | 'initial' | 'date' | 'text' | 'checkbox' | 'dropdown';
  label: string;
  required: boolean;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signerRole?: string;
  defaultValue?: string;
  options?: string[]; // For dropdown fields
}

export interface SignerRole {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export interface FrozenTemplateData {
  templateId: string;
  versionId: string;
  version: number;
  name: string;
  description?: string;
  category?: string;
  fields: TemplateField[];
  signerRoles: SignerRole[];
  documentData?: string;
  frozenAt: string;
}

// ============== TEMPLATE VERSIONING SERVICE ==============

export const TemplateVersioningService = {
  /**
   * Create initial version when template is created
   */
  async createInitialVersion(
    templateId: string,
    tenantId: string,
    data: {
      name: string;
      description?: string;
      category?: string;
      fields: TemplateField[];
      signerRoles: SignerRole[];
      documentData?: string;
      createdBy?: string;
    }
  ): Promise<TemplateVersion> {
    const result = await sql`
      INSERT INTO template_versions (
        template_id, tenant_id, version, name, description, category,
        fields, signer_roles, document_data, created_by
      ) VALUES (
        ${templateId},
        ${tenantId},
        1,
        ${data.name},
        ${data.description || null},
        ${data.category || null},
        ${JSON.stringify(data.fields)},
        ${JSON.stringify(data.signerRoles)},
        ${data.documentData || null},
        ${data.createdBy || null}
      )
      RETURNING *
    `;

    return mapVersionFromDb(result[0]);
  },

  /**
   * Create new version when template is updated
   * This is called automatically when a template is edited
   */
  async createVersion(
    templateId: string,
    tenantId: string,
    data: {
      name: string;
      description?: string;
      category?: string;
      fields: TemplateField[];
      signerRoles: SignerRole[];
      documentData?: string;
      createdBy?: string;
    }
  ): Promise<TemplateVersion> {
    // Get the latest version number
    const latestVersion = await sql`
      SELECT MAX(version) as max_version
      FROM template_versions
      WHERE template_id = ${templateId} AND tenant_id = ${tenantId}
    `;

    const nextVersion = (parseInt(latestVersion[0]?.max_version) || 0) + 1;

    const result = await sql`
      INSERT INTO template_versions (
        template_id, tenant_id, version, name, description, category,
        fields, signer_roles, document_data, created_by
      ) VALUES (
        ${templateId},
        ${tenantId},
        ${nextVersion},
        ${data.name},
        ${data.description || null},
        ${data.category || null},
        ${JSON.stringify(data.fields)},
        ${JSON.stringify(data.signerRoles)},
        ${data.documentData || null},
        ${data.createdBy || null}
      )
      RETURNING *
    `;

    return mapVersionFromDb(result[0]);
  },

  /**
   * Get the latest version of a template
   */
  async getLatestVersion(templateId: string, tenantId: string): Promise<TemplateVersion | null> {
    const result = await sql`
      SELECT * FROM template_versions
      WHERE template_id = ${templateId} AND tenant_id = ${tenantId}
      ORDER BY version DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;
    return mapVersionFromDb(result[0]);
  },

  /**
   * Get a specific version of a template
   */
  async getVersion(templateId: string, tenantId: string, version: number): Promise<TemplateVersion | null> {
    const result = await sql`
      SELECT * FROM template_versions
      WHERE template_id = ${templateId}
        AND tenant_id = ${tenantId}
        AND version = ${version}
    `;

    if (result.length === 0) return null;
    return mapVersionFromDb(result[0]);
  },

  /**
   * Get version by ID
   */
  async getVersionById(versionId: string): Promise<TemplateVersion | null> {
    const result = await sql`
      SELECT * FROM template_versions WHERE id = ${versionId}
    `;

    if (result.length === 0) return null;
    return mapVersionFromDb(result[0]);
  },

  /**
   * Get all versions of a template
   */
  async getAllVersions(templateId: string, tenantId: string): Promise<TemplateVersion[]> {
    const result = await sql`
      SELECT * FROM template_versions
      WHERE template_id = ${templateId} AND tenant_id = ${tenantId}
      ORDER BY version DESC
    `;

    return result.map(mapVersionFromDb);
  },

  /**
   * Freeze template for envelope creation
   * Returns a snapshot of the template that will be stored with the envelope
   */
  async freezeTemplateForEnvelope(templateId: string, tenantId: string): Promise<FrozenTemplateData> {
    const version = await this.getLatestVersion(templateId, tenantId);

    if (!version) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return {
      templateId: version.templateId,
      versionId: version.id,
      version: version.version,
      name: version.name,
      description: version.description,
      category: version.category,
      fields: version.fields,
      signerRoles: version.signerRoles,
      documentData: version.documentData,
      frozenAt: new Date().toISOString(),
    };
  },

  /**
   * Compare two versions to see what changed
   */
  async compareVersions(
    templateId: string,
    tenantId: string,
    version1: number,
    version2: number
  ): Promise<{
    fieldsAdded: TemplateField[];
    fieldsRemoved: TemplateField[];
    fieldsModified: Array<{ field: TemplateField; changes: string[] }>;
    signerRolesChanged: boolean;
    nameChanged: boolean;
    descriptionChanged: boolean;
  }> {
    const [v1, v2] = await Promise.all([
      this.getVersion(templateId, tenantId, version1),
      this.getVersion(templateId, tenantId, version2),
    ]);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const v1FieldIds = new Set(v1.fields.map(f => f.id));
    const v2FieldIds = new Set(v2.fields.map(f => f.id));

    const fieldsAdded = v2.fields.filter(f => !v1FieldIds.has(f.id));
    const fieldsRemoved = v1.fields.filter(f => !v2FieldIds.has(f.id));
    const fieldsModified: Array<{ field: TemplateField; changes: string[] }> = [];

    // Check for modified fields
    for (const f2 of v2.fields) {
      if (v1FieldIds.has(f2.id)) {
        const f1 = v1.fields.find(f => f.id === f2.id)!;
        const changes: string[] = [];

        if (f1.type !== f2.type) changes.push('type');
        if (f1.label !== f2.label) changes.push('label');
        if (f1.required !== f2.required) changes.push('required');
        if (f1.x !== f2.x || f1.y !== f2.y) changes.push('position');
        if (f1.width !== f2.width || f1.height !== f2.height) changes.push('size');
        if (f1.signerRole !== f2.signerRole) changes.push('signerRole');

        if (changes.length > 0) {
          fieldsModified.push({ field: f2, changes });
        }
      }
    }

    return {
      fieldsAdded,
      fieldsRemoved,
      fieldsModified,
      signerRolesChanged: JSON.stringify(v1.signerRoles) !== JSON.stringify(v2.signerRoles),
      nameChanged: v1.name !== v2.name,
      descriptionChanged: v1.description !== v2.description,
    };
  },

  /**
   * Get version statistics for a template
   */
  async getVersionStats(templateId: string, tenantId: string): Promise<{
    totalVersions: number;
    latestVersion: number;
    firstCreated: string;
    lastUpdated: string;
  }> {
    const result = await sql`
      SELECT
        COUNT(*) as total_versions,
        MAX(version) as latest_version,
        MIN(created_at) as first_created,
        MAX(created_at) as last_updated
      FROM template_versions
      WHERE template_id = ${templateId} AND tenant_id = ${tenantId}
    `;

    return {
      totalVersions: parseInt(result[0].total_versions) || 0,
      latestVersion: parseInt(result[0].latest_version) || 0,
      firstCreated: result[0].first_created?.toISOString() || '',
      lastUpdated: result[0].last_updated?.toISOString() || '',
    };
  },
};

// ============== HELPER FUNCTIONS ==============

function mapVersionFromDb(row: Record<string, unknown>): TemplateVersion {
  return {
    id: row.id as string,
    templateId: row.template_id as string,
    tenantId: row.tenant_id as string,
    version: parseInt(row.version as string) || 1,
    name: row.name as string,
    description: row.description as string | undefined,
    category: row.category as string | undefined,
    fields: parseJsonField(row.fields) as TemplateField[],
    signerRoles: parseJsonField(row.signer_roles) as SignerRole[],
    documentData: row.document_data as string | undefined,
    createdBy: row.created_by as string | undefined,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function parseJsonField(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value || [];
}

// ============== ENVELOPE TEMPLATE SNAPSHOT ==============

/**
 * Store frozen template data with envelope
 * This ensures the envelope always has the exact template state at send time
 */
export async function storeEnvelopeTemplateSnapshot(
  envelopeId: string,
  tenantId: string,
  frozenData: FrozenTemplateData
): Promise<void> {
  // Store in envelope_template_snapshots table
  await sql`
    INSERT INTO envelope_template_snapshots (
      envelope_id, tenant_id, template_id, version_id, version,
      name, description, category, fields, signer_roles, document_data, frozen_at
    ) VALUES (
      ${envelopeId},
      ${tenantId},
      ${frozenData.templateId},
      ${frozenData.versionId},
      ${frozenData.version},
      ${frozenData.name},
      ${frozenData.description || null},
      ${frozenData.category || null},
      ${JSON.stringify(frozenData.fields)},
      ${JSON.stringify(frozenData.signerRoles)},
      ${frozenData.documentData || null},
      ${frozenData.frozenAt}
    )
    ON CONFLICT (envelope_id) DO UPDATE SET
      template_id = EXCLUDED.template_id,
      version_id = EXCLUDED.version_id,
      version = EXCLUDED.version,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      fields = EXCLUDED.fields,
      signer_roles = EXCLUDED.signer_roles,
      document_data = EXCLUDED.document_data,
      frozen_at = EXCLUDED.frozen_at
  `.catch(async () => {
    // Table might not exist yet, create it
    await sql`
      CREATE TABLE IF NOT EXISTS envelope_template_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        envelope_id VARCHAR(255) UNIQUE NOT NULL,
        tenant_id VARCHAR(255) NOT NULL,
        template_id UUID,
        version_id UUID,
        version INTEGER,
        name VARCHAR(255),
        description TEXT,
        category VARCHAR(100),
        fields JSONB DEFAULT '[]',
        signer_roles JSONB DEFAULT '[]',
        document_data TEXT,
        frozen_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Retry the insert
    await sql`
      INSERT INTO envelope_template_snapshots (
        envelope_id, tenant_id, template_id, version_id, version,
        name, description, category, fields, signer_roles, document_data, frozen_at
      ) VALUES (
        ${envelopeId},
        ${tenantId},
        ${frozenData.templateId},
        ${frozenData.versionId},
        ${frozenData.version},
        ${frozenData.name},
        ${frozenData.description || null},
        ${frozenData.category || null},
        ${JSON.stringify(frozenData.fields)},
        ${JSON.stringify(frozenData.signerRoles)},
        ${frozenData.documentData || null},
        ${frozenData.frozenAt}
      )
    `;
  });
}

/**
 * Retrieve frozen template data for an envelope
 */
export async function getEnvelopeTemplateSnapshot(
  envelopeId: string,
  tenantId: string
): Promise<FrozenTemplateData | null> {
  try {
    const result = await sql`
      SELECT * FROM envelope_template_snapshots
      WHERE envelope_id = ${envelopeId} AND tenant_id = ${tenantId}
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      templateId: row.template_id as string,
      versionId: row.version_id as string,
      version: parseInt(row.version as string) || 1,
      name: row.name as string,
      description: row.description as string | undefined,
      category: row.category as string | undefined,
      fields: parseJsonField(row.fields) as TemplateField[],
      signerRoles: parseJsonField(row.signer_roles) as SignerRole[],
      documentData: row.document_data as string | undefined,
      frozenAt: row.frozen_at?.toISOString() || '',
    };
  } catch {
    return null;
  }
}
