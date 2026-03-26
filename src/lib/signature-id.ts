/**
 * PearSign Signature ID Service
 *
 * Generates unique, immutable signature IDs for every signature event.
 * These IDs are:
 * - Displayed visually on signed documents (like DocuSign)
 * - Stored in the database for verification
 * - Publicly verifiable without requiring certificates
 *
 * Format: PS-XXXXXXXX (8 character alphanumeric, uppercase)
 */

import { sql } from "./db";
import crypto from "crypto";

// ============== TYPES ==============

export interface SignatureRecord {
  id: string;                    // Internal UUID
  signatureId: string;           // Public PearSign ID (PS-XXXXXXXX)
  envelopeId: string;
  documentId?: string;
  signerId: string;
  signerName: string;
  signerEmail: string;
  fieldId?: string;              // Which field was signed
  fieldType: "signature" | "initials";
  signedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  documentHash: string;          // SHA-256 hash for tamper detection
  organizationId: string;
  status: "valid" | "voided" | "superseded";
  createdAt: Date;
}

export interface DocumentVerification {
  valid: boolean;
  documentId: string;
  envelopeId: string;
  signatureIds: string[];
  signers: Array<{
    signatureId: string;
    name: string;
    signedAt: string;
    fieldType: string;
  }>;
  status: "completed" | "in_signing" | "voided" | "declined" | "expired";
  documentTitle?: string;
  tampered: boolean;
  createdAt?: string;
  completedAt?: string;
  organizationName?: string;
}

// ============== SIGNATURE ID GENERATION ==============

/**
 * Generate a unique PearSign Signature ID
 * Format: PS-XXXXXXXX (8 uppercase alphanumeric characters)
 */
export function generateSignatureId(): string {
  // Use crypto for secure random generation
  const randomBytes = crypto.randomBytes(5);
  // Convert to base36 and take 8 characters, uppercase
  const id = randomBytes.toString("hex").toUpperCase().substring(0, 8);
  return `PS-${id}`;
}

/**
 * Generate a document hash for tamper detection
 */
