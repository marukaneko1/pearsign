/**
 * Billing Notification Service
 *
 * Handles sending billing-related email notifications:
 * - Invoice ready
 * - Payment received
 * - Payment failed
 * - Subscription changes
 * - Usage warnings
 * - Trial ending reminders
 */

import { sql } from './db';
import {
  sendInvoiceReadyEmail,
  sendPaymentReceivedEmail,
  sendPaymentFailedEmail,
  sendSubscriptionUpdatedEmail,
  sendUsageWarningEmail,
  sendTrialEndingEmail,
} from './email-service';
import { TenantLimitsService, TenantRateLimiter, TenantPricingService } from './tenant-billing';

// ============== TYPES ==============

interface TenantContact {
  email: string;
  name: string;
  orgId: string;
  organizationName: string;
}

// ============== HELPER FUNCTIONS ==============

/**
 * Get billing contact for a tenant (owner or first admin)
 */
async function getBillingContact(orgId: string): Promise<TenantContact | null> {
  try {
    // Get tenant info and owner
    const result = await sql`
      SELECT
        t.id as org_id,
        t.name as org_name,
        COALESCE(up.email, tu.user_id) as email,
        COALESCE(up.first_name || ' ' || up.last_name, 'Account Owner') as name
      FROM tenants t
      JOIN tenant_users tu ON t.id = tu.tenant_id AND tu.role = 'owner' AND tu.status = 'active'
      LEFT JOIN user_profiles up ON tu.user_id = up.user_id
      WHERE t.id = ${orgId}
      LIMIT 1
    `;

    if (result.length === 0) {
      console.warn('[BillingNotifications] No billing contact found for tenant:', orgId);
      return null;
    }

    return {
      orgId: result[0].org_id,
      organizationName: result[0].org_name,
      email: result[0].email,
      name: result[0].name?.trim() || 'Account Owner',
    };
  } catch (error) {
    console.error('[BillingNotifications] Error getting billing contact:', error);
    return null;
  }
}

/**
 * Format currency amount
 */
function formatCurrency(cents: number, currency: string = 'usd'): string {
  const amount = cents / 100;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
  return formatter.format(amount);
}

