/**
 * PearSign Field Mapping Service
 *
 * Provides stable field identifiers for CRM and API integrations.
 * Enables programmatic field population without relying on visual placement.
 *
 * Compatible with DocuSign-style API flows:
 * - Templates have pre-mapped, stable field IDs
 * - API consumers can fetch template schemas
 * - Fields can be populated at send-time via JSON payload
 */

import { sql } from './db';
import type { TemplateFieldMapping, SignerRole } from './templates';

// ============== TYPES ==============

export type FieldType =
  | 'signature'
  | 'initials'
  | 'text'
  | 'email'
  | 'date'
  | 'number'
  | 'checkbox'
  | 'company'
  | 'address'
  | 'phone'
  | 'upload'
  | 'name'
  | 'title';

/**
 * API Field Schema - exposed to external consumers
 * This is the stable contract for CRM integrations
 */
export interface ApiFieldSchema {
  fieldId: string;        // System-generated, immutable
  fieldName: string;      // Human-readable, editable by user
  type: FieldType;
  required: boolean;
  roleId: string;         // Signer role this field belongs to
  roleName: string;       // Human-readable role name

  // Optional metadata
  placeholder?: string;
  defaultValue?: string;
  validation?: {
    type: 'none' | 'email' | 'number' | 'phone' | 'date' | 'regex';
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    message?: string;
  };

  // Position info (for reference only - not used for API mapping)
  position?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Template Schema - full schema for API consumers
 */
export interface TemplateApiSchema {
  templateId: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active';
  signerRoles: Array<{
    roleId: string;
    name: string;
    order: number;
  }>;
  fields: ApiFieldSchema[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: number;
    fieldCount: number;
  };
}

/**
 * Document Schema - for non-template documents after field mapping
 */
export interface DocumentApiSchema {
  documentId: string;
  envelopeId: string;
  title: string;
  fields: ApiFieldSchema[];
  metadata: {
    createdAt: string;
    mappedAt: string;
    fieldCount: number;
  };
}

/**
 * Field Values payload for envelope sending
 */
export interface FieldValuesPayload {
  [fieldId: string]: string | boolean | number;
}

/**
 * Field validation error
 */
export interface FieldValidationError {
  code: 'FIELD_NOT_FOUND' | 'FIELD_TYPE_MISMATCH' | 'REQUIRED_FIELD_MISSING' | 'VALIDATION_FAILED' | 'INVALID_VALUE';
  fieldId: string;
  fieldName?: string;
  message: string;
  expectedType?: FieldType;
  receivedType?: string;
}

/**
 * Field validation result
 */
export interface FieldValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
  validatedFields: Array<{
    fieldId: string;
    fieldName: string;
    value: string | boolean | number;
    type: FieldType;
  }>;
}

// ============== FIELD ID GENERATION ==============

/**
 * Generate a stable, unique field ID
 * Format: fld_{timestamp}_{random}
 * These IDs persist across template reuse and document sends
 */
export function generateFieldId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 8);
  return `fld_${timestamp}_${random}`;
}

/**
 * Validate that a field ID follows the expected format
 */
export function isValidFieldId(fieldId: string): boolean {
  // Accept both legacy formats and new fld_ format
  return (
    fieldId.startsWith('fld_') ||
    fieldId.startsWith('f') ||
    fieldId.startsWith('field-') ||
    /^[a-zA-Z0-9_-]+$/.test(fieldId)
  );
}

// ============== FIELD MAPPING SERVICE ==============

