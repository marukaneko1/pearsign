/**
 * Invoicing & Payments Module - Payment Processors
 *
 * Pluggable adapter pattern for payment processors.
 * Key principle: Link-out payment system - we facilitate payments, we don't process them.
 * No payment card data ever touches our system.
 */

import type {
  PaymentProcessor,
  ProcessorType,
} from '../types';

import { StripeProcessor } from './stripe-processor';
import { SquareProcessor } from './square-processor';
import { AuthorizeNetProcessor } from './authorize-net-processor';
import { CustomUrlProcessor } from './custom-url-processor';

// Re-export from base-processor
export {
  BasePaymentProcessor,
  generatePaymentToken,
  verifyPaymentToken,
} from './base-processor';

// ============================================================================
// Processor Factory
// ============================================================================

export function getPaymentProcessor(type: ProcessorType): PaymentProcessor {
  switch (type) {
    case 'stripe':
      return new StripeProcessor();
    case 'square':
      return new SquareProcessor();
    case 'authorize_net':
      return new AuthorizeNetProcessor();
    case 'custom':
      return new CustomUrlProcessor();
    default:
      throw new Error(`Unknown processor type: ${type}`);
  }
}

export function getAllProcessorTypes(): ProcessorType[] {
  return ['stripe', 'square', 'authorize_net', 'custom'];
}

export function getProcessorDisplayInfo(type: ProcessorType): {
  name: string;
  description: string;
  icon: string;
} {
  switch (type) {
    case 'stripe':
      return {
        name: 'Stripe',
        description: 'Accept payments via Stripe Payment Links',
        icon: 'stripe',
      };
    case 'square':
      return {
        name: 'Square',
        description: 'Accept payments via Square Checkout',
        icon: 'square',
      };
    case 'authorize_net':
      return {
        name: 'Authorize.Net',
        description: 'Accept payments via Authorize.Net Accept Hosted',
        icon: 'authorize',
      };
    case 'custom':
      return {
        name: 'Custom URL',
        description: 'Redirect to your own payment page',
        icon: 'link',
      };
  }
}

// Re-export individual processors
export { StripeProcessor } from './stripe-processor';
export { SquareProcessor } from './square-processor';
export { AuthorizeNetProcessor } from './authorize-net-processor';
export { CustomUrlProcessor } from './custom-url-processor';
