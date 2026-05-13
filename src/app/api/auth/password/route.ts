import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, verifyPassword, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';

// PATCH /api/auth/password — Change user password
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
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Mevcut şifre ve yeni şifre gereklidir.' },
        { status: 400 },
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Yeni şifre en az 6 karakter olmalıdır.' },
        { status: 400 },
      );
    }

    if (newPassword.length > 100) {
      return NextResponse.json(
        { error: 'Şifre en fazla 100 karakter olabilir.' },
        { status: 400 },
      );
    }

    // Verify current password
    const dbUser = await db.user.findUnique({ where: { id: user.userId } });
    if (!dbUser) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı.' },
        { status: 404 },
      );
    }

    const isValid = await verifyPassword(currentPassword, dbUser.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Mevcut şifre hatalı.' },
        { status: 401 },
      );
    }

    // Hash and save new password
    const hashedPassword = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ message: 'Şifre başarıyla değiştirildi.' });
  } catch (error) {
    console.error('[auth/password] PATCH error:', error);
    return NextResponse.json(
      { error: 'Şifre değiştirilemedi.' },
      { status: 500 },
    );
  }
}
