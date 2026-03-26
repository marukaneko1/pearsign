/**
 * Environment Variable Validation
 *
 * Validates that required environment variables are set.
 * Call this at startup to fail fast if config is missing.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  // Core - Required
  { name: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string' },

  // Email - Required for production
  { name: 'SENDGRID_API_KEY', required: false, description: 'SendGrid API key for emails' },
  { name: 'SENDGRID_FROM_EMAIL', required: false, description: 'From email address' },

  // Security
  { name: 'ADMIN_SECRET_KEY', required: false, description: 'Admin dashboard access key' },
  { name: 'CERT_ENCRYPTION_KEY', required: false, description: 'Certificate encryption key' },

  // Optional integrations
  { name: 'TWILIO_ACCOUNT_SID', required: false, description: 'Twilio for SMS' },
  { name: 'STRIPE_SECRET_KEY', required: false, description: 'Stripe for payments' },
  { name: 'GOOGLE_CLIENT_ID', required: false, description: 'Google Drive integration' },
  { name: 'DROPBOX_CLIENT_ID', required: false, description: 'Dropbox integration' },
  { name: 'SALESFORCE_CLIENT_ID', required: false, description: 'Salesforce integration' },
];

interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnvironment(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value || value.trim() === '') {
      if (envVar.required) {
        missing.push(`${envVar.name} - ${envVar.description}`);
      } else if (isProduction()) {
        // Warn about recommended vars in production
        if (['SENDGRID_API_KEY', 'ADMIN_SECRET_KEY', 'CERT_ENCRYPTION_KEY'].includes(envVar.name)) {
          warnings.push(`${envVar.name} is recommended for production`);
        }
      }
    }
  }

  // Check for insecure defaults
  if (process.env.ADMIN_SECRET_KEY === 'pearsign-admin-2024') {
    warnings.push('ADMIN_SECRET_KEY is using the default value. Generate a secure random string for production.');
  }

  if (process.env.CERT_ENCRYPTION_KEY === 'pearsign-cert-key-2024') {
    warnings.push('CERT_ENCRYPTION_KEY is using the default value. Generate a secure random string for production.');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Get environment variable with fallback
 */
export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value;
}

/**
 * Get optional environment variable
 */
export function getOptionalEnv(name: string, fallback: string = ''): string {
  return process.env[name] || fallback;
}

/**
 * Check if a feature is enabled based on env vars
 */
export function isFeatureEnabled(feature: string): boolean {
  switch (feature) {
    case 'email':
      return !!process.env.SENDGRID_API_KEY;
    case 'sms':
      return !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
    case 'payments':
      return !!process.env.STRIPE_SECRET_KEY;
    case 'google-drive':
      return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
    case 'dropbox':
      return !!process.env.DROPBOX_CLIENT_ID && !!process.env.DROPBOX_CLIENT_SECRET;
    case 'salesforce':
      return !!process.env.SALESFORCE_CLIENT_ID && !!process.env.SALESFORCE_CLIENT_SECRET;
    default:
      return false;
  }
}

/**
 * Log environment status (for debugging)
 */
export function logEnvironmentStatus(): void {
  const result = validateEnvironment();

  console.log('\n=== PearSign Environment Status ===');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`App URL: ${process.env.NEXT_PUBLIC_APP_URL || 'not set'}`);
  console.log(`Database: ${process.env.DATABASE_URL ? '✓ configured' : '✗ missing'}`);
  console.log(`Email: ${isFeatureEnabled('email') ? '✓ enabled' : '○ disabled'}`);
  console.log(`SMS: ${isFeatureEnabled('sms') ? '✓ enabled' : '○ disabled'}`);
  console.log(`Payments: ${isFeatureEnabled('payments') ? '✓ enabled' : '○ disabled'}`);

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }

  if (!result.valid) {
    console.log('\nMissing required variables:');
    result.missing.forEach(m => console.log(`  ✗ ${m}`));
  }

  console.log('===================================\n');
}
