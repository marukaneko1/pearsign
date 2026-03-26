import { sql } from "@/lib/db";
import crypto from "crypto";

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

export type WebhookEventType =
  | "document.created"
  | "document.sent"
  | "document.viewed"
  | "document.signed"
  | "document.completed"
  | "document.voided"
  | "document.expired"
  | "document.declined"
  | "reminder.sent";

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: {
    envelopeId?: string;
    documentTitle?: string;
    signerEmail?: string;
    signerName?: string;
    status?: string;
    completedAt?: string;
    [key: string]: unknown;
  };
  extended?: {
    pdfBase64?: string;
    fieldValues?: Record<string, unknown>;
    auditTrail?: Array<{
      action: string;
      actor: string;
      timestamp: string;
      details?: string;
    }>;
  };
}

export interface PayloadOptions {
  includePdf: boolean;
  includeFieldValues: boolean;
  includeAuditTrail: boolean;
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Calculate delay for exponential backoff
 */
function calculateRetryDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelayMs
  );
  return delay + Math.random() * delay * 0.25;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a webhook to a single endpoint with retry logic
 */
async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<{ success: boolean; status?: number; body?: string; attempts: number }> {
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, secret);

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;
  let lastResponseBody = "";
  let attempts = 0;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    attempts = attempt + 1;

    try {
      if (attempt > 0) {
        const delay = calculateRetryDelay(attempt - 1);
        console.log(`[Webhook] Retry attempt ${attempt} for ${url}, waiting ${Math.round(delay)}ms`);
        await sleep(delay);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PearSign-Signature": signature,
          "X-PearSign-Event": payload.event,
          "X-PearSign-Timestamp": payload.timestamp,
          "X-PearSign-Retry-Attempt": String(attempt),
        },
        body: payloadString,
      });

      lastResponse = response;
      lastResponseBody = await response.text();

      if (response.ok) {
        await sql`
          INSERT INTO webhook_logs (webhook_id, event_type, payload, response_status, response_body, success)
          VALUES (
            ${webhookId},
            ${payload.event},
            ${JSON.stringify(payload)}::jsonb,
            ${response.status},
            ${lastResponseBody.substring(0, 1000)},
            true
          )
        `;

        await sql`
          UPDATE webhooks
          SET last_triggered_at = NOW(), last_status = 'success', failure_count = 0
          WHERE id = ${webhookId}
        `;

        console.log(`[Webhook] Successfully delivered to ${url} after ${attempts} attempt(s)`);
        return { success: true, status: response.status, body: lastResponseBody, attempts };
      }

      if (response.status >= 400 && response.status < 500) {
        console.log(`[Webhook] Client error ${response.status}, not retrying`);
        break;
      }

      console.log(`[Webhook] Server error ${response.status}, will retry`);

    } catch (error) {
      lastError = error as Error;
      console.error(`[Webhook] Network error on attempt ${attempt + 1}:`, error);
    }
  }

  console.error(`[Webhook] Delivery failed to ${url} after ${attempts} attempts`);

  await sql`
    INSERT INTO webhook_logs (webhook_id, event_type, payload, response_status, response_body, success)
    VALUES (
      ${webhookId},
      ${payload.event},
      ${JSON.stringify({ ...payload, _retryAttempts: attempts })}::jsonb,
      ${lastResponse?.status || 0},
      ${(lastError?.message || lastResponseBody).substring(0, 1000)},
      false
    )
  `;

  await sql`
    UPDATE webhooks
    SET last_triggered_at = NOW(), last_status = 'failed', failure_count = failure_count + 1
    WHERE id = ${webhookId}
  `;

  return {
    success: false,
    status: lastResponse?.status,
    body: lastError?.message || lastResponseBody,
    attempts
  };
}

/**
 * Fetch extended payload data based on options
 */
