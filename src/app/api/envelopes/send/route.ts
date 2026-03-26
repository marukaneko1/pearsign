import { NextRequest, NextResponse } from 'next/server';
import { onEnvelopeSent } from '@/lib/notifications';
import { logEnvelopeEvent } from '@/lib/audit-log';
import { sql } from '@/lib/db';
import { sendSignatureRequestEmail } from '@/lib/email-service';
import { withTenant, TenantApiContext, checkAndIncrementEnvelopeUsage, logTenantAction } from '@/lib/tenant-middleware';
import { TenantObjectStorage } from '@/lib/object-storage';

// Ensure signing sessions table exists with 2FA columns
async function ensureSigningTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS envelope_signing_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      envelope_id VARCHAR(255) NOT NULL,
      token VARCHAR(255) UNIQUE NOT NULL,
      recipient_name VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      field_values JSONB DEFAULT '{}',
      signature_data TEXT,
      ip_address VARCHAR(100),
      user_agent TEXT,
      viewed_at TIMESTAMP,
      signed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      two_fa_required BOOLEAN DEFAULT false,
      two_fa_phone VARCHAR(50),
      two_fa_verified BOOLEAN DEFAULT false,
      two_fa_verified_at TIMESTAMP
    )
  `;

  // Add 2FA columns if they don't exist (for existing tables)
  try {
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_required BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_phone VARCHAR(50)`;
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_verified BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_verified_at TIMESTAMP`;
  } catch {
    // Columns may already exist
  }
}

// Ensure envelope documents table exists
async function ensureDocumentsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS envelope_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      envelope_id VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      pdf_data TEXT,
      pdf_object_path TEXT,
      signature_fields JSONB DEFAULT '[]',
      message TEXT,
      is_demo BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  try {
    await sql`ALTER TABLE envelope_documents ADD COLUMN IF NOT EXISTS pdf_object_path TEXT`;
  } catch {}
}

interface SignatureField {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  recipientId: string;
  required: boolean;
}

interface SendEnvelopeRequest {
  title: string;
  recipients: Array<{
    name: string;
    email: string;
    role: 'signer' | 'cc';
    require2FA?: boolean;
    phoneNumber?: string;
  }>;
  message?: string;
  expirationDays?: number;
  enableReminders?: boolean;
  pdfBase64?: string;
  signatureFields?: SignatureField[];
  orgId?: string;
  userId?: string;
  userName?: string;
}

/**
 * POST /api/envelopes/send
 * Send an envelope and create notifications
 *
 * Multi-tenancy enforced:
 * - Requires authentication
 * - Checks envelope sending permission
 * - Enforces monthly envelope limits based on plan
 * - Increments usage counter on success
 */
export const POST = withTenant(
  async (request: NextRequest, { context, tenantId, userId }: TenantApiContext) => {
    try {
      const body: SendEnvelopeRequest = await request.json();

      if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] Request received:", {
        title: body.title,
        recipientCount: body.recipients?.length,
        tenantId,
        userId,
        plan: context.tenant.plan,
      });

      // Check and increment envelope usage BEFORE sending
      const usageCheck = await checkAndIncrementEnvelopeUsage(tenantId);
      if (!usageCheck.allowed) {
        if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] Limit exceeded for tenant:", tenantId);
        return NextResponse.json(
          {
            success: false,
            error: 'LimitExceeded',
            message: `You've reached your monthly limit of ${context.features.maxEnvelopesPerMonth} documents. Upgrade your plan to send more.`,
            limit: context.features.maxEnvelopesPerMonth,
            remaining: 0,
            upgradeRequired: true,
          },
          { status: 429 }
        );
      }

      const orgId = tenantId; // Use tenantId as orgId for consistency
      const userName = context.user.name || 'User';

      // Generate envelope ID
      const envelopeId = `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Count signers (excluding CC recipients)
      const signerCount = body.recipients.filter(r => r.role === 'signer').length;
      const twoFACount = body.recipients.filter(r => r.role === 'signer' && r.require2FA).length;
      if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] Signers count:", signerCount, "with 2FA:", twoFACount);

      // Log the envelope creation audit event
      await logEnvelopeEvent('envelope.created', {
        orgId,
        envelopeId,
        envelopeTitle: body.title,
        actorId: userId,
        actorName: userName,
        details: {
          tenantId,
          plan: context.tenant.plan,
          recipientCount: body.recipients.length,
          signerCount,
          twoFACount,
          recipients: body.recipients.map(r => ({
            name: r.name,
            email: r.email,
            role: r.role,
            require2FA: r.require2FA,
          })),
          expirationDays: body.expirationDays,
          enableReminders: body.enableReminders,
        },
      });

      // Store the document and signature fields
      await ensureDocumentsTable();

      if (body.pdfBase64) {
        if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] Storing PDF document, size:", body.pdfBase64.length);

        let pdfObjectPath: string | null = null;
        try {
          let base64Data = body.pdfBase64;
          if (base64Data.startsWith('data:')) {
            base64Data = base64Data.split(',')[1];
          }
          const pdfBuffer = Buffer.from(base64Data, 'base64');
          const result = await TenantObjectStorage.uploadBuffer(
            orgId,
            `${envelopeId}.pdf`,
            pdfBuffer,
            'application/pdf',
            'documents'
          );
          pdfObjectPath = result.objectPath;
          if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] PDF stored in Object Storage:", pdfObjectPath);
        } catch (storageErr) {
          console.warn("[Envelope Send] Object Storage failed, falling back to DB:", storageErr);
        }

        await sql`
          INSERT INTO envelope_documents (org_id, envelope_id, title, pdf_data, pdf_object_path, signature_fields, message)
          VALUES (
            ${orgId},
            ${envelopeId},
            ${body.title},
            ${pdfObjectPath ? null : body.pdfBase64},
            ${pdfObjectPath},
            ${JSON.stringify(body.signatureFields || [])}::jsonb,
            ${body.message || ''}
          )
        `;
      }

      // Send signature request emails to all signers
      const origin = request.headers.get('origin');
      const referer = request.headers.get('referer');
      const host = request.headers.get('host') || 'localhost:3000';
      const forwardedHost = request.headers.get('x-forwarded-host');
      const protocol = request.headers.get('x-forwarded-proto') || 'https';

      let baseUrl: string;
      if (process.env.NEXT_PUBLIC_APP_URL) {
        baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      } else if (origin) {
        baseUrl = origin;
      } else if (referer) {
        try {
          const refererUrl = new URL(referer);
          baseUrl = refererUrl.origin;
        } catch {
          baseUrl = `${protocol}://${forwardedHost || host}`;
        }
      } else {
        baseUrl = `${protocol}://${forwardedHost || host}`;
      }

      if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] URL detection - baseUrl:", baseUrl);

      const emailResults: Array<{ email: string; success: boolean; error?: string }> = [];

      // Ensure signing sessions table exists
      await ensureSigningTable();

      for (const recipient of body.recipients.filter(r => r.role === 'signer')) {
        const signingToken = `${envelopeId}_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
        const signingUrl = `${baseUrl}/sign/${signingToken}`;

        if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] Sending to:", recipient.email, "2FA:", recipient.require2FA);

        // Calculate expiration timestamp
        const expiresAt = body.expirationDays
          ? new Date(Date.now() + body.expirationDays * 24 * 60 * 60 * 1000)
          : null;

        // Store signing session in database with 2FA settings
        await sql`
          INSERT INTO envelope_signing_sessions (
            org_id, envelope_id, token, recipient_name, recipient_email, status, expires_at,
            two_fa_required, two_fa_phone
          ) VALUES (
            ${orgId},
            ${envelopeId},
            ${signingToken},
            ${recipient.name},
            ${recipient.email},
            'pending',
            ${expiresAt},
            ${recipient.require2FA || false},
            ${recipient.phoneNumber || null}
          )
        `;

        // Calculate expiration date if provided
        let expirationDate: string | undefined;
        if (body.expirationDays) {
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + body.expirationDays);
          expirationDate = expDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }

        const emailResult = await sendSignatureRequestEmail({
          documentName: body.title,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          senderName: userName,
          senderEmail: process.env.SENDGRID_FROM_EMAIL || 'no-reply@premiumcapital.com',
          message: body.message,
          signingUrl,
          expirationDate,
          orgId, // TENANT ISOLATION: Pass orgId for proper credential lookup
        });

        emailResults.push({
          email: recipient.email,
          success: emailResult.success,
          error: emailResult.error,
        });

        // Log individual email send
        await logEnvelopeEvent('envelope.sent', {
          orgId,
          envelopeId,
          envelopeTitle: body.title,
          actorId: userId,
          recipientEmail: recipient.email,
          details: {
            emailSent: emailResult.success,
            error: emailResult.error,
            require2FA: recipient.require2FA,
          },
        });
      }

      if (process.env.NODE_ENV !== 'production') console.log("[Envelope Send] All email results:", emailResults);

      // Create the "envelope sent" notification
      const notification = await onEnvelopeSent({
        orgId,
        senderId: userId,
        senderName: userName,
        envelopeId,
        envelopeTitle: body.title,
        recipientCount: signerCount,
      });

      // Log tenant action for audit
      await logTenantAction(
        context,
        'document.sent',
        'envelope',
        envelopeId,
        {
          title: body.title,
          recipientCount: signerCount,
          remaining: usageCheck.remaining,
        }
      );

      // Return success response
      return NextResponse.json({
        success: true,
        data: {
          id: envelopeId,
          title: body.title,
          status: 'in_signing',
          recipients: body.recipients,
          createdAt: new Date().toISOString(),
          emailResults,
          notification: {
            id: notification.id,
            title: notification.title,
          },
          // Include usage info
          usage: {
            remaining: usageCheck.remaining,
            limit: context.features.maxEnvelopesPerMonth,
          },
        },
      });
    } catch (error) {
      console.error('[Envelope Send] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to send envelope' },
        { status: 500 }
      );
    }
  },
  {
    // Require document sending permission
    requiredPermissions: ['canSendDocuments'],
  }
);
