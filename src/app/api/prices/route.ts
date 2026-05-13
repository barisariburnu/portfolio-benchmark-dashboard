import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalPrices, getCurrentPrice, setForceRefresh } from '@/lib/yahoo-finance';
import { getUserFromRequest } from '@/lib/auth';

// GET /api/prices?symbols=VOO,QQQ — Get current prices
// GET /api/prices?symbol=VOO&date=2025-01-15 — Get historical price for a symbol on a specific date
// Note: All results are cached for 24 hours on disk. DRIP form allows manual price entry.
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');
    const singleSymbol = searchParams.get('symbol');
    const dateParam = searchParams.get('date');

    // Historical price lookup for a single symbol on a specific date
    if (singleSymbol && dateParam) {
      const targetDate = new Date(dateParam);

      try {
        const startDate = new Date(targetDate);
        startDate.setDate(startDate.getDate() - 7);
        const endDate = new Date(targetDate);
        endDate.setDate(endDate.getDate() + 3);

        const histPrices = await getHistoricalPrices(singleSymbol.toUpperCase(), startDate, endDate);

        if (histPrices.length > 0) {
          // Find closest date to the target
          const targetTime = targetDate.getTime();
          const closest = histPrices.reduce((prev, curr) => {
            const prevDiff = Math.abs(new Date(prev.date).getTime() - targetTime);
            const currDiff = Math.abs(new Date(curr.date).getTime() - targetTime);
            return currDiff < prevDiff ? curr : prev;
          });

          return NextResponse.json({
            symbol: singleSymbol.toUpperCase(),
            price: closest.close,
            date: closest.date,
            source: 'historical',
          });
        }
      } catch {
        // Historical fetch failed, try current price
      }

      // Fallback to current price
      const currentPrice = await getCurrentPrice(singleSymbol.toUpperCase());
      if (currentPrice !== null) {
        return NextResponse.json({
          symbol: singleSymbol.toUpperCase(),
          price: currentPrice,
          date: dateParam,
          source: 'current_fallback',
        });
      }

      return NextResponse.json(
        { error: `${singleSymbol} icin fiyat bulunamadi.` },
        { status: 404 },
      );
    }

    // Multiple current prices
    if (symbolsParam) {
      const symbols = symbolsParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (symbols.length === 0) {
        return NextResponse.json(
          { error: 'No valid symbols provided' },
          { status: 400 },
        );
      }

      const result: Record<string, number | null> = {};
      for (const symbol of symbols) {
        try {
          result[symbol] = await getCurrentPrice(symbol);
        } catch {
          result[symbol] = null;
        }
      }
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Missing "symbols" or "symbol" + "date" query parameters' },
      { status: 400 },
    );
  } catch (error) {
    console.error('[prices] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 500 },
    );
  }
}
