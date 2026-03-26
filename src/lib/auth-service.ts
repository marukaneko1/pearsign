/**
 * Authentication Service
 *
 * Handles user authentication with:
 * - Password hashing using Web Crypto API (bcrypt-like)
 * - User registration and login
 * - Email verification
 * - Password reset
 * - Integration with tenant sessions
 * - Secure password verification
 */

import { sql } from './db';
import { createTenantSession, initializeSessionTable } from './tenant-session';
import type { UserRole } from './tenant';

// ============== TYPES ==============

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  emailVerified: boolean;
  emailVerificationToken?: string;
  lastLoginAt?: string;
}

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
  };
  tenant?: {
    id: string;
    name: string;
    plan: string;
    role: UserRole;
  };
  error?: string;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

// ============== PASSWORD HASHING ==============

/**
 * Hash a password using PBKDF2 (Web Crypto API compatible)
 * This is a secure, modern alternative to bcrypt that works in Edge environments
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Combine salt and hash, encode as base64
  const combined = new Uint8Array(salt.length + new Uint8Array(hash).length);
  combined.set(salt);
  combined.set(new Uint8Array(hash), salt.length);

  return `pbkdf2:${btoa(String.fromCharCode(...combined))}`;
}

/**
 * Verify a password against a stored hash
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith('pbkdf2:')) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const combined = Uint8Array.from(atob(storedHash.slice(7)), c => c.charCodeAt(0));

    // Extract salt (first 16 bytes) and stored hash
    const salt = combined.slice(0, 16);
    const originalHash = combined.slice(16);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const newHash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    // Compare hashes
    const newHashArray = new Uint8Array(newHash);
    if (newHashArray.length !== originalHash.length) return false;

    let result = 0;
    for (let i = 0; i < newHashArray.length; i++) {
      result |= newHashArray[i] ^ originalHash[i];
    }

    return result === 0;
  } catch (error) {
    console.error('[Auth] Password verification error:', error);
    return false;
  }
}

/**
 * Generate a secure random token
 */
function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues, v => chars[v % chars.length]).join('');
}

// ============== DATABASE INITIALIZATION ==============

