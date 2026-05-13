// ── Precision Helper ─────────────────────────────────────────────────────────
// Round to N decimal places to avoid floating-point drift in financial calculations.
// We use 6 decimal places for all intermediate calculations, which provides
// sub-penny precision while preventing floating-point accumulation errors.
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

const PRECISION = 6; // 6 decimal places for all financial calculations

// ── Types ───────────────────────────────────────────────────────────────────

export interface Lot {
  date: string;
  quantity: number;
  pricePerShare: number;
  remainingQuantity: number;
}

export interface Position {
  symbol: string;
  totalQuantity: number;
  averageCost: number;
  totalInvested: number;
  lots: Lot[];
}

export interface PositionDetail {
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  totalInvested: number;
  currentValue: number;
  profitLoss: number;
  profitLossPct: number;
}

export interface PortfolioSummary {
  totalInvestedUSD: number;
  totalInvestedTRY: number;
  currentValueUSD: number;
  currentValueTRY: number;
  totalReturnUSD: number;
  totalReturnTRY: number;
  totalReturnPct: number;
  positions: PositionDetail[];
  cashBalance: number;
}

export interface BenchmarkPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
}

export interface BenchmarkSummary {
  totalInvestedUSD: number;
  currentValueUSD: number;
  totalReturnUSD: number;
  totalReturnPct: number;
  positions: BenchmarkPosition[];
  cashBalance: number;
}

export interface TimeSeriesPoint {
  date: string;
  realValueUSD: number;
  realValueTRY: number;
  benchmarkValueUSD: number;
  benchmarkValueTRY: number;
  realReturnPct: number;
  benchmarkReturnPct: number;
  // Multi-benchmark support
  benchmarks: { [symbol: string]: { valueUSD: number; valueTRY: number; returnPct: number } };
}

export interface TransactionInput {
  id: string;
  type: string;       // BUY, SELL, DRIP, DIVIDEND_CASH
  symbol: string;
  date: string;       // YYYY-MM-DD or ISO string
  price: number;
  quantity: number;
  commission: number;
  exchangeRate: number;
  totalUSD: number;
  totalTRY: number;
}

interface HistoricalPriceMap {
  [symbol: string]: { [date: string]: number }; // symbol -> date -> close price
}

// ── calculatePortfolioPositions (FIFO) ──────────────────────────────────────

export function calculatePortfolioPositions(
  transactions: TransactionInput[],
): { positions: Map<string, Position>; cashBalance: number } {
  const positions = new Map<string, Position>();
  let cashBalance = 0;

  // Sort transactions by date ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  for (const tx of sorted) {
    const { type, symbol, price, quantity, commission, totalUSD } = tx;

    switch (type) {
      case 'BUY':
      case 'DRIP': {
        const lot: Lot = {
          date: tx.date,
          quantity,
          pricePerShare: price,
          remainingQuantity: quantity,
        };

        if (!positions.has(symbol)) {
          positions.set(symbol, {
            symbol,
            totalQuantity: 0,
            averageCost: 0,
            totalInvested: 0,
            lots: [],
          });
        }

        const pos = positions.get(symbol)!;
        pos.lots.push(lot);
        pos.totalQuantity = roundTo(pos.totalQuantity + quantity, PRECISION);
        pos.totalInvested = roundTo(pos.totalInvested + totalUSD, PRECISION);
        pos.averageCost = pos.totalQuantity > 0 ? roundTo(pos.totalInvested / pos.totalQuantity, PRECISION) : 0;
        break;
      }

      case 'SELL': {
        if (!positions.has(symbol)) {
          console.warn(`[portfolio-engine] SELL for unknown symbol: ${symbol}`);
          // Add proceeds to cash
          cashBalance = roundTo(cashBalance + totalUSD, PRECISION);
          break;
        }

        const pos = positions.get(symbol)!;
        let remainingSell = quantity;

        // FIFO: reduce from oldest lots first
        for (const lot of pos.lots) {
          if (remainingSell <= 0) break;
          if (lot.remainingQuantity <= 0) continue;

          if (lot.remainingQuantity >= remainingSell) {
            // This lot can cover the entire sell
            lot.remainingQuantity = roundTo(lot.remainingQuantity - remainingSell, PRECISION);
            pos.totalQuantity = roundTo(pos.totalQuantity - remainingSell, PRECISION);
            pos.totalInvested = roundTo(pos.totalInvested - roundTo(remainingSell * lot.pricePerShare, PRECISION), PRECISION);
            remainingSell = 0;
          } else {
            // This lot is partially consumed
            const consumed = lot.remainingQuantity;
            pos.totalQuantity = roundTo(pos.totalQuantity - consumed, PRECISION);
            pos.totalInvested = roundTo(pos.totalInvested - roundTo(consumed * lot.pricePerShare, PRECISION), PRECISION);
            remainingSell = roundTo(remainingSell - consumed, PRECISION);
            lot.remainingQuantity = 0;
          }
        }

        // If there's still remaining sell quantity (shouldn't happen in normal data)
        if (remainingSell > 0) {
          pos.totalQuantity = Math.max(0, roundTo(pos.totalQuantity - remainingSell, PRECISION));
        }

        pos.averageCost = pos.totalQuantity > 0 ? roundTo(pos.totalInvested / pos.totalQuantity, PRECISION) : 0;

        // Add sell proceeds to cash
        cashBalance = roundTo(cashBalance + totalUSD, PRECISION);
        break;
      }

      case 'DIVIDEND_CASH': {
        cashBalance = roundTo(cashBalance + totalUSD, PRECISION);
        break;
      }

      default:
        console.warn(`[portfolio-engine] Unknown transaction type: ${type}`);
    }
  }

  return { positions, cashBalance };
}

