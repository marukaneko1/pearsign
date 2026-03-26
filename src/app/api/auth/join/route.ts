import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { AuthService, initializeAuthTables, hashPassword } from '@/lib/auth-service';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 });
  }

  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token TEXT`;

    const result = await sql`
      SELECT u.email, u.role, u.status, u.organization_id, t.name as tenant_name
      FROM users u
      JOIN tenants t ON t.id = u.organization_id
      WHERE u.invite_token = ${token} AND u.status = 'invited'
    `;

    if (result.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'This invitation link is invalid or has already been used.'
      }, { status: 404 });
    }

    const invite = result[0];
    return NextResponse.json({
      success: true,
      invite: {
        email: invite.email,
        role: invite.role,
        orgName: invite.tenant_name,
      }
    });
  } catch (error) {
    console.error('[Join] Error validating invite:', error);
    return NextResponse.json({ success: false, error: 'Failed to validate invite' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, firstName, lastName, password } = body;

    if (!token || !firstName || !lastName || !password) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token TEXT`;
    await initializeAuthTables();

    const inviteResult = await sql`
      SELECT u.id, u.email, u.role, u.organization_id, t.name as tenant_name
      FROM users u
      JOIN tenants t ON t.id = u.organization_id
      WHERE u.invite_token = ${token} AND u.status = 'invited'
    `;

    if (inviteResult.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'This invitation link is invalid or has already been used.'
      }, { status: 404 });
    }

    const invite = inviteResult[0];
    const email = invite.email;
    const tenantId = invite.organization_id;

    const existingAuth = await sql`
      SELECT id FROM auth_users WHERE email = ${email.toLowerCase()}
    `;

    let authUserId: string;

    if (existingAuth.length > 0) {
      authUserId = existingAuth[0].id;
      const hashedPassword = await hashPassword(password);
      await sql`
        UPDATE auth_users
        SET password_hash = ${hashedPassword},
            first_name = ${firstName},
            last_name = ${lastName},
            email_verified = true,
            updated_at = NOW()
        WHERE id = ${authUserId}
      `;
      if (process.env.NODE_ENV !== 'production') console.log('[Join] Updated existing auth user:', authUserId);
    } else {
      const registerResult = await AuthService.register({
        email,
        password,
        firstName,
        lastName,
      });

      if (!registerResult.success || !registerResult.user) {
        return NextResponse.json(
          { success: false, error: registerResult.error || 'Failed to create account' },
          { status: 400 }
        );
      }

      authUserId = registerResult.user.id;

      await sql`
        UPDATE auth_users SET email_verified = true WHERE id = ${authUserId}
      `;
      if (process.env.NODE_ENV !== 'production') console.log('[Join] Created new auth user:', authUserId);
    }

    const tuId = `tu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await sql`
      INSERT INTO tenant_users (id, user_id, tenant_id, role, status, joined_at, created_at, updated_at)
      VALUES (${tuId}, ${authUserId}, ${tenantId}, ${invite.role}, 'active', NOW(), NOW(), NOW())
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET role = ${invite.role}, status = 'active', joined_at = NOW(), updated_at = NOW()
    `;

    await sql`
      UPDATE users
      SET first_name = ${firstName},
          last_name = ${lastName},
          status = 'active',
          invite_token = NULL,
          updated_at = NOW()
      WHERE id = ${invite.id}
    `;

    if (process.env.NODE_ENV !== 'production') console.log('[Join] Team member joined successfully:', email, 'org:', tenantId);

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. You can now sign in.'
    });

  } catch (error) {
    console.error('[Join] Error processing join:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
