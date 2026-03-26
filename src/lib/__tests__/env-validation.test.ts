import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateEnvironment, isFeatureEnabled, getEnv, getOptionalEnv } from '../env-validation';

describe('Environment Validation', () => {
  beforeEach(() => {
    // Reset env vars before each test
    vi.unstubAllEnvs();
  });

  describe('validateEnvironment', () => {
    it('should pass with required vars set', () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');

      const result = validateEnvironment();
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should fail without DATABASE_URL', () => {
      vi.stubEnv('DATABASE_URL', '');

      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.missing.some(m => m.includes('DATABASE_URL'))).toBe(true);
    });

    it('should warn about default security keys', () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');
      vi.stubEnv('ADMIN_SECRET_KEY', 'pearsign-admin-2024');

      const result = validateEnvironment();
      expect(result.warnings.some(w => w.includes('ADMIN_SECRET_KEY'))).toBe(true);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true for email when SendGrid is configured', () => {
      vi.stubEnv('SENDGRID_API_KEY', 'SG.test');
      expect(isFeatureEnabled('email')).toBe(true);
    });

    it('should return false for email when SendGrid is not configured', () => {
      vi.stubEnv('SENDGRID_API_KEY', '');
      expect(isFeatureEnabled('email')).toBe(false);
    });

    it('should return true for SMS when Twilio is fully configured', () => {
      vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
      vi.stubEnv('TWILIO_AUTH_TOKEN', 'token123');
      expect(isFeatureEnabled('sms')).toBe(true);
    });

    it('should return false for SMS when Twilio is partially configured', () => {
      vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
      vi.stubEnv('TWILIO_AUTH_TOKEN', '');
      expect(isFeatureEnabled('sms')).toBe(false);
    });
  });

  describe('getEnv', () => {
    it('should return env value when set', () => {
      vi.stubEnv('TEST_VAR', 'test-value');
      expect(getEnv('TEST_VAR')).toBe('test-value');
    });

    it('should return fallback when env not set', () => {
      vi.stubEnv('TEST_VAR', '');
      expect(getEnv('TEST_VAR', 'fallback')).toBe('fallback');
    });

    it('should throw when required env not set and no fallback', () => {
      vi.stubEnv('REQUIRED_VAR', '');
      expect(() => getEnv('REQUIRED_VAR')).toThrow();
    });
  });

  describe('getOptionalEnv', () => {
    it('should return env value when set', () => {
      vi.stubEnv('OPTIONAL_VAR', 'optional-value');
      expect(getOptionalEnv('OPTIONAL_VAR')).toBe('optional-value');
    });

    it('should return empty string when not set', () => {
      vi.stubEnv('OPTIONAL_VAR', '');
      expect(getOptionalEnv('OPTIONAL_VAR')).toBe('');
    });

    it('should return custom fallback when not set', () => {
      vi.stubEnv('OPTIONAL_VAR', '');
      expect(getOptionalEnv('OPTIONAL_VAR', 'default')).toBe('default');
    });
  });
});
