import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/auth/me — Get current authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Oturum açmanız gerekiyor.' },
        { status: 401 },
      );
    }

    // Fetch full user info including displayName
    const fullUser = await db.user.findUnique({
      where: { id: user.userId },
      select: { id: true, username: true, displayName: true, createdAt: true },
    });

    if (!fullUser) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      userId: fullUser.id,
      username: fullUser.username,
      displayName: fullUser.displayName,
      createdAt: fullUser.createdAt,
    });
  } catch (error) {
    console.error('[auth/me] GET error:', error);
    return NextResponse.json(
      { error: 'Kullanıcı bilgisi alınamadı.' },
      { status: 500 },
    );
  }
}
