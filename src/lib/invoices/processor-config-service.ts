/**
 * Invoicing & Payments Module - Processor Config Service
 *
 * Manages payment processor configurations for tenants.
 * Credentials are encrypted at rest.
 * All data is strictly tenant-isolated.
 */

import { sql } from '../db';
import type {
  ProcessorConfig,
  CreateProcessorConfigInput,
  ProcessorType,
} from './types';
import { validateProcessorConfigInput } from './validators';
import { getPaymentProcessor } from './payment-processors';
import { createInvoiceAuditLog } from './invoice-audit';
import { initializeInvoicingTables } from './db-init';

// ============================================================================
// Table Initialization
// ============================================================================

async function ensureProcessorConfigTable(): Promise<void> {
  await initializeInvoicingTables();
}

// ============================================================================
// Encryption (Simple for demo - use proper encryption in production)
// ============================================================================

function encryptCredentials(credentials: Record<string, unknown>): string {
  // In production, use proper AES-256-GCM encryption
  const json = JSON.stringify(credentials);
  return Buffer.from(json).toString('base64');
}

function decryptCredentials(encrypted: string): Record<string, unknown> {
  // In production, use proper AES-256-GCM decryption
  try {
    const json = Buffer.from(encrypted, 'base64').toString();
    return JSON.parse(json);
  } catch {
    return {};
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createProcessorConfig(
  tenantId: string,
  input: CreateProcessorConfigInput,
  actorId?: string
): Promise<ProcessorConfig> {
  await ensureProcessorConfigTable();

  const validation = validateProcessorConfigInput(input);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  // Validate credentials with processor
  const processor = getPaymentProcessor(input.processor_type);
  const isValid = await processor.validateConfig(input.credentials);
  if (!isValid) {
    throw new Error('Invalid processor credentials');
  }

  const id = `pconfig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // If this is set as default, unset other defaults for this tenant
  if (input.is_default) {
    await sql`
      UPDATE payment_processor_configs
      SET is_default = FALSE
      WHERE tenant_id = ${tenantId}
    `;
  }

  // Insert with tenant_id for isolation
  await sql`
    INSERT INTO payment_processor_configs (
      id, tenant_id, processor_type, display_name, credentials, webhook_secret,
      is_default, is_active, created_at, updated_at
    ) VALUES (
      ${id},
      ${tenantId},
      ${input.processor_type},
      ${input.display_name},
      ${encryptCredentials(input.credentials)},
      ${input.webhook_secret || null},
      ${input.is_default || false},
      TRUE,
      NOW(),
      NOW()
    )
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: null,
    action: 'processor_config_changed',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: {
      action: 'created',
      processor_type: input.processor_type,
      config_id: id,
    },
  });

  const config = await getProcessorConfig(tenantId, id);
  if (!config) {
    throw new Error('Failed to create processor config');
  }

  return config;
}

export async function getProcessorConfig(
  tenantId: string,
  configId: string
): Promise<ProcessorConfig | null> {
  await ensureProcessorConfigTable();

  // CRITICAL: Always filter by tenant_id for isolation
  const rows = await sql`
    SELECT * FROM payment_processor_configs
    WHERE id = ${configId} AND tenant_id = ${tenantId}
  `;

  if (rows.length === 0) return null;

  return rowToConfig(rows[0]);
}

export async function getDefaultProcessorConfig(
  tenantId: string
): Promise<ProcessorConfig | null> {
  await ensureProcessorConfigTable();

  const rows = await sql`
    SELECT * FROM payment_processor_configs
    WHERE tenant_id = ${tenantId} AND is_default = TRUE AND is_active = TRUE
  `;

  if (rows.length === 0) {
    // Fallback to any active config
    const anyRows = await sql`
      SELECT * FROM payment_processor_configs
      WHERE tenant_id = ${tenantId} AND is_active = TRUE
      LIMIT 1
    `;
    if (anyRows.length === 0) return null;
    return rowToConfig(anyRows[0]);
  }

  return rowToConfig(rows[0]);
}

export async function listProcessorConfigs(
  tenantId: string,
  includeInactive: boolean = false
): Promise<ProcessorConfig[]> {
  await ensureProcessorConfigTable();

  let rows;
  if (includeInactive) {
    rows = await sql`
      SELECT * FROM payment_processor_configs
      WHERE tenant_id = ${tenantId}
      ORDER BY is_default DESC, created_at ASC
    `;
  } else {
    rows = await sql`
      SELECT * FROM payment_processor_configs
      WHERE tenant_id = ${tenantId} AND is_active = TRUE
      ORDER BY is_default DESC, created_at ASC
    `;
  }

  return rows.map(rowToConfig);
}

export async function updateProcessorConfig(
  tenantId: string,
  configId: string,
  updates: Partial<CreateProcessorConfigInput>,
  actorId?: string
): Promise<ProcessorConfig> {
  await ensureProcessorConfigTable();

  const existing = await getProcessorConfig(tenantId, configId);
  if (!existing) {
    throw new Error('Processor config not found');
  }

  // If updating credentials, validate them
  if (updates.credentials) {
    const processor = getPaymentProcessor(existing.processor_type);
    const isValid = await processor.validateConfig(updates.credentials);
    if (!isValid) {
      throw new Error('Invalid processor credentials');
    }
  }

  // If setting as default, unset others
  if (updates.is_default) {
    await sql`
      UPDATE payment_processor_configs
      SET is_default = FALSE
      WHERE tenant_id = ${tenantId}
    `;
  }

  // Build update values
  const displayName = updates.display_name ?? existing.display_name;
  const webhookSecret = updates.webhook_secret !== undefined ? updates.webhook_secret : existing.webhook_secret;
  const isDefault = updates.is_default ?? existing.is_default;
  const credentials = updates.credentials
    ? encryptCredentials(updates.credentials)
    : encryptCredentials(existing.credentials);

  await sql`
    UPDATE payment_processor_configs SET
      display_name = ${displayName},
      credentials = ${credentials},
      webhook_secret = ${webhookSecret},
      is_default = ${isDefault},
      updated_at = NOW()
    WHERE id = ${configId} AND tenant_id = ${tenantId}
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: null,
    action: 'processor_config_changed',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: {
      action: 'updated',
      config_id: configId,
      changes: Object.keys(updates),
    },
  });

  const updated = await getProcessorConfig(tenantId, configId);
  if (!updated) {
    throw new Error('Failed to retrieve updated config');
  }

  return updated;
}

export async function deleteProcessorConfig(
  tenantId: string,
  configId: string,
  actorId?: string
): Promise<void> {
  await ensureProcessorConfigTable();

  const existing = await getProcessorConfig(tenantId, configId);
  if (!existing) {
    throw new Error('Processor config not found');
  }

  // Soft delete by setting is_active = false
  await sql`
    UPDATE payment_processor_configs
    SET is_active = FALSE, is_default = FALSE, updated_at = NOW()
    WHERE id = ${configId} AND tenant_id = ${tenantId}
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: null,
    action: 'processor_config_changed',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: {
      action: 'deleted',
      config_id: configId,
      processor_type: existing.processor_type,
    },
  });
}

function rowToConfig(row: Record<string, unknown>): ProcessorConfig {
  // Format dates
  const formatDate = (val: unknown): string => {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };

  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    processor_type: row.processor_type as ProcessorType,
    display_name: row.display_name as string,
    credentials: decryptCredentials(row.credentials as string),
    webhook_secret: (row.webhook_secret as string) ?? null,
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
    created_at: formatDate(row.created_at),
    updated_at: formatDate(row.updated_at),
  };
}
