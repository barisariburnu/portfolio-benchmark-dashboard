import YahooFinance from 'yahoo-finance2';
import { format, parseISO } from 'date-fns';

// ── Yahoo Finance Instance ─────────────────────────────────────────────────
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

// ── In-memory Cache with 24-hour TTL ────────────────────────────────────────
// Data is cached in memory for 24 hours (same-day reuse).
// On server restart, cache is rebuilt on first request.
// "forceRefresh" flag bypasses cache for one request cycle.

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — fetch once per day

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCache<T>(key: string, value: T): void {
  cache.set(key, { value, expiry: Date.now() + CACHE_TTL_MS });
}

// ── In-memory request deduplication ─────────────────────────────────────────
// Prevents concurrent requests for the same data
const pendingRequests = new Map<string, Promise<unknown>>();

function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = pendingRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = factory().finally(() => {
    pendingRequests.delete(key);
  });
  pendingRequests.set(key, promise);
  return promise;
}

// ── Global force refresh flag ───────────────────────────────────────────────
let _forceRefresh = false;

export function setForceRefresh(force: boolean): void {
  _forceRefresh = force;
}

// ── Helper: date key for cache granularity ──────────────────────────────────
function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// ── getCurrentPrice ─────────────────────────────────────────────────────────
export async function getCurrentPrice(symbol: string): Promise<number | null> {
  const cacheKey = `price:${symbol}`;

  if (!_forceRefresh) {
    const cached = getCached<number>(cacheKey);
    if (cached !== null) return cached;
  }

  return dedup(cacheKey, async () => {
    try {
      const quote = await yf.quote(symbol);
      const price = quote?.regularMarketPrice ?? null;
      if (price !== null) {
        setCache(cacheKey, price);
      }
      return price;
    } catch {
      console.warn(`[yahoo-finance] Failed to get current price for ${symbol}`);
      // Return stale cache as fallback
      const stale = cache.get(cacheKey);
      if (stale) return stale.value as number;
      return null;
    }
  });
}

// ── getHistoricalPrices ─────────────────────────────────────────────────────
export interface HistoricalPrice {
  date: string;   // YYYY-MM-DD
  close: number;
}

export async function getHistoricalPrices(
  symbol: string,
  start: Date,
  end: Date,
): Promise<HistoricalPrice[]> {
  const cacheKey = `hist:${symbol}:${dateKey(start)}:${dateKey(end)}`;

  if (!_forceRefresh) {
    const cached = getCached<HistoricalPrice[]>(cacheKey);
    if (cached) return cached;
  }

  return dedup(cacheKey, async () => {
    try {
      const results = await yf.historical(symbol, {
        period1: format(start, 'yyyy-MM-dd'),
        period2: format(end, 'yyyy-MM-dd'),
      });

      const prices: HistoricalPrice[] = results.map((r) => ({
        date: format(new Date(r.date), 'yyyy-MM-dd'),
        close: r.close,
      }));

      setCache(cacheKey, prices);
      return prices;
    } catch {
      console.warn(`[yahoo-finance] Failed to get historical prices for ${symbol}`);
      // Return stale cache if available
      const stale = cache.get(cacheKey);
      if (stale) return stale.value as HistoricalPrice[];
      return [];
    }
  });
}

// ── getExchangeRate ─────────────────────────────────────────────────────────
export interface ExchangeRateResult {
  rate: number;
  date: string;
  isApproximate: boolean;
}

// Fallback exchange rates (approximate, used when API fails)
const FALLBACK_RATES: Record<string, number> = {
  '2024-01': 30.2,
  '2024-02': 30.5,
  '2024-03': 31.8,
  '2024-04': 32.3,
  '2024-05': 32.5,
  '2024-06': 33.0,
  '2024-07': 33.5,
  '2024-08': 34.0,
  '2024-09': 34.2,
  '2024-10': 34.5,
  '2024-11': 35.0,
  '2024-12': 35.5,
  '2025-01': 36.0,
  '2025-02': 36.5,
  '2025-03': 38.0,
  '2025-04': 39.0,
  '2025-05': 40.0,
  '2026-01': 42.0,
  '2026-02': 43.0,
  '2026-03': 44.0,
  '2026-04': 45.0,
  '2026-05': 45.5,
};