async function fetchExtendedPayload(
  envelopeId: string,
  options: PayloadOptions
): Promise<WebhookPayload["extended"]> {
  const extended: WebhookPayload["extended"] = {};

  try {
    if (options.includePdf || options.includeFieldValues) {
      const sessions = await sql`
        SELECT field_values, signed_pdf_data, signed_pdf_object_path FROM envelope_signing_sessions
        WHERE envelope_id = ${envelopeId} AND status = 'completed'
        ORDER BY signed_at DESC
        LIMIT 1
      `;

      if (sessions.length > 0) {
        if (options.includeFieldValues && sessions[0].field_values) {
          extended.fieldValues = sessions[0].field_values as Record<string, unknown>;
        }
        if (options.includePdf) {
          if (sessions[0].signed_pdf_object_path) {
            try {
              const { TenantObjectStorage } = await import('@/lib/object-storage');
              const { data } = await TenantObjectStorage.downloadBuffer(sessions[0].signed_pdf_object_path as string);
              extended.pdfBase64 = data.toString('base64');
            } catch {
              if (sessions[0].signed_pdf_data) {
                extended.pdfBase64 = sessions[0].signed_pdf_data as string;
              }
            }
          } else if (sessions[0].signed_pdf_data) {
            extended.pdfBase64 = sessions[0].signed_pdf_data as string;
          }
        }
      }
    }

    if (options.includeAuditTrail) {
      const auditLogs = await sql`
        SELECT action, actor_name, actor_email, created_at, details
        FROM audit_logs
        WHERE envelope_id = ${envelopeId}
        ORDER BY created_at ASC
        LIMIT 50
      `;

      extended.auditTrail = auditLogs.map((log) => ({
        action: log.action as string,
        actor: `${log.actor_name || 'System'} (${log.actor_email || ''})`.trim(),
        timestamp: (log.created_at as Date).toISOString(),
        details: log.details ? JSON.stringify(log.details) : undefined,
      }));
    }
  } catch (error) {
    console.error("[Webhook] Error fetching extended payload:", error);
  }

  return Object.keys(extended).length > 0 ? extended : undefined;
}

/**
 * Trigger all webhooks for an event
 */
export async function triggerWebhooks(
  eventType: WebhookEventType,
  data: WebhookPayload["data"],
  orgId: string
): Promise<void> {
  if (!orgId) {
    throw new Error('orgId is required');
  }
  const targetOrgId = orgId;
  try {
    const webhooks = await sql`
      SELECT id, url, secret, events, payload_options FROM webhooks
      WHERE org_id = ${targetOrgId}
        AND enabled = true
        AND ${eventType} = ANY(events)
        AND failure_count < 10
    `;

    await Promise.all(
      webhooks.map(async (webhook) => {
        const payload: WebhookPayload = {
          event: eventType,
          timestamp: new Date().toISOString(),
          data,
        };

        const options = (webhook.payload_options as PayloadOptions) || {
          includePdf: false,
          includeFieldValues: true,
          includeAuditTrail: false,
        };

        if (data.envelopeId && (options.includePdf || options.includeFieldValues || options.includeAuditTrail)) {
          const extended = await fetchExtendedPayload(data.envelopeId, options);
          if (extended) {
            payload.extended = extended;
          }
        }

        return deliverWebhook(
          webhook.id as string,
          webhook.url as string,
          webhook.secret as string,
          payload
        );
      })
    );

    console.log(`[Webhook] Triggered ${webhooks.length} webhooks for ${eventType}`);
  } catch (error) {
    console.error("[Webhook] Failed to trigger webhooks:", error);
  }
}

/**
 * Send a Slack notification
 */
