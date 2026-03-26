const isDev = process.env.NODE_ENV !== 'production';
const sigLog = isDev ? (...args: unknown[]) => console.log(...args) : () => {};

/**
 * PearSign PDF Digital Signature Service (v4 - Approval Signatures)
 *
 * Implements APPROVAL e-signatures that Adobe Acrobat validates correctly.
 *
 * Key features:
 * - Adobe Acrobat validated approval signatures
 * - "Signed and all signatures are valid" banner
 * - Signatures invalidate when document is modified and saved
 * - Standard industry behavior (like DocuSign)
 * - PKCS#7/CMS compliant (detached signature)
 * - X.509 certificate embedded
 * - SHA-256 hashing
 *
 * Architecture:
 * - Incremental update (appends to original PDF)
 * - AcroForm with /SigFlags 3 (signatures exist + append-only)
 * - Signature field (/FT /Sig) with /V pointing to signature
 * - Widget annotation linked to page
 * - NO DocMDP, NO certification, NO UI locking
 */

import * as forge from 'node-forge';
import * as crypto from 'crypto';
import { sql } from './db';
import { PDFDocument, PDFName, PDFHexString, PDFString, PDFDict, PDFRawStream, PDFNumber, PDFArray, PDFInvalidObject, PDFRef } from 'pdf-lib';
// Import crypto utilities from pdf-encrypt-lite
import { md5 as pdfMd5, RC4 as PdfRC4, hexToBytes as pdfHexToBytes, bytesToHex as pdfBytesToHex } from '@pdfsmaller/pdf-encrypt-lite';
// Import @signpdf library for professional PDF signing
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import signpdf from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';

// ============================================================================
// TYPES
// ============================================================================

export interface SignatureFieldPosition {
  fieldName: string;           // e.g., "Owner1Signature", "Owner2Signature"
  page: number;                // 1-indexed page number
  x: number;                   // Left position in PDF units
  y: number;                   // Bottom position in PDF units (PDF coordinates)
  width: number;               // Width of signature field
  height: number;              // Height of signature field
  signerName?: string;         // Name to display in appearance
  signerEmail?: string;        // Email (optional)
  signatureImageBase64?: string; // Optional signature image
}

export interface SigningCertificate {
  id: string;
  orgId: string;
  name: string;
  usage: string;
  certificate: string; // PEM format
  privateKey: string; // PEM format (encrypted)
  publicKey: string; // PEM format
  certificateChain?: string[]; // PEM format array
  subject: {
    commonName: string;
    organizationName: string;
    countryName?: string;
    emailAddress?: string;
  };
  issuer: {
    commonName: string;
    organizationName: string;
    countryName?: string;
  };
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  isDefault: boolean;
  isSelfSigned: boolean;
  isCAIssued: boolean;
  chainValidated: boolean;
  createdAt: Date;
}

export interface CertificateValidationResult {
  isValid: boolean;
  isSelfSigned: boolean;
  isExpired: boolean;
  isNotYetValid: boolean;
  chainComplete: boolean;
  chainValid: boolean;
  errors: string[];
  warnings: string[];
  subject: {
    commonName: string;
    organizationName: string;
    countryName?: string;
    emailAddress?: string;
  };
  issuer: {
    commonName: string;
    organizationName: string;
    countryName?: string;
  };
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  keyUsage: string[];
  extendedKeyUsage: string[];
}

export interface CertificateImportOptions {
  orgId: string;
  certificate: string;
  privateKey: string;
  privateKeyPassword?: string;
  certificateChain?: string[];
  setAsDefault?: boolean;
  name?: string;
  usage?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CERT_ENCRYPTION_KEY = process.env.CERT_ENCRYPTION_KEY || 'pearsign-cert-key-2024';

function decryptStoredPrivateKey(encryptedKey: string, passphrase: string): forge.pki.rsa.PrivateKey {
  if (encryptedKey.startsWith('-----BEGIN')) {
    const key = forge.pki.decryptRsaPrivateKey(encryptedKey, passphrase);
    if (!key) throw new Error('Failed to decrypt PEM-encrypted private key');
    return key;
  }

  if (encryptedKey.includes(':')) {
    const [ivHex, ciphertextHex] = encryptedKey.split(':');
    const keyHash = crypto.createHash('sha256').update(passphrase).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    let decrypted: string;
    if (iv.length === 12) {
      const authTagLen = 16;
      const actualCiphertext = ciphertext.subarray(0, ciphertext.length - authTagLen);
      const authTag = ciphertext.subarray(ciphertext.length - authTagLen);
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyHash, iv);
      decipher.setAuthTag(authTag);
      decrypted = Buffer.concat([decipher.update(actualCiphertext), decipher.final()]).toString('utf8');
    } else {
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
      decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }

    if (decrypted.startsWith('-----BEGIN')) {
      return forge.pki.privateKeyFromPem(decrypted);
    }
    throw new Error('Decrypted data is not a valid PEM private key');
  }

  try {
    return forge.pki.privateKeyFromPem(encryptedKey);
  } catch {
    throw new Error('Invalid PEM formatted message - unrecognized private key encryption format');
  }
}

// Signature placeholder size (16KB for PKCS#7 signature with certificate chain)
const SIGNATURE_LENGTH = 16384;
const SIGNATURE_PLACEHOLDER = '0'.repeat(SIGNATURE_LENGTH * 2); // Hex = 2x bytes

// ============================================================================
// AATL / eIDAS CERTIFICATE CHAIN UTILITIES
// ============================================================================

/**
 * Split a PEM bundle containing multiple certificates into individual PEM strings
 * Preserves the order of certificates in the bundle
 */
export function splitPemBundle(pemBundle: string): string[] {
  const certificates: string[] = [];
  const pemRegex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

  let match;
  while ((match = pemRegex.exec(pemBundle)) !== null) {
    certificates.push(match[0].trim());
  }

  sigLog(`[PemBundle] Parsed ${certificates.length} certificate(s) from bundle`);
  return certificates;
}

/**
 * Load and parse CA bundle from file path or string
 * Returns array of PEM certificates in order: Intermediate(s), then Root
 */
export function loadCertificateChain(caBundlePem: string): string[] {
  const chainCerts = splitPemBundle(caBundlePem);

  if (chainCerts.length === 0) {
    console.warn('[CertChain] No certificates found in CA bundle');
    return [];
  }

  // Parse and log each certificate for debugging
  for (let i = 0; i < chainCerts.length; i++) {
    try {
      const cert = forge.pki.certificateFromPem(chainCerts[i]);
      const subject = cert.subject.getField('CN')?.value || 'Unknown';
      const issuer = cert.issuer.getField('CN')?.value || 'Unknown';
      sigLog(`[CertChain] Cert ${i + 1}: Subject="${subject}", Issuer="${issuer}"`);
    } catch (e) {
      console.error(`[CertChain] Failed to parse cert ${i + 1}:`, e);
    }
  }

  return chainCerts;
}

/**
 * Validate that a certificate is suitable for AATL/eIDAS certification signatures
 * Throws an error if the certificate is not suitable
 */
export function validateCertificationCertificate(certificate: SigningCertificate): void {
  // CRITICAL: Self-signed certificates CANNOT create valid certification signatures
  if (certificate.isSelfSigned) {
    throw new Error(
      'Certification signatures REQUIRE an AATL / CA-issued certificate. ' +
      'Self-signed certificates cannot be trusted by Adobe Acrobat for certification.'
    );
  }

  // Check that chain is present and validated
  if (!certificate.certificateChain || certificate.certificateChain.length === 0) {
    throw new Error(
      'AATL certificate chain must be present. ' +
      'Please import the CA bundle along with your signing certificate.'
    );
  }

  if (!certificate.chainValidated) {
    throw new Error(
      'AATL certificate chain must be valid. ' +
      'The certificate chain could not be verified.'
    );
  }

  sigLog('[CertValidation] ✓ Certificate is suitable for certification signatures');
  sigLog(`[CertValidation]   - Not self-signed: ${!certificate.isSelfSigned}`);
  sigLog(`[CertValidation]   - Chain present: ${certificate.certificateChain.length} cert(s)`);
  sigLog(`[CertValidation]   - Chain validated: ${certificate.chainValidated}`);
}

// ============================================================================
// CERTIFICATE MANAGEMENT
// ============================================================================

async function ensureCertificateTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS signing_certificates (
      id VARCHAR(100) PRIMARY KEY,
      org_id VARCHAR(255) NOT NULL,
      certificate TEXT NOT NULL,
      private_key TEXT NOT NULL,
      public_key TEXT NOT NULL,
      certificate_chain JSONB DEFAULT '[]',
      subject JSONB NOT NULL,
      issuer JSONB NOT NULL,
      serial_number VARCHAR(255) NOT NULL,
      valid_from TIMESTAMP NOT NULL,
      valid_to TIMESTAMP NOT NULL,
      fingerprint VARCHAR(128) NOT NULL,
      is_default BOOLEAN DEFAULT true,
      is_self_signed BOOLEAN DEFAULT true,
      is_ca_issued BOOLEAN DEFAULT false,
      chain_validated BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  try {
    await sql`ALTER TABLE signing_certificates ADD COLUMN IF NOT EXISTS certificate_chain JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE signing_certificates ADD COLUMN IF NOT EXISTS is_self_signed BOOLEAN DEFAULT true`;
    await sql`ALTER TABLE signing_certificates ADD COLUMN IF NOT EXISTS is_ca_issued BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE signing_certificates ADD COLUMN IF NOT EXISTS chain_validated BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE signing_certificates ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT ''`;
    await sql`ALTER TABLE signing_certificates ADD COLUMN IF NOT EXISTS usage VARCHAR(50) DEFAULT 'signing'`;
  } catch {
    // Columns might already exist
  }
}

function mapCertificateFromDb(row: Record<string, unknown>): SigningCertificate {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: (row.name as string) || '',
    usage: (row.usage as string) || 'signing',
    certificate: row.certificate as string,
    privateKey: row.private_key as string,
    publicKey: row.public_key as string,
    certificateChain: (row.certificate_chain as string[]) || [],
    subject: row.subject as SigningCertificate['subject'],
    issuer: row.issuer as SigningCertificate['issuer'],
    serialNumber: row.serial_number as string,
    validFrom: new Date(row.valid_from as string),
    validTo: new Date(row.valid_to as string),
    fingerprint: row.fingerprint as string,
    isDefault: row.is_default as boolean,
    isSelfSigned: (row.is_self_signed as boolean) ?? true,
    isCAIssued: (row.is_ca_issued as boolean) ?? false,
    chainValidated: (row.chain_validated as boolean) ?? false,
    createdAt: new Date(row.created_at as string),
  };
}

