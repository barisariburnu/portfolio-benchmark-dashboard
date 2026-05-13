import { NextResponse } from 'next/server';
import { getCookieName } from '@/lib/auth';

// POST /api/auth/logout — Logout user
export async function POST() {
  try {
    const response = NextResponse.json({ success: true });

    response.cookies.set(getCookieName(), '', {
      httpOnly: true,
      secure: false, // Allow HTTP in development/Docker; use reverse proxy for HTTPS
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[auth/logout] POST error:', error);
    return NextResponse.json(
      { error: 'Çıkış yapılamadı.' },
      { status: 500 },
    );
  }
}
