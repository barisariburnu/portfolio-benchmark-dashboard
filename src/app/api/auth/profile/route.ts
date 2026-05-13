import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, signToken, getCookieName } from '@/lib/auth';
import { db } from '@/lib/db';

// PATCH /api/auth/profile — Update user profile (displayName, username)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Oturum açmanız gerekiyor.' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { displayName, username } = body as {
      displayName?: string;
      username?: string;
    };

    // Build update data
    const updateData: { displayName?: string | null; username?: string } = {};

    // Handle displayName update
    if (displayName !== undefined) {
      const trimmed = displayName.trim();
      if (trimmed.length > 50) {
        return NextResponse.json(
          { error: 'Görünen ad en fazla 50 karakter olabilir.' },
          { status: 400 },
        );
      }
      updateData.displayName = trimmed || null;
    }

    // Handle username update
    if (username !== undefined) {
      const trimmed = username.trim().toLowerCase();
      if (trimmed.length < 3) {
        return NextResponse.json(
          { error: 'Kullanıcı adı en az 3 karakter olmalıdır.' },
          { status: 400 },
        );
      }
      if (trimmed.length > 30) {
        return NextResponse.json(
          { error: 'Kullanıcı adı en fazla 30 karakter olabilir.' },
          { status: 400 },
        );
      }
      if (!/^[a-z0-9_çğıöşü]+$/.test(trimmed)) {
        return NextResponse.json(
          { error: 'Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir.' },
          { status: 400 },
        );
      }
      // Check if username is taken by another user
      if (trimmed !== user.username) {
        const existing = await db.user.findUnique({ where: { username: trimmed } });
        if (existing) {
          return NextResponse.json(
            { error: 'Bu kullanıcı adı zaten kullanılıyor.' },
            { status: 409 },
          );
        }
      }
      updateData.username = trimmed;
    }

    // Nothing to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Güncellenecek bilgi bulunamadı.' },
        { status: 400 },
      );
    }

    // Update user
    const updatedUser = await db.user.update({
      where: { id: user.userId },
      data: updateData,
      select: { id: true, username: true, displayName: true, createdAt: true },
    });

    // If username changed, we need to re-sign the JWT token
    const response = NextResponse.json({
      userId: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.displayName,
      createdAt: updatedUser.createdAt,
    });

    if (updateData.username) {
      const token = await signToken({
        userId: updatedUser.id,
        username: updatedUser.username,
      });
      response.cookies.set(getCookieName(), token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('[auth/profile] PATCH error:', error);
    return NextResponse.json(
      { error: 'Profil güncellenemedi.' },
      { status: 500 },
    );
  }
}