export async function initializeAuthTables(): Promise<void> {
  // Create auth_users table
  await sql`
    CREATE TABLE IF NOT EXISTS auth_users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      email_verified BOOLEAN DEFAULT false,
      email_verification_token VARCHAR(255),
      email_verification_sent_at TIMESTAMP WITH TIME ZONE,
      last_login_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Create index for email lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email)
  `;

  // Create password reset tokens table
  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Create index for token lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)
  `;

  console.log('[AuthService] Tables initialized');
}

// ============== AUTH SERVICE ==============

export const AuthService = {
  /**
   * Register a new user
   */
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    skipEmailVerification?: boolean;
  }): Promise<{ user: AuthUser; userId: string; verificationToken?: string }> {
    await initializeAuthTables();

    // Check if email already exists
    const existing = await sql`
      SELECT id FROM auth_users WHERE email = ${data.email.toLowerCase()}
    `;

    if (existing.length > 0) {
      throw new Error('An account with this email already exists');
    }

    // Validate password
    if (data.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Generate user ID and verification token
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const verificationToken = data.skipEmailVerification ? null : generateToken(48);

    // Create user
    const result = await sql`
      INSERT INTO auth_users (
        id, email, password_hash, first_name, last_name,
        email_verified, email_verification_token, email_verification_sent_at
      )
      VALUES (
        ${userId},
        ${data.email.toLowerCase()},
        ${passwordHash},
        ${data.firstName},
        ${data.lastName},
        ${data.skipEmailVerification || false},
        ${verificationToken},
        ${verificationToken ? new Date().toISOString() : null}
      )
      RETURNING *
    `;

    const user = mapUserFromDb(result[0]);

    console.log('[AuthService] User registered:', data.email);

    return {
      user,
      userId,
      verificationToken: verificationToken || undefined
    };
  },

  /**
   * Login user with email and password
   */
  async login(email: string, password: string): Promise<LoginResult> {
    await initializeAuthTables();

    const normalizedEmail = email.toLowerCase().trim();

    const result = await sql`
      SELECT * FROM auth_users WHERE LOWER(TRIM(email)) = ${normalizedEmail}
    `;

    if (result.length === 0) {
      return { success: false, error: 'Invalid email or password' };
    }

    const user = mapUserFromDb(result[0]);

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return { success: false, error: 'Invalid email or password' };
    }

    if (!user.emailVerified) {
      return { success: false, error: 'Please verify your email address before logging in. Check your inbox for the verification link.' };
    }

    // Update last login
    await sql`
      UPDATE auth_users SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = ${user.id}
    `;

    // Find user's tenant memberships
    const tenantMemberships = await sql`
      SELECT tu.*, t.name as tenant_name, t.plan as tenant_plan, t.status as tenant_status
      FROM tenant_users tu
      JOIN tenants t ON tu.tenant_id = t.id
      WHERE tu.user_id = ${user.id} AND tu.status = 'active' AND t.status = 'active'
      ORDER BY tu.joined_at DESC
      LIMIT 1
    `;

    let tenant = undefined;

    if (tenantMemberships.length > 0) {
      // User has a tenant - use it
      const membership = tenantMemberships[0];
      tenant = {
        id: membership.tenant_id,
        name: membership.tenant_name,
        plan: membership.tenant_plan,
        role: membership.role as UserRole,
      };

      console.log('[AuthService] Found tenant membership:', {
        tenantId: tenant.id,
        tenantName: tenant.name,
        role: tenant.role,
        userEmail: user.email,
      });

      // Create tenant session
      try {
        await initializeSessionTable();
        await createTenantSession({
          userId: user.id,
          tenantId: tenant.id,
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`.trim(),
          role: tenant.role,
        });
        console.log('[AuthService] Created tenant session for:', user.email);
      } catch (sessionError) {
        console.error('[AuthService] Failed to create tenant session:', sessionError);
        throw new Error(`Failed to create session: ${sessionError instanceof Error ? sessionError.message : 'Unknown error'}`);
      }
    } else {
      // CRITICAL: User has no tenant - create one for them (legacy user fix)
      // This ensures every user has their own isolated workspace
      console.log('[AuthService] User has no tenant, creating one:', user.email);

      const { TenantService, ROLE_PERMISSIONS } = await import('./tenant');

      const tenantName = `${user.firstName}'s Workspace`;
      const baseSlug = tenantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);

      const existingTenant = await TenantService.getTenantBySlug(baseSlug);
      const finalSlug = existingTenant ? `${baseSlug}-${Date.now()}` : baseSlug;

      const newTenant = await TenantService.createTenant({
        name: tenantName,
        slug: finalSlug,
        ownerId: user.id,
        ownerEmail: user.email,
        plan: 'free',
      });

      tenant = {
        id: newTenant.id,
        name: newTenant.name,
        plan: newTenant.plan,
        role: 'owner' as UserRole,
      };

      // Create tenant session
      await initializeSessionTable();
      await createTenantSession({
        userId: user.id,
        tenantId: tenant.id,
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`.trim(),
        role: 'owner',
      });

      console.log('[AuthService] Created tenant for legacy user:', user.email, '->', newTenant.name);
    }

    console.log('[AuthService] User logged in:', email);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
      tenant,
    };
  },

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
    await initializeAuthTables();

    // Find user with this verification token
    const result = await sql`
      SELECT * FROM auth_users WHERE email_verification_token = ${token}
    `;

    if (result.length === 0) {
      return { success: false, error: 'Invalid or expired verification link' };
    }

    const user = result[0];

    // Check if already verified
    if (user.email_verified) {
      return { success: false, error: 'Email already verified' };
    }

    // Mark as verified
    await sql`
      UPDATE auth_users
      SET email_verified = true,
          email_verification_token = NULL,
          updated_at = NOW()
      WHERE id = ${user.id}
    `;

    console.log('[AuthService] Email verified:', user.email);

    return { success: true };
  },

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string): Promise<{ success: boolean; token?: string; error?: string }> {
    await initializeAuthTables();

    const result = await sql`
      SELECT * FROM auth_users WHERE email = ${email.toLowerCase()}
    `;

    if (result.length === 0) {
      // Don't reveal if email exists
      return { success: true };
    }

    const user = result[0];

    if (user.email_verified) {
      return { success: false, error: 'Email already verified' };
    }

    // Generate new token
    const verificationToken = generateToken(48);

    await sql`
      UPDATE auth_users
      SET email_verification_token = ${verificationToken},
          email_verification_sent_at = NOW(),
          updated_at = NOW()
      WHERE id = ${user.id}
    `;

    console.log('[AuthService] Verification email resent:', email);

    return { success: true, token: verificationToken };
  },

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; token?: string; userId?: string }> {
    await initializeAuthTables();

    const result = await sql`
      SELECT * FROM auth_users WHERE email = ${email.toLowerCase()}
    `;

    if (result.length === 0) {
      // Don't reveal if email exists - return success anyway
      return { success: true };
    }

    const user = result[0];

    // Invalidate any existing tokens
    await sql`
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = ${user.id} AND used_at IS NULL
    `;

    // Generate new token
    const token = generateToken(48);
    const tokenId = `prt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await sql`
      INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
      VALUES (${tokenId}, ${user.id}, ${token}, ${expiresAt})
    `;

    console.log('[AuthService] Password reset requested:', email);

    return {
      success: true,
      token,
      userId: user.id
    };
  },

  /**
   * Validate password reset token
   */
  async validateResetToken(token: string): Promise<{ valid: boolean; email?: string; error?: string }> {
    await initializeAuthTables();

    const result = await sql`
      SELECT prt.*, au.email
      FROM password_reset_tokens prt
      JOIN auth_users au ON prt.user_id = au.id
      WHERE prt.token = ${token}
    `;

    if (result.length === 0) {
      return { valid: false, error: 'Invalid reset link' };
    }

    const tokenData = result[0];

    if (tokenData.used_at) {
      return { valid: false, error: 'This reset link has already been used' };
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return { valid: false, error: 'This reset link has expired' };
    }

    return { valid: true, email: tokenData.email };
  },

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    await initializeAuthTables();

    if (newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    // Validate token
    const tokenResult = await sql`
      SELECT prt.*, au.email
      FROM password_reset_tokens prt
      JOIN auth_users au ON prt.user_id = au.id
      WHERE prt.token = ${token}
    `;

    if (tokenResult.length === 0) {
      return { success: false, error: 'Invalid reset link' };
    }

    const tokenData = tokenResult[0];

    if (tokenData.used_at) {
      return { success: false, error: 'This reset link has already been used' };
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return { success: false, error: 'This reset link has expired' };
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await sql`
      UPDATE auth_users
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${tokenData.user_id}
    `;

    // Mark token as used
    await sql`
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = ${tokenData.id}
    `;

    console.log('[AuthService] Password reset completed:', tokenData.email);

    return { success: true };
  },

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<AuthUser | null> {
    const result = await sql`
      SELECT * FROM auth_users WHERE id = ${userId}
    `;

    if (result.length === 0) return null;
    return mapUserFromDb(result[0]);
  },

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<AuthUser | null> {
    const result = await sql`
      SELECT * FROM auth_users WHERE email = ${email.toLowerCase()}
    `;

    if (result.length === 0) return null;
    return mapUserFromDb(result[0]);
  },

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const passwordHash = await hashPassword(newPassword);

    await sql`
      UPDATE auth_users SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${userId}
    `;
  },

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: {
    firstName?: string;
    lastName?: string;
  }): Promise<void> {
    if (data.firstName !== undefined) {
      await sql`UPDATE auth_users SET first_name = ${data.firstName}, updated_at = NOW() WHERE id = ${userId}`;
    }
    if (data.lastName !== undefined) {
      await sql`UPDATE auth_users SET last_name = ${data.lastName}, updated_at = NOW() WHERE id = ${userId}`;
    }
  },

  /**
   * Link existing user to tenant (for invite acceptance)
   */
  async linkUserToTenant(userId: string, tenantId: string, role: UserRole = 'member'): Promise<void> {
    const { ROLE_PERMISSIONS } = await import('./tenant');
    const permissions = ROLE_PERMISSIONS[role];

    await sql`
      INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at, permissions)
      VALUES (${tenantId}, ${userId}, ${role}, 'active', NOW(), ${JSON.stringify(permissions)})
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = 'active',
        permissions = EXCLUDED.permissions,
        updated_at = NOW()
    `;
  },
};

// ============== HELPER FUNCTIONS ==============

function mapUserFromDb(row: Record<string, unknown>): AuthUser {
  return {
    id: row.id as string,
    email: row.email as string,
    firstName: (row.first_name as string) || '',
    lastName: (row.last_name as string) || '',
    passwordHash: row.password_hash as string,
    emailVerified: row.email_verified as boolean,
    emailVerificationToken: row.email_verification_token as string | undefined,
    lastLoginAt: row.last_login_at ? (row.last_login_at as Date).toISOString() : undefined,
    createdAt: row.created_at ? (row.created_at as Date).toISOString() : '',
    updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : '',
  };
}