function getFallbackRate(dateStr: string): number {
  const monthKey = dateStr.substring(0, 7); // YYYY-MM
  if (FALLBACK_RATES[monthKey]) return FALLBACK_RATES[monthKey];
  const keys = Object.keys(FALLBACK_RATES).sort();
  for (const key of keys) {
    if (key >= monthKey) return FALLBACK_RATES[key];
  }
  return FALLBACK_RATES[keys[keys.length - 1]] ?? 45;
}

export async function getExchangeRate(date?: Date): Promise<ExchangeRateResult | null> {
  if (!date) {
    const cacheKey = 'fx:current';

    if (!_forceRefresh) {
      const cached = getCached<ExchangeRateResult>(cacheKey);
      if (cached) return cached;
    }

    return dedup(cacheKey, async () => {
      try {
        const quote = await yf.quote('TRY=X');
        const rate = quote?.regularMarketPrice;
        if (rate != null) {
          const result: ExchangeRateResult = {
            rate,
            date: format(new Date(), 'yyyy-MM-dd'),
            isApproximate: false,
          };
          setCache(cacheKey, result);
          return result;
        }
      } catch {
        console.warn('[yahoo-finance] Failed to get current USD/TRY rate');
      }

      const today = format(new Date(), 'yyyy-MM-dd');
      return {
        rate: getFallbackRate(today),
        date: today,
        isApproximate: true,
      };
    });
  }

  // Historical rate
  const targetDate = dateKey(date);
  const cacheKey = `fx:hist:${targetDate}`;

  if (!_forceRefresh) {
    const cached = getCached<ExchangeRateResult>(cacheKey);
    if (cached) return cached;
  }

  try {
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 7);

    const results = await yf.historical('TRY=X', {
      period1: format(startDate, 'yyyy-MM-dd'),
      period2: format(endDate, 'yyyy-MM-dd'),
    });

    if (results && results.length > 0) {
      const result = findNearestRate(results, date);
      if (result) {
        setCache(cacheKey, result);
        return result;
      }
    }
  } catch {
    console.warn(`[yahoo-finance] Failed to get historical USD/TRY rate for ${targetDate}`);
  }

  return {
    rate: getFallbackRate(targetDate),
    date: targetDate,
    isApproximate: true,
  };
}

function findNearestRate(
  results: { date: Date | string; close: number }[],
  targetDate: Date,
): ExchangeRateResult | null {
  if (results.length === 0) return null;

  const target = targetDate.getTime();
  const sorted = [...results].sort((a, b) => {
    const diffA = Math.abs(new Date(a.date).getTime() - target);
    const diffB = Math.abs(new Date(b.date).getTime() - target);
    return diffA - diffB;
  });

  const nearest = sorted[0];
  const nearestDate = new Date(nearest.date);
  const isApproximate = dateKey(nearestDate) !== dateKey(targetDate);

  return {
    rate: nearest.close,
    date: format(nearestDate, 'yyyy-MM-dd'),
    isApproximate,
  };
}

// ── getMultiplePrices ───────────────────────────────────────────────────────
export async function getMultiplePrices(
  symbols: string[],
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};

  for (const symbol of symbols) {
    try {
      result[symbol] = await getCurrentPrice(symbol);
    } catch {
      result[symbol] = null;
    }
  }

  return result;
}

// ── getHistoricalExchangeRates ──────────────────────────────────────────────
export async function getHistoricalExchangeRates(
  start: Date,
  end: Date,
): Promise<HistoricalPrice[]> {
  const cacheKey = `fx:histall:${dateKey(start)}:${dateKey(end)}`;

  if (!_forceRefresh) {
    const cached = getCached<HistoricalPrice[]>(cacheKey);
    if (cached) return cached;
  }

  try {
    const results = await yf.historical('TRY=X', {
      period1: format(start, 'yyyy-MM-dd'),
      period2: format(end, 'yyyy-MM-dd'),
    });

    const rates: HistoricalPrice[] = results.map((r) => ({
      date: format(new Date(r.date), 'yyyy-MM-dd'),
      close: r.close,
    }));

    setCache(cacheKey, rates);
    return rates;
  } catch {
    console.warn('[yahoo-finance] Failed to get historical USD/TRY rates');

    // Generate fallback rates for each month
    const rates: HistoricalPrice[] = [];
    const current = new Date(start);
    while (current <= end) {
      const d = format(current, 'yyyy-MM-dd');
      rates.push({ date: d, close: getFallbackRate(d) });
      current.setDate(current.getDate() + 1);
    }
    return rates;
  }
}

// ── parseDate utility ───────────────────────────────────────────────────────
export function parseDate(dateStr: string): Date {
  return parseISO(dateStr);
}
