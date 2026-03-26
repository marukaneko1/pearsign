import { NextRequest } from "next/server";
import { withApiAuth, apiSuccess, apiError } from "@/lib/api-auth";
import { sql } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get single envelope
export const GET = (request: NextRequest, context: RouteContext) =>
  withApiAuth(
    async (req, auth) => {
      const { id } = await context.params;

      const result = await sql`
        SELECT * FROM envelopes
        WHERE id = ${id} AND organization_id = ${auth.organizationId}
      `;

      if (result.length === 0) {
        return apiError("NOT_FOUND", "Envelope not found", 404);
      }

      return apiSuccess({ data: result[0] });
    },
    { requiredPermissions: ["envelopes:read"] }
  )(request);

// PATCH - Update envelope
export const PATCH = (request: NextRequest, context: RouteContext) =>
  withApiAuth(
    async (req, auth) => {
      const { id } = await context.params;
      const body = await req.json();
      const now = new Date().toISOString();

      const existing = await sql`
        SELECT id FROM envelopes
        WHERE id = ${id} AND organization_id = ${auth.organizationId}
      `;

      if (existing.length === 0) {
        return apiError("NOT_FOUND", "Envelope not found", 404);
      }

      await sql`
        UPDATE envelopes SET
          name = COALESCE(${body.name || null}, name),
          signer_email = COALESCE(${body.signerEmail || null}, signer_email),
          signer_name = COALESCE(${body.signerName || null}, signer_name),
          updated_at = ${now}
        WHERE id = ${id}
      `;

      const result = await sql`SELECT * FROM envelopes WHERE id = ${id}`;

      return apiSuccess({ data: result[0] });
    },
    { requiredPermissions: ["envelopes:create"] }
  )(request);

// DELETE - Void envelope
export const DELETE = (request: NextRequest, context: RouteContext) =>
  withApiAuth(
    async (req, auth) => {
      const { id } = await context.params;
      const now = new Date().toISOString();

      const existing = await sql`
        SELECT id, status FROM envelopes
        WHERE id = ${id} AND organization_id = ${auth.organizationId}
      `;

      if (existing.length === 0) {
        return apiError("NOT_FOUND", "Envelope not found", 404);
      }

      if (existing[0].status === "completed") {
        return apiError("INVALID_REQUEST", "Cannot void a completed envelope", 400);
      }

      await sql`
        UPDATE envelopes SET
          status = 'voided',
          updated_at = ${now}
        WHERE id = ${id}
      `;

      return apiSuccess({ data: { id, status: "voided" } });
    },
    { requiredPermissions: ["envelopes:void"] }
  )(request);
