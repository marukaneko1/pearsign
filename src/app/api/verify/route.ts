/**
 * Public Document Verification API
 *
 * Allows third parties to verify signed documents without authentication.
 * No document content is exposed - only verification status.
 *
 * Endpoints:
 *   GET /api/verify?documentId=XXX
 *   GET /api/verify?signatureId=PS-XXXXXXXX
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyDocument, isValidSignatureId } from "@/lib/signature-id";
import { sql } from "@/lib/db";

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000);

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") ||
               request.headers.get("x-real-ip") ||
               "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: {
            code: "rate_limited",
            message: "Too many verification requests. Please try again later.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
          },
        }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    const signatureId = searchParams.get("signatureId");

    if (!documentId && !signatureId) {
      return NextResponse.json(
        {
          error: {
            code: "missing_parameter",
            message: "Please provide either documentId or signatureId parameter",
          },
        },
        { status: 400 }
      );
    }

    // Use the provided identifier
    const identifier = signatureId || documentId;

    if (!identifier) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_parameter",
            message: "Invalid document or signature ID",
          },
        },
        { status: 400 }
      );
    }

    // Validate signature ID format if provided
    if (signatureId && !isValidSignatureId(signatureId)) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_signature_id",
            message: "Invalid PearSign Signature ID format. Expected format: PS-XXXXXXXX",
          },
        },
        { status: 400 }
      );
    }

    // Verify the document
    const verification = await verifyDocument(identifier);

    if (!verification) {
      // Try to find envelope by ID even if no signature records exist yet
      if (documentId) {
        const envelope = await sql`
          SELECT e.id, e.status, e.title, e.created_at,
                 ed.title as doc_title
          FROM envelopes e
          LEFT JOIN envelope_documents ed ON e.id = ed.envelope_id
          WHERE e.id = ${documentId}
        `;

        if (envelope.length > 0) {
          const env = envelope[0];
          const status = env.status as string;

          // Map envelope status to verification status
          let verificationStatus: "completed" | "in_signing" | "voided" | "declined" | "expired" = "in_signing";
          if (status === "completed" || status === "signed") {
            verificationStatus = "completed";
          } else if (status === "voided") {
            verificationStatus = "voided";
          } else if (status === "declined") {
            verificationStatus = "declined";
          } else if (status === "expired") {
            verificationStatus = "expired";
          }

          return NextResponse.json({
            valid: true,
            documentId: env.id,
            envelopeId: env.id,
            signatureIds: [],
            signers: [],
            status: verificationStatus,
            documentTitle: env.doc_title || env.title || "Document",
            tampered: false,
            createdAt: env.created_at ? new Date(env.created_at).toISOString() : undefined,
            message: "Document found. No signature records available yet.",
          });
        }
      }

      return NextResponse.json(
        {
          valid: false,
          error: {
            code: "not_found",
            message: "No document found with the provided ID",
          },
        },
        { status: 404 }
      );
    }

    // Return verification result (no sensitive data exposed)
    return NextResponse.json({
      valid: verification.valid,
      documentId: verification.documentId,
      envelopeId: verification.envelopeId,
      signatureIds: verification.signatureIds,
      signers: verification.signers.map((s) => ({
        signatureId: s.signatureId,
        name: s.name,
        signedAt: s.signedAt,
        // Don't expose email
      })),
      status: verification.status,
      documentTitle: verification.documentTitle,
      tampered: verification.tampered,
      createdAt: verification.createdAt,
      completedAt: verification.completedAt,
      // Add verification metadata
      verifiedAt: new Date().toISOString(),
      verificationSource: "PearSign Document Verification API",
    });
  } catch (error) {
    console.error("[Verify API] Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "An error occurred during verification",
        },
      },
      { status: 500 }
    );
  }
}

// Also support POST for bulk verification (future feature)
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      error: {
        code: "not_implemented",
        message: "Bulk verification is not yet available. Use GET with documentId or signatureId parameter.",
      },
    },
    { status: 501 }
  );
}