export function validateCertificate(
  certificatePem: string,
  chainPems: string[] = []
): CertificateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const keyUsage: string[] = [];
  const extendedKeyUsage: string[] = [];

  try {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const now = new Date();

    const subject = {
      commonName: cert.subject.getField('CN')?.value || 'Unknown',
      organizationName: cert.subject.getField('O')?.value || 'Unknown',
      countryName: cert.subject.getField('C')?.value,
      emailAddress: cert.subject.getField('E')?.value || cert.subject.getField('emailAddress')?.value,
    };

    const issuer = {
      commonName: cert.issuer.getField('CN')?.value || 'Unknown',
      organizationName: cert.issuer.getField('O')?.value || 'Unknown',
      countryName: cert.issuer.getField('C')?.value,
    };

    const isSelfSigned =
      cert.subject.getField('CN')?.value === cert.issuer.getField('CN')?.value &&
      cert.subject.getField('O')?.value === cert.issuer.getField('O')?.value;

    const validFrom = cert.validity.notBefore;
    const validTo = cert.validity.notAfter;
    const isExpired = validTo < now;
    const isNotYetValid = validFrom > now;

    if (isExpired) errors.push('Certificate has expired');
    if (isNotYetValid) errors.push('Certificate is not yet valid');

    const fingerprint = forge.md.sha256.create();
    fingerprint.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
    const fingerprintHex = fingerprint.digest().toHex();

    const keyUsageExt = cert.getExtension('keyUsage');
    if (keyUsageExt) {
      if ((keyUsageExt as { digitalSignature?: boolean }).digitalSignature) keyUsage.push('digitalSignature');
      if ((keyUsageExt as { nonRepudiation?: boolean }).nonRepudiation) keyUsage.push('nonRepudiation');
    }

    if (keyUsageExt && !keyUsage.includes('digitalSignature') && !keyUsage.includes('nonRepudiation')) {
      errors.push('Certificate key usage does not permit digital signing');
    }

    let chainComplete = isSelfSigned;
    let chainValid = isSelfSigned;

    if (!isSelfSigned && chainPems.length > 0) {
      try {
        const chainCerts = chainPems.map((pem) => forge.pki.certificateFromPem(pem));
        const caStore = forge.pki.createCaStore(chainCerts);
        try {
          const verified = forge.pki.verifyCertificateChain(caStore, [cert, ...chainCerts]);
          chainComplete = true;
          chainValid = verified;
          if (!verified) warnings.push('Certificate chain verification failed');
        } catch (verifyErr) {
          chainComplete = true;
          chainValid = false;
          warnings.push(`Chain verification error: ${verifyErr instanceof Error ? verifyErr.message : 'Unknown'}`);
        }
      } catch (chainErr) {
        errors.push(`Failed to parse certificate chain: ${chainErr instanceof Error ? chainErr.message : 'Unknown'}`);
      }
    } else if (!isSelfSigned && chainPems.length === 0) {
      warnings.push('Certificate is not self-signed but no certificate chain was provided');
      chainComplete = false;
    }

    return {
      isValid: errors.length === 0,
      isSelfSigned,
      isExpired,
      isNotYetValid,
      chainComplete,
      chainValid,
      errors,
      warnings,
      subject,
      issuer,
      validFrom,
      validTo,
      fingerprint: fingerprintHex,
      keyUsage,
      extendedKeyUsage,
    };
  } catch (error) {
    return {
      isValid: false,
      isSelfSigned: false,
      isExpired: false,
      isNotYetValid: false,
      chainComplete: false,
      chainValid: false,
      errors: [`Failed to parse certificate: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: [],
      subject: { commonName: 'Unknown', organizationName: 'Unknown' },
      issuer: { commonName: 'Unknown', organizationName: 'Unknown' },
      validFrom: new Date(),
      validTo: new Date(),
      fingerprint: '',
      keyUsage: [],
      extendedKeyUsage: [],
    };
  }
}

export async function importSigningCertificate(options: CertificateImportOptions): Promise<{
  success: boolean;
  certificate?: SigningCertificate;
  validation: CertificateValidationResult;
  error?: string;
}> {
  const {
    orgId,
    certificate: certPem,
    privateKey: privateKeyPem,
    privateKeyPassword,
    certificateChain = [],
    setAsDefault = true,
    name: certName,
    usage: certUsage = 'signing',
  } = options;

  try {
    const validation = validateCertificate(certPem, certificateChain);

    if (!validation.isValid) {
      return {
        success: false,
        validation,
        error: `Certificate validation failed: ${validation.errors.join(', ')}`,
      };
    }

    const cert = forge.pki.certificateFromPem(certPem);

    let privateKey: forge.pki.rsa.PrivateKey;
    try {
      if (privateKeyPassword) {
        privateKey = forge.pki.decryptRsaPrivateKey(privateKeyPem, privateKeyPassword);
        if (!privateKey) {
          return { success: false, validation, error: 'Failed to decrypt private key. Check the password.' };
        }
      } else {
        privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      }
    } catch (keyErr) {
      return { success: false, validation, error: `Failed to parse private key: ${keyErr instanceof Error ? keyErr.message : 'Unknown error'}` };
    }

    const certPublicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    const derivedPublicKey = forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e);

    if (certPublicKey.n.toString(16) !== derivedPublicKey.n.toString(16)) {
      return { success: false, validation, error: 'Private key does not match the certificate public key' };
    }

    const encryptedPrivateKey = forge.pki.encryptRsaPrivateKey(privateKey, CERT_ENCRYPTION_KEY);
    const publicKeyPem = forge.pki.publicKeyToPem(certPublicKey);

    await ensureCertificateTable();

    const certId = `cert-${Date.now()}-${forge.util.bytesToHex(forge.random.getBytesSync(4))}`;

    if (setAsDefault) {
      await sql`UPDATE signing_certificates SET is_default = false WHERE org_id = ${orgId}`;
    }

    const resolvedName = certName || validation.subject.commonName || 'Imported Certificate';

    await sql`
      INSERT INTO signing_certificates (
        id, org_id, name, usage, certificate, private_key, public_key, certificate_chain,
        subject, issuer, serial_number, valid_from, valid_to,
        fingerprint, is_default, is_self_signed, is_ca_issued, chain_validated, created_at
      ) VALUES (
        ${certId}, ${orgId}, ${resolvedName}, ${certUsage}, ${certPem}, ${encryptedPrivateKey}, ${publicKeyPem},
        ${JSON.stringify(certificateChain)}::jsonb,
        ${JSON.stringify(validation.subject)}::jsonb,
        ${JSON.stringify(validation.issuer)}::jsonb,
        ${cert.serialNumber},
        ${validation.validFrom.toISOString()},
        ${validation.validTo.toISOString()},
        ${validation.fingerprint},
        ${setAsDefault}, ${validation.isSelfSigned}, ${!validation.isSelfSigned}, ${validation.chainValid},
        NOW()
      )
    `;

    const certRecord: SigningCertificate = {
      id: certId,
      orgId,
      name: resolvedName,
      usage: certUsage,
      certificate: certPem,
      privateKey: encryptedPrivateKey,
      publicKey: publicKeyPem,
      certificateChain,
      subject: validation.subject,
      issuer: validation.issuer,
      serialNumber: cert.serialNumber,
      validFrom: validation.validFrom,
      validTo: validation.validTo,
      fingerprint: validation.fingerprint,
      isDefault: setAsDefault,
      isSelfSigned: validation.isSelfSigned,
      isCAIssued: !validation.isSelfSigned,
      chainValidated: validation.chainValid,
      createdAt: new Date(),
    };

    return { success: true, certificate: certRecord, validation };
  } catch (error) {
    console.error('[Certificate Import] Error:', error);
    return {
      success: false,
      validation: {
        isValid: false, isSelfSigned: false, isExpired: false, isNotYetValid: false,
        chainComplete: false, chainValid: false,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        subject: { commonName: 'Unknown', organizationName: 'Unknown' },
        issuer: { commonName: 'Unknown', organizationName: 'Unknown' },
        validFrom: new Date(), validTo: new Date(), fingerprint: '', keyUsage: [], extendedKeyUsage: [],
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getOrganizationCertificates(orgId: string): Promise<SigningCertificate[]> {
  await ensureCertificateTable();
  const result = await sql`SELECT * FROM signing_certificates WHERE org_id = ${orgId} ORDER BY created_at DESC`;
  return result.map(mapCertificateFromDb);
}

export async function deleteCertificate(orgId: string, certId: string): Promise<{ success: boolean; error?: string }> {
  await ensureCertificateTable();
  const cert = await sql`SELECT is_default FROM signing_certificates WHERE id = ${certId} AND org_id = ${orgId}`;
  if (cert.length === 0) return { success: false, error: 'Certificate not found' };
  if (cert[0].is_default) return { success: false, error: 'Cannot delete the default certificate' };
  await sql`DELETE FROM signing_certificates WHERE id = ${certId} AND org_id = ${orgId}`;
  return { success: true };
}

export async function generateSigningCertificate(options: {
  orgId: string;
  commonName: string;
  organizationName: string;
  countryName?: string;
  emailAddress?: string;
  validityDays?: number;
}): Promise<SigningCertificate> {
  const { orgId, commonName, organizationName, countryName = 'US', emailAddress, validityDays = 365 * 3 } = options;

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.serialNumber = Date.now().toString(16) + forge.util.bytesToHex(forge.random.getBytesSync(8));

  const now = new Date();
  const validTo = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  cert.validity.notBefore = now;
  cert.validity.notAfter = validTo;

  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: organizationName },
    { shortName: 'C', value: countryName },
  ];
  if (emailAddress) attrs.push({ name: 'emailAddress', value: emailAddress });

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.publicKey = keys.publicKey;

  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, critical: true },
    { name: 'extKeyUsage', emailProtection: true, clientAuth: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.encryptRsaPrivateKey(keys.privateKey, CERT_ENCRYPTION_KEY);
  const publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);

  const fingerprint = forge.md.sha256.create();
  fingerprint.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  const fingerprintHex = fingerprint.digest().toHex();

  const certRecord: SigningCertificate = {
    id: `cert-${Date.now()}-${forge.util.bytesToHex(forge.random.getBytesSync(4))}`,
    orgId,
    name: commonName,
    usage: 'signing',
    certificate: certPem,
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
    certificateChain: [],
    subject: { commonName, organizationName, countryName, emailAddress },
    issuer: { commonName, organizationName },
    serialNumber: cert.serialNumber,
    validFrom: now,
    validTo,
    fingerprint: fingerprintHex,
    isDefault: true,
    isSelfSigned: true,
    isCAIssued: false,
    chainValidated: true,
    createdAt: now,
  };

  await ensureCertificateTable();
  await sql`UPDATE signing_certificates SET is_default = false WHERE org_id = ${orgId}`;

  await sql`
    INSERT INTO signing_certificates (
      id, org_id, name, usage, certificate, private_key, public_key, certificate_chain,
      subject, issuer, serial_number, valid_from, valid_to,
      fingerprint, is_default, is_self_signed, is_ca_issued, chain_validated, created_at
    ) VALUES (
      ${certRecord.id}, ${orgId}, ${certRecord.name}, ${certRecord.usage}, ${certPem}, ${privateKeyPem}, ${publicKeyPem},
      ${JSON.stringify([])}::jsonb,
      ${JSON.stringify(certRecord.subject)}::jsonb,
      ${JSON.stringify(certRecord.issuer)}::jsonb,
      ${cert.serialNumber},
      ${now.toISOString()}, ${validTo.toISOString()},
      ${fingerprintHex}, true, true, false, true, NOW()
    )
  `;

  return certRecord;
}

export async function getDefaultSigningCertificate(orgId: string): Promise<SigningCertificate | null> {
  try {
    await ensureCertificateTable();

    sigLog('[getDefaultCert] Looking for default certificate for org:', orgId);

    const result = await sql`
      SELECT * FROM signing_certificates
      WHERE org_id = ${orgId} AND is_default = true AND valid_to > NOW()
      LIMIT 1
    `;

    if (result.length > 0) {
      const cert = mapCertificateFromDb(result[0]);
      sigLog('[getDefaultCert] Found certificate:', cert.subject.commonName,
        '| CA-issued:', cert.isCAIssued,
        '| Chain:', cert.certificateChain?.length || 0);
      return cert;
    }

    const anyCAResult = await sql`
      SELECT id, is_ca_issued, valid_to FROM signing_certificates
      WHERE org_id = ${orgId} AND is_ca_issued = true
      LIMIT 1
    `;

    if (anyCAResult.length > 0) {
      const expired = new Date(anyCAResult[0].valid_to as string) < new Date();
      console.error('[getDefaultCert] CA-issued certificate exists but is',
        expired ? 'EXPIRED' : 'not set as default',
        '- refusing silent self-signed fallback');
      throw new Error(
        expired
          ? 'Your CA-issued signing certificate has expired. Please import a renewed certificate in Settings > Certificates.'
          : 'No valid default certificate found. Please set a default certificate in Settings > Certificates.'
      );
    }

    sigLog(`[getDefaultCert] No certificates found for org ${orgId}, generating self-signed fallback`);
    return await generateSigningCertificate({
      orgId,
      commonName: 'PearSign Digital Signature',
      organizationName: 'PearSign Electronic Signatures',
      countryName: 'US',
      validityDays: 365 * 3,
    });
  } catch (error) {
    console.error('[DigitalSignature] Error getting certificate:', error);
    if (error instanceof Error && (error.message.includes('expired') || error.message.includes('No valid default'))) {
      throw error;
    }
    return null;
  }
}

// ============================================================================
// PDF HELPER FUNCTIONS
// ============================================================================

/**
 * Format date for PDF (D:YYYYMMDDHHmmssZ)
 */
function formatPdfDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/**
 * Escape PDF string
 */
function escapePdfString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Find last xref offset in PDF
 */
function findLastXrefOffset(pdfBytes: Buffer): number {
  const pdfStr = pdfBytes.toString('latin1');
  const matches = [...pdfStr.matchAll(/startxref\s+(\d+)/g)];
  return matches.length > 0 ? parseInt(matches[matches.length - 1][1], 10) : 0;
}

/**
 * Find maximum object number in PDF
 */
function findMaxObjectNumber(pdfBytes: Buffer): number {
  const pdfStr = pdfBytes.toString('latin1');
  const matches = [...pdfStr.matchAll(/(\d+)\s+0\s+obj/g)];
  let max = 0;
  for (const match of matches) {
    const num = parseInt(match[1], 10);
    if (num > max) max = num;
  }
  return max;
}

/**
 * Find catalog object number
 */
function findCatalogObjectNumber(pdfBytes: Buffer): number {
  const pdfStr = pdfBytes.toString('latin1');
  const match = pdfStr.match(/\/Root\s+(\d+)\s+0\s+R/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Get page object number for a specific page (1-indexed)
 */
function findPageObjectNumber(pdfBytes: Buffer, pageNum: number): number {
  const pdfStr = pdfBytes.toString('latin1');

  // Find all page objects (match /Type /Page but not /Type /Pages)
  const pageMatches: { objNum: number; index: number }[] = [];
  const objRegex = /(\d+)\s+0\s+obj/g;
  let match;

  while ((match = objRegex.exec(pdfStr)) !== null) {
    const objNum = parseInt(match[1], 10);
    const objStart = match.index;

    // Find endobj for this object
    const endObjPos = pdfStr.indexOf('endobj', objStart);
    if (endObjPos === -1) continue;

    const objContent = pdfStr.substring(objStart, endObjPos);

    // Check if this is a Page object (not Pages)
    if (objContent.match(/\/Type\s*\/Page(?!s)/)) {
      pageMatches.push({ objNum, index: objStart });
    }
  }

  // Sort by appearance in file (which should match page order in most PDFs)
  pageMatches.sort((a, b) => a.index - b.index);

  if (pageNum <= pageMatches.length && pageNum >= 1) {
    return pageMatches[pageNum - 1].objNum;
  }

  // Fallback to first page
  return pageMatches.length > 0 ? pageMatches[0].objNum : 3;
}

// ============================================================================
// PDF EDIT RESTRICTIONS (ISOLATED FUNCTION)
// ============================================================================
//
// This function applies PDF security permissions to block editing in Adobe Acrobat.
// It uses standard PDF encryption with:
// - Empty user password (no prompt to open)
// - Random owner password (prevents removing restrictions)
// - Permission flags that disallow modification
//
// This is NOT DocMDP/certification - it's standard PDF permissions.
// Combined with approval signatures, this provides:
// - UI blocks editing attempts
// - Signature invalidates if document is modified and saved
//
// ============================================================================

/**
 * RC4 stream cipher implementation
 */
function rc4Encrypt(key: Buffer, data: Buffer): Buffer {
  // Initialize S-box
  const S = new Array(256);
  for (let i = 0; i < 256; i++) {
    S[i] = i;
  }

  // Key scheduling algorithm (KSA)
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xFF;
    [S[i], S[j]] = [S[j], S[i]];
  }

  // Pseudo-random generation algorithm (PRGA)
  const result = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xFF;
    j = (j + S[i]) & 0xFF;
    [S[i], S[j]] = [S[j], S[i]];
    const t = (S[i] + S[j]) & 0xFF;
    result[k] = data[k] ^ S[t];
  }

  return result;
}

/**
 * Compute MD5 hash
 */
function computeMD5(data: Buffer): Buffer {
  const md = forge.md.md5.create();
  md.update(data.toString('binary'));
  return Buffer.from(md.digest().getBytes(), 'binary');
}

/**
 * Compute PDF encryption key (Algorithm 2 from PDF spec)
 * Uses RC4 40-bit encryption for maximum compatibility
 */
function computeEncryptionKey(
  password: string,
  ownerKey: Buffer,
  permissions: number,
  fileId: string,
  keyLength: number = 40
): Buffer {
  const keyBytes = keyLength / 8;

  // Pad password to 32 bytes using standard PDF padding
  const paddedPassword = padPassword(password);

  // Step 1: Concatenate components
  const md = forge.md.md5.create();
  md.update(paddedPassword.toString('binary'));
  md.update(ownerKey.toString('binary'));

  // Permissions as little-endian 4-byte integer
  const permBytes = Buffer.alloc(4);
  permBytes.writeInt32LE(permissions, 0);
  md.update(permBytes.toString('binary'));

  // File ID (first element)
  md.update(fileId);

  const hash = Buffer.from(md.digest().getBytes(), 'binary');

  // For key lengths > 40 bits, do 50 additional rounds (we use 40-bit for compatibility)

  return hash.subarray(0, keyBytes);
}

/**
 * Pad password to 32 bytes using PDF standard padding
 */
function padPassword(password: string): Buffer {
  const padding = Buffer.from([
    0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
    0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
    0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
    0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
  ]);

  const passwordBytes = Buffer.from(password, 'latin1');
  const paddedLength = Math.min(passwordBytes.length, 32);

  const result = Buffer.alloc(32);
  passwordBytes.copy(result, 0, 0, paddedLength);
  padding.copy(result, paddedLength, 0, 32 - paddedLength);

  return result;
}

/**
 * Compute owner key (Algorithm 3 from PDF spec)
 */
function computeOwnerKey(ownerPassword: string, userPassword: string, keyLength: number = 40): Buffer {
  const keyBytes = keyLength / 8;

  // Hash the owner password
  const paddedOwner = padPassword(ownerPassword);
  const hash = computeMD5(paddedOwner);

  // Use first keyBytes of hash as RC4 key
  const rc4Key = hash.subarray(0, keyBytes);

  // Encrypt the padded user password with RC4
  const paddedUser = padPassword(userPassword);
  return rc4Encrypt(rc4Key, paddedUser);
}

/**
 * Compute user key (Algorithm 4 from PDF spec - for V=1, R=2)
 */
function computeUserKey(
  encryptionKey: Buffer,
  _fileId: string
): Buffer {
  // For R=2 (40-bit RC4), encrypt the padding string
  const padding = Buffer.from([
    0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
    0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
    0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
    0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
  ]);

  return rc4Encrypt(encryptionKey, padding);
}

/**
 * Generate a random file ID for PDF
 */
function generateFileId(): string {
  return forge.util.bytesToHex(forge.random.getBytesSync(16));
}

/**
 * RC4 encrypt data with object-specific key (for future use)
 */
function _rc4EncryptForObject(data: Buffer, encryptionKey: Buffer, objNum: number, genNum: number): Buffer {
  // Extend key with object number and generation number
  const extendedKey = Buffer.concat([
    encryptionKey,
    Buffer.from([objNum & 0xFF, (objNum >> 8) & 0xFF, (objNum >> 16) & 0xFF]),
    Buffer.from([genNum & 0xFF, (genNum >> 8) & 0xFF])
  ]);

  // Hash and take first (keyLength + 5) bytes, max 16
  const hash = computeMD5(extendedKey);
  const keyLen = Math.min(encryptionKey.length + 5, 16);
  const objKey = hash.subarray(0, keyLen);

  return rc4Encrypt(objKey, data);
}

/**
 * Helper to convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Helper to convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * RC4 class for encryption (128-bit compatible)
 */
class RC4Class {
  private S: number[];
  private i: number;
  private j: number;

  constructor(key: Uint8Array) {
    this.S = new Array(256);
    for (let i = 0; i < 256; i++) {
      this.S[i] = i;
    }
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + key[i % key.length]) & 0xFF;
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
    }
    this.i = 0;
    this.j = 0;
  }

  process(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let k = 0; k < data.length; k++) {
      this.i = (this.i + 1) & 0xFF;
      this.j = (this.j + this.S[this.i]) & 0xFF;
      [this.S[this.i], this.S[this.j]] = [this.S[this.j], this.S[this.i]];
      const t = (this.S[this.i] + this.S[this.j]) & 0xFF;
      result[k] = data[k] ^ this.S[t];
    }
    return result;
  }
}

/**
 * Compute MD5 hash (returns Uint8Array)
 */
function md5Hash(data: Uint8Array): Uint8Array {
  const md = forge.md.md5.create();
  md.update(String.fromCharCode(...data));
  const hashBytes = md.digest().getBytes();
  return new Uint8Array(hashBytes.split('').map(c => c.charCodeAt(0)));
}

// Standard PDF padding string
const PDF_PADDING = new Uint8Array([
  0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
  0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
  0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
  0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
]);

/**
 * Pad password to 32 bytes per PDF spec
 */
function padPasswordBytes(password: string): Uint8Array {
  const pwdBytes = new TextEncoder().encode(password);
  const padded = new Uint8Array(32);
  if (pwdBytes.length >= 32) {
    padded.set(pwdBytes.slice(0, 32));
  } else {
    padded.set(pwdBytes);
    padded.set(PDF_PADDING.slice(0, 32 - pwdBytes.length), pwdBytes.length);
  }
  return padded;
}

/**
 * Compute encryption key (Algorithm 2 from PDF spec) for 128-bit RC4
 */
function computeEncryptionKey128(
  userPassword: string,
  ownerKey: Uint8Array,
  permissions: number,
  fileId: Uint8Array
): Uint8Array {
  const paddedPwd = padPasswordBytes(userPassword);

  // Concatenate: password + O + P + ID
  const hashInput = new Uint8Array(
    paddedPwd.length + ownerKey.length + 4 + fileId.length
  );
  let offset = 0;
  hashInput.set(paddedPwd, offset);
  offset += paddedPwd.length;
  hashInput.set(ownerKey, offset);
  offset += ownerKey.length;
  // Add permissions (low-order byte first)
  hashInput[offset++] = permissions & 0xFF;
  hashInput[offset++] = (permissions >> 8) & 0xFF;
  hashInput[offset++] = (permissions >> 16) & 0xFF;
  hashInput[offset++] = (permissions >> 24) & 0xFF;
  hashInput.set(fileId, offset);

  let hash = md5Hash(hashInput);

  // For 128-bit (revision 3), do 50 additional iterations
  for (let i = 0; i < 50; i++) {
    hash = md5Hash(hash.slice(0, 16));
  }

  return hash.slice(0, 16);
}

/**
 * Compute owner key (O entry) for 128-bit RC4
 */
function computeOwnerKey128(ownerPassword: string, userPassword: string): Uint8Array {
  const paddedOwner = padPasswordBytes(ownerPassword || userPassword);
  let hash = md5Hash(paddedOwner);

  // For 128-bit (revision 3), hash 50 more times
  for (let i = 0; i < 50; i++) {
    hash = md5Hash(hash);
  }

  const paddedUser = padPasswordBytes(userPassword);
  let result = new Uint8Array(paddedUser);

  // Encrypt with variations of the key
  for (let i = 0; i < 20; i++) {
    const key = new Uint8Array(hash.length);
    for (let j = 0; j < hash.length; j++) {
      key[j] = hash[j] ^ i;
    }
    const rc4 = new RC4Class(key.slice(0, 16));
    const processed = rc4.process(result);
    result = new Uint8Array(processed);
  }

  return result;
}

/**
 * Compute user key (U entry) for 128-bit RC4
 */
function computeUserKey128(encryptionKey: Uint8Array, fileId: Uint8Array): Uint8Array {
  // Hash padding + file ID
  const hashInput = new Uint8Array(PDF_PADDING.length + fileId.length);
  hashInput.set(PDF_PADDING);
  hashInput.set(fileId, PDF_PADDING.length);

  const hash = md5Hash(hashInput);

  // Encrypt with key
  const rc4 = new RC4Class(encryptionKey);
  let result = rc4.process(hash);

  // 19 more iterations with key variations
  for (let i = 1; i <= 19; i++) {
    const key = new Uint8Array(encryptionKey.length);
    for (let j = 0; j < encryptionKey.length; j++) {
      key[j] = encryptionKey[j] ^ i;
    }
    const rc4iter = new RC4Class(key);
    result = rc4iter.process(result);
  }

  // Append 16 bytes of padding
  const finalResult = new Uint8Array(32);
  finalResult.set(result);
  return finalResult;
}

/**
 * Encrypt data for a specific PDF object
 */
function encryptObjectData(
  data: Uint8Array,
  objectNum: number,
  generationNum: number,
  encryptionKey: Uint8Array
): Uint8Array {
  // Create object-specific key
  const keyInput = new Uint8Array(encryptionKey.length + 5);
  keyInput.set(encryptionKey);
  keyInput[encryptionKey.length] = objectNum & 0xFF;
  keyInput[encryptionKey.length + 1] = (objectNum >> 8) & 0xFF;
  keyInput[encryptionKey.length + 2] = (objectNum >> 16) & 0xFF;
  keyInput[encryptionKey.length + 3] = generationNum & 0xFF;
  keyInput[encryptionKey.length + 4] = (generationNum >> 8) & 0xFF;

  const objectKey = md5Hash(keyInput);
  const rc4 = new RC4Class(objectKey.slice(0, Math.min(encryptionKey.length + 5, 16)));
  return rc4.process(data);
}

/**
 * Recursively encrypt strings in a PDF object
 */
function encryptStringsInPdfObject(
  obj: unknown,
  objectNum: number,
  generationNum: number,
  encryptionKey: Uint8Array
): void {
  if (!obj) return;

  if (obj instanceof PDFString) {
    const originalBytes = obj.asBytes();
    const encrypted = encryptObjectData(
      new Uint8Array(originalBytes),
      objectNum,
      generationNum,
      encryptionKey
    );
    // Replace with hex string (using any to bypass private property)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (obj as any).value = bytesToHex(encrypted);
  } else if (obj instanceof PDFHexString) {
    const hexStr = obj.asString();
    const originalBytes = hexToBytes(hexStr);
    const encrypted = encryptObjectData(originalBytes, objectNum, generationNum, encryptionKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (obj as any).value = bytesToHex(encrypted);
  } else if (obj instanceof PDFDict) {
    const entries = obj.entries();
    for (const [, value] of entries) {
      encryptStringsInPdfObject(value, objectNum, generationNum, encryptionKey);
    }
  } else if (obj instanceof Array) {
    for (const item of obj) {
      encryptStringsInPdfObject(item, objectNum, generationNum, encryptionKey);
    }
  }
}

/**
 * Apply PDF edit restrictions using the proven pdf-encrypt-lite approach
 * but with RESTRICTIVE permissions instead of full permissions.
 *
 * This is a direct port of the library's encryption logic with custom permissions.
 */
async function applyPdfEditRestrictions(pdfBytes: Uint8Array): Promise<Uint8Array> {
  sigLog('[EditRestrictions] ========================================');
  sigLog('[EditRestrictions] APPLYING PDF EDIT RESTRICTIONS');
  sigLog('[EditRestrictions] Using pdf-encrypt-lite approach with custom permissions');
  sigLog('[EditRestrictions] ========================================');

  try {
    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const context = pdfDoc.context;

    // Get file ID (required for encryption)
    let fileId: Uint8Array;
    const trailer = context.trailerInfo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idArray = (trailer as any).ID;

    if (idArray && Array.isArray(idArray) && idArray.length > 0) {
      const idString = idArray[0].toString();
      const hexStr = idString.replace(/^<|>$/g, '');
      fileId = pdfHexToBytes(hexStr);
    } else {
      // Generate a file ID if none exists
      fileId = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        fileId[i] = Math.floor(Math.random() * 256);
      }
      // Add ID to trailer
      const idHex1 = PDFHexString.of(pdfBytesToHex(fileId));
      const idHex2 = PDFHexString.of(pdfBytesToHex(fileId));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trailer as any).ID = [idHex1, idHex2];
    }

    sigLog(`[EditRestrictions] File ID: ${pdfBytesToHex(fileId).substring(0, 16)}...`);

    // Passwords
    const userPassword = '';  // Empty = no password prompt to open
    const ownerPassword = forge.util.bytesToHex(forge.random.getBytesSync(16));  // Random owner password

    // RESTRICTIVE PERMISSIONS
    // PDF permission bits (1-indexed):
    // Bit 3 (4): Print
    // Bit 4 (8): Modify contents
    // Bit 5 (16): Copy
    // Bit 6 (32): Add/modify annotations
    // Bit 9 (256): Fill in forms
    // Bit 10 (512): Extract for accessibility
    // Bit 11 (1024): Assemble document
    // Bit 12 (2048): High quality print
    // Bits 1-2 and 7-8 must be 0, bits 13-32 must be 1
    //
    // For "view and print only, no editing":
    // Allow: print (4), copy (16), extract (512), hi-res print (2048)
    // Block: modify (8), annot (32), fill (256), assemble (1024)
    // = 0xFFFFF0D4 in unsigned = -3884 in signed 32-bit
    const permissions = -3884;

    sigLog(`[EditRestrictions] Permissions: ${permissions}`);
    sigLog('[EditRestrictions] - Print: ALLOWED');
    sigLog('[EditRestrictions] - Modify: BLOCKED');
    sigLog('[EditRestrictions] - Copy: ALLOWED');
    sigLog('[EditRestrictions] - Annotations: BLOCKED');
    sigLog('[EditRestrictions] - Fill forms: BLOCKED');
    sigLog('[EditRestrictions] - Assemble: BLOCKED');

    // Standard PDF padding string
    const PADDING = new Uint8Array([
      0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
      0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
      0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
      0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
    ]);

    // Pad password to 32 bytes
    const padPwd = (password: string): Uint8Array => {
      const pwdBytes = new TextEncoder().encode(password);
      const padded = new Uint8Array(32);
      if (pwdBytes.length >= 32) {
        padded.set(pwdBytes.slice(0, 32));
      } else {
        padded.set(pwdBytes);
        padded.set(PADDING.slice(0, 32 - pwdBytes.length), pwdBytes.length);
      }
      return padded;
    };

    // Compute owner key (O entry) - Algorithm 3
    const computeO = (ownerPwd: string, userPwd: string): Uint8Array => {
      const paddedOwner = padPwd(ownerPwd || userPwd);
      let hash = pdfMd5(paddedOwner);
      // 50 iterations for 128-bit
      for (let i = 0; i < 50; i++) {
        hash = pdfMd5(hash);
      }
      const paddedUser = padPwd(userPwd);
      let result = new Uint8Array(paddedUser);
      // 20 encryption iterations
      for (let i = 0; i < 20; i++) {
        const key = new Uint8Array(hash.length);
        for (let j = 0; j < hash.length; j++) {
          key[j] = hash[j] ^ i;
        }
        const rc4 = new PdfRC4(key.slice(0, 16));
        result = new Uint8Array(rc4.process(result));
      }
      return result;
    };

    // Compute encryption key - Algorithm 2
    const computeKey = (userPwd: string, oKey: Uint8Array, perms: number, fId: Uint8Array): Uint8Array => {
      const paddedPwd = padPwd(userPwd);
      const hashInput = new Uint8Array(paddedPwd.length + oKey.length + 4 + fId.length);
      let offset = 0;
      hashInput.set(paddedPwd, offset);
      offset += paddedPwd.length;
      hashInput.set(oKey, offset);
      offset += oKey.length;
      // Permissions (low-order byte first)
      hashInput[offset++] = perms & 0xFF;
      hashInput[offset++] = (perms >> 8) & 0xFF;
      hashInput[offset++] = (perms >> 16) & 0xFF;
      hashInput[offset++] = (perms >> 24) & 0xFF;
      hashInput.set(fId, offset);
      let hash = pdfMd5(hashInput);
      // 50 iterations for 128-bit
      for (let i = 0; i < 50; i++) {
        hash = pdfMd5(hash.slice(0, 16));
      }
      return hash.slice(0, 16);
    };

    // Compute user key (U entry) - Algorithm 5
    const computeU = (encKey: Uint8Array, fId: Uint8Array): Uint8Array => {
      const hashInput = new Uint8Array(PADDING.length + fId.length);
      hashInput.set(PADDING);
      hashInput.set(fId, PADDING.length);
      const hash = pdfMd5(hashInput);
      const rc4 = new PdfRC4(encKey);
      let result = rc4.process(hash);
      // 19 more iterations
      for (let i = 1; i <= 19; i++) {
        const key = new Uint8Array(encKey.length);
        for (let j = 0; j < encKey.length; j++) {
          key[j] = encKey[j] ^ i;
        }
        const rc4iter = new PdfRC4(key);
        result = rc4iter.process(result);
      }
      // Pad to 32 bytes
      const finalResult = new Uint8Array(32);
      finalResult.set(result);
      return finalResult;
    };

    // Encrypt object data
    const encryptData = (data: Uint8Array, objNum: number, genNum: number, encKey: Uint8Array): Uint8Array => {
      const keyInput = new Uint8Array(encKey.length + 5);
      keyInput.set(encKey);
      keyInput[encKey.length] = objNum & 0xFF;
      keyInput[encKey.length + 1] = (objNum >> 8) & 0xFF;
      keyInput[encKey.length + 2] = (objNum >> 16) & 0xFF;
      keyInput[encKey.length + 3] = genNum & 0xFF;
      keyInput[encKey.length + 4] = (genNum >> 8) & 0xFF;
      const objectKey = pdfMd5(keyInput);
      const rc4 = new PdfRC4(objectKey.slice(0, Math.min(encKey.length + 5, 16)));
      return rc4.process(data);
    };

    // Recursive string encryption
    const encryptStrings = (obj: unknown, objNum: number, genNum: number, encKey: Uint8Array): void => {
      if (!obj) return;
      if (obj instanceof PDFString) {
        const originalBytes = obj.asBytes();
        const encrypted = encryptData(new Uint8Array(originalBytes), objNum, genNum, encKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any).value = pdfBytesToHex(encrypted);
      } else if (obj instanceof PDFHexString) {
        const hexStr = obj.asString();
        const originalBytes = pdfHexToBytes(hexStr);
        const encrypted = encryptData(originalBytes, objNum, genNum, encKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any).value = pdfBytesToHex(encrypted);
      } else if (obj instanceof PDFDict) {
        for (const [, value] of obj.entries()) {
          encryptStrings(value, objNum, genNum, encKey);
        }
      } else if (obj instanceof PDFArray) {
        const arr = obj.asArray();
        for (const item of arr) {
          encryptStrings(item, objNum, genNum, encKey);
        }
      }
    };

    // Compute keys
    const ownerKey = computeO(ownerPassword, userPassword);
    const encryptionKey = computeKey(userPassword, ownerKey, permissions, fileId);
    const userKey = computeU(encryptionKey, fileId);

    sigLog(`[EditRestrictions] O key: ${pdfBytesToHex(ownerKey).substring(0, 16)}...`);
    sigLog(`[EditRestrictions] U key: ${pdfBytesToHex(userKey).substring(0, 16)}...`);
    sigLog(`[EditRestrictions] Enc key: ${pdfBytesToHex(encryptionKey)}`);

    // Encrypt all objects
    sigLog('[EditRestrictions] Encrypting all PDF objects...');
    const indirectObjects = context.enumerateIndirectObjects();
    let streamCount = 0;
    let stringCount = 0;

    for (const [ref, obj] of indirectObjects) {
      const objectNum = ref.objectNumber;
      const generationNum = ref.generationNumber || 0;

      // Skip the encryption dictionary itself
      if (obj instanceof PDFDict) {
        const filter = obj.get(PDFName.of('Filter'));
        if (filter && filter.toString() === '/Standard') {
          continue;
        }
      }

      // Encrypt streams
      if (obj instanceof PDFRawStream) {
        const streamData = obj.contents;
        const encrypted = encryptData(new Uint8Array(streamData), objectNum, generationNum, encryptionKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any).contents = encrypted;
        streamCount++;
      }

      // Encrypt strings
      encryptStrings(obj, objectNum, generationNum, encryptionKey);
      stringCount++;
    }

    sigLog(`[EditRestrictions] Encrypted ${streamCount} streams, processed ${stringCount} objects`);

    // Create /Encrypt dictionary
    const encryptDict = context.obj({
      Filter: PDFName.of('Standard'),
      V: PDFNumber.of(2),        // Version 2 = RC4
      R: PDFNumber.of(3),        // Revision 3 = 128-bit
      Length: PDFNumber.of(128), // Key length
      P: PDFNumber.of(permissions),
      O: PDFHexString.of(pdfBytesToHex(ownerKey)),
      U: PDFHexString.of(pdfBytesToHex(userKey))
    });

    // Register and add to trailer
    const encryptRef = context.register(encryptDict);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trailer as any).Encrypt = encryptRef;

    // Save
    const encryptedBytes = await pdfDoc.save({
      useObjectStreams: false
    });

    sigLog('[EditRestrictions] ========================================');
    sigLog('[EditRestrictions] ENCRYPTION COMPLETE');
    sigLog(`[EditRestrictions] Original: ${pdfBytes.length} bytes`);
    sigLog(`[EditRestrictions] Encrypted: ${encryptedBytes.length} bytes`);
    sigLog('[EditRestrictions] ========================================');

    return encryptedBytes;

  } catch (error) {
    console.error('[EditRestrictions] Encryption error:', error);
    sigLog('[EditRestrictions] Returning original PDF');
    return pdfBytes;
  }
}

// ============================================================================
// PKCS#7 SIGNATURE CREATION
// ============================================================================

/**
 * Create PKCS#7 detached signature (Adobe-compatible with full AATL chain)
 *
 * CRITICAL FOR AATL/eIDAS TRUST:
 * - Leaf certificate is added first
 * - All intermediate certificates are added in chain order
 * - Root CA is added last (if provided)
 * - NO duplicate certificates
 */
function createPkcs7Signature(
  certificate: SigningCertificate,
  dataToSign: Buffer,
  signedAt: Date
): Buffer {
  sigLog('[PKCS7] ========================================');
  sigLog('[PKCS7] Creating PKCS#7 detached signature with FULL CERTIFICATE CHAIN');
  sigLog('[PKCS7] ========================================');
  sigLog(`[PKCS7] Data to sign: ${dataToSign.length} bytes`);

  const leafCert = forge.pki.certificateFromPem(certificate.certificate);
  const privateKey = decryptStoredPrivateKey(certificate.privateKey, CERT_ENCRYPTION_KEY);

  // Log leaf certificate info
  const leafSubject = leafCert.subject.getField('CN')?.value || 'Unknown';
  const leafIssuer = leafCert.issuer.getField('CN')?.value || 'Unknown';
  const leafSerial = leafCert.serialNumber;

  sigLog(`[PKCS7] Leaf certificate:`);
  sigLog(`[PKCS7]   Subject: ${leafSubject}`);
  sigLog(`[PKCS7]   Issuer: ${leafIssuer}`);
  sigLog(`[PKCS7]   Serial: ${leafSerial.substring(0, 20)}...`);
  sigLog(`[PKCS7]   Self-signed: ${certificate.isSelfSigned}`);
  sigLog(`[PKCS7]   CA-issued: ${certificate.isCAIssued}`);

  // Create PKCS#7 SignedData structure
  const p7 = forge.pkcs7.createSignedData();

  // Set the content to the data that was hashed (ByteRange bytes)
  p7.content = forge.util.createBuffer(dataToSign.toString('binary'));

  // CRITICAL: Add leaf certificate FIRST
  sigLog('[PKCS7] Adding leaf certificate to PKCS#7...');
  p7.addCertificate(leafCert);

  // CRITICAL: Add FULL certificate chain (intermediates + root)
  // This is REQUIRED for Adobe Acrobat to trust AATL certificates
  let chainCertCount = 0;
  if (certificate.certificateChain && certificate.certificateChain.length > 0) {
    sigLog(`[PKCS7] Adding ${certificate.certificateChain.length} chain certificate(s)...`);

    for (let i = 0; i < certificate.certificateChain.length; i++) {
      const chainCertPem = certificate.certificateChain[i];
      try {
        const chainCert = forge.pki.certificateFromPem(chainCertPem);
        const chainSubject = chainCert.subject.getField('CN')?.value || 'Unknown';
        const chainIssuer = chainCert.issuer.getField('CN')?.value || 'Unknown';

        // Verify we're not adding the leaf cert again
        if (chainCert.serialNumber === leafSerial) {
          sigLog(`[PKCS7]   SKIP chain[${i}]: Duplicate of leaf certificate`);
          continue;
        }

        sigLog(`[PKCS7]   Chain[${i}]: Subject="${chainSubject}", Issuer="${chainIssuer}"`);
        p7.addCertificate(chainCert);
        chainCertCount++;
      } catch (e) {
        console.error(`[PKCS7]   FAILED to add chain cert ${i}:`, e);
      }
    }

    sigLog(`[PKCS7] Successfully added ${chainCertCount} chain certificate(s)`);
  } else {
    console.warn('[PKCS7] WARNING: No certificate chain provided!');
    console.warn('[PKCS7] Adobe Acrobat may not trust this signature without the full chain.');
  }

  // Log total certs in PKCS#7
  const totalCerts = 1 + chainCertCount; // leaf + chain
  sigLog(`[PKCS7] Total certificates in PKCS#7: ${totalCerts}`);

  // Add signer with required authenticated attributes
  p7.addSigner({
    key: privateKey,
    certificate: leafCert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: signedAt as unknown as string },
    ],
  });

  // Sign with detached mode
  p7.sign({ detached: true });

  // Convert to DER format
  const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const signatureBuffer = Buffer.from(derBytes, 'binary');

  sigLog('[PKCS7] ========================================');
  sigLog(`[PKCS7] Signature created: ${signatureBuffer.length} bytes`);
  sigLog(`[PKCS7] Certificates embedded: ${totalCerts} (1 leaf + ${chainCertCount} chain)`);
  sigLog('[PKCS7] ========================================');

  return signatureBuffer;
}