// ── calculateBenchmarkPositions ─────────────────────────────────────────────

export function calculateBenchmarkPositions(
  transactions: TransactionInput[],
  benchmarkSymbol: string,
  historicalPrices: HistoricalPriceMap,
): { position: BenchmarkPosition; cashBalance: number } {
  const benchmarkPrices = historicalPrices[benchmarkSymbol] || {};

  // Sort transactions by date ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let totalShares = 0;
  let totalInvested = 0;
  let cashBalance = 0;

  for (const tx of sorted) {
    const { type, date, totalUSD } = tx;
    const dateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];
    const benchmarkPrice = findNearestPrice(benchmarkPrices, dateStr);

    if (benchmarkPrice == null) {
      // If we can't get benchmark price, skip this transaction's impact on shares
      // but still track cash for DIVIDEND_CASH
      if (type === 'DIVIDEND_CASH') {
        cashBalance = roundTo(cashBalance + totalUSD, PRECISION);
      }
      continue;
    }

    switch (type) {
      case 'BUY':
      case 'DRIP': {
        // Benchmark buys equivalent USD amount
        const sharesBought = roundTo(totalUSD / benchmarkPrice, PRECISION);
        totalShares = roundTo(totalShares + sharesBought, PRECISION);
        totalInvested = roundTo(totalInvested + totalUSD, PRECISION);
        break;
      }

      case 'SELL': {
        // Benchmark sells equivalent USD amount
        const sharesSold = roundTo(totalUSD / benchmarkPrice, PRECISION);
        totalShares = Math.max(0, roundTo(totalShares - sharesSold, PRECISION));
        cashBalance = roundTo(cashBalance + totalUSD, PRECISION);
        break;
      }

      case 'DIVIDEND_CASH': {
        cashBalance = roundTo(cashBalance + totalUSD, PRECISION);
        break;
      }

      default:
        break;
    }
  }

  const averageCost = totalShares > 0 ? roundTo(totalInvested / totalShares, PRECISION) : 0;

  return {
    position: {
      symbol: benchmarkSymbol,
      quantity: totalShares,
      averageCost,
    },
    cashBalance,
  };
}

// ── calculatePortfolioSummary ───────────────────────────────────────────────

