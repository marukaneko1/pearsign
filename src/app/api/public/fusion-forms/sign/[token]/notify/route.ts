import { NextRequest, NextResponse } from "next/server";
import { FusionFormsService } from "@/lib/fusion-forms";
import { sendSignedDocumentNotifications } from "@/lib/email-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Verify the token resolves to a completed submission — reject everything else.
    const submission = await FusionFormsService.getSubmissionByToken(token);

    if (!submission) {
      return NextResponse.json(
        { error: "Signing session not found" },
        { status: 404 }
      );
    }

    if (submission.status !== "completed") {
      return NextResponse.json(
        { error: "Signing not completed" },
        { status: 400 }
      );
    }

    // Only accept the generated PDF from the client — all identity fields come
    // from the server-side submission/form record to prevent spoofing.
    const body = await request.json();
    const { pdfBase64, fieldsSummary } = body;

    if (!pdfBase64) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const form = await FusionFormsService.getForm(submission.fusionFormId);

    const results = await sendSignedDocumentNotifications({
      documentName: form?.name ?? "Document",
      signerName: submission.signerName ?? "",
      signerEmail: submission.signerEmail ?? "",
      senderName: form?.senderName ?? "PearSign User",
      senderEmail: form?.senderEmail ?? "",
      signedAt: submission.signedAt ? new Date(submission.signedAt) : new Date(),
      pdfBase64,
      fieldsSummary,
    });

    return NextResponse.json({
      success: true,
      token,
      signerEmailSent: results.signerResult.success,
      senderEmailSent: results.senderResult.success,
      errors: {
        signer: results.signerResult.error,
        sender: results.senderResult.error,
      },
    });
  } catch (error) {
    console.error("Error sending notifications:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
