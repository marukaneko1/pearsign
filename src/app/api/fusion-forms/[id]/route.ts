/**
 * Individual FusionForm API Routes
 * Handles GET, PATCH, DELETE for a specific FusionForm
 */

import { NextRequest, NextResponse } from "next/server";
import { FusionFormsService, FusionFormStatus } from "@/lib/fusion-forms";
import { withTenant, type TenantApiContext } from "@/lib/tenant-middleware";

interface RouteParams {
  id: string;
}

export const GET = withTenant<RouteParams>(async (
  _request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: RouteParams
) => {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "Form ID required" }, { status: 400 });
    }

    const form = await FusionFormsService.getForm(id, tenantId);

    if (!form) {
      return NextResponse.json(
        { error: "FusionForm not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(form);
  } catch (error) {
    console.error("Error fetching fusion form:", error);
    return NextResponse.json(
      { error: "Failed to fetch fusion form" },
      { status: 500 }
    );
  }
});

export const PATCH = withTenant<RouteParams>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: RouteParams
) => {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "Form ID required" }, { status: 400 });
    }

    const body = await request.json();

    if (body.status && Object.keys(body).length === 1) {
      const validStatuses: FusionFormStatus[] = ["active", "paused", "archived"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: "Invalid status" },
          { status: 400 }
        );
      }

      const form = await FusionFormsService.updateFormStatus(id, body.status, tenantId);
      if (!form) {
        return NextResponse.json(
          { error: "FusionForm not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(form);
    }

    const form = await FusionFormsService.updateForm(id, {
      name: body.name,
      description: body.description,
      redirectUrl: body.redirectUrl,
      expiresAt: body.expiresAt,
      requireName: body.requireName,
      requireEmail: body.requireEmail,
      allowMultipleSubmissions: body.allowMultipleSubmissions,
      customBranding: body.customBranding,
    }, tenantId);

    if (!form) {
      return NextResponse.json(
        { error: "FusionForm not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(form);
  } catch (error) {
    console.error("Error updating fusion form:", error);
    return NextResponse.json(
      { error: "Failed to update fusion form" },
      { status: 500 }
    );
  }
});

export const DELETE = withTenant<RouteParams>(async (
  _request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: RouteParams
) => {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "Form ID required" }, { status: 400 });
    }

    const deleted = await FusionFormsService.deleteForm(id, tenantId);

    if (!deleted) {
      return NextResponse.json(
        { error: "FusionForm not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting fusion form:", error);
    return NextResponse.json(
      { error: "Failed to delete fusion form" },
      { status: 500 }
    );
  }
});
