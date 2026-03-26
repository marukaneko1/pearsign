/**
 * API Key Detail API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated API keys
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiKeyService, ALL_PERMISSIONS, type ApiKeyPermission } from "@/lib/api-keys";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/v1/api-keys/[id]
 * Get a single API key for the current tenant
 */
export const GET = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: { code: "invalid_request", message: "API key ID is required" } },
          { status: 400 }
        );
      }

      const key = await ApiKeyService.getById(params.id, tenantId);

      if (!key) {
        return NextResponse.json(
          { error: { code: "not_found", message: "API key not found" } },
          { status: 404 }
        );
      }

      return NextResponse.json({ data: key });
    } catch (error) {
      console.error("Error fetching API key:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to fetch API key" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canUseApi'],
  }
);

/**
 * PATCH /api/v1/api-keys/[id]
 * Update an API key for the current tenant
 */
export const PATCH = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: { code: "invalid_request", message: "API key ID is required" } },
          { status: 400 }
        );
      }

      const body = await request.json();

      // Validate permissions if provided
      if (body.permissions) {
        const invalidPermissions = body.permissions.filter(
          (p: string) => !ALL_PERMISSIONS.includes(p as ApiKeyPermission)
        );
        if (invalidPermissions.length > 0) {
          return NextResponse.json(
            {
              error: {
                code: "invalid_request",
                message: `Invalid permissions: ${invalidPermissions.join(", ")}`,
              },
            },
            { status: 400 }
          );
        }
      }

      // Validate rate limit if provided
      if (body.rateLimit !== undefined) {
        if (typeof body.rateLimit !== "number" || body.rateLimit < 1 || body.rateLimit > 10000) {
          return NextResponse.json(
            { error: { code: "invalid_request", message: "Rate limit must be between 1 and 10000" } },
            { status: 400 }
          );
        }
      }

      const updated = await ApiKeyService.update(
        params.id,
        {
          name: body.name,
          permissions: body.permissions,
          rateLimit: body.rateLimit,
          expiresAt: body.expiresAt,
          metadata: body.metadata,
        },
        tenantId
      );

      if (!updated) {
        return NextResponse.json(
          { error: { code: "not_found", message: "API key not found" } },
          { status: 404 }
        );
      }

      return NextResponse.json({ data: updated });
    } catch (error) {
      console.error("Error updating API key:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to update API key" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canUseApi'],
  }
);

/**
 * DELETE /api/v1/api-keys/[id]
 * Revoke an API key for the current tenant
 */
export const DELETE = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: { code: "invalid_request", message: "API key ID is required" } },
          { status: 400 }
        );
      }

      const searchParams = request.nextUrl.searchParams;
      const reason = searchParams.get("reason") || "Manually revoked via dashboard";

      const success = await ApiKeyService.revoke(params.id, reason, tenantId);

      if (!success) {
        return NextResponse.json(
          { error: { code: "not_found", message: "API key not found or already revoked" } },
          { status: 404 }
        );
      }

      return NextResponse.json({
        data: { id: params.id, status: "revoked", message: "API key has been revoked" },
      });
    } catch (error) {
      console.error("Error revoking API key:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to revoke API key" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canUseApi'],
  }
);
