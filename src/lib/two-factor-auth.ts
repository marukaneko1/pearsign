/**
 * Two-Factor Authentication Service
 *
 * Implements TOTP-based 2FA with:
 * - Authenticator app support (Google Authenticator, Authy, etc.)
 * - Backup codes for account recovery
 * - Encrypted secret storage
 * - Enforcement for admin/billing/API access
 */

import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import crypto from 'crypto';
import { sql } from './db';

// ============== CONFIGURATION ==============

const TOTP_ISSUER = 'PearSign';
const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'SHA1';
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;

// Encryption key from environment (32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.CERT_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-dev-key-32-bytes-long!!';

// ============== TYPES ==============

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
  lastVerifiedAt: string | null;
}

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  manualEntryCode: string;
}

export interface BackupCodes {
  codes: string[];
  generatedAt: string;
}

// ============== DATABASE ==============

export async function initializeTwoFactorTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS two_factor_auth (
      user_id TEXT PRIMARY KEY,
      secret_encrypted TEXT NOT NULL,
      enabled BOOLEAN DEFAULT FALSE,
      enabled_at TIMESTAMP WITH TIME ZONE,
      backup_codes_encrypted TEXT,
      backup_codes_used JSONB DEFAULT '[]',
      last_verified_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_two_factor_user_enabled
    ON two_factor_auth(user_id, enabled)
  `;

  console.log('[TwoFactorAuth] Table initialized');
}

// ============== ENCRYPTION ==============

function getEncryptionKey(): Buffer {
  // Ensure key is exactly 32 bytes for AES-256
  const hash = crypto.createHash('sha256');
  hash.update(ENCRYPTION_KEY);
  return hash.digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============== BACKUP CODES ==============

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(BACKUP_CODE_LENGTH / 2).toString('hex').toUpperCase();
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

// ============== TOTP OPERATIONS ==============

/**
 * Generate a new TOTP secret for a user
 */
export async function generateTwoFactorSecret(userId: string, userEmail: string): Promise<TwoFactorSetup> {
  // Generate a random secret
  const secret = new Secret({ size: 20 });

  // Create TOTP instance
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: userEmail,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: secret,
  });

  // Generate QR code URL
  const otpauthUrl = totp.toString();
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  // Encrypt and store the secret (but don't enable 2FA yet)
  const secretEncrypted = encrypt(secret.base32);

  await sql`
    INSERT INTO two_factor_auth (user_id, secret_encrypted, enabled)
    VALUES (${userId}, ${secretEncrypted}, FALSE)
    ON CONFLICT (user_id) DO UPDATE SET
      secret_encrypted = EXCLUDED.secret_encrypted,
      enabled = FALSE,
      updated_at = NOW()
  `;

  return {
    secret: secret.base32,
    qrCodeUrl,
    manualEntryCode: secret.base32,
  };
}

/**
 * Verify a TOTP token and enable 2FA if valid
 */
export async function verifyAndEnableTwoFactor(
  userId: string,
  token: string
): Promise<{ success: boolean; backupCodes?: string[] }> {
  // Get the stored secret
  const result = await sql`
    SELECT secret_encrypted, enabled
    FROM two_factor_auth
    WHERE user_id = ${userId}
  `;

  if (result.length === 0) {
    return { success: false };
  }

  const { secret_encrypted, enabled } = result[0];

  // Don't allow re-enabling if already enabled
  if (enabled) {
    return { success: false };
  }

  // Decrypt the secret
  const secretBase32 = decrypt(secret_encrypted);
  const secret = Secret.fromBase32(secretBase32);

  // Create TOTP and verify
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: '',
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: secret,
  });

  // Validate token (with some time window tolerance)
  const delta = totp.validate({ token, window: 1 });

  if (delta === null) {
    return { success: false };
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes();
  const backupCodesEncrypted = encrypt(JSON.stringify(backupCodes));

  // Enable 2FA
  await sql`
    UPDATE two_factor_auth
    SET
      enabled = TRUE,
      enabled_at = NOW(),
      backup_codes_encrypted = ${backupCodesEncrypted},
      backup_codes_used = '[]'::jsonb,
      last_verified_at = NOW(),
      updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  return { success: true, backupCodes };
}

/**
 * Verify a TOTP token for login
 */
