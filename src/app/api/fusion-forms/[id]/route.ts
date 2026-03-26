/**
 * Individual FusionForm API Routes
 * Handles GET, PATCH, DELETE for a specific FusionForm
 */

import { NextRequest, NextResponse } from "next/server";
import { FusionFormsService, FusionFormStatus } from "@/lib/fusion-forms";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;
    const form = await FusionFormsService.getForm(id);

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
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (body.status && Object.keys(body).length === 1) {
      const validStatuses: FusionFormStatus[] = ["active", "paused", "archived"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: "Invalid status" },
          { status: 400 }
        );
      }

      const form = await FusionFormsService.updateFormStatus(id, body.status);
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
    });

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
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;
    const deleted = await FusionFormsService.deleteForm(id);

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
}
