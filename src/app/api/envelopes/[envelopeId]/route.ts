import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

export const GET = withTenant<{ envelopeId: string }>(
  async (
    request: NextRequest,
    { tenantId, context }: TenantApiContext,
    params?: { envelopeId: string }
  ) => {
    try {
      if (!params?.envelopeId) {
        return NextResponse.json(
          { error: "Envelope ID is required" },
          { status: 400 }
        );
      }

      const { envelopeId } = params;

      const docs = await sql`
        SELECT envelope_id, title, message, created_at
        FROM envelope_documents
        WHERE envelope_id = ${envelopeId} AND org_id = ${tenantId}
      `;

      if (docs.length === 0) {
        return NextResponse.json(
          { error: "Envelope not found" },
          { status: 404 }
        );
      }

      const doc = docs[0];

      const sessions = await sql`
        SELECT id, recipient_name, recipient_email, status,
               viewed_at, signed_at, created_at
        FROM envelope_signing_sessions
        WHERE envelope_id = ${envelopeId} AND org_id = ${tenantId}
        ORDER BY created_at ASC
      `;

      const recipientCount = sessions.length;
      const completedCount = sessions.filter((s: any) => s.status === 'completed').length;
      const viewedCount = sessions.filter((s: any) => s.status === 'viewed').length;
      const declinedCount = sessions.filter((s: any) => s.status === 'declined').length;
      const voidedCount = sessions.filter((s: any) => s.status === 'voided').length;

      let envelopeStatus = 'draft';
      if (recipientCount === 0) {
        envelopeStatus = 'draft';
      } else if (completedCount === recipientCount) {
        envelopeStatus = 'completed';
      } else if (voidedCount === recipientCount) {
        envelopeStatus = 'voided';
      } else if (declinedCount > 0) {
        envelopeStatus = 'declined';
      } else if (viewedCount > 0 || completedCount > 0) {
        envelopeStatus = 'viewed';
      } else {
        envelopeStatus = 'in_signing';
      }

      return NextResponse.json({
        envelope: {
          id: doc.envelope_id,
          title: doc.title,
          description: doc.message || '',
          status: envelopeStatus,
          signingOrder: 'sequential',
          organizationId: tenantId,
          createdBy: context.user.id,
          recipients: sessions.map((s: any, index: number) => ({
            id: s.id,
            name: s.recipient_name || 'Unknown',
            email: s.recipient_email || '',
            role: 'signer',
            status: s.status === 'completed' ? 'signed' : s.status,
            viewedAt: s.viewed_at,
            signedAt: s.signed_at,
            signingOrder: index + 1,
          })),
          createdAt: doc.created_at,
          updatedAt: doc.created_at,
          metadata: {
            documentCount: 1,
            recipientCount,
            completedCount,
            viewedCount,
          },
        },
      });
    } catch (error) {
      console.error("[Envelope Detail] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch envelope" },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withTenant<{ envelopeId: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { envelopeId: string }
  ) => {
    try {
      if (!params?.envelopeId) {
        return NextResponse.json(
          { error: "Envelope ID is required" },
          { status: 400 }
        );
      }

      const { envelopeId } = params;

      await sql`
        DELETE FROM envelope_signing_sessions
        WHERE envelope_id = ${envelopeId} AND org_id = ${tenantId}
      `;

      const result = await sql`
        DELETE FROM envelope_documents
        WHERE envelope_id = ${envelopeId} AND org_id = ${tenantId}
        RETURNING envelope_id
      `;

      if (result.length === 0) {
        return NextResponse.json(
          { error: "Envelope not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("[Envelope Delete] Error:", error);
      return NextResponse.json(
        { error: "Failed to delete envelope" },
        { status: 500 }
      );
    }
  },
  { requiredPermissions: ['canSendDocuments'] }
);
