import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({
  sql: vi.fn(),
}));

describe('Fusion Forms', () => {
  describe('Access code validation', () => {
    const isValidAccessCode = (code: string): boolean => {
      return typeof code === 'string' && code.length >= 6 && /^[a-zA-Z0-9_-]+$/.test(code);
    };

    it('accepts valid access codes', () => {
      expect(isValidAccessCode('abc123')).toBe(true);
      expect(isValidAccessCode('my-form-code')).toBe(true);
      expect(isValidAccessCode('FORM_2024')).toBe(true);
    });

    it('rejects short access codes', () => {
      expect(isValidAccessCode('ab')).toBe(false);
      expect(isValidAccessCode('')).toBe(false);
    });

    it('rejects codes with special characters', () => {
      expect(isValidAccessCode('form@code')).toBe(false);
      expect(isValidAccessCode('form code')).toBe(false);
    });
  });

  describe('Form expiry', () => {
    const isFormExpired = (expiresAt: Date | null): boolean => {
      if (!expiresAt) return false;
      return expiresAt < new Date();
    };

    it('returns false for non-expiring forms', () => {
      expect(isFormExpired(null)).toBe(false);
    });

    it('detects expired forms', () => {
      const past = new Date(Date.now() - 86400000); // 1 day ago
      expect(isFormExpired(past)).toBe(true);
    });

    it('accepts future expiry dates', () => {
      const future = new Date(Date.now() + 86400000); // 1 day from now
      expect(isFormExpired(future)).toBe(false);
    });
  });

  describe('Form field schema validation', () => {
    interface FormField {
      id: string;
      type: 'text' | 'email' | 'phone' | 'signature' | 'checkbox' | 'select';
      label: string;
      required: boolean;
    }

    const validateFormField = (field: Partial<FormField>): string[] => {
      const errors: string[] = [];
      if (!field.id) errors.push('Field ID is required');
      if (!field.type) errors.push('Field type is required');
      if (!field.label?.trim()) errors.push('Field label is required');
      return errors;
    };

    it('accepts a valid form field', () => {
      const errors = validateFormField({
        id: 'field_1',
        type: 'text',
        label: 'Full Name',
        required: true,
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects a field missing required properties', () => {
      const errors = validateFormField({ label: 'Name' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => /id/i.test(e))).toBe(true);
      expect(errors.some(e => /type/i.test(e))).toBe(true);
    });
  });

  describe('Submission data validation', () => {
    interface FormField {
      id: string;
      required: boolean;
    }

    const validateSubmission = (
      fields: FormField[],
      data: Record<string, unknown>
    ): { valid: boolean; missing: string[] } => {
      const missing = fields
        .filter(f => f.required && (data[f.id] === undefined || data[f.id] === ''))
        .map(f => f.id);

      return { valid: missing.length === 0, missing };
    };

    it('passes when all required fields are filled', () => {
      const fields: FormField[] = [
        { id: 'name', required: true },
        { id: 'email', required: true },
        { id: 'notes', required: false },
      ];
      const result = validateSubmission(fields, { name: 'John', email: 'j@example.com' });
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('fails when required fields are missing', () => {
      const fields: FormField[] = [
        { id: 'name', required: true },
        { id: 'email', required: true },
      ];
      const result = validateSubmission(fields, { name: 'John' });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('email');
    });
  });
});
