import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getHistoricalPrices, getHistoricalExchangeRates, getCurrentPrice, setForceRefresh } from '@/lib/yahoo-finance';
import {
  generateMultiBenchmarkTimeSeries,
  getUniqueSymbols,
  type TransactionInput,
} from '@/lib/portfolio-engine';
import { getUserFromRequest } from '@/lib/auth';

// Helper: downsample daily time series to weekly
function downsampleWeekly<T extends { date: string }>(data: T[]): T[] {
  if (data.length <= 60) return data;

  const result: T[] = [];
  let lastWeek = -1;

  for (const point of data) {
    const d = new Date(point.date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const week = Math.floor(dayOfYear / 7);

    if (week !== lastWeek) {
      result.push(point);
      lastWeek = week;
    }
  }

  if (result.length > 0 && result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }

  return result;
}

// GET /api/portfolio/timeseries — Get time series data for charts
// Supports ?force=1 to bypass cache
// Memory-efficient: fetches historical prices for portfolio symbols + benchmarks
// Data is cached on disk for 24 hours
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    // Check for force refresh
    const forceRefresh = request.nextUrl.searchParams.get('force') === '1';
    setForceRefresh(forceRefresh);

    const transactions = await db.transaction.findMany({
      where: { userId: user.userId },
      orderBy: { date: 'asc' },
    });

    if (transactions.length === 0) {
      return NextResponse.json([]);
    }

    // Get benchmark symbols
    const benchmarkSetting = await db.setting.findFirst({
      where: { key: 'benchmark_symbols', userId: user.userId },
    });
    const singleBenchmarkSetting = await db.setting.findFirst({
      where: { key: 'benchmark_symbol', userId: user.userId },
    });

    let benchmarkSymbols: string[] = [];
    if (benchmarkSetting?.value) {
      benchmarkSymbols = benchmarkSetting.value.split(',').map(s => s.trim()).filter(Boolean);
    } else if (singleBenchmarkSetting?.value) {
      benchmarkSymbols = [singleBenchmarkSetting.value];
    }
    if (benchmarkSymbols.length === 0) {
      benchmarkSymbols = ['GLD'];
    }

    const txInputs: TransactionInput[] = transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      symbol: tx.symbol,
      date: tx.date.toISOString(),
      price: tx.price,
      quantity: tx.quantity,
      commission: tx.commission,
      exchangeRate: tx.exchangeRate,
      totalUSD: tx.totalUSD,
      totalTRY: tx.totalTRY,
    }));

    const symbols = getUniqueSymbols(txInputs);
    const firstDate = transactions[0].date;
    const lastDate = new Date();

    // Fetch historical prices for ALL symbols (portfolio + benchmarks) SEQUENTIALLY
    // With file cache, most will be instant after the first daily fetch
    const allSymbols = [...new Set([...symbols, ...benchmarkSymbols])];
    const allHistoricalPrices: { [symbol: string]: { [date: string]: number } } = {};

    for (const symbol of allSymbols) {
      try {
        const prices = await getHistoricalPrices(symbol, firstDate, lastDate);
        allHistoricalPrices[symbol] = {};
        for (const p of prices) {
          allHistoricalPrices[symbol][p.date] = p.close;
        }
      } catch (error) {
        console.warn(`[timeseries] Failed to get historical prices for ${symbol}:`, error);
        allHistoricalPrices[symbol] = {};
      }
    }

    // Fetch historical exchange rates
    let exchangeRateHistoryArray: { date: string; close: number }[] = [];
    try {
      exchangeRateHistoryArray = await getHistoricalExchangeRates(firstDate, lastDate);
    } catch (error) {
      console.warn('[timeseries] Failed to get historical exchange rates:', error);
    }

    const exchangeRateHistory: { [date: string]: number } = {};
    for (const er of exchangeRateHistoryArray) {
      exchangeRateHistory[er.date] = er.close;
    }

    // Generate time series with full benchmark historical data
    const fullTimeSeries = generateMultiBenchmarkTimeSeries(
      txInputs,
      benchmarkSymbols,
      allHistoricalPrices,
      exchangeRateHistory,
    );

    // Downsample to weekly for chart performance
    const timeSeries = downsampleWeekly(fullTimeSeries);

    // Reset force refresh flag
    setForceRefresh(false);

    return NextResponse.json(timeSeries);
  } catch (error) {
    console.error('[timeseries] GET error:', error);
    setForceRefresh(false);
    return NextResponse.json(
      { error: 'Failed to generate time series' },
      { status: 500 },
    );
  }
}