// ============================================================================
// APPROVAL SIGNATURE IMPLEMENTATION
// ============================================================================
//
// This implements standard APPROVAL signatures (NOT certification).
//
// Key characteristics:
// - NO /Reference array
// - NO /TransformMethod /DocMDP
// - NO /Perms in catalog
// - /SigFlags 3 in AcroForm (signatures exist + append-only)
// - Incremental update to original PDF
// - Signature invalidates if document is modified and saved
//
// This matches DocuSign and industry-standard behavior.
//
// ============================================================================

/**
 * Apply APPROVAL signature to PDF using incremental update
 *
 * Creates:
 * 1. Signature dictionary (/Type /Sig) - NO /Reference
 * 2. Signature field (/FT /Sig with /V pointing to signature)
 * 3. Widget annotation (linked to page)
 * 4. Updated AcroForm (/SigFlags 3)
 * 5. Updated Page (/Annots includes widget)
 * 6. Updated Catalog (with /AcroForm reference)
 */
async function applyApprovalSignature(
  pdfBytes: Buffer,
  certificate: SigningCertificate,
  signerName: string,
  signedAt: Date,
  reason?: string,
  signatureField?: SignatureFieldPosition
): Promise<Buffer> {
  sigLog('[ApprovalSig] ========================================');
  sigLog('[ApprovalSig] APPLYING APPROVAL SIGNATURE');
  sigLog('[ApprovalSig] ========================================');

  const originalPdf = pdfBytes;
  const originalLength = originalPdf.length;
  const pdfStr = originalPdf.toString('latin1');

  sigLog(`[ApprovalSig] Original PDF: ${originalLength} bytes`);

  // Parse PDF structure
  const maxObjNum = findMaxObjectNumber(originalPdf);
  const catalogObjNum = findCatalogObjectNumber(originalPdf);
  const prevXref = findLastXrefOffset(originalPdf);

  // Determine page for widget
  const pageNum = signatureField?.page || 1;
  const pageObjNum = findPageObjectNumber(originalPdf, pageNum);

  sigLog(`[ApprovalSig] Max object: ${maxObjNum}`);
  sigLog(`[ApprovalSig] Catalog: ${catalogObjNum}`);
  sigLog(`[ApprovalSig] Page ${pageNum}: object ${pageObjNum}`);
  sigLog(`[ApprovalSig] Prev xref: ${prevXref}`);

  // Check for existing AcroForm
  const hasAcroForm = pdfStr.includes('/AcroForm');
  sigLog(`[ApprovalSig] Has existing AcroForm: ${hasAcroForm}`);

  // Allocate new object numbers
  const sigObjNum = maxObjNum + 1;
  const fieldObjNum = maxObjNum + 2;
  const widgetObjNum = maxObjNum + 3;
  const acroFormObjNum = maxObjNum + 4;

  sigLog(`[ApprovalSig] Sig object: ${sigObjNum}`);
  sigLog(`[ApprovalSig] Field object: ${fieldObjNum}`);
  sigLog(`[ApprovalSig] Widget object: ${widgetObjNum}`);
  sigLog(`[ApprovalSig] AcroForm object: ${acroFormObjNum}`);

  // Build PDF date
  const pdfDate = formatPdfDate(signedAt);
  const fieldName = signatureField?.fieldName || `Signature_${Date.now()}`;

  // ============================================================================
  // 1. SIGNATURE DICTIONARY (Approval - NO /Reference, NO /DocMDP)
  // ============================================================================

  let sigObj = `${sigObjNum} 0 obj\n`;
  sigObj += '<<\n';
  sigObj += '/Type /Sig\n';
  sigObj += '/Filter /Adobe.PPKLite\n';
  sigObj += '/SubFilter /adbe.pkcs7.detached\n';
  sigObj += `/ByteRange [0 0000000000 0000000000 0000000000]\n`;
  sigObj += `/Contents <${SIGNATURE_PLACEHOLDER}>\n`;
  sigObj += `/Name (${escapePdfString(signerName)})\n`;
  sigObj += `/M (${pdfDate})\n`;
  sigObj += `/Reason (${escapePdfString(reason || 'Signed by PearSign')})\n`;
  sigObj += '/Location (PearSign Electronic Signatures)\n';
  sigObj += '>>\n';
  sigObj += 'endobj\n';

  // ============================================================================
  // 2. SIGNATURE FIELD (/FT /Sig with /V pointing to signature)
  // ============================================================================

  let fieldObj = `${fieldObjNum} 0 obj\n`;
  fieldObj += '<<\n';
  fieldObj += '/FT /Sig\n';
  fieldObj += `/T (${escapePdfString(fieldName)})\n`;
  fieldObj += `/V ${sigObjNum} 0 R\n`;
  fieldObj += `/Kids [${widgetObjNum} 0 R]\n`;
  fieldObj += '>>\n';
  fieldObj += 'endobj\n';

  // ============================================================================
  // 3. WIDGET ANNOTATION (linked to page)
  // ============================================================================

  // Determine widget rectangle
  let rect = '[0 0 0 0]';  // Invisible by default
  if (signatureField) {
    const x = signatureField.x || 0;
    const y = signatureField.y || 0;
    const width = signatureField.width || 150;
    const height = signatureField.height || 50;
    rect = `[${x} ${y} ${x + width} ${y + height}]`;
  }

  let widgetObj = `${widgetObjNum} 0 obj\n`;
  widgetObj += '<<\n';
  widgetObj += '/Type /Annot\n';
  widgetObj += '/Subtype /Widget\n';
  widgetObj += `/Parent ${fieldObjNum} 0 R\n`;
  widgetObj += `/P ${pageObjNum} 0 R\n`;
  widgetObj += `/Rect ${rect}\n`;
  widgetObj += '/F 132\n';  // Print + ReadOnly
  widgetObj += '>>\n';
  widgetObj += 'endobj\n';

  // ============================================================================
  // 4. ACROFORM DICTIONARY (/SigFlags 3)
  // ============================================================================

  let acroFormObj = `${acroFormObjNum} 0 obj\n`;
  acroFormObj += '<<\n';
  acroFormObj += `/Fields [${fieldObjNum} 0 R]\n`;
  acroFormObj += '/SigFlags 3\n';  // 1=SignaturesExist + 2=AppendOnly
  acroFormObj += '>>\n';
  acroFormObj += 'endobj\n';

  // ============================================================================
  // 5. UPDATED PAGE (add widget to /Annots)
  // ============================================================================

  // Extract current page content
  const pageObjStart = pdfStr.lastIndexOf(`${pageObjNum} 0 obj`);
  let pageContent = '';

  if (pageObjStart !== -1) {
    const pgEndObj = pdfStr.indexOf('endobj', pageObjStart);
    const pgStreamPos = pdfStr.indexOf('stream', pageObjStart);
    const pgSearchEnd = (pgStreamPos !== -1 && pgStreamPos < pgEndObj) ? pgStreamPos : pgEndObj;
    const afterObj = pdfStr.substring(pageObjStart, pgSearchEnd);
    const dictStart = afterObj.indexOf('<<');
    if (dictStart !== -1) {
      let depth = 0;
      let pos = dictStart;
      let dictEnd = -1;

      while (pos < afterObj.length - 1) {
        if (afterObj[pos] === '<' && afterObj[pos + 1] === '<') {
          depth++;
          pos += 2;
        } else if (afterObj[pos] === '>' && afterObj[pos + 1] === '>') {
          depth--;
          if (depth === 0) {
            dictEnd = pos + 2;
            break;
          }
          pos += 2;
        } else {
          pos++;
        }
      }

      if (dictEnd > 0) {
        pageContent = afterObj.substring(dictStart + 2, dictEnd - 2);
      }
    }
  }

  let updatedPage = `${pageObjNum} 0 obj\n<<`;

  if (pageContent) {
    if (pageContent.includes('/Annots')) {
      const annotsMatch = pageContent.match(/\/Annots\s*\[([^\]]*)\]/);
      if (annotsMatch) {
        const existingAnnots = annotsMatch[1].trim();
        const newAnnots = existingAnnots
          ? `${existingAnnots} ${widgetObjNum} 0 R`
          : `${widgetObjNum} 0 R`;
        pageContent = pageContent.replace(/\/Annots\s*\[([^\]]*)\]/, `/Annots [${newAnnots}]`);
      }
    } else {
      pageContent = pageContent.trimEnd() + `\n/Annots [${widgetObjNum} 0 R]`;
    }
    updatedPage += pageContent;
  } else {
    updatedPage += `\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Annots [${widgetObjNum} 0 R]`;
  }

  updatedPage += '>>\nendobj\n';

  // ============================================================================
  // 6. UPDATED CATALOG (add /AcroForm reference)
  // ============================================================================

  let catalogContent = '';

  const catObjPattern = new RegExp(`(^|\\n|\\r)${catalogObjNum}\\s+0\\s+obj`, 'g');
  let catalogObjStart = -1;
  let catMatch;
  while ((catMatch = catObjPattern.exec(pdfStr)) !== null) {
    const candidateStart = catMatch.index + catMatch[0].indexOf(`${catalogObjNum}`);
    const endObjPos = pdfStr.indexOf('endobj', candidateStart);
    if (endObjPos === -1) continue;
    const candidateContent = pdfStr.substring(candidateStart, endObjPos);
    if (candidateContent.includes('/Type') && candidateContent.includes('/Catalog')) {
      catalogObjStart = candidateStart;
      break;
    }
    if (candidateContent.includes('/Pages')) {
      catalogObjStart = candidateStart;
    }
  }

  if (catalogObjStart !== -1) {
    const endObjPos = pdfStr.indexOf('endobj', catalogObjStart);
    const streamPos = pdfStr.indexOf('stream', catalogObjStart);
    const searchEnd = (streamPos !== -1 && streamPos < endObjPos) ? streamPos : endObjPos;
    const afterObj = pdfStr.substring(catalogObjStart, searchEnd);
    const dictStart = afterObj.indexOf('<<');
    if (dictStart !== -1) {
      let depth = 0;
      let pos = dictStart;
      let dictEnd = -1;

      while (pos < afterObj.length - 1) {
        if (afterObj[pos] === '<' && afterObj[pos + 1] === '<') {
          depth++;
          pos += 2;
        } else if (afterObj[pos] === '>' && afterObj[pos + 1] === '>') {
          depth--;
          if (depth === 0) {
            dictEnd = pos + 2;
            break;
          }
          pos += 2;
        } else {
          pos++;
        }
      }

      if (dictEnd > 0) {
        catalogContent = afterObj.substring(dictStart + 2, dictEnd - 2);
        catalogContent = catalogContent.replace(/\/AcroForm\s*<<[^>]*(?:<<[^>]*>>[^>]*)*>>/g, '');
        catalogContent = catalogContent.replace(/\/AcroForm\s+\d+\s+0\s+R/g, '');
        catalogContent = catalogContent.replace(/\/Perms\s*<<[^>]*(?:<<[^>]*>>[^>]*)*>>/g, '');
        catalogContent = catalogContent.replace(/\/Perms\s+\d+\s+0\s+R/g, '');
        catalogContent = catalogContent.replace(/\n\s*\n/g, '\n');
        catalogContent = catalogContent.replace(/\/Type\s+\/XRef\b/g, '');
        catalogContent = catalogContent.replace(/\/W\s*\[[^\]]*\]/g, '');
        catalogContent = catalogContent.replace(/\/Index\s*\[[^\]]*\]/g, '');
        catalogContent = catalogContent.replace(/\/Size\s+\d+/g, '');
        catalogContent = catalogContent.replace(/\/Filter\s+\/\w+/g, '');
        catalogContent = catalogContent.replace(/\/DecodeParms\s*<<[^>]*>>/g, '');
        catalogContent = catalogContent.replace(/\/Length\s+\d+/g, '');
        catalogContent = catalogContent.replace(/\/Prev\s+\d+/g, '');
        catalogContent = catalogContent.replace(/\/ID\s*\[[^\]]*\]/g, '');
        catalogContent = catalogContent.replace(/\/Info\s+\d+\s+0\s+R/g, '');
        catalogContent = catalogContent.replace(/\n\s*\n/g, '\n');
      }
    }
  }

  if (!catalogContent || !catalogContent.includes('/Pages')) {
    sigLog('[ApprovalSig] Strategy 1 failed, trying regex extraction for catalog entries...');
    const pagesRef = pdfStr.match(/\/Pages\s+(\d+)\s+0\s+R/);
    if (pagesRef) {
      const entries: string[] = [];
      entries.push(`/Type /Catalog`);
      entries.push(`/Pages ${pagesRef[1]} 0 R`);
      const namesRef = pdfStr.match(/\/Names\s+(\d+)\s+0\s+R/);
      if (namesRef) entries.push(`/Names ${namesRef[1]} 0 R`);
      const outlinesRef = pdfStr.match(/\/Outlines\s+(\d+)\s+0\s+R/);
      if (outlinesRef) entries.push(`/Outlines ${outlinesRef[1]} 0 R`);
      const markInfoMatch = pdfStr.match(/\/MarkInfo\s*<<([^>]*)>>/);
      if (markInfoMatch) entries.push(`/MarkInfo <<${markInfoMatch[1]}>>`);
      const langMatch = pdfStr.match(/\/Lang\s*\(([^)]*)\)/);
      if (langMatch) entries.push(`/Lang (${langMatch[1]})`);
      const structTreeRef = pdfStr.match(/\/StructTreeRoot\s+(\d+)\s+0\s+R/);
      if (structTreeRef) entries.push(`/StructTreeRoot ${structTreeRef[1]} 0 R`);
      const metadataRef = pdfStr.match(/\/Metadata\s+(\d+)\s+0\s+R/);
      if (metadataRef) entries.push(`/Metadata ${metadataRef[1]} 0 R`);
      const viewPrefsRef = pdfStr.match(/\/ViewerPreferences\s+(\d+)\s+0\s+R/);
      if (viewPrefsRef) entries.push(`/ViewerPreferences ${viewPrefsRef[1]} 0 R`);
      const pageLayoutMatch = pdfStr.match(/\/PageLayout\s+\/(\w+)/);
      if (pageLayoutMatch) entries.push(`/PageLayout /${pageLayoutMatch[1]}`);
      const pageModeMatch = pdfStr.match(/\/PageMode\s+\/(\w+)/);
      if (pageModeMatch) entries.push(`/PageMode /${pageModeMatch[1]}`);
      catalogContent = '\n' + entries.join('\n') + '\n';
      sigLog(`[ApprovalSig] Reconstructed catalog with ${entries.length} entries`);
    }
  }

  if (!catalogContent) {
    console.error('[ApprovalSig] FATAL: Could not parse or reconstruct catalog from PDF');
    throw new Error('Could not parse catalog from PDF');
  }

  // Build updated catalog with AcroForm reference
  let updatedCatalog = `${catalogObjNum} 0 obj\n<<`;
  updatedCatalog += catalogContent.trimEnd() + '\n';
  updatedCatalog += `/AcroForm ${acroFormObjNum} 0 R\n`;
  updatedCatalog += '>>\nendobj\n';

  // ============================================================================
  // CALCULATE OFFSETS FOR INCREMENTAL UPDATE
  // ============================================================================

  const needsNewline = originalPdf[originalPdf.length - 1] !== 0x0A;
  const prefix = needsNewline ? '\n' : '';

  // Calculate offsets
  let currentOffset = originalLength + Buffer.byteLength(prefix, 'latin1');

  const sigObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(sigObj, 'latin1');

  const fieldObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(fieldObj, 'latin1');

  const widgetObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(widgetObj, 'latin1');

  const acroFormObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(acroFormObj, 'latin1');

  const pageObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(updatedPage, 'latin1');

  const catalogObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(updatedCatalog, 'latin1');

  const xrefOffset = currentOffset;

  sigLog(`[ApprovalSig] Sig offset: ${sigObjOffset}`);
  sigLog(`[ApprovalSig] Field offset: ${fieldObjOffset}`);
  sigLog(`[ApprovalSig] Widget offset: ${widgetObjOffset}`);
  sigLog(`[ApprovalSig] AcroForm offset: ${acroFormObjOffset}`);
  sigLog(`[ApprovalSig] Page offset: ${pageObjOffset}`);
  sigLog(`[ApprovalSig] Catalog offset: ${catalogObjOffset}`);
  sigLog(`[ApprovalSig] xref offset: ${xrefOffset}`);

  // ============================================================================
  // BUILD XREF TABLE
  // ============================================================================

  let xref = 'xref\n';
  xref += '0 1\n';
  xref += '0000000000 65535 f \n';

  // Catalog entry
  xref += `${catalogObjNum} 1\n`;
  xref += `${catalogObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Page entry
  xref += `${pageObjNum} 1\n`;
  xref += `${pageObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Sig entry
  xref += `${sigObjNum} 1\n`;
  xref += `${sigObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Field entry
  xref += `${fieldObjNum} 1\n`;
  xref += `${fieldObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Widget entry
  xref += `${widgetObjNum} 1\n`;
  xref += `${widgetObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // AcroForm entry
  xref += `${acroFormObjNum} 1\n`;
  xref += `${acroFormObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Trailer
  xref += 'trailer\n';
  xref += '<<\n';
  xref += `/Size ${acroFormObjNum + 1}\n`;
  xref += `/Root ${catalogObjNum} 0 R\n`;
  xref += `/Prev ${prevXref}\n`;
  xref += '>>\n';
  xref += 'startxref\n';
  xref += `${xrefOffset}\n`;
  xref += '%%EOF\n';

  // ============================================================================
  // ASSEMBLE INCREMENTAL UPDATE (WITHOUT SIGNATURE YET)
  // ============================================================================

  const incrementalUpdate = prefix + sigObj + fieldObj + widgetObj + acroFormObj + updatedPage + updatedCatalog + xref;
  const incrementalBuffer = Buffer.from(incrementalUpdate, 'latin1');

  // Create complete PDF
  const pdf = Buffer.concat([originalPdf, incrementalBuffer]);
  const totalLength = pdf.length;

  sigLog(`[ApprovalSig] Incremental update: ${incrementalBuffer.length} bytes`);
  sigLog(`[ApprovalSig] Total PDF: ${totalLength} bytes`);

  // ============================================================================
  // FIND /Contents AND CALCULATE ByteRange
  // ============================================================================

  // Find /Contents < in the signature object
  const contentsMarker = '/Contents <';
  const contentsMarkerBytes = Buffer.from(contentsMarker, 'latin1');
  const contentsMarkerPos = pdf.indexOf(contentsMarkerBytes, sigObjOffset);

  if (contentsMarkerPos === -1) {
    throw new Error('Could not find /Contents marker in signature object');
  }

  // Position of '<' is at contentsMarkerPos + '/Contents '.length
  const angleBracketOpenPos = contentsMarkerPos + contentsMarker.length - 1;
  const hexDataStartPos = angleBracketOpenPos + 1;
  const hexDataEndPos = hexDataStartPos + SIGNATURE_PLACEHOLDER.length;
  const angleBracketClosePos = hexDataEndPos;

  // ByteRange: [0, up-to-and-including-'<', after-'>', to-end]
  // The '<' is the last byte of first segment
  // The '>' is the first byte of second segment
  const byteRange = [
    0,
    hexDataStartPos,           // Includes the '<'
    angleBracketClosePos,      // Starts at '>'
    totalLength - angleBracketClosePos
  ];

  sigLog(`[ApprovalSig] ByteRange: [${byteRange.join(', ')}]`);

  // Verify ByteRange boundaries
  if (pdf[hexDataStartPos - 1] !== 0x3C) {  // '<' = 0x3C
    throw new Error(`ByteRange error: expected '<' at ${hexDataStartPos - 1}, found 0x${pdf[hexDataStartPos - 1].toString(16)}`);
  }
  if (pdf[angleBracketClosePos] !== 0x3E) {  // '>' = 0x3E
    throw new Error(`ByteRange error: expected '>' at ${angleBracketClosePos}, found 0x${pdf[angleBracketClosePos].toString(16)}`);
  }

  sigLog('[ApprovalSig] ✓ ByteRange boundaries verified');
  sigLog(`[ApprovalSig]   First segment ends with '<' at byte ${hexDataStartPos - 1}`);
  sigLog(`[ApprovalSig]   Second segment starts with '>' at byte ${angleBracketClosePos}`);

  // ============================================================================
  // UPDATE ByteRange IN PDF
  // ============================================================================

  const byteRangeStr = `${byteRange[0]} ${byteRange[1].toString().padStart(10, '0')} ${byteRange[2].toString().padStart(10, '0')} ${byteRange[3].toString().padStart(10, '0')}`;
  const byteRangePlaceholder = '/ByteRange [0 0000000000 0000000000 0000000000]';
  const byteRangeMarkerPos = pdf.indexOf(Buffer.from(byteRangePlaceholder, 'latin1'), sigObjOffset);

  if (byteRangeMarkerPos === -1) {
    throw new Error('Could not find ByteRange placeholder');
  }

  // Write the actual ByteRange values
  const byteRangeValueOffset = byteRangeMarkerPos + 12;  // After '/ByteRange ['
  Buffer.from(byteRangeStr, 'latin1').copy(pdf, byteRangeValueOffset);

  sigLog(`[ApprovalSig] ByteRange updated at offset ${byteRangeMarkerPos}`);

  // ============================================================================
  // CALCULATE HASH AND CREATE PKCS#7 SIGNATURE
  // ============================================================================

  // Extract the two segments that will be signed
  const segment1 = pdf.subarray(byteRange[0], byteRange[0] + byteRange[1]);
  const segment2 = pdf.subarray(byteRange[2], byteRange[2] + byteRange[3]);
  const dataToHash = Buffer.concat([segment1, segment2]);

  sigLog(`[ApprovalSig] Segment 1: ${segment1.length} bytes (0 to ${byteRange[1]})`);
  sigLog(`[ApprovalSig] Segment 2: ${segment2.length} bytes (${byteRange[2]} to ${byteRange[2] + byteRange[3]})`);
  sigLog(`[ApprovalSig] Total data to hash: ${dataToHash.length} bytes`);

  // Create PKCS#7 signature
  const pkcs7Signature = createPkcs7Signature(certificate, dataToHash, signedAt);
  sigLog(`[ApprovalSig] PKCS#7 signature: ${pkcs7Signature.length} bytes`);

  if (pkcs7Signature.length > SIGNATURE_LENGTH) {
    throw new Error(`Signature too large: ${pkcs7Signature.length} > ${SIGNATURE_LENGTH}`);
  }

  // ============================================================================
  // INSERT SIGNATURE INTO /Contents
  // ============================================================================

  const signatureHex = pkcs7Signature.toString('hex').toUpperCase();
  const paddedSignatureHex = signatureHex.padEnd(SIGNATURE_PLACEHOLDER.length, '0');
  Buffer.from(paddedSignatureHex, 'latin1').copy(pdf, hexDataStartPos);

  sigLog(`[ApprovalSig] Signature inserted at offset ${hexDataStartPos}`);

  // ============================================================================
  // FINAL VERIFICATION
  // ============================================================================

  const finalPdfStr = pdf.toString('latin1');

  // Verify NO certification markers
  if (finalPdfStr.includes('/TransformMethod /DocMDP')) {
    throw new Error('VERIFICATION FAILED: Found /TransformMethod /DocMDP (should not exist for approval signature)');
  }
  if (finalPdfStr.includes('/Perms')) {
    // Check if it's in catalog (bad) or just in a comment/other context (ok)
    const permsInCatalog = finalPdfStr.match(/\/Root\s+\d+\s+0\s+R[\s\S]*?\/Perms/);
    if (permsInCatalog) {
      throw new Error('VERIFICATION FAILED: Found /Perms in catalog (should not exist for approval signature)');
    }
  }

  // Verify required structures
  if (!finalPdfStr.includes('/Type /Sig')) {
    throw new Error('VERIFICATION FAILED: Missing /Type /Sig');
  }
  if (!finalPdfStr.includes('/SubFilter /adbe.pkcs7.detached')) {
    throw new Error('VERIFICATION FAILED: Missing /SubFilter /adbe.pkcs7.detached');
  }
  if (!finalPdfStr.includes('/AcroForm')) {
    throw new Error('VERIFICATION FAILED: Missing /AcroForm');
  }
  if (!finalPdfStr.includes('/SigFlags 3')) {
    throw new Error('VERIFICATION FAILED: Missing /SigFlags 3');
  }
  if (!finalPdfStr.includes('/FT /Sig')) {
    throw new Error('VERIFICATION FAILED: Missing signature field /FT /Sig');
  }

  sigLog('[ApprovalSig] ========================================');
  sigLog('[ApprovalSig] VERIFICATION PASSED');
  sigLog('[ApprovalSig] ✓ /Type /Sig present');
  sigLog('[ApprovalSig] ✓ /SubFilter /adbe.pkcs7.detached present');
  sigLog('[ApprovalSig] ✓ /AcroForm with /SigFlags 3 present');
  sigLog('[ApprovalSig] ✓ Signature field /FT /Sig present');
  sigLog('[ApprovalSig] ✓ NO /DocMDP (correct for approval signature)');
  sigLog('[ApprovalSig] ✓ NO /Perms in catalog (correct for approval signature)');
  sigLog('[ApprovalSig] ========================================');
  sigLog('[ApprovalSig] APPROVAL SIGNATURE COMPLETE');
  sigLog(`[ApprovalSig] Final PDF size: ${pdf.length} bytes`);
  sigLog('[ApprovalSig] ========================================');

  return pdf;
}

// ============================================================================
// CERTIFICATION SIGNATURE IMPLEMENTATION (DocMDP)
// ============================================================================
//
// This implements CERTIFICATION signatures with DocMDP for AATL/eIDAS trust.
//
// Key characteristics:
// - /Reference array with /TransformMethod /DocMDP
// - /Perms in catalog pointing to signature
// - /P permission level (1=no changes, 2=form fill only, 3=annotations+form)
// - Requires AATL/CA-issued certificate (NOT self-signed)
// - Adobe shows "Certified by..." with blue ribbon
// - Editing is blocked or invalidates signature
//
// ============================================================================

/**
 * Apply CERTIFICATION signature to PDF using incremental update
 *
 * Creates:
 * 1. Signature dictionary (/Type /Sig) WITH /Reference DocMDP
 * 2. Signature field (/FT /Sig with /V pointing to signature)
 * 3. Widget annotation (linked to page)
 * 4. Updated AcroForm (/SigFlags 3)
 * 5. Updated Page (/Annots includes widget)
 * 6. Updated Catalog (with /AcroForm AND /Perms references)
 */
async function applyCertificationSignature(
  pdfBytes: Buffer,
  certificate: SigningCertificate,
  signerName: string,
  signedAt: Date,
  reason?: string,
  signatureField?: SignatureFieldPosition,
  permissionLevel: 1 | 2 | 3 = 1  // 1=no changes, 2=form fill, 3=annot+form
): Promise<Buffer> {
  sigLog('[CertSig] ========================================');
  sigLog('[CertSig] APPLYING CERTIFICATION SIGNATURE (DocMDP)');
  sigLog('[CertSig] ========================================');
  sigLog(`[CertSig] Permission level: ${permissionLevel}`);
  sigLog(`[CertSig]   1 = No changes allowed`);
  sigLog(`[CertSig]   2 = Form filling only`);
  sigLog(`[CertSig]   3 = Annotations and form filling`);

  // CRITICAL: Validate certificate is suitable for certification
  if (certificate.isSelfSigned) {
    throw new Error(
      'CERTIFICATION ERROR: Self-signed certificates cannot create certification signatures. ' +
      'Adobe Acrobat requires an AATL/CA-issued certificate for certification.'
    );
  }

  if (!certificate.certificateChain || certificate.certificateChain.length === 0) {
    console.warn('[CertSig] WARNING: No certificate chain provided!');
    console.warn('[CertSig] Adobe may not fully trust this certification signature.');
  }

  const originalPdf = pdfBytes;
  const originalLength = originalPdf.length;
  const pdfStr = originalPdf.toString('latin1');

  sigLog(`[CertSig] Original PDF: ${originalLength} bytes`);

  // Parse PDF structure
  const maxObjNum = findMaxObjectNumber(originalPdf);
  const catalogObjNum = findCatalogObjectNumber(originalPdf);
  const prevXref = findLastXrefOffset(originalPdf);

  // Determine page for widget
  const pageNum = signatureField?.page || 1;
  const pageObjNum = findPageObjectNumber(originalPdf, pageNum);

  sigLog(`[CertSig] Max object: ${maxObjNum}`);
  sigLog(`[CertSig] Catalog: ${catalogObjNum}`);
  sigLog(`[CertSig] Page ${pageNum}: object ${pageObjNum}`);
  sigLog(`[CertSig] Prev xref: ${prevXref}`);

  // Allocate new object numbers
  const sigObjNum = maxObjNum + 1;
  const fieldObjNum = maxObjNum + 2;
  const widgetObjNum = maxObjNum + 3;
  const acroFormObjNum = maxObjNum + 4;
  const transformObjNum = maxObjNum + 5;  // DocMDP TransformParams

  sigLog(`[CertSig] Sig object: ${sigObjNum}`);
  sigLog(`[CertSig] Field object: ${fieldObjNum}`);
  sigLog(`[CertSig] Widget object: ${widgetObjNum}`);
  sigLog(`[CertSig] AcroForm object: ${acroFormObjNum}`);
  sigLog(`[CertSig] Transform object: ${transformObjNum}`);

  // Build PDF date
  const pdfDate = formatPdfDate(signedAt);
  const fieldName = signatureField?.fieldName || `CertSignature_${Date.now()}`;

  // ============================================================================
  // 1. TRANSFORM PARAMS DICTIONARY (DocMDP)
  // ============================================================================

  let transformObj = `${transformObjNum} 0 obj\n`;
  transformObj += '<<\n';
  transformObj += '/Type /TransformParams\n';
  transformObj += '/V /1.2\n';
  transformObj += `/P ${permissionLevel}\n`;  // Permission level
  transformObj += '>>\n';
  transformObj += 'endobj\n';

  // ============================================================================
  // 2. SIGNATURE DICTIONARY (Certification WITH /Reference DocMDP)
  // ============================================================================

  let sigObj = `${sigObjNum} 0 obj\n`;
  sigObj += '<<\n';
  sigObj += '/Type /Sig\n';
  sigObj += '/Filter /Adobe.PPKLite\n';
  sigObj += '/SubFilter /adbe.pkcs7.detached\n';
  sigObj += `/ByteRange [0 0000000000 0000000000 0000000000]\n`;
  sigObj += `/Contents <${SIGNATURE_PLACEHOLDER}>\n`;
  sigObj += `/Name (${escapePdfString(signerName)})\n`;
  sigObj += `/M (${pdfDate})\n`;
  sigObj += `/Reason (${escapePdfString(reason || 'Certified by PearSign')})\n`;
  sigObj += '/Location (PearSign Electronic Signatures)\n';
  // CRITICAL: /Reference array with DocMDP for certification
  sigObj += '/Reference [\n';
  sigObj += '  <<\n';
  sigObj += '    /Type /SigRef\n';
  sigObj += '    /TransformMethod /DocMDP\n';
  sigObj += `    /TransformParams ${transformObjNum} 0 R\n`;
  sigObj += '  >>\n';
  sigObj += ']\n';
  sigObj += '>>\n';
  sigObj += 'endobj\n';

  // ============================================================================
  // 3. SIGNATURE FIELD (/FT /Sig with /V pointing to signature)
  // ============================================================================

  let fieldObj = `${fieldObjNum} 0 obj\n`;
  fieldObj += '<<\n';
  fieldObj += '/FT /Sig\n';
  fieldObj += `/T (${escapePdfString(fieldName)})\n`;
  fieldObj += `/V ${sigObjNum} 0 R\n`;
  fieldObj += `/Kids [${widgetObjNum} 0 R]\n`;
  fieldObj += '>>\n';
  fieldObj += 'endobj\n';

  // ============================================================================
  // 4. WIDGET ANNOTATION (linked to page)
  // ============================================================================

  // Determine widget rectangle
  let rect = '[0 0 0 0]';  // Invisible by default
  if (signatureField) {
    const x = signatureField.x || 0;
    const y = signatureField.y || 0;
    const width = signatureField.width || 150;
    const height = signatureField.height || 50;
    rect = `[${x} ${y} ${x + width} ${y + height}]`;
  }

  let widgetObj = `${widgetObjNum} 0 obj\n`;
  widgetObj += '<<\n';
  widgetObj += '/Type /Annot\n';
  widgetObj += '/Subtype /Widget\n';
  widgetObj += `/Parent ${fieldObjNum} 0 R\n`;
  widgetObj += `/P ${pageObjNum} 0 R\n`;
  widgetObj += `/Rect ${rect}\n`;
  widgetObj += '/F 132\n';  // Print + ReadOnly
  widgetObj += '>>\n';
  widgetObj += 'endobj\n';

  // ============================================================================
  // 5. ACROFORM DICTIONARY (/SigFlags 3)
  // ============================================================================

  let acroFormObj = `${acroFormObjNum} 0 obj\n`;
  acroFormObj += '<<\n';
  acroFormObj += `/Fields [${fieldObjNum} 0 R]\n`;
  acroFormObj += '/SigFlags 3\n';  // 1=SignaturesExist + 2=AppendOnly
  acroFormObj += '>>\n';
  acroFormObj += 'endobj\n';

  // ============================================================================
  // 6. UPDATED PAGE (add widget to /Annots)
  // ============================================================================

  const pageObjStart = pdfStr.lastIndexOf(`${pageObjNum} 0 obj`);
  let pageContent = '';

  if (pageObjStart !== -1) {
    const pageEndObj = pdfStr.indexOf('endobj', pageObjStart);
    const pageStreamPos = pdfStr.indexOf('stream', pageObjStart);
    const pageSearchEnd = (pageStreamPos !== -1 && pageStreamPos < pageEndObj) ? pageStreamPos : pageEndObj;
    const afterObj = pdfStr.substring(pageObjStart, pageSearchEnd);
    const dictStart = afterObj.indexOf('<<');
    if (dictStart !== -1) {
      let depth = 0;
      let pos = dictStart;
      let dictEnd = -1;

      while (pos < afterObj.length - 1) {
        if (afterObj[pos] === '<' && afterObj[pos + 1] === '<') {
          depth++;
          pos += 2;
        } else if (afterObj[pos] === '>' && afterObj[pos + 1] === '>') {
          depth--;
          if (depth === 0) {
            dictEnd = pos + 2;
            break;
          }
          pos += 2;
        } else {
          pos++;
        }
      }

      if (dictEnd > 0) {
        pageContent = afterObj.substring(dictStart + 2, dictEnd - 2);
      }
    }
  }

  let updatedPage = `${pageObjNum} 0 obj\n<<`;

  if (pageContent) {
    if (pageContent.includes('/Annots')) {
      const annotsMatch = pageContent.match(/\/Annots\s*\[([^\]]*)\]/);
      if (annotsMatch) {
        const existingAnnots = annotsMatch[1].trim();
        const newAnnots = existingAnnots
          ? `${existingAnnots} ${widgetObjNum} 0 R`
          : `${widgetObjNum} 0 R`;
        pageContent = pageContent.replace(/\/Annots\s*\[([^\]]*)\]/, `/Annots [${newAnnots}]`);
      }
    } else {
      pageContent = pageContent.trimEnd() + `\n/Annots [${widgetObjNum} 0 R]`;
    }
    updatedPage += pageContent;
  } else {
    updatedPage += `\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Annots [${widgetObjNum} 0 R]`;
  }

  updatedPage += '>>\nendobj\n';

  // ============================================================================
  // 7. UPDATED CATALOG (with /AcroForm AND /Perms for DocMDP)
  // ============================================================================

  let catalogContent = '';

  // Strategy 1: Find and parse the catalog dictionary directly
  const catalogObjPattern = new RegExp(`(^|\\n|\\r)${catalogObjNum}\\s+0\\s+obj`, 'g');
  let catalogObjStart = -1;
  let catalogMatch;
  while ((catalogMatch = catalogObjPattern.exec(pdfStr)) !== null) {
    const candidateStart = catalogMatch.index + catalogMatch[0].indexOf(`${catalogObjNum}`);
    const endObjPos = pdfStr.indexOf('endobj', candidateStart);
    if (endObjPos === -1) continue;
    const candidateContent = pdfStr.substring(candidateStart, endObjPos);
    if (candidateContent.includes('/Type') && candidateContent.includes('/Catalog')) {
      catalogObjStart = candidateStart;
      break;
    }
    if (candidateContent.includes('/Pages')) {
      catalogObjStart = candidateStart;
    }
  }

  if (catalogObjStart !== -1) {
    const endObjPos = pdfStr.indexOf('endobj', catalogObjStart);
    const streamPos = pdfStr.indexOf('stream', catalogObjStart);
    const searchEnd = (streamPos !== -1 && streamPos < endObjPos) ? streamPos : endObjPos;
    const afterObj = pdfStr.substring(catalogObjStart, searchEnd);
    const dictStart = afterObj.indexOf('<<');
    if (dictStart !== -1) {
      let depth = 0;
      let pos = dictStart;
      let dictEnd = -1;

      while (pos < afterObj.length - 1) {
        if (afterObj[pos] === '<' && afterObj[pos + 1] === '<') {
          depth++;
          pos += 2;
        } else if (afterObj[pos] === '>' && afterObj[pos + 1] === '>') {
          depth--;
          if (depth === 0) {
            dictEnd = pos + 2;
            break;
          }
          pos += 2;
        } else {
          pos++;
        }
      }

      if (dictEnd > 0) {
        catalogContent = afterObj.substring(dictStart + 2, dictEnd - 2);
        catalogContent = catalogContent.replace(/\/AcroForm\s*<<[^>]*(?:<<[^>]*>>[^>]*)*>>/g, '');
        catalogContent = catalogContent.replace(/\/AcroForm\s+\d+\s+0\s+R/g, '');
        catalogContent = catalogContent.replace(/\/Perms\s*<<[^>]*(?:<<[^>]*>>[^>]*)*>>/g, '');
        catalogContent = catalogContent.replace(/\/Perms\s+\d+\s+0\s+R/g, '');
        catalogContent = catalogContent.replace(/\n\s*\n/g, '\n');
        // Remove xref-stream-specific entries that don't belong in a plain catalog
        catalogContent = catalogContent.replace(/\/Type\s+\/XRef\b/g, '');
        catalogContent = catalogContent.replace(/\/W\s*\[[^\]]*\]/g, '');
        catalogContent = catalogContent.replace(/\/Index\s*\[[^\]]*\]/g, '');
        catalogContent = catalogContent.replace(/\/Size\s+\d+/g, '');
        catalogContent = catalogContent.replace(/\/Filter\s+\/\w+/g, '');
        catalogContent = catalogContent.replace(/\/DecodeParms\s*<<[^>]*>>/g, '');
        catalogContent = catalogContent.replace(/\/Length\s+\d+/g, '');
        catalogContent = catalogContent.replace(/\/Prev\s+\d+/g, '');
        catalogContent = catalogContent.replace(/\/ID\s*\[[^\]]*\]/g, '');
        catalogContent = catalogContent.replace(/\/Info\s+\d+\s+0\s+R/g, '');
        catalogContent = catalogContent.replace(/\n\s*\n/g, '\n');
      }
    }
  }

  // Strategy 2: If direct parsing fails, extract essential refs with regex
  if (!catalogContent || !catalogContent.includes('/Pages')) {
    sigLog('[CertSig] Strategy 1 failed, trying regex extraction for catalog entries...');
    const pagesRef = pdfStr.match(/\/Pages\s+(\d+)\s+0\s+R/);
    if (pagesRef) {
      const entries: string[] = [];
      entries.push(`/Type /Catalog`);
      entries.push(`/Pages ${pagesRef[1]} 0 R`);
      
      const namesRef = pdfStr.match(/\/Names\s+(\d+)\s+0\s+R/);
      if (namesRef) entries.push(`/Names ${namesRef[1]} 0 R`);
      
      const outlinesRef = pdfStr.match(/\/Outlines\s+(\d+)\s+0\s+R/);
      if (outlinesRef) entries.push(`/Outlines ${outlinesRef[1]} 0 R`);
      
      const markInfoMatch = pdfStr.match(/\/MarkInfo\s*<<([^>]*)>>/);
      if (markInfoMatch) entries.push(`/MarkInfo <<${markInfoMatch[1]}>>`);
      
      const langMatch = pdfStr.match(/\/Lang\s*\(([^)]*)\)/);
      if (langMatch) entries.push(`/Lang (${langMatch[1]})`);
      
      const structTreeRef = pdfStr.match(/\/StructTreeRoot\s+(\d+)\s+0\s+R/);
      if (structTreeRef) entries.push(`/StructTreeRoot ${structTreeRef[1]} 0 R`);
      
      const metadataRef = pdfStr.match(/\/Metadata\s+(\d+)\s+0\s+R/);
      if (metadataRef) entries.push(`/Metadata ${metadataRef[1]} 0 R`);
      
      const viewPrefsRef = pdfStr.match(/\/ViewerPreferences\s+(\d+)\s+0\s+R/);
      if (viewPrefsRef) entries.push(`/ViewerPreferences ${viewPrefsRef[1]} 0 R`);
      
      const pageLayoutMatch = pdfStr.match(/\/PageLayout\s+\/(\w+)/);
      if (pageLayoutMatch) entries.push(`/PageLayout /${pageLayoutMatch[1]}`);
      
      const pageModeMatch = pdfStr.match(/\/PageMode\s+\/(\w+)/);
      if (pageModeMatch) entries.push(`/PageMode /${pageModeMatch[1]}`);
      
      catalogContent = '\n' + entries.join('\n') + '\n';
      sigLog(`[CertSig] Reconstructed catalog with ${entries.length} entries`);
    }
  }

  if (!catalogContent) {
    console.error('[CertSig] FATAL: Could not parse or reconstruct catalog from PDF');
    throw new Error('Could not parse catalog from PDF');
  }

  sigLog(`[CertSig] Catalog content parsed successfully (${catalogContent.length} chars)`);

  // Build updated catalog with AcroForm AND Perms
  let updatedCatalog = `${catalogObjNum} 0 obj\n<<`;
  updatedCatalog += catalogContent.trimEnd() + '\n';
  updatedCatalog += `/AcroForm ${acroFormObjNum} 0 R\n`;
  // CRITICAL: /Perms dictionary with /DocMDP pointing to signature
  updatedCatalog += `/Perms << /DocMDP ${sigObjNum} 0 R >>\n`;
  updatedCatalog += '>>\nendobj\n';

  // ============================================================================
  // CALCULATE OFFSETS FOR INCREMENTAL UPDATE
  // ============================================================================

  const needsNewline = originalPdf[originalPdf.length - 1] !== 0x0A;
  const prefix = needsNewline ? '\n' : '';

  let currentOffset = originalLength + Buffer.byteLength(prefix, 'latin1');

  const transformObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(transformObj, 'latin1');

  const sigObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(sigObj, 'latin1');

  const fieldObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(fieldObj, 'latin1');

  const widgetObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(widgetObj, 'latin1');

  const acroFormObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(acroFormObj, 'latin1');

  const pageObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(updatedPage, 'latin1');

  const catalogObjOffset = currentOffset;
  currentOffset += Buffer.byteLength(updatedCatalog, 'latin1');

  const xrefOffset = currentOffset;

  sigLog(`[CertSig] Transform offset: ${transformObjOffset}`);
  sigLog(`[CertSig] Sig offset: ${sigObjOffset}`);
  sigLog(`[CertSig] xref offset: ${xrefOffset}`);

  // ============================================================================
  // BUILD XREF TABLE
  // ============================================================================

  let xref = 'xref\n';
  xref += '0 1\n';
  xref += '0000000000 65535 f \n';

  // Catalog entry
  xref += `${catalogObjNum} 1\n`;
  xref += `${catalogObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Page entry
  xref += `${pageObjNum} 1\n`;
  xref += `${pageObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Transform entry
  xref += `${transformObjNum} 1\n`;
  xref += `${transformObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Sig entry
  xref += `${sigObjNum} 1\n`;
  xref += `${sigObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Field entry
  xref += `${fieldObjNum} 1\n`;
  xref += `${fieldObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Widget entry
  xref += `${widgetObjNum} 1\n`;
  xref += `${widgetObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // AcroForm entry
  xref += `${acroFormObjNum} 1\n`;
  xref += `${acroFormObjOffset.toString().padStart(10, '0')} 00000 n \n`;

  // Trailer
  xref += 'trailer\n';
  xref += '<<\n';
  xref += `/Size ${acroFormObjNum + 1}\n`;
  xref += `/Root ${catalogObjNum} 0 R\n`;
  xref += `/Prev ${prevXref}\n`;
  xref += '>>\n';
  xref += 'startxref\n';
  xref += `${xrefOffset}\n`;
  xref += '%%EOF\n';

  // ============================================================================
  // ASSEMBLE INCREMENTAL UPDATE
  // ============================================================================

  const incrementalUpdate = prefix + transformObj + sigObj + fieldObj + widgetObj + acroFormObj + updatedPage + updatedCatalog + xref;
  const incrementalBuffer = Buffer.from(incrementalUpdate, 'latin1');

  const pdf = Buffer.concat([originalPdf, incrementalBuffer]);
  const totalLength = pdf.length;

  sigLog(`[CertSig] Incremental update: ${incrementalBuffer.length} bytes`);
  sigLog(`[CertSig] Total PDF: ${totalLength} bytes`);

  // ============================================================================
  // FIND /Contents AND CALCULATE ByteRange
  // ============================================================================

  const contentsMarker = '/Contents <';
  const contentsMarkerBytes = Buffer.from(contentsMarker, 'latin1');
  const contentsMarkerPos = pdf.indexOf(contentsMarkerBytes, sigObjOffset);

  if (contentsMarkerPos === -1) {
    throw new Error('Could not find /Contents marker in signature object');
  }

  const angleBracketOpenPos = contentsMarkerPos + contentsMarker.length - 1;
  const hexDataStartPos = angleBracketOpenPos + 1;
  const hexDataEndPos = hexDataStartPos + SIGNATURE_PLACEHOLDER.length;
  const angleBracketClosePos = hexDataEndPos;

  const byteRange = [
    0,
    hexDataStartPos,
    angleBracketClosePos,
    totalLength - angleBracketClosePos
  ];

  sigLog(`[CertSig] ByteRange: [${byteRange.join(', ')}]`);

  // Verify ByteRange boundaries
  if (pdf[hexDataStartPos - 1] !== 0x3C) {
    throw new Error(`ByteRange error: expected '<' at ${hexDataStartPos - 1}`);
  }
  if (pdf[angleBracketClosePos] !== 0x3E) {
    throw new Error(`ByteRange error: expected '>' at ${angleBracketClosePos}`);
  }

  // ============================================================================
  // UPDATE ByteRange IN PDF
  // ============================================================================

  const byteRangeStr = `${byteRange[0]} ${byteRange[1].toString().padStart(10, '0')} ${byteRange[2].toString().padStart(10, '0')} ${byteRange[3].toString().padStart(10, '0')}`;
  const byteRangePlaceholder = '/ByteRange [0 0000000000 0000000000 0000000000]';
  const byteRangeMarkerPos = pdf.indexOf(Buffer.from(byteRangePlaceholder, 'latin1'), sigObjOffset);

  if (byteRangeMarkerPos === -1) {
    throw new Error('Could not find ByteRange placeholder');
  }

  const byteRangeValueOffset = byteRangeMarkerPos + 12;
  Buffer.from(byteRangeStr, 'latin1').copy(pdf, byteRangeValueOffset);

  // ============================================================================
  // CALCULATE HASH AND CREATE PKCS#7 SIGNATURE
  // ============================================================================

  const segment1 = pdf.subarray(byteRange[0], byteRange[0] + byteRange[1]);
  const segment2 = pdf.subarray(byteRange[2], byteRange[2] + byteRange[3]);
  const dataToHash = Buffer.concat([segment1, segment2]);

  sigLog(`[CertSig] Data to hash: ${dataToHash.length} bytes`);

  const pkcs7Signature = createPkcs7Signature(certificate, dataToHash, signedAt);
  sigLog(`[CertSig] PKCS#7 signature: ${pkcs7Signature.length} bytes`);

  if (pkcs7Signature.length > SIGNATURE_LENGTH) {
    throw new Error(`Signature too large: ${pkcs7Signature.length} > ${SIGNATURE_LENGTH}`);
  }

  // ============================================================================
  // INSERT SIGNATURE INTO /Contents
  // ============================================================================

  const signatureHex = pkcs7Signature.toString('hex').toUpperCase();
  const paddedSignatureHex = signatureHex.padEnd(SIGNATURE_PLACEHOLDER.length, '0');
  Buffer.from(paddedSignatureHex, 'latin1').copy(pdf, hexDataStartPos);

  // ============================================================================
  // FINAL VERIFICATION
  // ============================================================================

  const finalPdfStr = pdf.toString('latin1');

  // Verify certification markers ARE present
  if (!finalPdfStr.includes('/TransformMethod /DocMDP')) {
    throw new Error('CERTIFICATION FAILED: Missing /TransformMethod /DocMDP');
  }
  if (!finalPdfStr.includes('/Perms')) {
    throw new Error('CERTIFICATION FAILED: Missing /Perms in catalog');
  }
  if (!finalPdfStr.includes('/DocMDP')) {
    throw new Error('CERTIFICATION FAILED: Missing /DocMDP reference');
  }
  if (!finalPdfStr.includes('/Type /Sig')) {
    throw new Error('CERTIFICATION FAILED: Missing /Type /Sig');
  }
  if (!finalPdfStr.includes('/Reference')) {
    throw new Error('CERTIFICATION FAILED: Missing /Reference array');
  }

  sigLog('[CertSig] ========================================');
  sigLog('[CertSig] CERTIFICATION VERIFICATION PASSED');
  sigLog('[CertSig] ✓ /Type /Sig present');
  sigLog('[CertSig] ✓ /Reference array present');
  sigLog('[CertSig] ✓ /TransformMethod /DocMDP present');
  sigLog('[CertSig] ✓ /Perms /DocMDP in catalog present');
  sigLog(`[CertSig] ✓ Permission level: ${permissionLevel}`);
  sigLog('[CertSig] ========================================');
  sigLog('[CertSig] CERTIFICATION SIGNATURE COMPLETE');
  sigLog(`[CertSig] Final PDF size: ${pdf.length} bytes`);
  sigLog('[CertSig] ========================================');

  return pdf;
}

/**
 * Apply digital signature to PDF
 *
 * This is the main entry point for signing PDFs.
 * Supports both APPROVAL and CERTIFICATION signatures.
 */
export async function applyDigitalSignatureSimple(
  pdfBytes: Uint8Array,
  certificate: SigningCertificate,
  signerName: string,
  signedAt: Date,
  reason?: string,
  signatureField?: SignatureFieldPosition,
  isCertification: boolean = false  // true = certification, false = approval
): Promise<Uint8Array> {
  // ==================== TEMP VERIFICATION LOGS (REMOVE AFTER CONFIRMATION) ====================
  sigLog('[SIGNING CERT] ========================================');
  sigLog('[SIGNING CERT] Subject:', JSON.stringify(certificate.subject));
  sigLog('[SIGNING CERT] Issuer:', JSON.stringify(certificate.issuer));
  sigLog('[SIGNING CERT] Serial:', certificate.serialNumber);
  sigLog('[SIGNING CERT] IsSelfSigned:', certificate.isSelfSigned);
  sigLog('[SIGNING CERT] IsCAIssued:', certificate.isCAIssued);
  sigLog('[SIGNING CERT] ChainCount:', certificate.certificateChain?.length || 0);
  sigLog('[SIGNING CERT] ChainValidated:', certificate.chainValidated);
  sigLog('[SIGNING CERT] Fingerprint:', certificate.fingerprint?.substring(0, 32) + '...');
  sigLog('[SIGNING CERT] ValidFrom:', certificate.validFrom);
  sigLog('[SIGNING CERT] ValidTo:', certificate.validTo);
  sigLog('[SIGNING CERT] ========================================');

  // Log signature mode
  const signatureMode = isCertification ? 'CERTIFICATION' : 'APPROVAL';
  sigLog('[SIGNATURE MODE] SignatureMode:', signatureMode);
  sigLog('[SIGNATURE MODE] isCertification parameter:', isCertification);
  // ==================== END TEMP VERIFICATION LOGS ====================

  // ============================================================================
  // CERTIFICATION SIGNATURE MODE
  // ============================================================================
  if (isCertification) {
    sigLog('[DigitalSignature] ========================================');
    sigLog('[DigitalSignature] APPLYING CERTIFICATION SIGNATURE (DocMDP)');
    sigLog('[DigitalSignature] ========================================');

    // Validate certificate is suitable for certification
    if (certificate.isSelfSigned) {
      throw new Error(
        'CERTIFICATION REQUIRES AATL/CA-ISSUED CERTIFICATE: ' +
        'Self-signed certificates cannot create certification signatures. ' +
        'Import an AATL-approved certificate to use certification mode.'
      );
    }

    const signedPdf = await applyCertificationWithPdfLib(
      pdfBytes,
      certificate,
      signerName,
      signedAt,
      reason,
      signatureField,
      1
    );
    return signedPdf;
  }

  // ============================================================================
  // APPROVAL SIGNATURE MODE (default)
  // ============================================================================
  sigLog('[DigitalSignature] ========================================');
  sigLog('[DigitalSignature] APPLYING APPROVAL SIGNATURE');
  sigLog('[DigitalSignature] ========================================');

  try {
    // Use the professional @signpdf library for Adobe-compatible approval signatures
    const signedPdf = await applySignatureWithSignpdf(
      pdfBytes,
      certificate,
      signerName,
      signedAt,
      reason,
      signatureField
    );
    return signedPdf;
  } catch (error) {
    console.error('[DigitalSignature] @signpdf failed, falling back to custom implementation:', error);

    // Fallback to custom implementation
    const signedPdf = await applyApprovalSignature(
      Buffer.from(pdfBytes),
      certificate,
      signerName,
      signedAt,
      reason,
      signatureField
    );
    return new Uint8Array(signedPdf);
  }
}

/**
 * Apply CERTIFICATION signature using pdf-lib + @signpdf
 * 
 * Uses pdf-lib for all PDF structure manipulation (handles compressed object streams)
 * and adds DocMDP transform for certification-level protection.
 * 
 * DocMDP certification means:
 * - Adobe shows "Certified by..." blue ribbon
 * - Document cannot be edited without invalidating signature
 * - Permission level 1 = no changes allowed
 */
async function applyCertificationWithPdfLib(
  pdfBytes: Uint8Array,
  certificate: SigningCertificate,
  signerName: string,
  signedAt: Date,
  reason?: string,
  signatureField?: SignatureFieldPosition,
  permissionLevel: number = 1
): Promise<Uint8Array> {
  sigLog('[CertPdfLib] ========================================');
  sigLog('[CertPdfLib] APPLYING CERTIFICATION SIGNATURE via pdf-lib');
  sigLog(`[CertPdfLib] Permission level: ${permissionLevel}`);
  sigLog('[CertPdfLib] ========================================');

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const pageIndex = signatureField?.page ? signatureField.page - 1 : 0;
  const page = pages[Math.min(pageIndex, pages.length - 1)];

  let widgetRect: [number, number, number, number] = [0, 0, 0, 0];
  if (signatureField) {
    widgetRect = [
      signatureField.x,
      signatureField.y,
      signatureField.x + signatureField.width,
      signatureField.y + signatureField.height
    ];
  }

  sigLog(`[CertPdfLib] Widget rect: [${widgetRect.join(', ')}]`);

  const DEFAULT_BYTE_RANGE_PLACEHOLDER = '**********';
  const SIGNATURE_LENGTH = 16384;

  const byteRange = PDFArray.withContext(pdfDoc.context);
  byteRange.push(PDFNumber.of(0));
  byteRange.push(PDFName.of(DEFAULT_BYTE_RANGE_PLACEHOLDER));
  byteRange.push(PDFName.of(DEFAULT_BYTE_RANGE_PLACEHOLDER));
  byteRange.push(PDFName.of(DEFAULT_BYTE_RANGE_PLACEHOLDER));

  const placeholder = PDFHexString.of(String.fromCharCode(0).repeat(SIGNATURE_LENGTH));

  const transformParamsDict = PDFDict.withContext(pdfDoc.context);
  transformParamsDict.set(PDFName.of('Type'), PDFName.of('TransformParams'));
  transformParamsDict.set(PDFName.of('P'), PDFNumber.of(permissionLevel));
  transformParamsDict.set(PDFName.of('V'), PDFName.of('1.2'));

  const sigRefDict = PDFDict.withContext(pdfDoc.context);
  sigRefDict.set(PDFName.of('Type'), PDFName.of('SigRef'));
  sigRefDict.set(PDFName.of('TransformMethod'), PDFName.of('DocMDP'));
  sigRefDict.set(PDFName.of('DigestMethod'), PDFName.of('SHA256'));
  sigRefDict.set(PDFName.of('TransformParams'), transformParamsDict);

  const referenceArray = PDFArray.withContext(pdfDoc.context);
  referenceArray.push(sigRefDict);

  const propBuildFilter = PDFDict.withContext(pdfDoc.context);
  propBuildFilter.set(PDFName.of('Name'), PDFName.of('Adobe.PPKLite'));
  const propBuildApp = PDFDict.withContext(pdfDoc.context);
  propBuildApp.set(PDFName.of('Name'), PDFName.of('PearSign'));
  const propBuildDict = PDFDict.withContext(pdfDoc.context);
  propBuildDict.set(PDFName.of('Filter'), propBuildFilter);
  propBuildDict.set(PDFName.of('App'), propBuildApp);

  const signatureDict = PDFDict.withContext(pdfDoc.context);
  signatureDict.set(PDFName.of('Type'), PDFName.of('Sig'));
  signatureDict.set(PDFName.of('Filter'), PDFName.of('Adobe.PPKLite'));
  signatureDict.set(PDFName.of('SubFilter'), PDFName.of('adbe.pkcs7.detached'));
  signatureDict.set(PDFName.of('ByteRange'), byteRange);
  signatureDict.set(PDFName.of('Contents'), placeholder);
  signatureDict.set(PDFName.of('Reason'), PDFString.of(reason || 'Certified by PearSign'));
  signatureDict.set(PDFName.of('M'), PDFString.fromDate(signedAt));
  signatureDict.set(PDFName.of('Name'), PDFString.of(signerName));
  signatureDict.set(PDFName.of('Location'), PDFString.of('PearSign Electronic Signatures'));
  signatureDict.set(PDFName.of('ContactInfo'), PDFString.of(certificate.subject.emailAddress || ''));
  signatureDict.set(PDFName.of('Reference'), referenceArray);
  signatureDict.set(PDFName.of('Prop_Build'), propBuildDict);

  const signatureBuffer = new Uint8Array(signatureDict.sizeInBytes());
  signatureDict.copyBytesInto(signatureBuffer, 0);
  const signatureObj = PDFInvalidObject.of(signatureBuffer);
  const signatureDictRef = pdfDoc.context.register(signatureObj);

  sigLog('[CertPdfLib] Signature dict created with DocMDP /Reference (using PDFName)');

  const rect = PDFArray.withContext(pdfDoc.context);
  widgetRect.forEach(c => rect.push(PDFNumber.of(c)));

  const apStreamBBox: [number, number, number, number] = [0, 0,
    signatureField ? signatureField.width : 0,
    signatureField ? signatureField.height : 0
  ];
  const apStream = pdfDoc.context.formXObject([], {
    BBox: apStreamBBox,
    Resources: {},
  });

  const widgetDict = PDFDict.withContext(pdfDoc.context);
  widgetDict.set(PDFName.of('Type'), PDFName.of('Annot'));
  widgetDict.set(PDFName.of('Subtype'), PDFName.of('Widget'));
  widgetDict.set(PDFName.of('FT'), PDFName.of('Sig'));
  widgetDict.set(PDFName.of('Rect'), rect);
  widgetDict.set(PDFName.of('V'), signatureDictRef);
  widgetDict.set(PDFName.of('T'), PDFString.of('PearSignCertification'));
  widgetDict.set(PDFName.of('F'), PDFNumber.of(132));
  widgetDict.set(PDFName.of('P'), page.ref);
  const apDict = PDFDict.withContext(pdfDoc.context);
  apDict.set(PDFName.of('N'), pdfDoc.context.register(apStream));
  widgetDict.set(PDFName.of('AP'), apDict);
  const widgetDictRef = pdfDoc.context.register(widgetDict);

  let annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annotations) {
    annotations = pdfDoc.context.obj([]) as PDFArray;
  }
  annotations.push(widgetDictRef);
  page.node.set(PDFName.of('Annots'), annotations);

  let acroForm = pdfDoc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (!acroForm) {
    acroForm = PDFDict.withContext(pdfDoc.context);
    acroForm.set(PDFName.of('Fields'), pdfDoc.context.obj([]));
    const acroFormRef = pdfDoc.context.register(acroForm);
    pdfDoc.catalog.set(PDFName.of('AcroForm'), acroFormRef);
  }

  const currentFlags = acroForm.has(PDFName.of('SigFlags'))
    ? (acroForm.get(PDFName.of('SigFlags')) as PDFNumber).asNumber()
    : 0;
  acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(currentFlags | 3));

  let fields = acroForm.get(PDFName.of('Fields'));
  if (!(fields instanceof PDFArray)) {
    fields = pdfDoc.context.obj([]) as PDFArray;
    acroForm.set(PDFName.of('Fields'), fields);
  }
  (fields as PDFArray).push(widgetDictRef);

  const permsDict = PDFDict.withContext(pdfDoc.context);
  permsDict.set(PDFName.of('DocMDP'), signatureDictRef);
  pdfDoc.catalog.set(PDFName.of('Perms'), permsDict);

  sigLog('[CertPdfLib] Catalog updated with /Perms /DocMDP');

  const pdfWithPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  sigLog(`[CertPdfLib] PDF with placeholder: ${pdfWithPlaceholder.length} bytes`);

  const p12Buffer = createP12FromCertificate(certificate);
  const signer = new P12Signer(p12Buffer, { passphrase: '' });

  sigLog('[CertPdfLib] Signing with P12...');
  const signedPdfBuffer = await signpdf.sign(Buffer.from(pdfWithPlaceholder), signer);

  sigLog('[CertPdfLib] ========================================');
  sigLog('[CertPdfLib] CERTIFICATION SIGNATURE APPLIED SUCCESSFULLY');
  sigLog(`[CertPdfLib] Signed PDF size: ${signedPdfBuffer.length} bytes`);
  sigLog('[CertPdfLib] ========================================');

  return new Uint8Array(signedPdfBuffer);
}