export async function verifyTwoFactorToken(userId: string, token: string): Promise<boolean> {
  const result = await sql`
    SELECT secret_encrypted, enabled, backup_codes_encrypted, backup_codes_used
    FROM two_factor_auth
    WHERE user_id = ${userId} AND enabled = TRUE
  `;

  if (result.length === 0) {
    return false;
  }

  const { secret_encrypted, backup_codes_encrypted, backup_codes_used } = result[0];

  // First, try to verify as TOTP
  const secretBase32 = decrypt(secret_encrypted);
  const secret = Secret.fromBase32(secretBase32);

  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: '',
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: secret,
  });

  const delta = totp.validate({ token, window: 1 });

  if (delta !== null) {
    // Update last verified
    await sql`
      UPDATE two_factor_auth
      SET last_verified_at = NOW()
      WHERE user_id = ${userId}
    `;
    return true;
  }

  // If not a valid TOTP, check if it's a backup code
  if (backup_codes_encrypted) {
    const backupCodes = JSON.parse(decrypt(backup_codes_encrypted)) as string[];
    const usedCodes = (backup_codes_used as string[]) || [];

    // Normalize the token (remove dashes, uppercase)
    const normalizedToken = token.replace(/-/g, '').toUpperCase();

    const matchingCode = backupCodes.find(code => {
      const normalizedCode = code.replace(/-/g, '').toUpperCase();
      return normalizedCode === normalizedToken && !usedCodes.includes(code);
    });

    if (matchingCode) {
      // Mark backup code as used
      await sql`
        UPDATE two_factor_auth
        SET
          backup_codes_used = backup_codes_used || ${JSON.stringify([matchingCode])}::jsonb,
          last_verified_at = NOW(),
          updated_at = NOW()
        WHERE user_id = ${userId}
      `;
      return true;
    }
  }

  return false;
}

/**
 * Disable 2FA for a user
 */
export async function disableTwoFactor(userId: string, token: string): Promise<boolean> {
  // First verify the token
  const isValid = await verifyTwoFactorToken(userId, token);

  if (!isValid) {
    return false;
  }

  await sql`
    UPDATE two_factor_auth
    SET
      enabled = FALSE,
      enabled_at = NULL,
      backup_codes_encrypted = NULL,
      backup_codes_used = '[]'::jsonb,
      updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  return true;
}

/**
 * Get 2FA status for a user
 */
export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const result = await sql`
    SELECT enabled, enabled_at, backup_codes_encrypted, backup_codes_used, last_verified_at
    FROM two_factor_auth
    WHERE user_id = ${userId}
  `;

  if (result.length === 0 || !result[0].enabled) {
    return {
      enabled: false,
      enabledAt: null,
      backupCodesRemaining: 0,
      lastVerifiedAt: null,
    };
  }

  const { enabled, enabled_at, backup_codes_encrypted, backup_codes_used, last_verified_at } = result[0];

  let backupCodesRemaining = 0;
  if (backup_codes_encrypted) {
    try {
      const backupCodes = JSON.parse(decrypt(backup_codes_encrypted)) as string[];
      const usedCodes = (backup_codes_used as string[]) || [];
      backupCodesRemaining = backupCodes.filter(code => !usedCodes.includes(code)).length;
    } catch {
      backupCodesRemaining = 0;
    }
  }

  return {
    enabled: Boolean(enabled),
    enabledAt: enabled_at ? new Date(enabled_at).toISOString() : null,
    backupCodesRemaining,
    lastVerifiedAt: last_verified_at ? new Date(last_verified_at).toISOString() : null,
  };
}

/**
 * Regenerate backup codes
 */
export async function regenerateBackupCodes(userId: string, token: string): Promise<string[] | null> {
  // Verify the token first
  const isValid = await verifyTwoFactorToken(userId, token);

  if (!isValid) {
    return null;
  }

  const backupCodes = generateBackupCodes();
  const backupCodesEncrypted = encrypt(JSON.stringify(backupCodes));

  await sql`
    UPDATE two_factor_auth
    SET
      backup_codes_encrypted = ${backupCodesEncrypted},
      backup_codes_used = '[]'::jsonb,
      updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  return backupCodes;
}

/**
 * Check if 2FA is required for a specific action
 */
export function isTwoFactorRequiredForAction(action: string, userRole: string): boolean {
  const protectedActions = [
    'billing:manage',
    'api_keys:create',
    'api_keys:delete',
    'admin:access',
    'settings:security',
    'team:invite',
    'team:remove',
  ];

  const protectedRoles = ['admin', 'billing'];

  // Admin and billing roles require 2FA for all sensitive actions
  if (protectedRoles.includes(userRole) && protectedActions.includes(action)) {
    return true;
  }

  return false;
}

/**
 * Check if a user has 2FA enabled
 */
export async function is2FAEnabled(userId: string): Promise<boolean> {
  const status = await getTwoFactorStatus(userId);
  return status.enabled;
}

/**
 * Enforce 2FA verification for a sensitive action
 * Returns { required: false } if 2FA is not enabled for this user
 * Returns { required: true, verified: false } if 2FA is required but not verified
 * Returns { required: true, verified: true } if 2FA is required and verified
 */
export async function enforce2FA(
  userId: string,
  token?: string
): Promise<{ required: boolean; verified: boolean; error?: string }> {
  const status = await getTwoFactorStatus(userId);

  // If 2FA is not enabled, no enforcement needed
  if (!status.enabled) {
    return { required: false, verified: false };
  }

  // 2FA is enabled - verification required
  if (!token) {
    return { required: true, verified: false, error: '2FA verification required' };
  }

  // Verify the token
  const isValid = await verifyTwoFactorToken(userId, token);
  if (!isValid) {
    return { required: true, verified: false, error: 'Invalid 2FA code' };
  }

  return { required: true, verified: true };
}
