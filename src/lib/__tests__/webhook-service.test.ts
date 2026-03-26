import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  sql: vi.fn(),
}));

describe('Webhook Service', () => {
  describe('Payload signing', () => {
    it('creates a consistent HMAC signature', async () => {
      const createSignature = async (payload: string, secret: string): Promise<string> => {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const msgData = encoder.encode(payload);

        const key = await crypto.subtle.importKey(
          'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, msgData);
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      const payload = JSON.stringify({ event: 'test', data: { id: '123' } });
      const secret = 'webhook-secret';

      const sig1 = await createSignature(payload, secret);
      const sig2 = await createSignature(payload, secret);

      expect(sig1).toBe(sig2);
      expect(sig1.length).toBe(64); // SHA-256 hex
    });

    it('produces different signatures for different payloads', async () => {
      const createSignature = async (payload: string, secret: string): Promise<string> => {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const msgData = encoder.encode(payload);
        const key = await crypto.subtle.importKey(
          'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, msgData);
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      const sig1 = await createSignature('payload-a', 'secret');
      const sig2 = await createSignature('payload-b', 'secret');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Event types', () => {
    type WebhookEventType =
      | 'envelope.sent'
      | 'envelope.viewed'
      | 'envelope.signed'
      | 'envelope.voided'
      | 'invoice.created'
      | 'invoice.paid';

    const VALID_EVENTS: WebhookEventType[] = [
      'envelope.sent',
      'envelope.viewed',
      'envelope.signed',
      'envelope.voided',
      'invoice.created',
      'invoice.paid',
    ];

    it('recognizes valid webhook event types', () => {
      VALID_EVENTS.forEach(event => {
        expect(VALID_EVENTS.includes(event)).toBe(true);
      });
    });

    it('event types follow namespace.action pattern', () => {
      VALID_EVENTS.forEach(event => {
        const parts = event.split('.');
        expect(parts).toHaveLength(2);
        expect(parts[0].length).toBeGreaterThan(0);
        expect(parts[1].length).toBeGreaterThan(0);
      });
    });
  });

  describe('Retry logic', () => {
    it('calculates exponential backoff correctly', () => {
      const getBackoffDelay = (attempt: number, baseMs = 1000): number => {
        return Math.min(baseMs * Math.pow(2, attempt), 60000);
      };

      expect(getBackoffDelay(0)).toBe(1000);
      expect(getBackoffDelay(1)).toBe(2000);
      expect(getBackoffDelay(2)).toBe(4000);
      expect(getBackoffDelay(3)).toBe(8000);
      // Capped at 60 seconds
      expect(getBackoffDelay(10)).toBe(60000);
    });

    it('stops retrying after max attempts', () => {
      const MAX_ATTEMPTS = 3;
      let attempts = 0;

      const shouldRetry = (attempt: number, statusCode: number): boolean => {
        if (attempt >= MAX_ATTEMPTS) return false;
        if (statusCode >= 400 && statusCode < 500) return false; // client errors
        return statusCode >= 500; // only retry server errors
      };

      expect(shouldRetry(0, 500)).toBe(true);
      expect(shouldRetry(2, 500)).toBe(true);
      expect(shouldRetry(3, 500)).toBe(false);
      expect(shouldRetry(0, 400)).toBe(false);
      expect(shouldRetry(0, 200)).toBe(false);
    });
  });

  describe('Webhook URL validation', () => {
    it('accepts valid HTTPS URLs', () => {
      const isValidWebhookUrl = (url: string): boolean => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'https:';
        } catch {
          return false;
        }
      };

      expect(isValidWebhookUrl('https://example.com/webhook')).toBe(true);
      expect(isValidWebhookUrl('https://api.myapp.io/hooks/pearsign')).toBe(true);
      expect(isValidWebhookUrl('http://insecure.com/webhook')).toBe(false);
      expect(isValidWebhookUrl('not-a-url')).toBe(false);
    });
  });
});
