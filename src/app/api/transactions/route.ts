import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getExchangeRate } from '@/lib/yahoo-finance';
import { getUserFromRequest } from '@/lib/auth';

// ── Precision Helpers ───────────────────────────────────────────────────────
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// GET /api/transactions — List all transactions for the current user
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const transactions = await db.transaction.findMany({
      where: { userId: user.userId },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('[transactions] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 },
    );
  }
}

// POST /api/transactions — Add a new transaction
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const { type, symbol, date, price, quantity, commission, notes } = body;

    // Validate required fields
    if (!type || !symbol || !date || price == null || quantity == null) {
      return NextResponse.json(
        { error: 'Missing required fields: type, symbol, date, price, quantity' },
        { status: 400 },
      );
    }

    const validTypes = ['BUY', 'SELL', 'DRIP', 'DIVIDEND_CASH'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid transaction type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    // Round input values to 6 decimal places to avoid floating-point drift
    const priceRounded = roundTo(price, 6);
    const quantityRounded = roundTo(quantity, 6);
    const commissionValue = roundTo(commission ?? 0, 6);

    // Auto-fetch exchange rate for the transaction date
    const txDate = new Date(date);
    const exchangeRateResult = await getExchangeRate(txDate);
    const exchangeRate = roundTo(exchangeRateResult?.rate ?? 0, 6);

    // Calculate totalUSD based on transaction type — use rounded inputs
    let totalUSD: number;
    switch (type) {
      case 'BUY':
        totalUSD = roundTo(priceRounded * quantityRounded + commissionValue, 6);
        break;
      case 'SELL':
        totalUSD = roundTo(priceRounded * quantityRounded - commissionValue, 6);
        break;
      case 'DRIP':
        totalUSD = roundTo(priceRounded * quantityRounded, 6);
        break;
      case 'DIVIDEND_CASH':
        // price = total amount, quantity = 1
        totalUSD = roundTo(priceRounded * quantityRounded, 6);
        break;
      default:
        totalUSD = roundTo(priceRounded * quantityRounded, 6);
    }

    const totalTRY = roundTo(totalUSD * exchangeRate, 6);

    const transaction = await db.transaction.create({
      data: {
        type,
        symbol: symbol.toUpperCase(),
        date: txDate,
        price: priceRounded,
        quantity: quantityRounded,
        commission: commissionValue,
        notes: notes ?? null,
        exchangeRate,
        totalUSD,
        totalTRY,
        userId: user.userId,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error('[transactions] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 },
    );
  }
}
