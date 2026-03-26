/**
 * Public Envelope Signing API
 * Handles signature request viewing and completion
 *
 * Multi-tenancy: Tenant ID is extracted from the signing session.
 * The session's org_id was set when the envelope was sent by an authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateSignedPDF, pdfBytesToBase64 } from "@/lib/signed-pdf-generator";
import { sendSignedDocumentNotifications, sendDocumentViewedNotification, sendSignerNotification } from "@/lib/email-service";
import { logEnvelopeEvent } from "@/lib/audit-log";
import { notifyDocumentSigned, notifyDocumentCompleted } from "@/lib/webhook-service";
import { saveSignedDocumentToDrive } from "@/lib/google-drive-service";
import { TenantObjectStorage } from "@/lib/object-storage";
import { saveSignedDocumentToDropbox } from "@/lib/dropbox-service";
import { syncSignerToSalesforce, logSigningTask } from "@/lib/salesforce-service";
import { createSignaturesForSession, generateDocumentHash } from "@/lib/signature-id";
import { markDocumentCompleted } from "@/lib/document-retention";

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Parse the signing token to extract envelope ID
function parseSigningToken(token: string): { envelopeId: string; tokenPart: string } | null {
  // Token format: envelopeId_timestamp_randomPart
  // e.g., env-1234567890-abc123_1234567890123_xyz789
  const parts = token.split('_');
  if (parts.length < 2) return null;

  return {
    envelopeId: parts[0],
    tokenPart: parts.slice(1).join('_'),
  };
}

// Store signing sessions in database
async function ensureSigningTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS envelope_signing_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      envelope_id VARCHAR(255) NOT NULL,
      token VARCHAR(255) UNIQUE NOT NULL,
      recipient_name VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      field_values JSONB DEFAULT '{}',
      signature_data TEXT,
      signed_pdf_data TEXT,
      ip_address VARCHAR(100),
      user_agent TEXT,
      viewed_at TIMESTAMP,
      signed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      two_fa_required BOOLEAN DEFAULT false,
      two_fa_phone VARCHAR(50),
      two_fa_verified BOOLEAN DEFAULT false,
      two_fa_verified_at TIMESTAMP
    )
  `;

  // Add columns if they don't exist
  try {
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS signed_pdf_data TEXT`;
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_required BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_phone VARCHAR(50)`;
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_verified BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE envelope_signing_sessions ADD COLUMN IF NOT EXISTS two_fa_verified_at TIMESTAMP`;
  } catch {
    // Columns might already exist
  }
}

// Mask phone number for display
function maskPhoneNumber(phone: string | null): string | null {
  if (!phone || phone.length < 6) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length <= 4) return '***' + cleaned.slice(-2);
  return '+' + cleaned.slice(0, 2) + '***' + cleaned.slice(-4);
}

// Field type labels
const FIELD_LABELS: Record<string, string> = {
  signature: 'Your Signature',
  initials: 'Your Initials',
  date: 'Date Signed',
  name: 'Full Name',
  email: 'Email Address',
  text: 'Text Field',
  company: 'Company',
  title: 'Job Title',
  upload: 'Document Upload',
};

// Get signing data
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;

    // Parse the token
    const tokenData = parseSigningToken(token);
    if (!tokenData) {
      return NextResponse.json(
        { message: "Invalid signing link" },
        { status: 400 }
      );
    }

    await ensureSigningTable();

    // Try to find existing session - includes org_id
    const sessions = await sql`
      SELECT * FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    const session = sessions[0];
    let recipientName = "Signer";
    let recipientEmail = "signer@example.com";
    // Extract tenant ID from session, fallback to querying envelope
    let tenantId = session?.org_id || '';

    if (session) {
      if (session.status === "completed") {
        return NextResponse.json(
          { message: "This document has already been signed", completed: true },
          { status: 400 }
        );
      }

      if (session.expires_at && new Date(session.expires_at) < new Date()) {
        return NextResponse.json(
          { message: "This signing link has expired" },
          { status: 400 }
        );
      }

      recipientName = session.recipient_name;
      recipientEmail = session.recipient_email;
      tenantId = session.org_id;
    }

    // If no session found, try to get tenant from envelope
    if (!tenantId) {
      const envelopeResult = await sql`
        SELECT organization_id FROM envelopes WHERE id = ${tokenData.envelopeId}
      `;
      if (envelopeResult.length > 0) {
        tenantId = envelopeResult[0].organization_id;
      }
    }

    // Get the actual document from the database
    const documents = await sql`
      SELECT * FROM envelope_documents
      WHERE envelope_id = ${tokenData.envelopeId}
    `;

    let documentUrl: string;
    let documentTitle = "Document for Signature";
    let signatureFields: Array<{
      id: string;
      type: string;
      label: string;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      required: boolean;
      value: string;
      preFilledValue: string;
      isPreFilled: boolean;
      placeholder: string;
    }> = [];

    if (documents.length > 0) {
      const doc = documents[0];
      documentTitle = doc.title;

      // Use relative URL - the browser will resolve to the correct host
      documentUrl = `/api/public/document/${tokenData.envelopeId}`;

      // Get signature fields from the document
      const storedFields = doc.signature_fields || [];
      signatureFields = storedFields.map((f: {
        id: string;
        type: string;
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        required: boolean;
        prefillValue?: string;
        placeholder?: string;
      }) => {
        // Determine prefill value based on field type
        let preFilledValue = f.prefillValue || '';

        // Auto-fill name and email fields with recipient data if no prefill set
        if (!preFilledValue) {
          if (f.type === 'name') {
            preFilledValue = recipientName;
          } else if (f.type === 'email') {
            preFilledValue = recipientEmail;
          }
        }

        return {
          id: f.id,
          type: f.type,
          label: FIELD_LABELS[f.type] || f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required !== false, // Default to required
          value: "",
          preFilledValue,
          isPreFilled: !!preFilledValue,
          placeholder: f.placeholder || `Enter ${FIELD_LABELS[f.type]?.toLowerCase() || f.type}`,
        };
      });
    } else {
      // Fallback to sample PDF if no document found - use relative URL
      documentUrl = `/api/public/sample-pdf`;
      // Sample PDF has signature lines at specific positions
      signatureFields = [
        {
          id: "sig-1",
          type: "signature",
          label: "Your Signature",
          page: 1,
          x: 50,
          y: 555,
          width: 200,
          height: 50,
          required: true,
          value: "",
          preFilledValue: "",
          isPreFilled: false,
          placeholder: "Sign here",
        },
        {
          id: "date-1",
          type: "date",
          label: "Date Signed",
          page: 1,
          x: 350,
          y: 560,
          width: 180,
          height: 35,
          required: true,
          value: "",
          preFilledValue: "",
          isPreFilled: false,
          placeholder: "Date",
        },
      ];
    }

    // Check 2FA status
    const twoFactorAuth = {
      required: session?.two_fa_required === true,
      verified: session?.two_fa_verified === true,
      maskedPhone: session?.two_fa_phone ? maskPhoneNumber(session.two_fa_phone as string) : null,
    };

    return NextResponse.json({
      envelope: {
        id: tokenData.envelopeId,
        title: documentTitle,
        description: "Please review and sign this document",
        status: session?.status || "pending",
      },
      recipient: {
        id: session?.id || `recipient-${tokenData.tokenPart}`,
        name: recipientName,
        email: recipientEmail,
        role: "signer",
        status: session?.status || "pending",
      },
      documentUrl,
      assignedFields: signatureFields,
      allFields: signatureFields,
      twoFactorAuth,
    });
  } catch (error) {
    console.error("Error fetching signing data:", error);
    return NextResponse.json(
      { message: "Failed to load signing session" },
      { status: 500 }
    );
  }
}

// Mark as viewed
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const tokenData = parseSigningToken(token);

    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid signing link" },
        { status: 400 }
      );
    }

    await ensureSigningTable();

    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Update viewed_at timestamp and status to 'viewed' (only if not already viewed/completed)
    const result = await sql`
      UPDATE envelope_signing_sessions
      SET
        viewed_at = COALESCE(viewed_at, NOW()),
        status = CASE
          WHEN status IN ('pending', 'sent') THEN 'viewed'
          ELSE status
        END,
        ip_address = ${ipAddress},
        user_agent = ${userAgent}
      WHERE token = ${token} AND status NOT IN ('completed', 'voided', 'declined', 'expired')
      RETURNING *
    `;

    // Log the viewed event and trigger webhook (only on first view)
    console.log("[Viewed] PUT request received for token:", token);
    console.log("[Viewed] Update result rows:", result.length);

    if (result.length > 0) {
      const session = result[0];
      const viewedAtTime = session.viewed_at ? new Date(session.viewed_at as string).getTime() : 0;
      const timeDiff = new Date().getTime() - viewedAtTime;
      const isFirstView = session.viewed_at === null || timeDiff < 5000;

      console.log("[Viewed] Session data:", {
        token: session.token,
        status: session.status,
        viewed_at: session.viewed_at,
        recipient_email: session.recipient_email,
        org_id: session.org_id,
      });
      console.log("[Viewed] Time diff (ms):", timeDiff, "isFirstView:", isFirstView);

      if (isFirstView) {
        console.log("[Viewed] First view detected, sending notifications...");
        // Get document title for webhook
        const documents = await sql`
          SELECT title FROM envelope_documents
          WHERE envelope_id = ${tokenData.envelopeId}
        `;
        const documentTitle = documents[0]?.title || "Document";

        // Log the viewed event
        await logEnvelopeEvent('envelope.viewed', {
          orgId: session.org_id as string,
          envelopeId: tokenData.envelopeId,
          envelopeTitle: documentTitle,
          actorName: session.recipient_name as string,
          actorEmail: session.recipient_email as string,
          details: {
            ipAddress,
            userAgent: userAgent.substring(0, 100),
            viewedAt: new Date().toISOString(),
          },
        });

        // Send "Document Viewed" email notification to sender
        try {
          // Try multiple ways to get sender info
          let senderName = 'PearSign User';
          let senderEmail = '';

          // Method 1: Try audit log first
          try {
            const auditResult = await sql`
              SELECT actor_name, actor_email
              FROM audit_logs
              WHERE action = 'envelope.sent'
                AND entity_id = ${tokenData.envelopeId}
              ORDER BY created_at DESC
              LIMIT 1
            `;
            if (auditResult.length > 0 && auditResult[0].actor_email) {
              senderName = auditResult[0].actor_name || 'PearSign User';
              senderEmail = auditResult[0].actor_email;
              console.log("[Viewed] Found sender from audit log:", senderEmail);
            }
          } catch (auditErr) {
            console.log("[Viewed] Audit log lookup failed:", auditErr);
          }

          // Method 2: Fallback to user_profiles (check both tenant org and default org)
          if (!senderEmail) {
            try {
              // First try with session's org_id
              let profileResult = await sql`
                SELECT first_name, last_name, email
                FROM user_profiles
                WHERE organization_id = ${session.org_id as string}
                LIMIT 1
              `;

              // If not found, try with default org 'org-1'
              if (profileResult.length === 0) {
                console.log("[Viewed] No profile found for org:", session.org_id, "- trying default org-1");
                profileResult = await sql`
                  SELECT first_name, last_name, email
                  FROM user_profiles
                  WHERE organization_id = 'org-1'
                  LIMIT 1
                `;
              }

              if (profileResult.length > 0 && profileResult[0].email) {
                senderName = `${profileResult[0].first_name || ''} ${profileResult[0].last_name || ''}`.trim() || 'PearSign User';
                senderEmail = profileResult[0].email;
                console.log("[Viewed] Found sender from user_profiles:", senderEmail);
              }
            } catch (profileErr) {
              console.log("[Viewed] User profiles lookup failed:", profileErr);
            }
          }

          // Method 3: Fallback - try any profile in the system
          if (!senderEmail) {
            try {
              const anyProfile = await sql`
                SELECT first_name, last_name, email
                FROM user_profiles
                WHERE email IS NOT NULL AND email != ''
                LIMIT 1
              `;
              if (anyProfile.length > 0 && anyProfile[0].email) {
                senderName = `${anyProfile[0].first_name || ''} ${anyProfile[0].last_name || ''}`.trim() || 'PearSign User';
                senderEmail = anyProfile[0].email;
                console.log("[Viewed] Found sender from any profile:", senderEmail);
              }
            } catch {
              console.log("[Viewed] Any profile lookup failed");
            }
          }

          if (senderEmail) {
            console.log("[Viewed] Sending notification to:", senderEmail);
            const emailResult = await sendDocumentViewedNotification({
              documentName: documentTitle,
              viewerName: session.recipient_name as string,
              viewerEmail: session.recipient_email as string,
              senderName,
              senderEmail,
              viewedAt: new Date(),
              envelopeId: tokenData.envelopeId,
            });

            if (emailResult.success) {
              console.log("[Viewed] Sent notification email to sender:", senderEmail);
            } else {
              console.log("[Viewed] Failed to send notification email:", emailResult.error);
            }
          } else {
            console.log("[Viewed] No sender email found, skipping notification");
          }
        } catch (emailErr) {
          console.error("[Viewed] Error sending notification email:", emailErr);
          console.error("[Viewed] Error details:", JSON.stringify(emailErr, Object.getOwnPropertyNames(emailErr)));
          // Don't fail the request if email fails
        }

        // Trigger document.viewed webhook
        try {
          const { triggerWebhooks } = await import("@/lib/webhook-service");
          await triggerWebhooks("document.viewed", {
            envelopeId: tokenData.envelopeId,
            documentTitle,
            signerEmail: session.recipient_email as string,
            signerName: session.recipient_name as string,
            viewedAt: new Date().toISOString(),
          });
        } catch (webhookErr) {
          console.error("[Viewed] Error triggering webhook:", webhookErr);
          // Don't fail the request if webhook fails
        }
      } else {
        console.log("[Viewed] Not first view, skipping notifications (time diff:", timeDiff, "ms)");
      }
    }

    return NextResponse.json({ success: true, viewed: true });
  } catch (error) {
    console.error("Error marking as viewed:", error);
    return NextResponse.json(
      { error: "Failed to update" },
      { status: 500 }
    );
  }
}

// Complete signing
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const body = await request.json();

    const tokenData = parseSigningToken(token);
    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid signing link" },
        { status: 400 }
      );
    }

    await ensureSigningTable();

    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const signedAt = new Date();

    const signerName = body.signerName || 'Signer';
    const signerEmail = body.signerEmail || 'signer@example.com';
    const fieldValues = body.fieldValues || {};
    const signatureData = body.signatureData || '';

    // Get the session to extract tenant ID (org_id)
    let tenantId = '';
    let session = null;
    const sessions = await sql`
      SELECT * FROM envelope_signing_sessions WHERE token = ${token}
    `;
    if (sessions.length > 0) {
      session = sessions[0];
      tenantId = session.org_id;
    } else {
      // If no session, try to get tenant from envelope
      const envelopeResult = await sql`
        SELECT organization_id FROM envelopes WHERE id = ${tokenData.envelopeId}
      `;
      if (envelopeResult.length > 0) {
        tenantId = envelopeResult[0].organization_id;
      }
    }

    // Get the document to generate signed PDF
    console.log('[Signing Complete] Looking for document with envelope_id:', tokenData.envelopeId);
    const documents = await sql`
      SELECT * FROM envelope_documents
      WHERE envelope_id = ${tokenData.envelopeId}
    `;
    console.log('[Signing Complete] Found documents:', documents.length, documents.length > 0 ? `title: ${documents[0]?.title}` : 'NONE FOUND');

    // Fetch compliance settings to determine audit trail mode
    let includeAuditOnDocument = true;
    let auditTrailEnabled = true;
    try {
      if (tenantId) {
        const complianceSettings = await sql`
          SELECT
            COALESCE(audit_trail_enabled, true) as audit_enabled,
            COALESCE(audit_trail_mode, 'attached') as audit_mode
          FROM compliance_settings
          WHERE organization_id = ${tenantId}
        `;
        if (complianceSettings.length > 0) {
          auditTrailEnabled = complianceSettings[0].audit_enabled === true;
          // If audit is disabled or mode is 'separate', don't include full audit on document
          if (!auditTrailEnabled) {
            includeAuditOnDocument = false;
          } else {
            includeAuditOnDocument = complianceSettings[0].audit_mode === 'attached';
          }
          console.log('[Signing Complete] Compliance settings:', {
            auditTrailEnabled,
            auditMode: complianceSettings[0].audit_mode,
            includeAuditOnDocument
          });
        }
      }
    } catch (err) {
      console.log('[Signing Complete] Could not fetch compliance settings, using defaults');
    }

    let signedPdfBase64 = '';
    let documentTitle = 'Document';

    // Look up the actual sender (account user) email - not the SendGrid FROM email
    let senderEmail = '';
    let senderName = 'PearSign User';

    // Method 1: Try audit log first (who sent the envelope)
    try {
      const auditResult = await sql`
        SELECT actor_name, actor_email
        FROM audit_logs
        WHERE action = 'envelope.sent'
          AND entity_id = ${tokenData.envelopeId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (auditResult.length > 0 && auditResult[0].actor_email) {
        senderName = auditResult[0].actor_name || 'PearSign User';
        senderEmail = auditResult[0].actor_email;
        console.log("[Signing Complete] Found sender from audit log:", senderEmail);
      }
    } catch (auditErr) {
      console.log("[Signing Complete] Audit log lookup failed:", auditErr);
    }

    // Method 2: Fallback to user_profiles
    if (!senderEmail) {
      try {
        if (tenantId) {
          const profileResult = await sql`
            SELECT first_name, last_name, email
            FROM user_profiles
            WHERE organization_id = ${tenantId}
              AND email IS NOT NULL AND email != ''
            LIMIT 1
          `;
          if (profileResult.length > 0 && profileResult[0].email) {
            senderName = `${profileResult[0].first_name || ''} ${profileResult[0].last_name || ''}`.trim() || 'PearSign User';
            senderEmail = profileResult[0].email;
            console.log("[Signing Complete] Found sender from user_profiles:", senderEmail);
          }
        }
      } catch (profileErr) {
        console.log("[Signing Complete] Profile lookup failed:", profileErr);
      }
    }

    // Method 3: Fallback - try any profile in the system (matches PUT handler)
    if (!senderEmail) {
      try {
        const anyProfile = await sql`
          SELECT first_name, last_name, email
          FROM user_profiles
          WHERE email IS NOT NULL AND email != ''
          LIMIT 1
        `;
        if (anyProfile.length > 0 && anyProfile[0].email) {
          senderName = `${anyProfile[0].first_name || ''} ${anyProfile[0].last_name || ''}`.trim() || 'PearSign User';
          senderEmail = anyProfile[0].email;
          console.log("[Signing Complete] Found sender from any profile:", senderEmail);
        }
      } catch {
        console.log("[Signing Complete] Any profile lookup failed");
      }
    }

    if (!senderEmail) {
      console.warn("[Signing Complete] No sender email found - completion email to sender will be skipped");
    }

    // Variable to store generated signature IDs for verification
    let signatureIds: Map<string, string> = new Map();

    if (documents.length > 0) {
      const doc = documents[0];
      documentTitle = doc.title;

      if (!doc.pdf_data && doc.pdf_object_path) {
        try {
          const { data } = await TenantObjectStorage.downloadBuffer(doc.pdf_object_path as string);
          doc.pdf_data = data.toString('base64');
          console.log('[Signing Complete] Loaded PDF from Object Storage, size:', doc.pdf_data.length);
        } catch (storageErr) {
          console.error('[Signing Complete] Failed to load PDF from Object Storage:', storageErr);
        }
      }

      console.log('[Signing Complete] Document found:', {
        title: doc.title,
        hasPdfData: !!doc.pdf_data,
        pdfDataLength: doc.pdf_data?.length || 0,
        fieldsCount: doc.signature_fields?.length || 0,
      });

      const documentHash = generateDocumentHash(doc.pdf_data);
      console.log('[Signing Complete] Document hash generated:', documentHash.substring(0, 16) + '...');

      // Create signature records for each signature/initials field
      // This generates unique PearSign IDs (PS-XXXXXXXX) for each signature
      try {
        const signatureFieldsToRecord = (doc.signature_fields || [])
          .filter((f: { type: string; id: string }) =>
            (f.type === 'signature' || f.type === 'initials') && fieldValues[f.id]
          )
          .map((f: { type: string; id: string }) => ({
            fieldId: f.id,
            fieldType: f.type as 'signature' | 'initials',
          }));

        if (signatureFieldsToRecord.length > 0) {
          console.log('[Signing Complete] Creating signature records for', signatureFieldsToRecord.length, 'fields...');

          signatureIds = await createSignaturesForSession({
            envelopeId: tokenData.envelopeId,
            documentId: doc.id || tokenData.envelopeId,
            signerId: session?.id || `signer-${Date.now()}`,
            signerName,
            signerEmail,
            fields: signatureFieldsToRecord,
            signedAt,
            ipAddress,
            userAgent,
            documentHash,
            organizationId: tenantId || 'org-1',
          });

          console.log('[Signing Complete] Created', signatureIds.size, 'signature records with PearSign IDs');
          signatureIds.forEach((id, fieldId) => {
            console.log(`[Signing Complete]   - ${fieldId}: ${id}`);
          });
        }
      } catch (sigRecordErr) {
        console.error('[Signing Complete] Error creating signature records:', sigRecordErr);
        // Continue without signature records - PDF will use fallback IDs
      }

      // Generate the signed PDF with signature overlays, PearSign IDs, AND digital signature (PKI)
      // IMPORTANT: PKI digital signature is applied LAST - no modifications allowed after this
      try {
        console.log('[Signing Complete] Generating signed PDF with visual signatures...');
        console.log('[Signing Complete] - includeAuditOnDocument:', includeAuditOnDocument);
        console.log('[Signing Complete] - signatureIds count:', signatureIds.size);
        console.log('[Signing Complete] - PKI digital signature: ENABLED (Adobe-recognized)');

        const signedPdfBytes = await generateSignedPDF({
          originalPdfBase64: doc.pdf_data,
          signatureFields: doc.signature_fields || [],
          fieldValues,
          signerName,
          signerEmail,
          signedAt,
          ipAddress,
          documentId: tokenData.envelopeId,
          documentTitle: doc.title,
          includeAuditOnDocument,
          // Enable PKI digital signature for Adobe Acrobat recognition
          // The PDF is FINAL after this - no further modifications allowed
          orgId: tenantId || 'org-1',
          applyDigitalSignature: true,
          signatureReason: `Document "${doc.title}" electronically signed by ${signerName} (${signerEmail})`,
          // Pass PearSign Signature IDs for visual display under each signature
          signatureIds,
        });

        // FINALIZATION GUARD: PDF is now digitally signed
        // Convert to base64 immediately - no further processing of PDF bytes allowed
        signedPdfBase64 = pdfBytesToBase64(signedPdfBytes);

        // Verify the signature was applied (PDF should be larger than original)
        if (signedPdfBytes.length <= doc.pdf_data.length) {
          console.warn('[Signing Complete] WARNING: Signed PDF is not larger than original - signature may not have been applied');
        }

        console.log('[Signing Complete] Signed PDF generated with PKI signature, size:', signedPdfBase64.length);
        console.log('[Signing Complete] PDF is now FINALIZED - no further modifications');
      } catch (err) {
        console.error('[Signing Complete] Error generating signed PDF:', err);
        // Fallback: Generate PDF without PKI signature
        console.log('[Signing Complete] Falling back to visual-only signatures...');
        try {
          const fallbackPdfBytes = await generateSignedPDF({
            originalPdfBase64: doc.pdf_data,
            signatureFields: doc.signature_fields || [],
            fieldValues,
            signerName,
            signerEmail,
            signedAt,
            ipAddress,
            documentId: tokenData.envelopeId,
            documentTitle: doc.title,
            includeAuditOnDocument,
            orgId: tenantId || 'org-1',
            applyDigitalSignature: false, // Fallback without PKI
            signatureReason: `Document "${doc.title}" electronically signed by ${signerName} (${signerEmail})`,
            signatureIds,
          });
          signedPdfBase64 = pdfBytesToBase64(fallbackPdfBytes);
          console.log('[Signing Complete] Fallback PDF generated (visual signatures only)');
        } catch (fallbackErr) {
          console.error('[Signing Complete] Fallback also failed:', fallbackErr);
          // Continue without signed PDF if both attempts fail
        }
      }
    } else {
      console.warn('[Signing Complete] NO DOCUMENT FOUND - Cannot generate signed PDF or send completion emails!');
    }

    let signedPdfObjectPath: string | null = null;
    let signedPdfDataForDb: string | null = signedPdfBase64;

    if (signedPdfBase64) {
      try {
        let b64 = signedPdfBase64;
        if (b64.startsWith('data:')) {
          b64 = b64.split(',')[1];
        }
        const pdfBuffer = Buffer.from(b64, 'base64');
        const storageResult = await TenantObjectStorage.uploadBuffer(
          tenantId || 'org-1',
          `${tokenData.envelopeId}_signed.pdf`,
          pdfBuffer,
          'application/pdf',
          'signed-documents'
        );
        signedPdfObjectPath = storageResult.objectPath;
        signedPdfDataForDb = null;
        console.log("[Signing Complete] Signed PDF stored in Object Storage:", signedPdfObjectPath);
      } catch (storageErr) {
        console.warn("[Signing Complete] Object Storage failed, storing in DB:", storageErr);
      }
    }

    if (!session) {
      await sql`
        INSERT INTO envelope_signing_sessions (
          org_id, envelope_id, token, recipient_name, recipient_email,
          status, field_values, signature_data, signed_pdf_data, signed_pdf_object_path, ip_address, user_agent, signed_at
        ) VALUES (
          ${tenantId || 'org-1'},
          ${tokenData.envelopeId},
          ${token},
          ${signerName},
          ${signerEmail},
          'completed',
          ${JSON.stringify(fieldValues)}::jsonb,
          ${signatureData},
          ${signedPdfDataForDb},
          ${signedPdfObjectPath},
          ${ipAddress},
          ${userAgent},
          NOW()
        )
      `;
    } else {
      await sql`
        UPDATE envelope_signing_sessions
        SET
          status = 'completed',
          field_values = ${JSON.stringify(fieldValues)}::jsonb,
          signature_data = ${signatureData},
          signed_pdf_data = ${signedPdfDataForDb},
          signed_pdf_object_path = ${signedPdfObjectPath},
          ip_address = ${ipAddress},
          user_agent = ${userAgent},
          signed_at = NOW()
        WHERE token = ${token}
      `;
    }

    // Log the signing event
    await logEnvelopeEvent('envelope.signed', {
      orgId: tenantId || 'org-1',
      envelopeId: tokenData.envelopeId,
      envelopeTitle: documentTitle,
      actorName: signerName,
      actorEmail: signerEmail,
      details: {
        ipAddress,
        userAgent: userAgent.substring(0, 100),
        signedAt: signedAt.toISOString(),
        fieldsCompleted: Object.keys(fieldValues).length,
      },
    });

    // Log the completion event
    await logEnvelopeEvent('envelope.completed', {
      orgId: tenantId || 'org-1',
      envelopeId: tokenData.envelopeId,
      envelopeTitle: documentTitle,
      actorName: 'System',
      details: {
        signerName,
        signerEmail,
        signedAt: signedAt.toISOString(),
      },
    });

    // Trigger webhook and Slack notifications
    try {
      await notifyDocumentSigned({
        envelopeId: tokenData.envelopeId,
        documentTitle,
        signerEmail,
        signerName,
      });

      // Check if all recipients have signed (for completion notification)
      const allSessions = await sql`
        SELECT COUNT(*) as total,
               COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
        FROM envelope_signing_sessions
        WHERE envelope_id = ${tokenData.envelopeId}
      `;

      const total = parseInt(allSessions[0]?.total as string) || 0;
      const completed = parseInt(allSessions[0]?.completed as string) || 0;

      if (total > 0 && total === completed) {
        await notifyDocumentCompleted({
          envelopeId: tokenData.envelopeId,
          documentTitle,
          recipientCount: total,
        });

        // Mark document as completed and set retention expiry based on tenant compliance settings
        try {
          const retentionResult = await markDocumentCompleted(
            tenantId || 'org-1',
            tokenData.envelopeId,
            signerName
          );
          if (retentionResult.success) {
            console.log('[Signing Complete] Retention set, expires:', retentionResult.retentionExpiresAt || 'never');
          }
        } catch (retentionErr) {
          console.error('[Signing Complete] Failed to set retention:', retentionErr);
          // Don't fail signing if retention tracking fails
        }
      }
    } catch (notifyErr) {
      console.error('[Signing Complete] Error sending notifications:', notifyErr);
      // Don't fail signing if notifications fail
    }

    // Send completion emails if we have the signed PDF
    console.log('[Signing Complete] signedPdfBase64 exists:', !!signedPdfBase64, 'length:', signedPdfBase64?.length || 0);
    if (signedPdfBase64) {
      try {
        console.log('[Signing Complete] Sending completion emails...');

        // Build field summary for email
        const fieldsSummary: Array<{ name: string; value: string }> = [];
        for (const [fieldId, value] of Object.entries(fieldValues)) {
          // Find field definition
          const doc = documents[0];
          const fieldDef = doc?.signature_fields?.find((f: { id: string }) => f.id === fieldId);
          if (fieldDef) {
            let displayValue = value as string;
            if (fieldDef.type === 'signature' || fieldDef.type === 'initials') {
              displayValue = '[Signed]';
            }
            fieldsSummary.push({
              name: fieldDef.type.charAt(0).toUpperCase() + fieldDef.type.slice(1),
              value: displayValue,
            });
          }
        }

        // Fetch any uploaded documents from the signer
        let additionalAttachments: Array<{ content: string; filename: string; type: string }> = [];
        try {
          const uploadedDocs = await sql`
            SELECT file_name, file_data
            FROM signer_uploaded_documents
            WHERE envelope_id = ${tokenData.envelopeId}
          `;

          if (uploadedDocs.length > 0) {
            console.log('[Signing Complete] Found', uploadedDocs.length, 'uploaded documents to attach');
            additionalAttachments = uploadedDocs.map((doc) => ({
              content: doc.file_data,
              filename: doc.file_name,
              type: 'application/octet-stream',
            }));
          }
        } catch (uploadErr) {
          console.log('[Signing Complete] Could not fetch uploaded documents:', uploadErr);
        }

        // Only send to both if we have a valid sender email
        if (senderEmail) {
          const emailResult = await sendSignedDocumentNotifications({
            documentName: documentTitle,
            signerName,
            signerEmail,
            senderName,
            senderEmail,
            signedAt,
            pdfBase64: signedPdfBase64,
            fieldsSummary,
            additionalAttachments: additionalAttachments.length > 0 ? additionalAttachments : undefined,
            orgId: tenantId, // TENANT ISOLATION: Pass orgId for proper credential lookup
          });

          console.log('[Signing Complete] Email results:', {
            signerEmail: emailResult.signerResult.success ? 'sent' : emailResult.signerResult.error,
            senderEmail: emailResult.senderResult.success ? 'sent' : emailResult.senderResult.error,
            senderRecipient: senderEmail,
            attachedUploads: additionalAttachments.length,
          });
        } else {
          // Only send to signer if no sender email found
          console.log('[Signing Complete] No sender email - sending only to signer');
          const signerResult = await sendSignerNotification({
            documentName: documentTitle,
            signerName,
            signerEmail,
            senderName: 'PearSign',
            senderEmail: process.env.SENDGRID_FROM_EMAIL || 'no-reply@premiumcapital.com',
            signedAt,
            pdfBase64: signedPdfBase64,
            fieldsSummary,
            additionalAttachments: additionalAttachments.length > 0 ? additionalAttachments : undefined,
            orgId: tenantId, // TENANT ISOLATION: Pass orgId for proper credential lookup
          });
          console.log('[Signing Complete] Signer email result:', signerResult.success ? 'sent' : signerResult.error);
        }
      } catch (err) {
        console.error('[Signing Complete] Error sending emails:', err);
        // Don't fail the signing if emails fail
      }

      // Auto-save to cloud storage if enabled
      try {
        // Save to Google Drive
        await saveSignedDocumentToDrive(documentTitle, signedPdfBase64, signerName);
      } catch (driveErr) {
        console.error('[Signing Complete] Error saving to Google Drive:', driveErr);
      }

      try {
        // Save to Dropbox
        await saveSignedDocumentToDropbox(documentTitle, signedPdfBase64, signerName);
      } catch (dropboxErr) {
        console.error('[Signing Complete] Error saving to Dropbox:', dropboxErr);
      }

      // Sync to Salesforce
      try {
        // Sync signer as contact
        await syncSignerToSalesforce({
          email: signerEmail,
          name: signerName,
        });

        // Log signing task
        await logSigningTask({
          contactEmail: signerEmail,
          documentTitle,
          signedAt,
          envelopeId: tokenData.envelopeId,
        });
      } catch (salesforceErr) {
        console.error('[Signing Complete] Error syncing to Salesforce:', salesforceErr);
      }
    }

    return NextResponse.json({
      success: true,
      completed: true,
      message: "Document signed successfully",
      downloadUrl: `/api/public/sign/${token}/download`,
      auditUrl: `/api/public/sign/${token}/audit`,
    });
  } catch (error) {
    console.error("Error completing signing:", error);
    return NextResponse.json(
      { error: "Failed to complete signing" },
      { status: 500 }
    );
  }
}
