/**
 * Public FusionForm Signing API
 * Handles signature submission and completion
 */

import { NextRequest, NextResponse } from "next/server";
import { FusionFormsService } from "@/lib/fusion-forms";

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Get submission data
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const submission = await FusionFormsService.getSubmissionByToken(token);

    if (!submission) {
      return NextResponse.json(
        { error: "Signing session not found" },
        { status: 404 }
      );
    }

    if (submission.status === "completed") {
      return NextResponse.json(
        { error: "Document already signed", completed: true },
        { status: 400 }
      );
    }

    if (submission.status === "expired" || submission.status === "cancelled") {
      return NextResponse.json(
        { error: "Signing session is no longer valid" },
        { status: 400 }
      );
    }

    // Get the form with template fields
    const form = await FusionFormsService.getForm(submission.fusionFormId);

    if (!form) {
      return NextResponse.json(
        { error: "Form not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        envelopeId: submission.envelopeId,
        signerName: submission.signerName,
        signerEmail: submission.signerEmail,
        status: submission.status,
        fieldValues: submission.fieldValues,
      },
      form: {
        id: form.id,
        name: form.name,
        description: form.description,
        templateName: form.templateName,
        templateFields: form.templateFields,
        senderEmail: form.senderEmail,
        senderName: form.senderName,
      },
    });
  } catch (error) {
    console.error("Error fetching signing data:", error);
    return NextResponse.json(
      { error: "Failed to load signing session" },
      { status: 500 }
    );
  }
}

// Update field values during signing
export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const body = await request.json();

    const submission = await FusionFormsService.getSubmissionByToken(token);

    if (!submission) {
      return NextResponse.json(
        { error: "Signing session not found" },
        { status: 404 }
      );
    }

    if (submission.status === "completed") {
      return NextResponse.json(
        { error: "Document already signed" },
        { status: 400 }
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(',')[0]?.trim() || request.headers.get("x-real-ip") || null;
    const userAgent = request.headers.get("user-agent") || null;

    // Update to in_progress if pending
    const updatedSubmission = await FusionFormsService.updateSubmissionStatus(
      submission.id,
      "in_progress",
      {
        fieldValues: body.fieldValues,
        ipAddress,
        userAgent,
      }
    );

    return NextResponse.json({ success: true, submission: updatedSubmission });
  } catch (error) {
    console.error("Error updating submission:", error);
    return NextResponse.json(
      { error: "Failed to update signing session" },
      { status: 500 }
    );
  }
}

// Complete signing
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const body = await request.json();

    const submission = await FusionFormsService.getSubmissionByToken(token);

    if (!submission) {
      return NextResponse.json(
        { error: "Signing session not found" },
        { status: 404 }
      );
    }

    if (submission.status === "completed") {
      return NextResponse.json(
        { error: "Document already signed" },
        { status: 400 }
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(',')[0]?.trim() || request.headers.get("x-real-ip") || null;
    const userAgent = request.headers.get("user-agent") || null;

    // Complete the submission
    const completedSubmission = await FusionFormsService.completeSubmission(
      submission.id,
      {
        fieldValues: body.fieldValues,
        signatureData: body.signatureData,
        ipAddress,
        userAgent,
      }
    );

    if (!completedSubmission) {
      return NextResponse.json(
        { error: "Failed to complete signing" },
        { status: 500 }
      );
    }

    // Get form for redirect URL
    const form = await FusionFormsService.getForm(submission.fusionFormId);

    return NextResponse.json({
      success: true,
      completed: true,
      submission: {
        id: completedSubmission.id,
        envelopeId: completedSubmission.envelopeId,
        signedAt: completedSubmission.signedAt,
        certificateUrl: completedSubmission.certificateUrl,
        documentUrl: completedSubmission.documentUrl,
      },
      redirectUrl: form?.redirectUrl,
    });
  } catch (error) {
    console.error("Error completing signing:", error);
    return NextResponse.json(
      { error: "Failed to complete signing" },
      { status: 500 }
    );
  }
}
