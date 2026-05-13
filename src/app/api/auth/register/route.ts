import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, signToken, getCookieName } from '@/lib/auth';

// POST /api/auth/register — Register a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, displayName } = body;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Kullanıcı adı ve şifre gereklidir.' },
        { status: 400 },
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Kullanıcı adı en az 3 karakter olmalıdır.' },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Şifre en az 6 karakter olmalıdır.' },
        { status: 400 },
      );
    }

    // Check if username already exists
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: 'Bu kullanıcı adı zaten kullanılıyor.' },
        { status: 409 },
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await db.user.create({
      data: {
        username,
        password: hashedPassword,
        displayName: displayName || null,
      },
    });

    // ── Data Migration: Claim orphaned data ────────────────────────────────
    // If this is the first user, assign all existing userId=null transactions
    // and settings to this user so that pre-existing data is preserved.
    const userCount = await db.user.count();
    if (userCount === 1) {
      // This is the first user — claim all orphaned data
      await db.transaction.updateMany({
        where: { userId: null },
        data: { userId: user.id },
      });
      await db.setting.updateMany({
        where: { userId: null },
        data: { userId: user.id },
      });
      console.log(`[auth/register] Migrated orphaned data to user ${user.username}`);
    }

    // Sign JWT token
    const token = await signToken({
      userId: user.id,
      username: user.username,
    });

    // Create response with cookie
    const response = NextResponse.json(
      {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      { status: 201 },
    );

    response.cookies.set(getCookieName(), token, {
      httpOnly: true,
      secure: false, // Allow HTTP in development/Docker; use reverse proxy for HTTPS
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[auth/register] POST error:', error);
    return NextResponse.json(
      { error: 'Kayıt oluşturulamadı.' },
      { status: 500 },
    );
  }
}
