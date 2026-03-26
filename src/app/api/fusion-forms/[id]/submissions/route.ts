/**
 * FusionForm Submissions API Routes
 */

import { NextRequest, NextResponse } from "next/server";
import { FusionFormsService, SubmissionStatus } from "@/lib/fusion-forms";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as SubmissionStatus | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await FusionFormsService.getFormSubmissions(id, {
      limit,
      offset,
      status: status || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return NextResponse.json(
      { error: "Failed to fetch submissions" },
      { status: 500 }
    );
  }
}