export function calculatePortfolioSummary(
  positions: Map<string, Position>,
  currentPrices: Record<string, number | null>,
  exchangeRate: number,
): PortfolioSummary {
  let totalInvestedUSD = 0;
  let currentValueUSD = 0;
  const positionDetails: PositionDetail[] = [];

  for (const [symbol, pos] of positions) {
    if (pos.totalQuantity <= 0) continue; // Skip fully sold positions

    const currentPrice = currentPrices[symbol] ?? 0;
    const totalInvested = pos.totalInvested;
    const currentValue = roundTo(pos.totalQuantity * currentPrice, PRECISION);
    const profitLoss = roundTo(currentValue - totalInvested, PRECISION);
    const profitLossPct = totalInvested > 0 ? roundTo((profitLoss / totalInvested) * 100, 2) : 0;

    totalInvestedUSD = roundTo(totalInvestedUSD + totalInvested, PRECISION);
    currentValueUSD = roundTo(currentValueUSD + currentValue, PRECISION);

    positionDetails.push({
      symbol,
      quantity: pos.totalQuantity,
      averageCost: pos.averageCost,
      currentPrice,
      totalInvested,
      currentValue,
      profitLoss,
      profitLossPct,
    });
  }

  const totalReturnUSD = roundTo(currentValueUSD - totalInvestedUSD, PRECISION);
  const totalReturnPct = totalInvestedUSD > 0 ? roundTo((totalReturnUSD / totalInvestedUSD) * 100, 2) : 0;

  return {
    totalInvestedUSD,
    totalInvestedTRY: roundTo(totalInvestedUSD * exchangeRate, PRECISION),
    currentValueUSD,
    currentValueTRY: roundTo(currentValueUSD * exchangeRate, PRECISION),
    totalReturnUSD,
    totalReturnTRY: roundTo(totalReturnUSD * exchangeRate, PRECISION),
    totalReturnPct,
    positions: positionDetails,
    cashBalance: 0, // Will be set by caller
  };
}

// ── calculateBenchmarkSummary ───────────────────────────────────────────────

export function calculateBenchmarkSummary(
  benchmarkPosition: BenchmarkPosition,
  currentBenchmarkPrice: number,
  cashBalance: number,
): BenchmarkSummary {
  const currentValue = roundTo(benchmarkPosition.quantity * currentBenchmarkPrice, PRECISION);
  const totalInvested = roundTo(benchmarkPosition.quantity * benchmarkPosition.averageCost, PRECISION);
  const totalReturn = roundTo(currentValue - totalInvested, PRECISION);
  const totalReturnPct = totalInvested > 0 ? roundTo((totalReturn / totalInvested) * 100, 2) : 0;

  return {
    totalInvestedUSD: totalInvested,
    currentValueUSD: roundTo(currentValue + cashBalance, PRECISION),
    totalReturnUSD: totalReturn,
    totalReturnPct,
    positions: [benchmarkPosition],
    cashBalance,
  };
}

// ── generateTimeSeries ──────────────────────────────────────────────────────

