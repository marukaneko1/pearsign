/**
 * API Key Rotate API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Rotates an API key (generates new secret)
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiKeyService } from "@/lib/api-keys";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * POST /api/v1/api-keys/[id]/rotate
 * Rotate an API key for the current tenant
 */
export const POST = withTenant<{ id: string }>(
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

      const rotatedKey = await ApiKeyService.rotate(params.id, tenantId);

      if (!rotatedKey) {
        return NextResponse.json(
          { error: { code: "not_found", message: "API key not found or not active" } },
          { status: 404 }
        );
      }

      return NextResponse.json({
        data: rotatedKey,
        warning: "Store this new API key securely. The secret will not be shown again. The previous secret is now invalid.",
      });
    } catch (error) {
      console.error("Error rotating API key:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to rotate API key" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canUseApi'],
  }
);
