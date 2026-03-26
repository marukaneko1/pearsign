/**
 * Envelopes API
 * List and manage envelopes (documents sent for signature)
 *
 * Multi-tenancy enforced via withTenant middleware
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext, checkAndIncrementEnvelopeUsage } from "@/lib/tenant-middleware";
import { getCurrentTenantId } from "@/lib/tenant-session";

interface EnvelopeRow {
  envelope_id: string;
  title: string;
  message: string;
  created_at: string;
  recipient_count: string;
  completed_count: string;
  viewed_count: string;
  pending_count: string;
  voided_count: string;
  declined_count: string;
  recipients: string; // JSON string
}

interface SigningSession {
  name: string;
  email: string;
  status: string;
  viewed_at: string | null;
  signed_at: string | null;
}

// GET - List all envelopes for the tenant
export const GET = withTenant(async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // CRITICAL: Use the session's tenant ID for strict isolation
    // If no tenant session exists, try to get from middleware context
    const sessionTenantId = await getCurrentTenantId();
    const effectiveTenantId = sessionTenantId || tenantId;

    if (process.env.NODE_ENV !== 'production') console.log('[Envelopes API] Fetching for tenant:', effectiveTenantId, 'Session tenant:', sessionTenantId);

    // Query envelopes by joining documents and signing sessions
    // CRITICAL: Always filter by the effective tenant ID for proper isolation
    const envelopes = await sql`
      SELECT
        d.envelope_id,
        d.title,
        d.message,
        d.created_at,
        COUNT(s.id) as recipient_count,
        COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN s.status = 'viewed' THEN 1 END) as viewed_count,
        COUNT(CASE WHEN s.status IN ('pending', 'sent') THEN 1 END) as pending_count,
        COUNT(CASE WHEN s.status = 'voided' THEN 1 END) as voided_count,
        COUNT(CASE WHEN s.status = 'declined' THEN 1 END) as declined_count,
        COALESCE(
          json_agg(
            json_build_object(
              'name', s.recipient_name,
              'email', s.recipient_email,
              'status', s.status,
              'viewed_at', s.viewed_at,
              'signed_at', s.signed_at
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) as recipients
      FROM envelope_documents d
      LEFT JOIN envelope_signing_sessions s ON d.envelope_id = s.envelope_id
      WHERE d.org_id = ${effectiveTenantId}
      GROUP BY d.envelope_id, d.title, d.message, d.created_at
      ORDER BY d.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Transform the data into the expected format
    const formattedEnvelopes = (envelopes as unknown as EnvelopeRow[]).map((env) => {
      const recipientCount = parseInt(env.recipient_count) || 0;
      const completedCount = parseInt(env.completed_count) || 0;
      const viewedCount = parseInt(env.viewed_count) || 0;
      const pendingCount = parseInt(env.pending_count) || 0;
      const voidedCount = parseInt(env.voided_count) || 0;
      const declinedCount = parseInt(env.declined_count) || 0;

      // Determine envelope status based on signing sessions
      // Priority: completed > viewed > in_signing > voided > draft
      let envelopeStatus: 'draft' | 'in_signing' | 'viewed' | 'completed' | 'voided' | 'expired' | 'declined' = 'in_signing';

      if (recipientCount === 0) {
        envelopeStatus = 'draft';
      } else if (completedCount === recipientCount && recipientCount > 0) {
        // All recipients have signed
        envelopeStatus = 'completed';
      } else if (voidedCount === recipientCount) {
        // All recipients are voided
        envelopeStatus = 'voided';
      } else if (declinedCount > 0) {
        // At least one recipient declined
        envelopeStatus = 'declined';
      } else if (viewedCount > 0 || completedCount > 0) {
        // At least one recipient has viewed (or completed)
        envelopeStatus = 'viewed';
      } else if (pendingCount > 0) {
        // Documents sent but not yet viewed
        envelopeStatus = 'in_signing';
      } else if (pendingCount === 0 && completedCount === 0) {
        envelopeStatus = 'draft';
      }

      // Parse recipients JSON
      let recipients: SigningSession[] = [];
      try {
        if (typeof env.recipients === 'string') {
          recipients = JSON.parse(env.recipients);
        } else if (Array.isArray(env.recipients)) {
          recipients = env.recipients;
        }
      } catch {
        recipients = [];
      }

      // Filter by status if specified
      if (status && envelopeStatus !== status) {
        return null;
      }

      return {
        id: env.envelope_id,
        title: env.title,
        description: env.message || '',
        status: envelopeStatus,
        signingOrder: 'sequential',
        organizationId: tenantId,
        createdBy: context.user.id,
        recipients: recipients.map((r, index) => {
          // Map recipient status to user-friendly labels
          let recipientStatus: 'signed' | 'viewed' | 'sent' | 'pending' | 'declined' | 'expired' = 'sent';
          if (r.status === 'completed') {
            recipientStatus = 'signed';
          } else if (r.status === 'viewed') {
            recipientStatus = 'viewed';
          } else if (r.status === 'declined') {
            recipientStatus = 'declined';
          } else if (r.status === 'expired') {
            recipientStatus = 'expired';
          } else if (r.viewed_at) {
            // Fallback: if viewed_at is set but status wasn't updated
            recipientStatus = 'viewed';
          } else {
            recipientStatus = 'sent';
          }

          return {
            id: `recipient-${index}`,
            name: r.name || 'Unknown',
            email: r.email || '',
            role: 'signer' as const,
            status: recipientStatus,
            viewedAt: r.viewed_at,
            signedAt: r.signed_at,
            signingOrder: index + 1,
          };
        }),
        createdAt: env.created_at,
        updatedAt: env.created_at,
        metadata: {
          documentCount: 1,
          recipientCount,
          completedCount,
          viewedCount,
        },
      };
    }).filter(Boolean);

    return NextResponse.json({
      envelopes: formattedEnvelopes,
      total: formattedEnvelopes.length,
      limit,
      offset,
      // Include tenant info for transparency
      tenant: {
        id: tenantId,
        plan: context.tenant.plan,
      },
    });
  } catch (error) {
    console.error("[Envelopes API] Error fetching envelopes:", error);
    return NextResponse.json(
      { error: "Failed to fetch envelopes", envelopes: [] },
      { status: 500 }
    );
  }
});

// POST - Create a new envelope (with usage limit check)
export const POST = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();

      // Check envelope usage limits
      const usageCheck = await checkAndIncrementEnvelopeUsage(tenantId);
      if (!usageCheck.allowed) {
        return NextResponse.json(
          {
            error: 'LimitExceeded',
            message: 'You have reached your monthly envelope limit. Please upgrade your plan.',
            remaining: 0,
            upgradeRequired: true,
          },
          { status: 429 }
        );
      }

      const envelopeId = `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const title = body.subject || body.title || 'Untitled Document';

      await sql`
        INSERT INTO envelope_documents (
          envelope_id, org_id, title, message, created_at
        ) VALUES (
          ${envelopeId},
          ${tenantId},
          ${title},
          ${body.message || ''},
          NOW()
        )
      `;

      if (body.recipients && Array.isArray(body.recipients)) {
        for (const recipient of body.recipients) {
          const token = `tok_${Math.random().toString(36).substr(2, 16)}`;
          await sql`
            INSERT INTO envelope_signing_sessions (
              id, envelope_id, org_id, recipient_name, recipient_email,
              status, token, created_at
            ) VALUES (
              gen_random_uuid(),
              ${envelopeId},
              ${tenantId},
              ${recipient.name || ''},
              ${recipient.email || ''},
              'pending',
              ${token},
              NOW()
            )
          `;
        }
      }

      return NextResponse.json({
        success: true,
        envelope: {
          id: envelopeId,
          title,
          status: body.recipients?.length ? 'in_signing' : 'draft',
          tenantId,
          createdBy: context.user.id,
        },
        usage: {
          remaining: usageCheck.remaining,
        },
      });
    } catch (error) {
      console.error("[Envelopes API] Error creating envelope:", error);
      return NextResponse.json(
        { error: "Failed to create envelope" },
        { status: 500 }
      );
    }
  },
  {
    // Require document sending permission
    requiredPermissions: ['canSendDocuments'],
    // Check envelope limits before processing
    checkLimits: ['envelopes'],
  }
);
