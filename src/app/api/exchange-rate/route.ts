import { NextRequest, NextResponse } from 'next/server';
import { getExchangeRate } from '@/lib/yahoo-finance';

// GET /api/exchange-rate?date=2024-01-15 — Get USD/TRY exchange rate
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    let result;

    if (dateParam) {
      // Historical rate
      const date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 },
        );
      }
      result = await getExchangeRate(date);
    } else {
      // Current rate
      result = await getExchangeRate();
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to fetch exchange rate' },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[exchange-rate] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange rate' },
      { status: 500 },
    );
  }
}
