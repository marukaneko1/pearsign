import { describe, it, expect } from 'vitest';
import {
  validateCreateInvoiceInput,
  validateUpdateInvoiceInput,
  isInvoiceEditable,
  isInvoiceVoidable,
} from '../invoices/validators';
import type { InvoiceStatus } from '../invoices/types';

describe('Invoice Validators', () => {
  describe('validateCreateInvoiceInput', () => {
    const validInput = {
      customer_name: 'Acme Corp',
      customer_email: 'acme@example.com',
      due_date: '2026-12-31',
      line_items: [
        { description: 'Consulting', quantity: 2, unit_price: 100, tax_rate: null },
      ],
    };

    it('passes with a valid input', () => {
      const result = validateCreateInvoiceInput(validInput);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails without customer_name', () => {
      const result = validateCreateInvoiceInput({ ...validInput, customer_name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => /customer name/i.test(e))).toBe(true);
    });

    it('fails with invalid customer_email', () => {
      const result = validateCreateInvoiceInput({ ...validInput, customer_email: 'not-an-email' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => /email/i.test(e))).toBe(true);
    });

    it('fails without due_date', () => {
      const result = validateCreateInvoiceInput({ ...validInput, due_date: '' });
      expect(result.valid).toBe(false);
    });

    it('fails with empty line_items', () => {
      const result = validateCreateInvoiceInput({ ...validInput, line_items: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => /line item/i.test(e))).toBe(true);
    });

    it('fails with negative quantity', () => {
      const result = validateCreateInvoiceInput({
        ...validInput,
        line_items: [{ description: 'Bad item', quantity: -1, unit_price: 100, tax_rate: null }],
      });
      expect(result.valid).toBe(false);
    });

    it('fails with negative unit_price', () => {
      const result = validateCreateInvoiceInput({
        ...validInput,
        line_items: [{ description: 'Bad item', quantity: 1, unit_price: -50, tax_rate: null }],
      });
      expect(result.valid).toBe(false);
    });

    it('accepts optional fields', () => {
      const result = validateCreateInvoiceInput({
        ...validInput,
        customer_phone: '+1-555-000-0000',
        memo: 'Thank you for your business',
        terms: 'Net 30',
        currency: 'EUR',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateUpdateInvoiceInput', () => {
    it('passes with valid partial update', () => {
      const result = validateUpdateInvoiceInput({ customer_name: 'New Corp' });
      expect(result.valid).toBe(true);
    });

    it('fails with invalid email in update', () => {
      const result = validateUpdateInvoiceInput({ customer_email: 'bad-email' });
      expect(result.valid).toBe(false);
    });

    it('passes with empty update object', () => {
      const result = validateUpdateInvoiceInput({});
      expect(result.valid).toBe(true);
    });
  });

  describe('isInvoiceEditable', () => {
    it('allows editing draft invoices', () => {
      expect(isInvoiceEditable('draft')).toBe(true);
    });

    it('prevents editing sent invoices', () => {
      expect(isInvoiceEditable('sent')).toBe(false);
    });

    it('prevents editing paid invoices', () => {
      expect(isInvoiceEditable('paid')).toBe(false);
    });

    it('prevents editing void invoices', () => {
      expect(isInvoiceEditable('void')).toBe(false);
    });
  });

  describe('isInvoiceVoidable', () => {
    const voidableStatuses: InvoiceStatus[] = ['draft', 'sent', 'viewed', 'signed', 'partially_paid', 'overdue'];
    const nonVoidableStatuses: InvoiceStatus[] = ['paid', 'void'];

    voidableStatuses.forEach(status => {
      it(`allows voiding ${status} invoices`, () => {
        expect(isInvoiceVoidable(status)).toBe(true);
      });
    });

    nonVoidableStatuses.forEach(status => {
      it(`prevents voiding ${status} invoices`, () => {
        expect(isInvoiceVoidable(status)).toBe(false);
      });
    });
  });
});
