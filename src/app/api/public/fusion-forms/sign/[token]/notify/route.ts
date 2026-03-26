import { NextRequest, NextResponse } from "next/server";
import { sendSignedDocumentNotifications } from "@/lib/email-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();

    const {
      documentName,
      signerName,
      signerEmail,
      senderName,
      senderEmail,
      signedAt,
      pdfBase64,
      fieldsSummary,
    } = body;

    // Validate required fields
    if (!documentName || !signerName || !pdfBase64) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Send notifications to both signer and sender
    const results = await sendSignedDocumentNotifications({
      documentName,
      signerName,
      signerEmail: signerEmail || "",
      senderName: senderName || "PearSign User",
      senderEmail: senderEmail || "",
      signedAt: new Date(signedAt || Date.now()),
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