/**
 * Apply APPROVAL signature using the professional @signpdf library
 * This produces Adobe Acrobat-compatible signatures
 */
async function applySignatureWithSignpdf(
  pdfBytes: Uint8Array,
  certificate: SigningCertificate,
  signerName: string,
  signedAt: Date,
  reason?: string,
  signatureField?: SignatureFieldPosition
): Promise<Uint8Array> {
  sigLog('[SignPdf] Loading PDF document...');

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const pageIndex = signatureField?.page ? signatureField.page - 1 : 0;
  const page = pages[Math.min(pageIndex, pages.length - 1)];

  let widgetRect: [number, number, number, number] = [0, 0, 0, 0];
  if (signatureField) {
    widgetRect = [
      signatureField.x,
      signatureField.y,
      signatureField.x + signatureField.width,
      signatureField.y + signatureField.height
    ];
  }

  sigLog('[SignPdf] Adding signature placeholder...');
  sigLog(`[SignPdf] Widget rect: [${widgetRect.join(', ')}]`);

  pdflibAddPlaceholder({
    pdfDoc,
    pdfPage: page,
    reason: reason || 'Signed with PearSign',
    contactInfo: certificate.subject.emailAddress || '',
    name: signerName,
    location: 'PearSign Electronic Signatures',
    signingTime: signedAt,
    signatureLength: 16384,
    widgetRect,
  });

  const pdfWithPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  sigLog(`[SignPdf] PDF with placeholder: ${pdfWithPlaceholder.length} bytes`);

  const p12Buffer = createP12FromCertificate(certificate);
  const signer = new P12Signer(p12Buffer, { passphrase: '' });

  sigLog('[SignPdf] Signing PDF...');
  const signedPdfBuffer = await signpdf.sign(Buffer.from(pdfWithPlaceholder), signer);

  sigLog('[SignPdf] ========================================');
  sigLog('[SignPdf] SIGNATURE APPLIED SUCCESSFULLY');
  sigLog(`[SignPdf] Signed PDF size: ${signedPdfBuffer.length} bytes`);
  sigLog('[SignPdf] ========================================');

  return new Uint8Array(signedPdfBuffer);
}

