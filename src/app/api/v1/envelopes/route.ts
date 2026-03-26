import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError, getPaginationParams } from "@/lib/api-auth";
import { sql } from "@/lib/db";

export const GET = withApiAuth(
  async (request, auth) => {
    const { limit, offset, page } = getPaginationParams(request);
    const envelopes = await sql`SELECT id, name, status, created_at as "createdAt" FROM envelopes WHERE organization_id = ${auth.organizationId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return apiSuccess({ data: envelopes, meta: { page, limit, count: envelopes.length } });
  },
  { requiredPermissions: ["envelopes:read"] }
);

export const POST = withApiAuth(
  async (request, auth) => {
    const body = await request.json();
    if (!body.name) return apiError("INVALID_REQUEST", "Envelope name is required", 400);
    if (!body.signerEmail) return apiError("INVALID_REQUEST", "Signer email is required", 400);
    const id = "env-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    await sql`INSERT INTO envelopes (id, organization_id, name, status, signer_email, signer_name, created_at, updated_at) VALUES (${id}, ${auth.organizationId}, ${body.name}, ${"draft"}, ${body.signerEmail}, ${body.signerName || null}, ${now}, ${now})`;
    const result = await sql`SELECT * FROM envelopes WHERE id = ${id}`;
    return apiSuccess({ data: result[0] }, 201);
  },
  { requiredPermissions: ["envelopes:create"] }
);
