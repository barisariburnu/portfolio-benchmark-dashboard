import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentPrice, getExchangeRate, getHistoricalPrices } from '@/lib/yahoo-finance';
import { getUserFromRequest } from '@/lib/auth';

// ── Precision Helper ────────────────────────────────────────────────────────
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// POST /api/dividends — Add a dividend
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const { symbol, date, type, price, quantity, amount } = body;

    // Validate required fields
    if (!symbol || !date || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, date, type' },
        { status: 400 },
      );
    }

    const validTypes = ['DRIP', 'CASH'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid dividend type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const txDate = new Date(date);

    // Auto-fetch exchange rate
    const exchangeRateResult = await getExchangeRate(txDate);
    const exchangeRate = roundTo(exchangeRateResult?.rate ?? 0, 6);

    let transaction;

    if (type === 'DRIP') {
      // DRIP: user provides both price and quantity of shares received
      if (quantity == null || quantity <= 0) {
        return NextResponse.json(
          { error: 'DRIP requires a positive quantity' },
          { status: 400 },
        );
      }

      const quantityRounded = roundTo(quantity, 6);

      // Use user-provided price if available, otherwise fallback to historical/current price
      let effectivePrice: number | null = null;

      if (price != null && price > 0) {
        // User provided the price directly
        effectivePrice = price;
      } else {
        // Fetch the price of the symbol on that date (try historical first, fallback to current)
        try {
          const startDate = new Date(txDate);
          startDate.setDate(startDate.getDate() - 5);
          const endDate = new Date(txDate);
          endDate.setDate(endDate.getDate() + 5);

          const histPrices = await getHistoricalPrices(symbol, startDate, endDate);
          if (histPrices.length > 0) {
            // Find closest date to the target
            const targetTime = txDate.getTime();
            const closest = histPrices.reduce((prev, curr) => {
              const prevDiff = Math.abs(new Date(prev.date).getTime() - targetTime);
              const currDiff = Math.abs(new Date(curr.date).getTime() - targetTime);
              return currDiff < prevDiff ? curr : prev;
            });
            effectivePrice = closest.close;
          }
        } catch {
          // Historical price fetch failed, fall through to current price
        }

        // Fallback to current price if historical not available
        if (effectivePrice == null) {
          effectivePrice = await getCurrentPrice(symbol);
        }

        if (effectivePrice == null) {
          return NextResponse.json(
            { error: `Failed to fetch price for ${symbol}` },
            { status: 502 },
          );
        }
      }

      const priceRounded = roundTo(effectivePrice, 6);
      const totalUSD = roundTo(priceRounded * quantityRounded, 6);
      const totalTRY = roundTo(totalUSD * exchangeRate, 6);

      transaction = await db.transaction.create({
        data: {
          type: 'DRIP',
          symbol: symbol.toUpperCase(),
          date: txDate,
          price: priceRounded,
          quantity: quantityRounded,
          commission: 0,
          notes: `DRIP dividend - ${quantityRounded} shares`,
          exchangeRate,
          totalUSD,
          totalTRY,
          userId: user.userId,
        },
      });
    } else {
      // CASH: user provides total USD amount
      if (amount == null || amount <= 0) {
        return NextResponse.json(
          { error: 'CASH dividend requires a positive amount' },
          { status: 400 },
        );
      }

      const amountRounded = roundTo(amount, 6);
      // For DIVIDEND_CASH: price = amount, quantity = 1
      const totalUSD = amountRounded;
      const totalTRY = roundTo(totalUSD * exchangeRate, 6);

      transaction = await db.transaction.create({
        data: {
          type: 'DIVIDEND_CASH',
          symbol: symbol.toUpperCase(),
          date: txDate,
          price: amountRounded,
          quantity: 1,
          commission: 0,
          notes: `Cash dividend - $${amountRounded.toFixed(2)}`,
          exchangeRate,
          totalUSD,
          totalTRY,
          userId: user.userId,
        },
      });
    }

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error('[dividends] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to add dividend' },
      { status: 500 },
    );
  }
}