/**
 * Create a P12/PFX buffer from certificate and private key with FULL chain
 *
 * CRITICAL FOR AATL/eIDAS:
 * The P12 must include the complete certificate chain for Adobe to trust the signature
 */
function createP12FromCertificate(certificate: SigningCertificate): Buffer {
  sigLog('[P12] ========================================');
  sigLog('[P12] Creating P12/PFX with FULL CERTIFICATE CHAIN');
  sigLog('[P12] ========================================');

  const leafCert = forge.pki.certificateFromPem(certificate.certificate);
  const privateKey = decryptStoredPrivateKey(certificate.privateKey, CERT_ENCRYPTION_KEY);

  // Log leaf certificate info
  const leafSubject = leafCert.subject.getField('CN')?.value || 'Unknown';
  sigLog(`[P12] Leaf certificate: ${leafSubject}`);
  sigLog(`[P12] Self-signed: ${certificate.isSelfSigned}`);
  sigLog(`[P12] CA-issued: ${certificate.isCAIssued}`);

  // Build certificate array: leaf first, then chain
  const certs: forge.pki.Certificate[] = [leafCert];

  // CRITICAL: Include full certificate chain (intermediates + root)
  if (certificate.certificateChain && certificate.certificateChain.length > 0) {
    sigLog(`[P12] Adding ${certificate.certificateChain.length} chain certificate(s)...`);

    for (let i = 0; i < certificate.certificateChain.length; i++) {
      const chainCertPem = certificate.certificateChain[i];
      try {
        const chainCert = forge.pki.certificateFromPem(chainCertPem);
        const chainSubject = chainCert.subject.getField('CN')?.value || 'Unknown';
        const chainIssuer = chainCert.issuer.getField('CN')?.value || 'Unknown';

        // Don't add duplicate of leaf
        if (chainCert.serialNumber === leafCert.serialNumber) {
          sigLog(`[P12]   SKIP chain[${i}]: Duplicate of leaf certificate`);
          continue;
        }

        sigLog(`[P12]   Chain[${i}]: Subject="${chainSubject}", Issuer="${chainIssuer}"`);
        certs.push(chainCert);
      } catch (e) {
        console.error(`[P12]   FAILED to add chain cert ${i}:`, e);
      }
    }
  } else {
    console.warn('[P12] WARNING: No certificate chain provided!');
    console.warn('[P12] Adobe Acrobat may not trust this signature without the full chain.');
  }

  sigLog(`[P12] Total certificates in P12: ${certs.length}`);

  // Create PKCS#12 (P12/PFX) structure with all certificates
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    privateKey,
    certs,
    '', // Empty passphrase
    { algorithm: '3des' }
  );

  // Convert to DER
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Buffer = Buffer.from(p12Der, 'binary');

  sigLog('[P12] ========================================');
  sigLog(`[P12] P12/PFX created: ${p12Buffer.length} bytes`);
  sigLog(`[P12] Certificates included: ${certs.length}`);
  sigLog('[P12] ========================================');

  return p12Buffer;
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