export function generateTimeSeries(
  transactions: TransactionInput[],
  benchmarkSymbol: string,
  allHistoricalPrices: HistoricalPriceMap,
  exchangeRateHistory: { [date: string]: number },
): TimeSeriesPoint[] {
  if (transactions.length === 0) return [];

  // Sort transactions by date ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Determine date range
  const firstDate = new Date(sorted[0].date);
  const lastDate = new Date();

  // Get all trading days from benchmark price data (or any symbol)
  const benchmarkPrices = allHistoricalPrices[benchmarkSymbol] || {};
  const allDates = Object.keys(benchmarkPrices).sort();

  if (allDates.length === 0) return [];

  // Filter dates to the relevant range
  const relevantDates = allDates.filter((d) => {
    const date = new Date(d);
    return date >= firstDate && date <= lastDate;
  });

  if (relevantDates.length === 0) return [];

  // Track portfolio state as we go through dates
  const positions = new Map<string, Position>();
  let portfolioCashBalance = 0;
  let benchmarkShares = 0;
  let benchmarkCashBalance = 0;
  let benchmarkTotalInvested = 0;

  // Track which transactions have been processed
  let txIndex = 0;

  const result: TimeSeriesPoint[] = [];

  // Initial investment tracking for return calculations
  let cumulativeInvestedUSD = 0;

  for (const dateStr of relevantDates) {
    // Process all transactions on or before this date that haven't been processed yet
    while (txIndex < sorted.length) {
      const tx = sorted[txIndex];
      const txDateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0];

      if (txDateStr > dateStr) break;

      // Process transaction
      switch (tx.type) {
        case 'BUY':
        case 'DRIP': {
          const lot: Lot = {
            date: tx.date,
            quantity: tx.quantity,
            pricePerShare: tx.price,
            remainingQuantity: tx.quantity,
          };

          if (!positions.has(tx.symbol)) {
            positions.set(tx.symbol, {
              symbol: tx.symbol,
              totalQuantity: 0,
              averageCost: 0,
              totalInvested: 0,
              lots: [],
            });
          }

          const pos = positions.get(tx.symbol)!;
          pos.lots.push(lot);
          pos.totalQuantity = roundTo(pos.totalQuantity + tx.quantity, PRECISION);
          pos.totalInvested = roundTo(pos.totalInvested + tx.totalUSD, PRECISION);
          pos.averageCost = pos.totalQuantity > 0 ? roundTo(pos.totalInvested / pos.totalQuantity, PRECISION) : 0;
          cumulativeInvestedUSD = roundTo(cumulativeInvestedUSD + tx.totalUSD, PRECISION);

          // Benchmark buys equivalent amount
          const benchPrice = findNearestPrice(benchmarkPrices, txDateStr);
          if (benchPrice != null) {
            benchmarkShares = roundTo(benchmarkShares + tx.totalUSD / benchPrice, PRECISION);
            benchmarkTotalInvested = roundTo(benchmarkTotalInvested + tx.totalUSD, PRECISION);
          }
          break;
        }

        case 'SELL': {
          if (positions.has(tx.symbol)) {
            const pos = positions.get(tx.symbol)!;
            let remainingSell = tx.quantity;

            for (const lot of pos.lots) {
              if (remainingSell <= 0) break;
              if (lot.remainingQuantity <= 0) continue;

              if (lot.remainingQuantity >= remainingSell) {
                lot.remainingQuantity = roundTo(lot.remainingQuantity - remainingSell, PRECISION);
                pos.totalQuantity = roundTo(pos.totalQuantity - remainingSell, PRECISION);
                pos.totalInvested = roundTo(pos.totalInvested - roundTo(remainingSell * lot.pricePerShare, PRECISION), PRECISION);
                remainingSell = 0;
              } else {
                const consumed = lot.remainingQuantity;
                pos.totalQuantity = roundTo(pos.totalQuantity - consumed, PRECISION);
                pos.totalInvested = roundTo(pos.totalInvested - roundTo(consumed * lot.pricePerShare, PRECISION), PRECISION);
                remainingSell = roundTo(remainingSell - consumed, PRECISION);
                lot.remainingQuantity = 0;
              }
            }

            if (remainingSell > 0) {
              pos.totalQuantity = Math.max(0, roundTo(pos.totalQuantity - remainingSell, PRECISION));
            }

            pos.averageCost = pos.totalQuantity > 0 ? roundTo(pos.totalInvested / pos.totalQuantity, PRECISION) : 0;
          }

          portfolioCashBalance = roundTo(portfolioCashBalance + tx.totalUSD, PRECISION);

          // Benchmark sells equivalent amount
          const benchPrice = findNearestPrice(benchmarkPrices, txDateStr);
          if (benchPrice != null) {
            const sharesSold = roundTo(tx.totalUSD / benchPrice, PRECISION);
            benchmarkShares = Math.max(0, roundTo(benchmarkShares - sharesSold, PRECISION));
          }
          benchmarkCashBalance = roundTo(benchmarkCashBalance + tx.totalUSD, PRECISION);
          break;
        }

        case 'DIVIDEND_CASH': {
          portfolioCashBalance = roundTo(portfolioCashBalance + tx.totalUSD, PRECISION);
          benchmarkCashBalance = roundTo(benchmarkCashBalance + tx.totalUSD, PRECISION);
          break;
        }
      }

      txIndex++;
    }

    // Calculate current values for this date
    let realValueUSD = portfolioCashBalance;
    for (const [symbol, pos] of positions) {
      if (pos.totalQuantity <= 0) continue;
      const symbolPrices = allHistoricalPrices[symbol] || {};
      const price = findNearestPrice(symbolPrices, dateStr);
      if (price != null) {
        realValueUSD = roundTo(realValueUSD + pos.totalQuantity * price, PRECISION);
      } else {
        // Fallback: use average cost if no price available
        realValueUSD = roundTo(realValueUSD + pos.totalInvested, PRECISION);
      }
    }

    // Benchmark value
    const benchmarkPriceToday = findNearestPrice(benchmarkPrices, dateStr);
    const benchmarkValueUSD = benchmarkPriceToday != null
      ? roundTo(benchmarkShares * benchmarkPriceToday + benchmarkCashBalance, PRECISION)
      : 0;

    // Exchange rate for this date
    const exchangeRate = findNearestPrice(exchangeRateHistory, dateStr) ?? 1;

    // Calculate returns
    const realReturnPct = cumulativeInvestedUSD > 0
      ? roundTo(((realValueUSD - cumulativeInvestedUSD) / cumulativeInvestedUSD) * 100, 2)
      : 0;
    const benchmarkReturnPct = benchmarkTotalInvested > 0
      ? roundTo(((benchmarkValueUSD - benchmarkTotalInvested) / benchmarkTotalInvested) * 100, 2)
      : 0;

    result.push({
      date: dateStr,
      realValueUSD,
      realValueTRY: roundTo(realValueUSD * exchangeRate, PRECISION),
      benchmarkValueUSD,
      benchmarkValueTRY: roundTo(benchmarkValueUSD * exchangeRate, PRECISION),
      realReturnPct,
      benchmarkReturnPct,
      benchmarks: {
        [benchmarkSymbol]: {
          valueUSD: benchmarkValueUSD,
          valueTRY: roundTo(benchmarkValueUSD * exchangeRate, PRECISION),
          returnPct: benchmarkReturnPct,
        },
      },
    });
  }

  return result;
}

