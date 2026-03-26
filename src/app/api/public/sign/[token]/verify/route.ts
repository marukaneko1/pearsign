/**
 * Verify PDF Digital Signature API
 *
 * Returns information about the digital signature in a signed PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyPdfSignature } from '@/lib/pdf-digital-signature';
import { TenantObjectStorage } from '@/lib/object-storage';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Parse the signing token to extract envelope ID
function parseSigningToken(token: string): { envelopeId: string; tokenPart: string } | null {
  const parts = token.split('_');
  if (parts.length < 2) return null;
  return {
    envelopeId: parts[0],
    tokenPart: parts.slice(1).join('_'),
  };
}

/**
 * GET /api/public/sign/[token]/verify
 * Verify the digital signature on a signed PDF
 */
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;

    const tokenData = parseSigningToken(token);
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid signing link' },
        { status: 400 }
      );
    }

    // Get the signing session
    const sessions = await sql`
      SELECT * FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    const session = sessions[0];
    if (!session) {
      return NextResponse.json(
        { error: 'Signing session not found' },
        { status: 404 }
      );
    }

    if (session.status !== 'completed') {
      return NextResponse.json({
        success: true,
        isSigned: false,
        message: 'Document has not been signed yet',
      });
    }

    // Get the signed PDF data
    let pdfBytes: Uint8Array | null = null;

    if (session.signed_pdf_object_path) {
      try {
        const { data } = await TenantObjectStorage.downloadBuffer(session.signed_pdf_object_path as string);
        pdfBytes = new Uint8Array(data);
      } catch {
        console.warn('[Verify] Failed to load from Object Storage, trying DB fallback');
      }
    }

    if (!pdfBytes && session.signed_pdf_data) {
      const base64Data = session.signed_pdf_data as string;
      pdfBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    }

    if (!pdfBytes) {
      return NextResponse.json({
        success: true,
        isSigned: true,
        hasDigitalSignature: false,
        message: 'Signed PDF not available for verification',
        signingDetails: {
          signerName: session.recipient_name,
          signerEmail: session.recipient_email,
          signedAt: session.signed_at,
          ipAddress: session.ip_address,
        },
      });
    }

    // Verify the digital signature
    const verificationResult = await verifyPdfSignature(pdfBytes);

    // Get document info
    const documents = await sql`
      SELECT title FROM envelope_documents
      WHERE envelope_id = ${tokenData.envelopeId}
    `;
    const documentTitle = documents[0]?.title || 'Document';

    // Get certificate info if available
    let certificateInfo = null;
    const tenantId = session.org_id;
    if (tenantId) {
      try {
        const certResult = await sql`
          SELECT subject, issuer, valid_from, valid_to, fingerprint
          FROM signing_certificates
          WHERE org_id = ${tenantId} AND is_default = true
          LIMIT 1
        `;
        if (certResult.length > 0) {
          certificateInfo = {
            subject: certResult[0].subject,
            issuer: certResult[0].issuer,
            validFrom: certResult[0].valid_from,
            validTo: certResult[0].valid_to,
            fingerprint: certResult[0].fingerprint,
          };
        }
      } catch {
        // Certificate table might not exist yet
      }
    }

    return NextResponse.json({
      success: true,
      isSigned: true,
      hasDigitalSignature: verificationResult.isSigned,
      documentTitle,
      signatureDetails: verificationResult.isSigned
        ? {
            signerName: verificationResult.signerName,
            signedAt: verificationResult.signedAt,
            reason: verificationResult.reason,
            isValid: verificationResult.isValid,
          }
        : null,
      signingSessionDetails: {
        signerName: session.recipient_name,
        signerEmail: session.recipient_email,
        signedAt: session.signed_at,
        viewedAt: session.viewed_at,
        ipAddress: session.ip_address,
        twoFaVerified: session.two_fa_verified,
      },
      certificateInfo,
      verification: {
        algorithm: 'SHA-256 with PKCS#7/CMS',
        format: 'adbe.pkcs7.detached',
        adobeCompatible: verificationResult.isSigned,
        message: verificationResult.isSigned
          ? 'Document contains a valid digital signature. Open in Adobe Acrobat for full verification.'
          : 'Document contains visual signatures but no PKI digital signature.',
      },
    });
  } catch (error) {
    console.error('[Verify Signature] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify signature' },
      { status: 500 }
    );
  }
}
