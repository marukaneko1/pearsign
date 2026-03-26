/**
 * Branding Logo API
 *
 * Multi-tenancy enforced via withTenant middleware (POST/DELETE)
 * GET is public to serve logo images but uses tenant query param
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { clearBrandingCache } from '@/lib/email-service';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { getTenantSessionContext } from '@/lib/tenant-session';
import { TenantObjectStorage } from '@/lib/object-storage';

/**
 * POST /api/settings/branding/logo
 * Upload a logo image and store it in the database for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const formData = await request.formData();
      const file = formData.get('logo') as File | null;

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'File must be an image' },
          { status: 400 }
        );
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File must be less than 2MB' },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = file.type;

      let logoObjectPath: string | null = null;
      let base64: string | null = null;

      try {
        const result = await TenantObjectStorage.uploadBuffer(
          tenantId,
          `logo${file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.png'}`,
          buffer,
          mimeType,
          'branding'
        );
        logoObjectPath = result.objectPath;
        console.log("[Logo Upload] Stored in Object Storage:", logoObjectPath);
      } catch (storageErr) {
        console.warn("[Logo Upload] Object Storage failed, falling back to DB:", storageErr);
        base64 = buffer.toString('base64');
      }

      const now = new Date().toISOString();
      const logoUrl = `/api/settings/branding/logo?t=${Date.now()}`;

      const existing = await sql`
        SELECT id FROM branding_settings WHERE organization_id = ${tenantId}
      `;

      if (existing.length === 0) {
        await sql`
          INSERT INTO branding_settings (id, organization_id, product_name, primary_color, logo_data, logo_mime_type, logo_url, logo_object_path)
          VALUES (gen_random_uuid(), ${tenantId}, 'PearSign', '#2563eb', ${base64}, ${mimeType}, ${logoUrl}, ${logoObjectPath})
        `;
      } else {
        await sql`
          UPDATE branding_settings
          SET logo_data = ${base64},
              logo_mime_type = ${mimeType},
              logo_url = ${logoUrl},
              logo_object_path = ${logoObjectPath},
              updated_at = ${now}
          WHERE organization_id = ${tenantId}
        `;
      }

      clearBrandingCache();

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

      return NextResponse.json({
        success: true,
        logoUrl: `${baseUrl}${logoUrl}`,
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      return NextResponse.json(
        { error: 'Failed to upload logo' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);

/**
 * GET /api/settings/branding/logo
 * Serve the logo image - public endpoint but tenant-aware
 */
export async function GET(request: NextRequest) {
  try {
    let orgId: string | null = null;

    try {
      const sessionContext = await getTenantSessionContext();
      if (sessionContext && sessionContext.isValid) {
        orgId = sessionContext.session.tenantId;
      }
    } catch {
      // No session available
    }

    // Also check for tenant query param (for emails, etc.)
    const { searchParams } = new URL(request.url);
    const tenantParam = searchParams.get('tenant');
    if (tenantParam) {
      orgId = tenantParam;
    }

    if (!orgId) {
      return new NextResponse(null, { status: 401 });
    }

    const result = await sql`
      SELECT logo_data, logo_mime_type, logo_object_path
      FROM branding_settings
      WHERE organization_id = ${orgId}
    `;

    if (result.length === 0 || (!result[0].logo_data && !result[0].logo_object_path)) {
      return new NextResponse(null, { status: 404 });
    }

    const row = result[0];

    let buffer: Buffer;
    let contentType: string;

    if (row.logo_object_path) {
      try {
        const { data, contentType: ct } = await TenantObjectStorage.downloadBuffer(row.logo_object_path as string);
        buffer = data;
        contentType = ct;
      } catch {
        if (!row.logo_data) {
          return new NextResponse(null, { status: 404 });
        }
        buffer = Buffer.from(row.logo_data as string, 'base64');
        contentType = (row.logo_mime_type as string) || 'image/png';
      }
    } else {
      buffer = Buffer.from(row.logo_data as string, 'base64');
      contentType = (row.logo_mime_type as string) || 'image/png';
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving logo:', error);
    return new NextResponse(null, { status: 500 });
  }
}

/**
 * DELETE /api/settings/branding/logo
 * Remove the logo for the current tenant
 */
export const DELETE = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const now = new Date().toISOString();

      const existing = await sql`
        SELECT logo_object_path FROM branding_settings WHERE organization_id = ${tenantId}
      `;

      if (existing.length > 0 && existing[0].logo_object_path) {
        try {
          await TenantObjectStorage.deleteObject(tenantId, existing[0].logo_object_path as string);
        } catch (err) {
          console.warn("[Logo Delete] Failed to remove from Object Storage:", err);
        }
      }

      await sql`
        UPDATE branding_settings
        SET logo_data = NULL,
            logo_mime_type = NULL,
            logo_url = NULL,
            logo_object_path = NULL,
            updated_at = ${now}
        WHERE organization_id = ${tenantId}
      `;

      clearBrandingCache();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error removing logo:', error);
      return NextResponse.json(
        { error: 'Failed to remove logo' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