// ── generateMultiBenchmarkTimeSeries ────────────────────────────────────────

export function generateMultiBenchmarkTimeSeries(
  transactions: TransactionInput[],
  benchmarkSymbols: string[],
  allHistoricalPrices: HistoricalPriceMap,
  exchangeRateHistory: { [date: string]: number },
): TimeSeriesPoint[] {
  if (transactions.length === 0) return [];

  // Sort transactions by date ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Determine date range from first available data
  const allDatesSet = new Set<string>();
  for (const bs of benchmarkSymbols) {
    const prices = allHistoricalPrices[bs] || {};
    for (const d of Object.keys(prices)) allDatesSet.add(d);
  }
  // Also add portfolio symbol dates
  for (const sym of getUniqueSymbols(transactions)) {
    const prices = allHistoricalPrices[sym] || {};
    for (const d of Object.keys(prices)) allDatesSet.add(d);
  }
  const allDates = Array.from(allDatesSet).sort();
  if (allDates.length === 0) return [];

  const firstDate = new Date(sorted[0].date);
  const lastDate = new Date();

  const relevantDates = allDates.filter((d) => {
    const date = new Date(d);
    return date >= firstDate && date <= lastDate;
  });

  if (relevantDates.length === 0) return [];

  // Track portfolio state
  const positions = new Map<string, Position>();
  let portfolioCashBalance = 0;
  let cumulativeInvestedUSD = 0;

  // Track benchmark states for each symbol
  const benchmarkStates: { [symbol: string]: { shares: number; cashBalance: number; totalInvested: number } } = {};
  for (const bs of benchmarkSymbols) {
    benchmarkStates[bs] = { shares: 0, cashBalance: 0, totalInvested: 0 };
  }

  let txIndex = 0;
  const result: TimeSeriesPoint[] = [];

  for (const dateStr of relevantDates) {
    // Process all transactions on or before this date
    while (txIndex < sorted.length) {
      const tx = sorted[txIndex];
      const txDateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0];
      if (txDateStr > dateStr) break;

      switch (tx.type) {
        case 'BUY':
        case 'DRIP': {
          const lot: Lot = {
            date: tx.date,
            quantity: tx.quantity,
            pricePerShare: tx.price,
            remainingQuantity: tx.quantity,
          };

          if (!positions.has(tx.symbol)) {
            positions.set(tx.symbol, { symbol: tx.symbol, totalQuantity: 0, averageCost: 0, totalInvested: 0, lots: [] });
          }

          const pos = positions.get(tx.symbol)!;
          pos.lots.push(lot);
          pos.totalQuantity = roundTo(pos.totalQuantity + tx.quantity, PRECISION);
          pos.totalInvested = roundTo(pos.totalInvested + tx.totalUSD, PRECISION);
          pos.averageCost = pos.totalQuantity > 0 ? roundTo(pos.totalInvested / pos.totalQuantity, PRECISION) : 0;
          cumulativeInvestedUSD = roundTo(cumulativeInvestedUSD + tx.totalUSD, PRECISION);

          // Each benchmark buys equivalent amount
          for (const bs of benchmarkSymbols) {
            const bsPrices = allHistoricalPrices[bs] || {};
            const benchPrice = findNearestPrice(bsPrices, txDateStr);
            if (benchPrice != null) {
              benchmarkStates[bs].shares = roundTo(benchmarkStates[bs].shares + tx.totalUSD / benchPrice, PRECISION);
              benchmarkStates[bs].totalInvested = roundTo(benchmarkStates[bs].totalInvested + tx.totalUSD, PRECISION);
            }
          }
          break;
        }

        case 'SELL': {
          if (positions.has(tx.symbol)) {
            const pos = positions.get(tx.symbol)!;
            let remainingSell = tx.quantity;
            for (const lot of pos.lots) {
              if (remainingSell <= 0) break;
              if (lot.remainingQuantity <= 0) continue;
              if (lot.remainingQuantity >= remainingSell) {
                lot.remainingQuantity = roundTo(lot.remainingQuantity - remainingSell, PRECISION);
                pos.totalQuantity = roundTo(pos.totalQuantity - remainingSell, PRECISION);
                pos.totalInvested = roundTo(pos.totalInvested - roundTo(remainingSell * lot.pricePerShare, PRECISION), PRECISION);
                remainingSell = 0;
              } else {
                const consumed = lot.remainingQuantity;
                pos.totalQuantity = roundTo(pos.totalQuantity - consumed, PRECISION);
                pos.totalInvested = roundTo(pos.totalInvested - roundTo(consumed * lot.pricePerShare, PRECISION), PRECISION);
                remainingSell = roundTo(remainingSell - consumed, PRECISION);
                lot.remainingQuantity = 0;
              }
            }
            if (remainingSell > 0) {
              pos.totalQuantity = Math.max(0, roundTo(pos.totalQuantity - remainingSell, PRECISION));
            }
            pos.averageCost = pos.totalQuantity > 0 ? roundTo(pos.totalInvested / pos.totalQuantity, PRECISION) : 0;
          }
          portfolioCashBalance = roundTo(portfolioCashBalance + tx.totalUSD, PRECISION);

          // Each benchmark sells equivalent amount
          for (const bs of benchmarkSymbols) {
            const bsPrices = allHistoricalPrices[bs] || {};
            const benchPrice = findNearestPrice(bsPrices, txDateStr);
            if (benchPrice != null) {
              const sharesSold = roundTo(tx.totalUSD / benchPrice, PRECISION);
              benchmarkStates[bs].shares = Math.max(0, roundTo(benchmarkStates[bs].shares - sharesSold, PRECISION));
            }
            benchmarkStates[bs].cashBalance = roundTo(benchmarkStates[bs].cashBalance + tx.totalUSD, PRECISION);
          }
          break;
        }

        case 'DIVIDEND_CASH': {
          portfolioCashBalance = roundTo(portfolioCashBalance + tx.totalUSD, PRECISION);
          for (const bs of benchmarkSymbols) {
            benchmarkStates[bs].cashBalance = roundTo(benchmarkStates[bs].cashBalance + tx.totalUSD, PRECISION);
          }
          break;
        }
      }
      txIndex++;
    }

    // Calculate real portfolio value for this date
    let realValueUSD = portfolioCashBalance;
    for (const [symbol, pos] of positions) {
      if (pos.totalQuantity <= 0) continue;
      const symbolPrices = allHistoricalPrices[symbol] || {};
      const price = findNearestPrice(symbolPrices, dateStr);
      if (price != null) {
        realValueUSD = roundTo(realValueUSD + pos.totalQuantity * price, PRECISION);
      } else {
        realValueUSD = roundTo(realValueUSD + pos.totalInvested, PRECISION);
      }
    }

    // Calculate each benchmark value for this date
    const benchmarksData: { [symbol: string]: { valueUSD: number; valueTRY: number; returnPct: number } } = {};

    for (const bs of benchmarkSymbols) {
      const bsPrices = allHistoricalPrices[bs] || {};
      const priceToday = findNearestPrice(bsPrices, dateStr);
      const valueUSD = priceToday != null
        ? roundTo(benchmarkStates[bs].shares * priceToday + benchmarkStates[bs].cashBalance, PRECISION)
        : 0;
      const returnPct = benchmarkStates[bs].totalInvested > 0
        ? roundTo(((valueUSD - benchmarkStates[bs].totalInvested) / benchmarkStates[bs].totalInvested) * 100, 2)
        : 0;
      benchmarksData[bs] = { valueUSD, valueTRY: 0, returnPct };
    }

    // Exchange rate for this date
    const exchangeRate = findNearestPrice(exchangeRateHistory, dateStr) ?? 1;

    // Set TRY values
    for (const bs of benchmarkSymbols) {
      benchmarksData[bs].valueTRY = roundTo(benchmarksData[bs].valueUSD * exchangeRate, PRECISION);
    }

    // Use first benchmark as the "primary" for backwards-compat fields
    const primaryBenchmark = benchmarkSymbols[0] || '';
    const primaryData = benchmarksData[primaryBenchmark] || { valueUSD: 0, valueTRY: 0, returnPct: 0 };

    const realReturnPct = cumulativeInvestedUSD > 0
      ? roundTo(((realValueUSD - cumulativeInvestedUSD) / cumulativeInvestedUSD) * 100, 2)
      : 0;

    result.push({
      date: dateStr,
      realValueUSD,
      realValueTRY: roundTo(realValueUSD * exchangeRate, PRECISION),
      benchmarkValueUSD: primaryData.valueUSD,
      benchmarkValueTRY: primaryData.valueTRY,
      realReturnPct,
      benchmarkReturnPct: primaryData.returnPct,
      benchmarks: benchmarksData,
    });
  }

  return result;
}

// ── Helper: find nearest price for a date ───────────────────────────────────

function findNearestPrice(
  priceMap: { [date: string]: number },
  targetDate: string,
): number | null {
  // Exact match first
  if (priceMap[targetDate] != null) {
    return priceMap[targetDate];
  }

  // Find nearest date (within 10 calendar days)
  const target = new Date(targetDate).getTime();
  let nearestDate: string | null = null;
  let nearestDiff = Infinity;
  const maxDiff = 10 * 24 * 60 * 60 * 1000; // 10 calendar days

  for (const dateStr of Object.keys(priceMap)) {
    const diff = Math.abs(new Date(dateStr).getTime() - target);
    if (diff < nearestDiff && diff <= maxDiff) {
      nearestDiff = diff;
      nearestDate = dateStr;
    }
  }

  if (nearestDate) {
    return priceMap[nearestDate];
  }

  return null;
}

// ── Helper: get unique symbols from transactions ────────────────────────────

export function getUniqueSymbols(transactions: TransactionInput[]): string[] {
  const symbols = new Set<string>();
  for (const tx of transactions) {
    if (tx.type !== 'DIVIDEND_CASH') {
      symbols.add(tx.symbol);
    }
  }
  return Array.from(symbols);
}
