/**
 * API Keys Management API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated API keys
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiKeyService, ALL_PERMISSIONS, type ApiKeyPermission, type ApiKeyEnvironment } from "@/lib/api-keys";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/v1/api-keys
 * List all API keys for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const keys = await ApiKeyService.getAll(tenantId);

      return NextResponse.json({
        data: keys,
        meta: {
          total: keys.length,
        },
      });
    } catch (error) {
      console.error("Error fetching API keys:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to fetch API keys" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canUseApi'],
  }
);

/**
 * POST /api/v1/api-keys
 * Create a new API key for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.name || typeof body.name !== "string") {
        return NextResponse.json(
          { error: { code: "invalid_request", message: "Name is required" } },
          { status: 400 }
        );
      }

      if (!body.environment || !["test", "live"].includes(body.environment)) {
        return NextResponse.json(
          { error: { code: "invalid_request", message: "Environment must be 'test' or 'live'" } },
          { status: 400 }
        );
      }

      // Validate permissions
      const permissions: ApiKeyPermission[] = body.permissions || [];
      const invalidPermissions = permissions.filter(p => !ALL_PERMISSIONS.includes(p));
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

      // Validate rate limit
      const rateLimit = body.rateLimit || 60;
      if (typeof rateLimit !== "number" || rateLimit < 1 || rateLimit > 10000) {
        return NextResponse.json(
          { error: { code: "invalid_request", message: "Rate limit must be between 1 and 10000" } },
          { status: 400 }
        );
      }

      // Create the API key for this tenant
      const apiKeyWithSecret = await ApiKeyService.create(
        {
          name: body.name,
          environment: body.environment as ApiKeyEnvironment,
          permissions,
          rateLimit,
          expiresAt: body.expiresAt || null,
          metadata: body.metadata || {},
        },
        tenantId
      );

      // Return the key with the raw secret (only shown once!)
      return NextResponse.json(
        {
          data: apiKeyWithSecret,
          warning: "Store this API key securely. The secret will not be shown again.",
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("Error creating API key:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to create API key" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canUseApi'],
  }
);