export function generateDocumentHash(pdfData: string | Uint8Array): string {
  const data = typeof pdfData === "string" ? pdfData : Buffer.from(pdfData);
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Validate a PearSign Signature ID format
 */
export function isValidSignatureId(id: string): boolean {
  return /^PS-[A-Z0-9]{8}$/.test(id);
}

// ============== DATABASE OPERATIONS ==============

/**
 * Ensure the signature_records table exists
 */
export async function ensureSignatureRecordsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS signature_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      signature_id VARCHAR(20) UNIQUE NOT NULL,
      envelope_id VARCHAR(255) NOT NULL,
      document_id VARCHAR(255),
      signer_id VARCHAR(255) NOT NULL,
      signer_name VARCHAR(255) NOT NULL,
      signer_email VARCHAR(255) NOT NULL,
      field_id VARCHAR(255),
      field_type VARCHAR(50) DEFAULT 'signature',
      signed_at TIMESTAMP WITH TIME ZONE NOT NULL,
      ip_address VARCHAR(100),
      user_agent TEXT,
      document_hash VARCHAR(128) NOT NULL,
      organization_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'valid',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Create indexes for fast lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_signature_records_signature_id
    ON signature_records(signature_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_signature_records_envelope_id
    ON signature_records(envelope_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_signature_records_document_hash
    ON signature_records(document_hash)
  `;

  console.log("[SignatureID] signature_records table initialized");
}

/**
 * Create a new signature record
 */
export async function createSignatureRecord(data: {
  envelopeId: string;
  documentId?: string;
  signerId: string;
  signerName: string;
  signerEmail: string;
  fieldId?: string;
  fieldType: "signature" | "initials";
  signedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  documentHash: string;
  organizationId: string;
}): Promise<SignatureRecord> {
  await ensureSignatureRecordsTable();

  const signatureId = generateSignatureId();

  const result = await sql`
    INSERT INTO signature_records (
      signature_id, envelope_id, document_id, signer_id, signer_name,
      signer_email, field_id, field_type, signed_at, ip_address,
      user_agent, document_hash, organization_id, status
    ) VALUES (
      ${signatureId},
      ${data.envelopeId},
      ${data.documentId || null},
      ${data.signerId},
      ${data.signerName},
      ${data.signerEmail},
      ${data.fieldId || null},
      ${data.fieldType},
      ${data.signedAt.toISOString()},
      ${data.ipAddress || null},
      ${data.userAgent || null},
      ${data.documentHash},
      ${data.organizationId},
      'valid'
    )
    RETURNING *
  `;

  return mapSignatureRecordFromDb(result[0]);
}

/**
 * Get signature record by PearSign ID
 */
export async function getSignatureByPearSignId(signatureId: string): Promise<SignatureRecord | null> {
  await ensureSignatureRecordsTable();

  if (!isValidSignatureId(signatureId)) {
    return null;
  }

  const result = await sql`
    SELECT * FROM signature_records
    WHERE signature_id = ${signatureId}
  `;

  if (result.length === 0) return null;
  return mapSignatureRecordFromDb(result[0]);
}

/**
 * Get all signatures for an envelope
 */
export async function getSignaturesForEnvelope(envelopeId: string): Promise<SignatureRecord[]> {
  await ensureSignatureRecordsTable();

  const result = await sql`
    SELECT * FROM signature_records
    WHERE envelope_id = ${envelopeId}
    ORDER BY signed_at ASC
  `;

  return result.map(mapSignatureRecordFromDb);
}

/**
 * Verify a document by its ID or signature ID
 */
export async function verifyDocument(identifier: string): Promise<DocumentVerification | null> {
  await ensureSignatureRecordsTable();

  // Check if it's a signature ID
  if (isValidSignatureId(identifier)) {
    return verifyBySignatureId(identifier);
  }

  // Otherwise treat as document/envelope ID
  return verifyByDocumentId(identifier);
}

async function verifyBySignatureId(signatureId: string): Promise<DocumentVerification | null> {
  const signature = await getSignatureByPearSignId(signatureId);
  if (!signature) return null;

  return verifyByDocumentId(signature.envelopeId);
}

async function verifyByDocumentId(documentId: string): Promise<DocumentVerification | null> {
  // Get all signatures for this document
  const signatures = await sql`
    SELECT * FROM signature_records
    WHERE envelope_id = ${documentId} OR document_id = ${documentId}
    ORDER BY signed_at ASC
  `;

  if (signatures.length === 0) {
    // Check if the envelope exists at all
    const envelope = await sql`
      SELECT id, status, title FROM envelopes WHERE id = ${documentId}
    `;

    // Also check envelope_documents
    if (envelope.length === 0) {
      const docs = await sql`
        SELECT envelope_id FROM envelope_documents WHERE envelope_id = ${documentId}
      `;
      if (docs.length === 0) {
        return null;
      }
    }

    // Envelope exists but no signatures yet
    return {
      valid: true,
      documentId,
      envelopeId: documentId,
      signatureIds: [],
      signers: [],
      status: "in_signing",
      tampered: false,
    };
  }

  // Get envelope details
  const envelope = await sql`
    SELECT id, status, title FROM envelopes WHERE id = ${signatures[0].envelope_id}
  `;

  const documents = await sql`
    SELECT title FROM envelope_documents WHERE envelope_id = ${signatures[0].envelope_id}
  `;

  // Map signers
  const signers = signatures.map((sig) => ({
    signatureId: sig.signature_id,
    name: sig.signer_name,
    signedAt: new Date(sig.signed_at).toISOString(),
    fieldType: sig.field_type || "signature",
  }));

  // Determine overall status
  let status: DocumentVerification["status"] = "completed";
  if (envelope.length > 0) {
    const envStatus = envelope[0].status as string;
    if (envStatus === "voided") status = "voided";
    else if (envStatus === "declined") status = "declined";
    else if (envStatus === "expired") status = "expired";
    else if (envStatus === "in_signing" || envStatus === "pending") status = "in_signing";
  }

  // All signatures are valid (not voided)
  const allValid = signatures.every((s) => s.status === "valid");

  // Find the latest signature date as completion date
  const completedAt = signatures.length > 0
    ? new Date(Math.max(...signatures.map((s) => new Date(s.signed_at).getTime()))).toISOString()
    : undefined;

  return {
    valid: allValid,
    documentId: signatures[0].document_id || signatures[0].envelope_id,
    envelopeId: signatures[0].envelope_id,
    signatureIds: signatures.map((s) => s.signature_id),
    signers,
    status,
    documentTitle: documents[0]?.title || envelope[0]?.title || "Document",
    tampered: false, // Hash verification would go here
    createdAt: signatures.length > 0 ? new Date(signatures[0].created_at).toISOString() : undefined,
    completedAt,
  };
}

/**
 * Void all signatures for an envelope
 */
export async function voidSignaturesForEnvelope(envelopeId: string): Promise<void> {
  await sql`
    UPDATE signature_records
    SET status = 'voided'
    WHERE envelope_id = ${envelopeId}
  `;
}

// ============== HELPER FUNCTIONS ==============

function mapSignatureRecordFromDb(row: Record<string, unknown>): SignatureRecord {
  return {
    id: row.id as string,
    signatureId: row.signature_id as string,
    envelopeId: row.envelope_id as string,
    documentId: row.document_id as string | undefined,
    signerId: row.signer_id as string,
    signerName: row.signer_name as string,
    signerEmail: row.signer_email as string,
    fieldId: row.field_id as string | undefined,
    fieldType: (row.field_type as "signature" | "initials") || "signature",
    signedAt: new Date(row.signed_at as string),
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    documentHash: row.document_hash as string,
    organizationId: row.organization_id as string,
    status: (row.status as SignatureRecord["status"]) || "valid",
    createdAt: new Date(row.created_at as string),
  };
}

// ============== BATCH OPERATIONS ==============

/**
 * Create multiple signature records for a signing session
 * Returns map of fieldId -> signatureId for embedding in PDF
 */
export async function createSignaturesForSession(data: {
  envelopeId: string;
  documentId?: string;
  signerId: string;
  signerName: string;
  signerEmail: string;
  fields: Array<{
    fieldId: string;
    fieldType: "signature" | "initials";
  }>;
  signedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  documentHash: string;
  organizationId: string;
}): Promise<Map<string, string>> {
  const signatureMap = new Map<string, string>();

  for (const field of data.fields) {
    const record = await createSignatureRecord({
      envelopeId: data.envelopeId,
      documentId: data.documentId,
      signerId: data.signerId,
      signerName: data.signerName,
      signerEmail: data.signerEmail,
      fieldId: field.fieldId,
      fieldType: field.fieldType,
      signedAt: data.signedAt,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      documentHash: data.documentHash,
      organizationId: data.organizationId,
    });

    signatureMap.set(field.fieldId, record.signatureId);
  }

  return signatureMap;
}