export async function sendSlackNotification(
  webhookUrl: string,
  message: {
    title: string;
    text: string;
    color?: string;
    fields?: Array<{ title: string; value: string; short?: boolean }>;
  }
): Promise<boolean> {
  try {
    const slackPayload = {
      attachments: [
        {
          color: message.color || "#4CAF50",
          title: message.title,
          text: message.text,
          fields: message.fields?.map((f) => ({
            title: f.title,
            value: f.value,
            short: f.short ?? true,
          })),
          footer: "PearSign",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });

    return response.ok;
  } catch (error) {
    console.error("[Slack] Failed to send notification:", error);
    return false;
  }
}

/**
 * Notify connected integrations when a document is signed
 */
export async function notifyDocumentSigned(data: {
  envelopeId: string;
  documentTitle: string;
  signerEmail: string;
  signerName: string;
  orgId: string;
}): Promise<void> {
  if (!data.orgId) {
    throw new Error('orgId is required');
  }
  try {
    await triggerWebhooks("document.signed", data, data.orgId);

    const slackConfig = await sql`
      SELECT config FROM integration_configs
      WHERE org_id = ${data.orgId}
        AND integration_type = 'slack'
        AND enabled = true
    `;

    if (slackConfig.length > 0 && slackConfig[0].config?.webhookUrl) {
      await sendSlackNotification(slackConfig[0].config.webhookUrl as string, {
        title: "Document Signed",
        text: `${data.signerName} (${data.signerEmail}) has signed "${data.documentTitle}"`,
        color: "#4CAF50",
        fields: [
          { title: "Document", value: data.documentTitle },
          { title: "Signed by", value: data.signerName },
          { title: "Email", value: data.signerEmail },
        ],
      });
    }
  } catch (error) {
    console.error("[Notifications] Failed to notify document signed:", error);
  }
}

/**
 * Notify when a document is fully completed (all signatures collected)
 */
export async function notifyDocumentCompleted(data: {
  envelopeId: string;
  documentTitle: string;
  recipientCount: number;
  orgId: string;
}): Promise<void> {
  if (!data.orgId) {
    throw new Error('orgId is required');
  }
  try {
    await triggerWebhooks("document.completed", {
      ...data,
      status: "completed",
      completedAt: new Date().toISOString(),
    }, data.orgId);

    const slackConfig = await sql`
      SELECT config FROM integration_configs
      WHERE org_id = ${data.orgId}
        AND integration_type = 'slack'
        AND enabled = true
    `;

    if (slackConfig.length > 0 && slackConfig[0].config?.webhookUrl) {
      await sendSlackNotification(slackConfig[0].config.webhookUrl as string, {
        title: "Document Completed",
        text: `All ${data.recipientCount} recipient(s) have signed "${data.documentTitle}"`,
        color: "#2196F3",
        fields: [
          { title: "Document", value: data.documentTitle },
          { title: "Recipients", value: String(data.recipientCount) },
          { title: "Status", value: "Completed" },
        ],
      });
    }
  } catch (error) {
    console.error("[Notifications] Failed to notify document completed:", error);
  }
}

/**
 * Notify when a document is voided
 */
export async function notifyDocumentVoided(data: {
  envelopeId: string;
  documentTitle: string;
  reason: string;
  orgId: string;
}): Promise<void> {
  if (!data.orgId) {
    throw new Error('orgId is required');
  }
  const orgId = data.orgId;
  try {
    await triggerWebhooks("document.voided", data, orgId);

    const slackConfig = await sql`
      SELECT config FROM integration_configs
      WHERE org_id = ${orgId}
        AND integration_type = 'slack'
        AND enabled = true
    `;

    if (slackConfig.length > 0 && slackConfig[0].config?.webhookUrl) {
      await sendSlackNotification(slackConfig[0].config.webhookUrl as string, {
        title: "Document Voided",
        text: `Document "${data.documentTitle}" has been voided`,
        color: "#F44336",
        fields: [
          { title: "Document", value: data.documentTitle },
          { title: "Reason", value: data.reason || "No reason provided" },
        ],
      });
    }
  } catch (error) {
    console.error("[Notifications] Failed to notify document voided:", error);
  }
}

/**
 * Notify when a document is declined
 */
export async function notifyDocumentDeclined(data: {
  envelopeId: string;
  documentTitle: string;
  signerEmail: string;
  signerName: string;
  reason: string;
  orgId: string;
}): Promise<void> {
  if (!data.orgId) {
    throw new Error('orgId is required');
  }
  try {
    await triggerWebhooks("document.declined", {
      ...data,
      declinedAt: new Date().toISOString(),
    }, data.orgId);

    const slackConfig = await sql`
      SELECT config FROM integration_configs
      WHERE org_id = ${data.orgId}
        AND integration_type = 'slack'
        AND enabled = true
    `;

    if (slackConfig.length > 0 && slackConfig[0].config?.webhookUrl) {
      await sendSlackNotification(slackConfig[0].config.webhookUrl as string, {
        title: "Document Declined",
        text: `${data.signerName} has declined to sign "${data.documentTitle}"`,
        color: "#FF9800",
        fields: [
          { title: "Document", value: data.documentTitle },
          { title: "Declined by", value: data.signerName },
          { title: "Email", value: data.signerEmail },
          { title: "Reason", value: data.reason || "No reason provided" },
        ],
      });
    }
  } catch (error) {
    console.error("[Notifications] Failed to notify document declined:", error);
  }
}

/**
 * Notify when a document expires
 */
export async function notifyDocumentExpired(data: {
  envelopeId: string;
  documentTitle: string;
  expiredAt: string;
  recipientCount: number;
  orgId: string;
}): Promise<void> {
  if (!data.orgId) {
    throw new Error('orgId is required');
  }
  try {
    await triggerWebhooks("document.expired", data, data.orgId);

    const slackConfig = await sql`
      SELECT config FROM integration_configs
      WHERE org_id = ${data.orgId}
        AND integration_type = 'slack'
        AND enabled = true
    `;

    if (slackConfig.length > 0 && slackConfig[0].config?.webhookUrl) {
      await sendSlackNotification(slackConfig[0].config.webhookUrl as string, {
        title: "Document Expired",
        text: `Document "${data.documentTitle}" has expired without all signatures`,
        color: "#9E9E9E",
        fields: [
          { title: "Document", value: data.documentTitle },
          { title: "Expired At", value: new Date(data.expiredAt).toLocaleString() },
          { title: "Pending Recipients", value: String(data.recipientCount) },
        ],
      });
    }
  } catch (error) {
    console.error("[Notifications] Failed to notify document expired:", error);
  }
}
