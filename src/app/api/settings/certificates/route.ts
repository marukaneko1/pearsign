/**
 * Signing Certificates API
 *
 * Manage X.509 signing certificates for digital signatures
 * Supports:
 * - Self-signed certificate generation
 * - CA-issued certificate import
 * - Certificate chain validation
 *
 * Multi-tenancy enforced via withTenant middleware
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  generateSigningCertificate,
  getOrganizationCertificates,
  importSigningCertificate,
  validateCertificate,
  splitPemBundle,
} from '@/lib/pdf-digital-signature';

/**
 * GET /api/settings/certificates
 * Get all signing certificates for the organization
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const certificates = await getOrganizationCertificates(tenantId);

      const publicCerts = certificates.map((cert) => ({
        id: cert.id,
        name: cert.name || cert.subject.commonName,
        usage: cert.usage || 'signing',
        subject: cert.subject,
        issuer: cert.issuer,
        serialNumber: cert.serialNumber,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        fingerprint: cert.fingerprint,
        isDefault: cert.isDefault,
        isSelfSigned: cert.isSelfSigned,
        isCAIssued: cert.isCAIssued,
        chainValidated: cert.chainValidated,
        hasChain: (cert.certificateChain?.length || 0) > 0,
        chainCertificateCount: cert.certificateChain?.length || 0,
        hasPrivateKey: !!cert.privateKey,
        createdAt: cert.createdAt,
        isValid: cert.validTo > new Date(),
        isExpired: cert.validTo < new Date(),
      }));

      return NextResponse.json({
        success: true,
        data: publicCerts,
      });
    } catch (error) {
      console.error('[Certificates API] Error fetching certificates:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch certificates' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/settings/certificates
 * Generate a new self-signed certificate OR import a CA-issued certificate
 *
 * For self-signed generation:
 * { action: 'generate', commonName, organizationName, countryName?, emailAddress?, validityDays? }
 *
 * For CA-issued import:
 * { action: 'import', certificate, privateKey, privateKeyPassword?, certificateChain?, setAsDefault? }
 *
 * For validation only:
 * { action: 'validate', certificate, certificateChain? }
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { action = 'generate' } = body;

      // Handle certificate validation (no import, just check)
      if (action === 'validate') {
        const { certificate, certificateChain = [] } = body;

        if (!certificate) {
          return NextResponse.json(
            { success: false, error: 'Certificate PEM is required' },
            { status: 400 }
          );
        }

        const validation = validateCertificate(certificate, certificateChain);

        return NextResponse.json({
          success: true,
          action: 'validate',
          validation,
        });
      }

      if (action === 'import') {
        const {
          certificate,
          privateKey,
          privateKeyPassword,
          certificateChain = [],
          caBundle,
          setAsDefault = true,
          name,
          usage = 'signing',
        } = body;

        // Validate required fields
        if (!certificate || !privateKey) {
          return NextResponse.json(
            { success: false, error: 'Certificate and privateKey are required for import' },
            { status: 400 }
          );
        }

        // Parse CA bundle if provided (for AATL/eIDAS certificates)
        let finalChain: string[] = certificateChain;
        if (caBundle && typeof caBundle === 'string') {
          if (process.env.NODE_ENV !== 'production') console.log('[Certificates API] Parsing CA bundle for AATL/eIDAS chain...');
          const parsedChain = splitPemBundle(caBundle);
          if (parsedChain.length > 0) {
            // Merge: user-provided chain first, then parsed bundle
            finalChain = [...certificateChain, ...parsedChain];
            if (process.env.NODE_ENV !== 'production') console.log(`[Certificates API] CA bundle added ${parsedChain.length} certificate(s) to chain`);
          }
        }

        const result = await importSigningCertificate({
          orgId: tenantId,
          certificate,
          privateKey,
          privateKeyPassword,
          certificateChain: finalChain,
          setAsDefault,
          name,
          usage,
        });

        if (!result.success) {
          return NextResponse.json(
            {
              success: false,
              error: result.error,
              validation: result.validation,
            },
            { status: 400 }
          );
        }

        const chainCount = result.certificate!.certificateChain?.length || 0;
        return NextResponse.json({
          success: true,
          action: 'import',
          data: {
            id: result.certificate!.id,
            subject: result.certificate!.subject,
            issuer: result.certificate!.issuer,
            serialNumber: result.certificate!.serialNumber,
            validFrom: result.certificate!.validFrom,
            validTo: result.certificate!.validTo,
            fingerprint: result.certificate!.fingerprint,
            isDefault: result.certificate!.isDefault,
            isSelfSigned: result.certificate!.isSelfSigned,
            isCAIssued: result.certificate!.isCAIssued,
            chainValidated: result.certificate!.chainValidated,
            chainCertificateCount: chainCount,
            createdAt: result.certificate!.createdAt,
          },
          validation: result.validation,
          message: result.certificate!.isCAIssued
            ? `AATL/CA-issued certificate imported successfully with ${chainCount} chain certificate(s)`
            : 'Certificate imported successfully',
        });
      }

      // Handle self-signed certificate generation (default)
      const {
        commonName,
        organizationName,
        countryName = 'US',
        emailAddress,
        validityDays = 365 * 3, // 3 years default
      } = body;

      // Validate required fields
      if (!commonName || !organizationName) {
        return NextResponse.json(
          { success: false, error: 'commonName and organizationName are required' },
          { status: 400 }
        );
      }

      // Generate new self-signed certificate
      const certificate = await generateSigningCertificate({
        orgId: tenantId,
        commonName,
        organizationName,
        countryName,
        emailAddress,
        validityDays,
      });

      return NextResponse.json({
        success: true,
        action: 'generate',
        data: {
          id: certificate.id,
          subject: certificate.subject,
          issuer: certificate.issuer,
          serialNumber: certificate.serialNumber,
          validFrom: certificate.validFrom,
          validTo: certificate.validTo,
          fingerprint: certificate.fingerprint,
          isDefault: certificate.isDefault,
          isSelfSigned: certificate.isSelfSigned,
          isCAIssued: certificate.isCAIssued,
          chainValidated: certificate.chainValidated,
          createdAt: certificate.createdAt,
        },
        message: 'Self-signed certificate generated successfully',
      });
    } catch (error) {
      console.error('[Certificates API] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to process certificate request' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageTeam'], // Require admin permissions
  }
);

/**
 * PUT /api/settings/certificates
 * Set the default signing certificate
 */
