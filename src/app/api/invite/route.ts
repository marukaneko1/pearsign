import { NextRequest, NextResponse } from 'next/server';
import { OrganizationInviteService, initializeAdminTables } from '@/lib/admin-tenant-service';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    await initializeAdminTables();
    const invite = await OrganizationInviteService.getInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: `This invite has already been ${invite.status}` }, { status: 410 });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'This invite link has expired' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      invite: {
        tenantName: invite.tenantName,
        ownerEmail: invite.ownerEmail,
        ownerName: invite.ownerName,
        allowedDomain: invite.allowedDomain,
        plan: invite.plan,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    console.error('[Invite] Validation error:', error);
    return NextResponse.json({ error: 'Failed to validate invite' }, { status: 500 });
  }
}
