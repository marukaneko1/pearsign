/**
 * FusionForm Submissions API Routes
 */

import { NextRequest, NextResponse } from "next/server";
import { FusionFormsService, SubmissionStatus } from "@/lib/fusion-forms";
import { withTenant, type TenantApiContext } from "@/lib/tenant-middleware";

interface RouteParams {
  id: string;
}

export const GET = withTenant<RouteParams>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: RouteParams
) => {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "Form ID required" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as SubmissionStatus | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await FusionFormsService.getFormSubmissions(id, {
      limit,
      offset,
      status: status || undefined,
      tenantId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return NextResponse.json(
      { error: "Failed to fetch submissions" },
      { status: 500 }
    );
  }
});