export const PUT = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { certificateId } = body;

      if (!certificateId) {
        return NextResponse.json(
          { success: false, error: 'certificateId is required' },
          { status: 400 }
        );
      }

      // Get all certificates to verify and update
      const certificates = await getOrganizationCertificates(tenantId);
      const targetCert = certificates.find((c) => c.id === certificateId);

      if (!targetCert) {
        return NextResponse.json(
          { success: false, error: 'Certificate not found' },
          { status: 404 }
        );
      }

      // Check if certificate is expired
      if (targetCert.validTo < new Date()) {
        return NextResponse.json(
          { success: false, error: 'Cannot set an expired certificate as default' },
          { status: 400 }
        );
      }

      // Import sql for direct updates
      const { sql } = await import('@/lib/db');

      // Unset all other defaults
      await sql`
        UPDATE signing_certificates
        SET is_default = false
        WHERE org_id = ${tenantId}
      `;

      // Set new default
      await sql`
        UPDATE signing_certificates
        SET is_default = true
        WHERE id = ${certificateId} AND org_id = ${tenantId}
      `;

      return NextResponse.json({
        success: true,
        message: 'Default certificate updated successfully',
        data: {
          id: targetCert.id,
          subject: targetCert.subject,
          isSelfSigned: targetCert.isSelfSigned,
          isCAIssued: targetCert.isCAIssued,
        },
      });
    } catch (error) {
      console.error('[Certificates API] Error updating default certificate:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update default certificate' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageTeam'],
  }
);

/**
 * DELETE /api/settings/certificates
 * Delete a signing certificate (cannot delete the default)
 */
export const DELETE = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const certificateId = searchParams.get('id');

      if (!certificateId) {
        return NextResponse.json(
          { success: false, error: 'Certificate ID is required' },
          { status: 400 }
        );
      }

      // Use the deleteCertificate service function
      const { deleteCertificate } = await import('@/lib/pdf-digital-signature');
      const result = await deleteCertificate(tenantId, certificateId);

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Certificate deleted successfully',
      });
    } catch (error) {
      console.error('[Certificates API] Error deleting certificate:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete certificate' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageTeam'],
  }
);
