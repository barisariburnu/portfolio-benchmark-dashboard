import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET /api/settings — Get all settings for the current user
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const settings = await db.setting.findMany({
      where: { userId: user.userId },
      orderBy: { key: 'asc' },
    });

    // Return as key-value object for convenience
    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    return NextResponse.json({
      settings: settingsMap,
      raw: settings,
    });
  } catch (error) {
    console.error('[settings] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 },
    );
  }
}

// POST /api/settings — Update a setting (upsert) for the current user
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key || value == null) {
      return NextResponse.json(
        { error: 'Missing required fields: key, value' },
        { status: 400 },
      );
    }

    // Upsert setting with composite unique key (key + userId)
    const existing = await db.setting.findFirst({
      where: { key, userId: user.userId },
    });

    let setting;
    if (existing) {
      setting = await db.setting.update({
        where: { id: existing.id },
        data: { value: String(value) },
      });
    } else {
      setting = await db.setting.create({
        data: {
          key,
          value: String(value),
          userId: user.userId,
        },
      });
    }

    return NextResponse.json(setting);
  } catch (error) {
    console.error('[settings] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update setting' },
      { status: 500 },
    );
  }
}