/**
 * Format date
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============== NOTIFICATION SERVICE ==============

export const BillingNotificationService = {
  /**
   * Send invoice ready notification
   */
  async notifyInvoiceReady(data: {
    orgId: string;
    invoiceNumber: string;
    amount: number; // in cents
    currency?: string;
    dueDate: Date | string;
    invoiceUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const contact = await getBillingContact(data.orgId);
    if (!contact) {
      return { success: false, error: 'No billing contact found' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
    const billingPortalUrl = `${baseUrl}/settings?tab=billing`;

    const result = await sendInvoiceReadyEmail({
      orgId: data.orgId,
      organizationName: contact.organizationName,
      contactName: contact.name,
      contactEmail: contact.email,
      invoiceNumber: data.invoiceNumber,
      invoiceAmount: formatCurrency(data.amount, data.currency),
      invoiceDate: formatDate(new Date()),
      dueDate: formatDate(data.dueDate),
      invoiceUrl: data.invoiceUrl || billingPortalUrl,
      billingPortalUrl,
    });

    if (process.env.NODE_ENV !== 'production') console.log('[BillingNotifications] Invoice ready notification sent:', {
      orgId: data.orgId,
      invoiceNumber: data.invoiceNumber,
      success: result.success,
    });

    return result;
  },

  /**
   * Send payment received confirmation
   */
  async notifyPaymentReceived(data: {
    orgId: string;
    invoiceNumber: string;
    amount: number; // in cents
    currency?: string;
    paymentMethod: string; // e.g., "Visa ending in 4242"
    receiptUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const contact = await getBillingContact(data.orgId);
    if (!contact) {
      return { success: false, error: 'No billing contact found' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
    const billingPortalUrl = `${baseUrl}/settings?tab=billing`;

    const result = await sendPaymentReceivedEmail({
      orgId: data.orgId,
      organizationName: contact.organizationName,
      contactName: contact.name,
      contactEmail: contact.email,
      invoiceNumber: data.invoiceNumber,
      paymentAmount: formatCurrency(data.amount, data.currency),
      paymentDate: formatDate(new Date()),
      paymentMethod: data.paymentMethod,
      receiptUrl: data.receiptUrl || billingPortalUrl,
      billingPortalUrl,
    });

    if (process.env.NODE_ENV !== 'production') console.log('[BillingNotifications] Payment received notification sent:', {
      orgId: data.orgId,
      invoiceNumber: data.invoiceNumber,
      success: result.success,
    });

    return result;
  },

  /**
   * Send payment failed alert
   */
  async notifyPaymentFailed(data: {
    orgId: string;
    invoiceNumber: string;
    amount: number; // in cents
    currency?: string;
    failureReason: string;
    retryDate?: Date | string;
  }): Promise<{ success: boolean; error?: string }> {
    const contact = await getBillingContact(data.orgId);
    if (!contact) {
      return { success: false, error: 'No billing contact found' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
    const billingPortalUrl = `${baseUrl}/settings?tab=billing`;
    const updatePaymentUrl = `${baseUrl}/settings?tab=billing&action=update-payment`;

    // Default retry in 3 days if not specified
    const retryDate = data.retryDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const result = await sendPaymentFailedEmail({
      orgId: data.orgId,
      organizationName: contact.organizationName,
      contactName: contact.name,
      contactEmail: contact.email,
      invoiceNumber: data.invoiceNumber,
      invoiceAmount: formatCurrency(data.amount, data.currency),
      failureReason: data.failureReason,
      retryDate: formatDate(retryDate),
      updatePaymentUrl,
      billingPortalUrl,
    });

    if (process.env.NODE_ENV !== 'production') console.log('[BillingNotifications] Payment failed notification sent:', {
      orgId: data.orgId,
      invoiceNumber: data.invoiceNumber,
      success: result.success,
    });

    return result;
  },

  /**
   * Send subscription updated notification
   */
  async notifySubscriptionUpdated(data: {
    orgId: string;
    previousPlan: string;
    newPlan: string;
    effectiveDate?: Date | string;
    newFeatures?: string[];
  }): Promise<{ success: boolean; error?: string }> {
    const contact = await getBillingContact(data.orgId);
    if (!contact) {
      return { success: false, error: 'No billing contact found' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
    const billingPortalUrl = `${baseUrl}/settings?tab=billing`;

    const result = await sendSubscriptionUpdatedEmail({
      orgId: data.orgId,
      organizationName: contact.organizationName,
      contactName: contact.name,
      contactEmail: contact.email,
      previousPlan: data.previousPlan,
      newPlan: data.newPlan,
      effectiveDate: formatDate(data.effectiveDate || new Date()),
      newFeatures: data.newFeatures?.join(', '),
      billingPortalUrl,
    });

    if (process.env.NODE_ENV !== 'production') console.log('[BillingNotifications] Subscription updated notification sent:', {
      orgId: data.orgId,
      previousPlan: data.previousPlan,
      newPlan: data.newPlan,
      success: result.success,
    });

    return result;
  },

  /**
   * Send usage warning notification
   */
  async notifyUsageWarning(data: {
    orgId: string;
    resourceType: 'Envelopes' | 'API Calls' | 'SMS' | 'Storage' | 'Team Members';
    currentUsage: number;
    usageLimit: number;
  }): Promise<{ success: boolean; error?: string }> {
    const contact = await getBillingContact(data.orgId);
    if (!contact) {
      return { success: false, error: 'No billing contact found' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
    const upgradeUrl = `${baseUrl}/settings?tab=billing&action=upgrade`;

    const usagePercentage = Math.round((data.currentUsage / data.usageLimit) * 100);

    const result = await sendUsageWarningEmail({
      orgId: data.orgId,
      organizationName: contact.organizationName,
      contactName: contact.name,
      contactEmail: contact.email,
      resourceType: data.resourceType,
      currentUsage: String(data.currentUsage),
      usageLimit: String(data.usageLimit),
      usagePercentage,
      upgradeUrl,
    });

    if (process.env.NODE_ENV !== 'production') console.log('[BillingNotifications] Usage warning notification sent:', {
      orgId: data.orgId,
      resourceType: data.resourceType,
      usagePercentage,
      success: result.success,
    });

    return result;
  },

  /**
   * Send trial ending reminder
   */
  async notifyTrialEnding(data: {
    orgId: string;
    trialEndDate: Date | string;
    planName: string;
    planPrice: number; // in cents per month
    currency?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const contact = await getBillingContact(data.orgId);
    if (!contact) {
      return { success: false, error: 'No billing contact found' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
    const upgradeUrl = `${baseUrl}/settings?tab=billing&action=upgrade`;

    const trialEnd = typeof data.trialEndDate === 'string' ? new Date(data.trialEndDate) : data.trialEndDate;
    const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    const result = await sendTrialEndingEmail({
      orgId: data.orgId,
      organizationName: contact.organizationName,
      contactName: contact.name,
      contactEmail: contact.email,
      trialEndDate: formatDate(data.trialEndDate),
      daysRemaining,
      planName: data.planName,
      planPrice: formatCurrency(data.planPrice, data.currency),
      upgradeUrl,
    });

    if (process.env.NODE_ENV !== 'production') console.log('[BillingNotifications] Trial ending notification sent:', {
      orgId: data.orgId,
      daysRemaining,
      success: result.success,
    });

    return result;
  },

  /**
   * Check usage and send warnings if approaching limits
   * Call this periodically (e.g., daily cron job)
   */
  async checkAndNotifyUsageWarnings(orgId: string, thresholdPercent: number = 80): Promise<void> {
    try {
      const limits = await TenantLimitsService.getLimits(orgId);
      const usage = await TenantRateLimiter.getOrCreateUsageCounter(orgId);

      // Check envelopes
      if (limits.envelopesPerMonth > 0) {
        const percent = (usage.envelopesSent / limits.envelopesPerMonth) * 100;
        if (percent >= thresholdPercent) {
          await this.notifyUsageWarning({
            orgId,
            resourceType: 'Envelopes',
            currentUsage: usage.envelopesSent,
            usageLimit: limits.envelopesPerMonth,
          });
        }
      }

      // Check API calls
      if (limits.apiPerMonth > 0) {
        const percent = (usage.apiCalls / limits.apiPerMonth) * 100;
        if (percent >= thresholdPercent) {
          await this.notifyUsageWarning({
            orgId,
            resourceType: 'API Calls',
            currentUsage: usage.apiCalls,
            usageLimit: limits.apiPerMonth,
          });
        }
      }

      // Check SMS
      if (limits.smsPerMonth > 0) {
        const percent = (usage.smsSent / limits.smsPerMonth) * 100;
        if (percent >= thresholdPercent) {
          await this.notifyUsageWarning({
            orgId,
            resourceType: 'SMS',
            currentUsage: usage.smsSent,
            usageLimit: limits.smsPerMonth,
          });
        }
      }
    } catch (error) {
      console.error('[BillingNotifications] Error checking usage warnings:', error);
    }
  },

  /**
   * Check for trials ending soon and send reminders
   * Call this daily
   */
  async checkAndNotifyTrialEnding(daysBeforeEnd: number = 3): Promise<void> {
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysBeforeEnd);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      // Find tenants with trials ending on target date
      const trialsEnding = await sql`
        SELECT t.id, t.name, t.plan,
               (t.billing->>'currentPeriodEnd') as trial_end
        FROM tenants t
        WHERE t.billing->>'status' = 'trialing'
          AND DATE(t.billing->>'currentPeriodEnd') = ${targetDateStr}
      `;

      for (const tenant of trialsEnding) {
        await this.notifyTrialEnding({
          orgId: tenant.id,
          trialEndDate: tenant.trial_end,
          planName: tenant.plan || 'Professional',
          planPrice: 4900, // $49.00 default
        });
      }

      if (process.env.NODE_ENV !== 'production') console.log(`[BillingNotifications] Sent ${trialsEnding.length} trial ending notifications`);
    } catch (error) {
      console.error('[BillingNotifications] Error checking trial endings:', error);
    }
  },
};
