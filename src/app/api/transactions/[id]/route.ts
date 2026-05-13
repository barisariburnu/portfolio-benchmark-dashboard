import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getExchangeRate } from '@/lib/yahoo-finance';
import { getUserFromRequest } from '@/lib/auth';

// ── Precision Helper ────────────────────────────────────────────────────────
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// GET /api/transactions/[id] — Get a single transaction by id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { id } = await params;

    const transaction = await db.transaction.findFirst({
      where: { id, userId: user.userId },
    });
    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error('[transactions/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transaction' },
      { status: 500 },
    );
  }
}

// PUT /api/transactions/[id] — Update a transaction by id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { id } = await params;

    // Check if transaction exists and belongs to user
    const existing = await db.transaction.findFirst({
      where: { id, userId: user.userId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { type, symbol, date, price, quantity, commission, notes, recalculateRate } = body;

    // Build update object — only update fields that are provided
    const updateData: Record<string, unknown> = {};

    if (type !== undefined) {
      const validTypes = ['BUY', 'SELL', 'DRIP', 'DIVIDEND_CASH'];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid transaction type. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 },
        );
      }
      updateData.type = type;
    }

    if (symbol !== undefined) {
      updateData.symbol = symbol.toUpperCase().trim();
    }

    if (date !== undefined) {
      updateData.date = new Date(date);
    }

    // Round numeric inputs to 6 decimal places
    if (price !== undefined) {
      updateData.price = roundTo(price, 6);
    }

    if (quantity !== undefined) {
      updateData.quantity = roundTo(quantity, 6);
    }

    if (commission !== undefined) {
      updateData.commission = roundTo(commission, 6);
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    // Determine the effective values for recalculation (use rounded values)
    const effectiveType = (updateData.type as string) ?? existing.type;
    const effectivePrice = (updateData.price as number) ?? existing.price;
    const effectiveQuantity = (updateData.quantity as number) ?? existing.quantity;
    const effectiveCommission = (updateData.commission as number) ?? existing.commission;
    const effectiveDate = updateData.date ? new Date(updateData.date as string) : existing.date;

    // Recalculate totalUSD based on (possibly updated) values with precision
    let totalUSD: number;
    switch (effectiveType) {
      case 'BUY':
        totalUSD = roundTo(effectivePrice * effectiveQuantity + effectiveCommission, 6);
        break;
      case 'SELL':
        totalUSD = roundTo(effectivePrice * effectiveQuantity - effectiveCommission, 6);
        break;
      case 'DRIP':
        totalUSD = roundTo(effectivePrice * effectiveQuantity, 6);
        break;
      case 'DIVIDEND_CASH':
        totalUSD = roundTo(effectivePrice * effectiveQuantity, 6);
        break;
      default:
        totalUSD = roundTo(effectivePrice * effectiveQuantity, 6);
    }
    updateData.totalUSD = totalUSD;

    // Recalculate exchange rate and totalTRY if date changed or explicitly requested
    if (recalculateRate || date !== undefined) {
      const exchangeRateResult = await getExchangeRate(effectiveDate);
      const exchangeRate = roundTo(exchangeRateResult?.rate ?? existing.exchangeRate, 6);
      updateData.exchangeRate = exchangeRate;
      updateData.totalTRY = roundTo(totalUSD * exchangeRate, 6);
    } else {
      // Use existing exchange rate, just recalculate totalTRY
      const effectiveExchangeRate = (updateData.exchangeRate as number) ?? existing.exchangeRate;
      updateData.totalTRY = roundTo(totalUSD * effectiveExchangeRate, 6);
    }

    const transaction = await db.transaction.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(transaction);
  } catch (error) {
    console.error('[transactions/[id]] PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 },
    );
  }
}

// DELETE /api/transactions/[id] — Delete a transaction by id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { id } = await params;

    // Check if transaction exists and belongs to user
    const existing = await db.transaction.findFirst({
      where: { id, userId: user.userId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 },
      );
    }

    await db.transaction.delete({ where: { id } });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('[transactions/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 },
    );
  }
}
