import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, signToken, getCookieName } from '@/lib/auth';

// POST /api/auth/login — Login user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Kullanıcı adı ve şifre gereklidir.' },
        { status: 400 },
      );
    }

    // Find user
    const user = await db.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json(
        { error: 'Kullanıcı adı veya şifre hatalı.' },
        { status: 401 },
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Kullanıcı adı veya şifre hatalı.' },
        { status: 401 },
      );
    }

    // Sign JWT token
    const token = await signToken({
      userId: user.id,
      username: user.username,
    });

    // Create response with cookie
    const response = NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
    });

    response.cookies.set(getCookieName(), token, {
      httpOnly: true,
      secure: false, // Allow HTTP in development/Docker; use reverse proxy for HTTPS
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[auth/login] POST error:', error);
    return NextResponse.json(
      { error: 'Giriş yapılamadı.' },
      { status: 500 },
    );
  }
}