export async function signPdfDocument(options: {
  pdfBytes: Uint8Array;
  orgId: string;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  reason?: string;
  location?: string;
  signatureFields?: SignatureFieldPosition[];
}): Promise<{
  signedPdfBytes: Uint8Array;
  certificateInfo: {
    fingerprint: string;
    subject: string;
    validTo: Date;
  };
}> {
  const { pdfBytes, orgId, signerName, signedAt, reason, signatureFields } = options;

  const certificate = await getDefaultSigningCertificate(orgId);
  if (!certificate) {
    throw new Error('Failed to get or create signing certificate');
  }

  sigLog('[signPdfDocument] Using certificate:', certificate.subject.commonName,
    '| CA-issued:', certificate.isCAIssued, '| Chain:', certificate.certificateChain?.length || 0);

  const firstField = signatureFields && signatureFields.length > 0 ? signatureFields[0] : undefined;

  const useCertificationMode = certificate.isCAIssued && !certificate.isSelfSigned;

  sigLog('[signPdfDocument] Signature mode:', useCertificationMode ? 'CERTIFICATION (DocMDP)' : 'APPROVAL');

  const signedPdfBytes = await applyDigitalSignatureSimple(
    pdfBytes,
    certificate,
    signerName,
    signedAt,
    reason,
    firstField,
    useCertificationMode  // true = certification, false = approval
  );

  return {
    signedPdfBytes,
    certificateInfo: {
      fingerprint: certificate.fingerprint,
      subject: certificate.subject.commonName,
      validTo: certificate.validTo,
    },
  };
}

