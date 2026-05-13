import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentPrice, getExchangeRate, getHistoricalPrices, setForceRefresh } from '@/lib/yahoo-finance';
import {
  calculatePortfolioPositions,
  calculateBenchmarkPositions,
  calculatePortfolioSummary,
  calculateBenchmarkSummary,
  getUniqueSymbols,
  type TransactionInput,
  type BenchmarkSummary,
} from '@/lib/portfolio-engine';
import { getUserFromRequest } from '@/lib/auth';

// GET /api/portfolio — Get full portfolio analysis with multi-benchmark support
// Supports ?force=1 to bypass cache and fetch fresh data
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    // Check for force refresh
    const forceRefresh = request.nextUrl.searchParams.get('force') === '1';
    setForceRefresh(forceRefresh);

    // Fetch all transactions for this user
    const transactions = await db.transaction.findMany({
      where: { userId: user.userId },
      orderBy: { date: 'asc' },
    });

    if (transactions.length === 0) {
      return NextResponse.json({
        portfolio: {
          totalInvestedUSD: 0, totalInvestedTRY: 0,
          currentValueUSD: 0, currentValueTRY: 0,
          totalReturnUSD: 0, totalReturnTRY: 0,
          totalReturnPct: 0, positions: [], cashBalance: 0,
        },
        benchmarks: [],
        comparison: { diffUSD: 0, diffTRY: 0, diffPct: 0, bestBenchmarkSymbol: '' },
      });
    }

    // Get benchmark symbols from settings (user-scoped)
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
      benchmarkSymbols = ['GLD']; // Default
    }

    // Map transactions to TransactionInput format
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

    // Get unique symbols in the portfolio
    const symbols = getUniqueSymbols(txInputs);

    // Fetch current prices SEQUENTIALLY (with file cache, most will be instant)
    const allSymbols = [...new Set([...symbols, ...benchmarkSymbols])];
    const currentPrices: Record<string, number | null> = {};

    for (const symbol of allSymbols) {
      try {
        const price = await getCurrentPrice(symbol);
        currentPrices[symbol] = price;
      } catch {
        currentPrices[symbol] = null;
      }
    }

    // Fetch current exchange rate
    let exchangeRate = 1;
    try {
      const exchangeRateResult = await getExchangeRate();
      exchangeRate = exchangeRateResult?.rate ?? 1;
    } catch {
      // Use fallback
    }

    // Calculate portfolio positions (FIFO) — pure computation, no API calls
    const { positions, cashBalance } = calculatePortfolioPositions(txInputs);
    const portfolioSummary = calculatePortfolioSummary(positions, currentPrices, exchangeRate);
    portfolioSummary.cashBalance = cashBalance;
    portfolioSummary.currentValueUSD += cashBalance;
    portfolioSummary.currentValueTRY += cashBalance * exchangeRate;
    portfolioSummary.totalReturnUSD = portfolioSummary.currentValueUSD - portfolioSummary.totalInvestedUSD;
    portfolioSummary.totalReturnTRY = portfolioSummary.totalReturnUSD * exchangeRate;
    portfolioSummary.totalReturnPct = portfolioSummary.totalInvestedUSD > 0
      ? (portfolioSummary.totalReturnUSD / portfolioSummary.totalInvestedUSD) * 100
      : 0;

    // Fetch historical prices for benchmarks SEQUENTIALLY
    const firstDate = transactions[0].date;
    const lastDate = new Date();
    const benchmarkHistoricalPrices: { [symbol: string]: { [date: string]: number } } = {};

    for (const bs of benchmarkSymbols) {
      try {
        const histPrices = await getHistoricalPrices(bs, firstDate, lastDate);
        benchmarkHistoricalPrices[bs] = {};
        for (const hp of histPrices) {
          benchmarkHistoricalPrices[bs][hp.date] = hp.close;
        }
      } catch (error) {
        console.warn(`[portfolio] Failed to fetch historical prices for ${bs}:`, error);
        benchmarkHistoricalPrices[bs] = {};
      }
    }

    // Calculate benchmarks for each selected symbol
    const benchmarkSummaries: (BenchmarkSummary & { symbol: string; name: string })[] = [];

    for (const bs of benchmarkSymbols) {
      try {
        const { position: benchmarkPosition, cashBalance: benchmarkCash } =
          calculateBenchmarkPositions(txInputs, bs, benchmarkHistoricalPrices);

        const currentBenchmarkPrice = currentPrices[bs] ?? 0;
        const summary = calculateBenchmarkSummary(benchmarkPosition, currentBenchmarkPrice, benchmarkCash);

        // Get benchmark name from settings (user-scoped)
        const nameSetting = await db.setting.findFirst({
          where: { key: `benchmark_name_${bs}`, userId: user.userId },
        });

        benchmarkSummaries.push({
          ...summary,
          symbol: bs,
          name: nameSetting?.value || bs,
        });
      } catch (error) {
        console.warn(`[portfolio] Failed to calculate benchmark ${bs}:`, error);
      }
    }

    // Calculate comparison with best benchmark
    const bestBenchmark = benchmarkSummaries.length > 0
      ? benchmarkSummaries.reduce((best, cur) =>
          cur.totalReturnPct > best.totalReturnPct ? cur : best
        )
      : null;

    const diffUSD = bestBenchmark
      ? portfolioSummary.totalReturnUSD - bestBenchmark.totalReturnUSD
      : 0;
    const diffTRY = diffUSD * exchangeRate;
    const diffPct = bestBenchmark
      ? portfolioSummary.totalReturnPct - bestBenchmark.totalReturnPct
      : 0;

    // Reset force refresh flag
    setForceRefresh(false);

    return NextResponse.json({
      portfolio: portfolioSummary,
      benchmarks: benchmarkSummaries,
      comparison: {
        diffUSD,
        diffTRY,
        diffPct,
        bestBenchmarkSymbol: bestBenchmark?.symbol || '',
      },
    });
  } catch (error) {
    console.error('[portfolio] GET error:', error);
    setForceRefresh(false);
    return NextResponse.json(
      { error: 'Failed to calculate portfolio analysis' },
      { status: 500 },
    );
  }
}
