/**
 * Documents API v1
 * GET /api/v1/documents - List all documents/envelopes with their fields
 *
 * Documents are created when envelopes are sent.
 * Each document has a field schema that can be retrieved for API mapping.
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError, getPaginationParams, buildPaginationMeta } from "@/lib/api-auth";
import { sql } from "@/lib/db";

/**
 * GET /api/v1/documents
 * List documents with field counts
 */
export const GET = withApiAuth(
  async (request: NextRequest, auth) => {
    try {
      const { limit, offset, page } = getPaginationParams(request);

      // Fetch documents
      const documents = await sql`
        SELECT
          d.id,
          d.envelope_id as "envelopeId",
          d.title,
          d.signature_fields as "signatureFields",
          d.message,
          d.created_at as "createdAt",
          s.status,
          s.recipient_name as "recipientName",
          s.recipient_email as "recipientEmail"
        FROM envelope_documents d
        LEFT JOIN envelope_signing_sessions s ON d.envelope_id = s.envelope_id AND d.org_id = s.org_id
        WHERE d.org_id = ${auth.organizationId}
        ORDER BY d.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // Count total
      const countResult = await sql`
        SELECT COUNT(DISTINCT envelope_id) as count
        FROM envelope_documents
        WHERE org_id = ${auth.organizationId}
      `;
      const total = parseInt(countResult[0]?.count || '0', 10);

      // Group documents by envelope
      const envelopeMap = new Map<string, {
        documentId: string;
        envelopeId: string;
        title: string;
        status: string;
        fieldCount: number;
        recipients: Array<{ name: string; email: string; status: string }>;
        createdAt: string;
      }>();

      for (const doc of documents) {
        const fields = (doc.signatureFields as Array<unknown>) || [];

        if (!envelopeMap.has(doc.envelopeId)) {
          envelopeMap.set(doc.envelopeId, {
            documentId: doc.id as string,
            envelopeId: doc.envelopeId as string,
            title: doc.title as string,
            status: (doc.status as string) || 'pending',
            fieldCount: fields.length,
            recipients: [],
            createdAt: (doc.createdAt as Date).toISOString(),
          });
        }

        if (doc.recipientEmail) {
          const envelope = envelopeMap.get(doc.envelopeId);
          if (envelope && !envelope.recipients.find(r => r.email === doc.recipientEmail)) {
            envelope.recipients.push({
              name: doc.recipientName as string,
              email: doc.recipientEmail as string,
              status: (doc.status as string) || 'pending',
            });
          }
        }
      }

      return apiSuccess({
        data: Array.from(envelopeMap.values()),
        meta: buildPaginationMeta(total, limit, page),
      });
    } catch (error) {
      console.error("Error listing documents:", error);
      return apiError("INTERNAL_ERROR", "Failed to list documents", 500);
    }
  },
  { requiredPermissions: ["documents:read"] }
);