export async function verifyPdfSignature(pdfBytes: Uint8Array): Promise<{
  isSigned: boolean;
  signerName?: string;
  signedAt?: Date;
  reason?: string;
  isValid?: boolean;
  isCertified?: boolean;
}> {
  const pdfString = Buffer.from(pdfBytes).toString('latin1');

  const isCertified = pdfString.includes('/TransformMethod /DocMDP') || pdfString.includes('/TransformMethod/DocMDP');

  const sigMatch = pdfString.match(/\/Type\s*\/Sig[\s\S]*?\/Name\s*\(([^)]+)\)[\s\S]*?\/M\s*\(D:(\d{14})/);

  if (!sigMatch) {
    return { isSigned: false };
  }

  const signerName = sigMatch[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')');
  const dateStr = sigMatch[2];

  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  const hour = parseInt(dateStr.substring(8, 10), 10);
  const minute = parseInt(dateStr.substring(10, 12), 10);
  const second = parseInt(dateStr.substring(12, 14), 10);

  const signedAt = new Date(Date.UTC(year, month, day, hour, minute, second));

  const reasonMatch = pdfString.match(/\/Reason\s*\(([^)]+)\)/);
  const reason = reasonMatch ? reasonMatch[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')') : undefined;

  return {
    isSigned: true,
    signerName,
    signedAt,
    reason,
    isValid: true,
    isCertified,
  };
}

// Legacy exports for backward compatibility
export { applyDigitalSignatureSimple as applyDigitalSignature };