export const FieldMappingService = {
  /**
   * Convert internal template fields to API schema format
   */
  toApiSchema(
    fields: TemplateFieldMapping[],
    signerRoles: SignerRole[]
  ): ApiFieldSchema[] {
    return fields.map(field => {
      const role = signerRoles.find(r => r.id === field.signerRoleId);

      return {
        fieldId: field.id,
        fieldName: field.name,
        type: field.type as FieldType,
        required: field.required,
        roleId: field.signerRoleId,
        roleName: role?.name || 'Unknown',
        placeholder: field.placeholder,
        defaultValue: field.defaultValue,
        validation: field.validation ? {
          type: 'regex' as const,
          pattern: field.validation.pattern,
          minLength: field.validation.minLength,
          maxLength: field.validation.maxLength,
        } : undefined,
        position: {
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
        },
      };
    });
  },

  /**
   * Validate field values against template schema
   */
  validateFieldValues(
    fieldValues: FieldValuesPayload,
    schemaFields: ApiFieldSchema[],
    options: { checkRequired?: boolean } = {}
  ): FieldValidationResult {
    const errors: FieldValidationError[] = [];
    const validatedFields: FieldValidationResult['validatedFields'] = [];
    const checkRequired = options.checkRequired !== false;

    // Create a map of field IDs to schema
    const fieldMap = new Map<string, ApiFieldSchema>();
    schemaFields.forEach(f => fieldMap.set(f.fieldId, f));

    // Also create a map by fieldName for convenience (some APIs may use names)
    const fieldNameMap = new Map<string, ApiFieldSchema>();
    schemaFields.forEach(f => fieldNameMap.set(f.fieldName.toLowerCase(), f));

    // Validate provided field values
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      // Try to find field by ID first, then by name
      let schemaField = fieldMap.get(fieldId);
      if (!schemaField) {
        schemaField = fieldNameMap.get(fieldId.toLowerCase());
      }

      if (!schemaField) {
        errors.push({
          code: 'FIELD_NOT_FOUND',
          fieldId,
          message: `Field "${fieldId}" does not exist in template schema`,
        });
        continue;
      }

      // Type validation
      const typeError = this.validateFieldType(schemaField, value);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // Custom validation (regex, etc.)
      if (schemaField.validation && schemaField.validation.type !== 'none') {
        const validationError = this.runFieldValidation(schemaField, value);
        if (validationError) {
          errors.push(validationError);
          continue;
        }
      }

      validatedFields.push({
        fieldId: schemaField.fieldId,
        fieldName: schemaField.fieldName,
        value,
        type: schemaField.type,
      });
    }

    // Check required fields
    if (checkRequired) {
      for (const field of schemaFields) {
        if (field.required && !fieldValues[field.fieldId] && !fieldValues[field.fieldName]) {
          errors.push({
            code: 'REQUIRED_FIELD_MISSING',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Required field "${field.fieldName}" (${field.fieldId}) is missing`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      validatedFields,
    };
  },

  /**
   * Validate field value type
   */
  validateFieldType(field: ApiFieldSchema, value: unknown): FieldValidationError | null {
    const valueType = typeof value;

    switch (field.type) {
      case 'checkbox':
        if (valueType !== 'boolean' && value !== 'true' && value !== 'false') {
          return {
            code: 'FIELD_TYPE_MISMATCH',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" expects boolean, got ${valueType}`,
            expectedType: 'checkbox',
            receivedType: valueType,
          };
        }
        break;

      case 'number':
        if (valueType !== 'number' && isNaN(Number(value))) {
          return {
            code: 'FIELD_TYPE_MISMATCH',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" expects number, got ${valueType}`,
            expectedType: 'number',
            receivedType: valueType,
          };
        }
        break;

      case 'signature':
      case 'initials':
        // Accept 'SIGN' command or base64 data
        if (valueType !== 'string') {
          return {
            code: 'FIELD_TYPE_MISMATCH',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" expects string (SIGN or base64), got ${valueType}`,
            expectedType: field.type,
            receivedType: valueType,
          };
        }
        break;

      case 'email':
        if (valueType !== 'string') {
          return {
            code: 'FIELD_TYPE_MISMATCH',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" expects email string, got ${valueType}`,
            expectedType: 'email',
            receivedType: valueType,
          };
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value as string)) {
          return {
            code: 'VALIDATION_FAILED',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" contains invalid email format`,
          };
        }
        break;

      case 'date':
        if (valueType !== 'string') {
          return {
            code: 'FIELD_TYPE_MISMATCH',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" expects date string, got ${valueType}`,
            expectedType: 'date',
            receivedType: valueType,
          };
        }
        // Validate date can be parsed
        if (isNaN(Date.parse(value as string))) {
          return {
            code: 'VALIDATION_FAILED',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" contains invalid date format`,
          };
        }
        break;

      case 'phone':
        if (valueType !== 'string') {
          return {
            code: 'FIELD_TYPE_MISMATCH',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" expects phone string, got ${valueType}`,
            expectedType: 'phone',
            receivedType: valueType,
          };
        }
        // Basic phone validation (digits, spaces, dashes, parentheses, plus)
        const phoneRegex = /^[\d\s\-\(\)\+]+$/;
        if (!phoneRegex.test(value as string)) {
          return {
            code: 'VALIDATION_FAILED',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" contains invalid phone format`,
          };
        }
        break;

      // Text-based fields (text, company, address, title, name)
      default:
        if (valueType !== 'string') {
          return {
            code: 'FIELD_TYPE_MISMATCH',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: `Field "${field.fieldName}" expects string, got ${valueType}`,
            expectedType: field.type,
            receivedType: valueType,
          };
        }
        break;
    }

    return null;
  },

  /**
   * Run custom validation rules
   */
  runFieldValidation(field: ApiFieldSchema, value: unknown): FieldValidationError | null {
    if (!field.validation) return null;

    const strValue = String(value);

    // Regex validation
    if (field.validation.type === 'regex' && field.validation.pattern) {
      try {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(strValue)) {
          return {
            code: 'VALIDATION_FAILED',
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            message: field.validation.message || `Field "${field.fieldName}" failed validation`,
          };
        }
      } catch (e) {
        // Invalid regex pattern - skip validation
        console.error('Invalid regex pattern:', field.validation.pattern);
      }
    }

    // Min/Max length validation
    if (field.validation.minLength && strValue.length < field.validation.minLength) {
      return {
        code: 'VALIDATION_FAILED',
        fieldId: field.fieldId,
        fieldName: field.fieldName,
        message: `Field "${field.fieldName}" must be at least ${field.validation.minLength} characters`,
      };
    }

    if (field.validation.maxLength && strValue.length > field.validation.maxLength) {
      return {
        code: 'VALIDATION_FAILED',
        fieldId: field.fieldId,
        fieldName: field.fieldName,
        message: `Field "${field.fieldName}" must be at most ${field.validation.maxLength} characters`,
      };
    }

    return null;
  },

  /**
   * Apply field values to signature fields for envelope creation
   */
  applyFieldValues(
    signatureFields: Array<{
      id: string;
      type: string;
      recipientId: string;
      prefillValue?: string;
      [key: string]: unknown;
    }>,
    fieldValues: FieldValuesPayload,
    recipientRoleMapping: Map<string, string> // roleId -> recipientId
  ): typeof signatureFields {
    return signatureFields.map(field => {
      const value = fieldValues[field.id];

      if (value !== undefined) {
        return {
          ...field,
          prefillValue: String(value),
        };
      }

      return field;
    });
  },

  /**
   * Get template fields schema for API response
   */
  async getTemplateFieldsSchema(
    orgId: string,
    templateId: string
  ): Promise<TemplateApiSchema | null> {
    const result = await sql`
      SELECT
        id, name, description, status,
        fields, signer_roles,
        created_at, updated_at
      FROM templates
      WHERE id = ${templateId}::uuid AND org_id = ${orgId}
    `;

    if (result.length === 0) return null;

    const template = result[0];
    const fields = (template.fields as TemplateFieldMapping[]) || [];
    const signerRoles = (template.signer_roles as SignerRole[]) || [];

    // Look up current version from template_versions table
    let currentVersion = 1;
    try {
      const { TemplateVersioningService } = await import('./template-versioning');
      const latestVersion = await TemplateVersioningService.getLatestVersion(templateId, orgId);
      if (latestVersion) {
        currentVersion = latestVersion.version;
      }
    } catch {
      // template_versions table may not exist yet; fall back to version 1
    }

    return {
      templateId: template.id as string,
      name: template.name as string,
      description: template.description as string | null,
      status: (template.status as 'draft' | 'active') || 'draft',
      signerRoles: signerRoles.map(role => ({
        roleId: role.id,
        name: role.name,
        order: role.order,
      })),
      fields: this.toApiSchema(fields, signerRoles),
      metadata: {
        createdAt: (template.created_at as Date).toISOString(),
        updatedAt: (template.updated_at as Date).toISOString(),
        version: currentVersion,
        fieldCount: fields.length,
      },
    };
  },

  /**
   * Get document fields schema for API response
   */
  async getDocumentFieldsSchema(
    orgId: string,
    envelopeId: string
  ): Promise<DocumentApiSchema | null> {
    const result = await sql`
      SELECT
        id, envelope_id, title,
        signature_fields,
        created_at
      FROM envelope_documents
      WHERE envelope_id = ${envelopeId} AND org_id = ${orgId}
    `;

    if (result.length === 0) return null;

    const doc = result[0];
    const signatureFields = (doc.signature_fields as Array<{
      id: string;
      type: string;
      recipientId: string;
      required: boolean;
      prefillValue?: string;
      placeholder?: string;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }>) || [];

    // Convert signature fields to API schema format
    const apiFields: ApiFieldSchema[] = signatureFields.map((field, index) => ({
      fieldId: field.id,
      fieldName: `Field ${index + 1}`,
      type: field.type as FieldType,
      required: field.required || false,
      roleId: field.recipientId,
      roleName: `Signer ${field.recipientId}`,
      placeholder: field.placeholder,
      defaultValue: field.prefillValue,
      position: {
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
      },
    }));

    return {
      documentId: doc.id as string,
      envelopeId: doc.envelope_id as string,
      title: doc.title as string,
      fields: apiFields,
      metadata: {
        createdAt: (doc.created_at as Date).toISOString(),
        mappedAt: (doc.created_at as Date).toISOString(),
        fieldCount: apiFields.length,
      },
    };
  },

  /**
   * Update field values on an existing envelope
   */
  async updateEnvelopeFields(
    orgId: string,
    envelopeId: string,
    fieldValues: FieldValuesPayload
  ): Promise<{ success: boolean; updatedFields: number; errors: FieldValidationError[] }> {
    // Get current document
    const docResult = await sql`
      SELECT id, signature_fields FROM envelope_documents
      WHERE envelope_id = ${envelopeId} AND org_id = ${orgId}
    `;

    if (docResult.length === 0) {
      return {
        success: false,
        updatedFields: 0,
        errors: [{
          code: 'FIELD_NOT_FOUND',
          fieldId: envelopeId,
          message: `Document for envelope "${envelopeId}" not found`,
        }],
      };
    }

    const doc = docResult[0];
    const signatureFields = (doc.signature_fields as Array<{
      id: string;
      type: string;
      prefillValue?: string;
      [key: string]: unknown;
    }>) || [];

    // Convert to API schema for validation
    const apiFields: ApiFieldSchema[] = signatureFields.map((field, index) => ({
      fieldId: field.id,
      fieldName: `Field ${index + 1}`,
      type: field.type as FieldType,
      required: false,
      roleId: '',
      roleName: '',
    }));

    // Validate field values (without requiring all fields)
    const validation = this.validateFieldValues(fieldValues, apiFields, { checkRequired: false });

    if (!validation.valid) {
      return {
        success: false,
        updatedFields: 0,
        errors: validation.errors,
      };
    }

    // Apply updates
    const updatedFields = signatureFields.map(field => {
      const value = fieldValues[field.id];
      if (value !== undefined) {
        return { ...field, prefillValue: String(value) };
      }
      return field;
    });

    // Save updated fields
    await sql`
      UPDATE envelope_documents
      SET signature_fields = ${JSON.stringify(updatedFields)}::jsonb
      WHERE envelope_id = ${envelopeId} AND org_id = ${orgId}
    `;

    return {
      success: true,
      updatedFields: validation.validatedFields.length,
      errors: [],
    };
  },
};

export default FieldMappingService;
