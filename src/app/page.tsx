'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart3,
  Plus,
  RefreshCw,
  Gift,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  LogOut,
  User,
  UserCog,
} from 'lucide-react';
import { TransactionForm } from '@/components/transaction-form';
import { DividendForm } from '@/components/dividend-form';
import { BenchmarkSelector, BENCHMARK_COLORS, getBenchmarkName } from '@/components/benchmark-selector';
import { TransactionTable } from '@/components/transaction-table';
import { ProfileDialog } from '@/components/profile-dialog';
import { toast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────

interface PositionDetail {
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  totalInvested: number;
  currentValue: number;
  profitLoss: number;
  profitLossPct: number;
}

interface PortfolioSummary {
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

interface BenchmarkSummaryItem {
  symbol: string;
  name: string;
  totalInvestedUSD: number;
  currentValueUSD: number;
  totalReturnUSD: number;
  totalReturnPct: number;
  positions: { symbol: string; quantity: number; averageCost: number }[];
  cashBalance: number;
}

interface TimeSeriesPoint {
  date: string;
  realValueUSD: number;
  realValueTRY: number;
  realReturnPct: number;
  benchmarks: { [symbol: string]: { valueUSD: number; valueTRY: number; returnPct: number } };
}

interface Transaction {
  id: string;
  type: string;
  symbol: string;
  date: string;
  price: number;
  quantity: number;
  commission: number;
  notes: string | null;
  exchangeRate: number;
  totalUSD: number;
  totalTRY: number;
}

interface PortfolioData {
  portfolio: PortfolioSummary;
  benchmarks: BenchmarkSummaryItem[];
  comparison: {
    diffUSD: number;
    diffTRY: number;
    diffPct: number;
    bestBenchmarkSymbol: string;
  };
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatTRY(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR');
}

// ── Main Dashboard Component ────────────────────────────────────────────────

export default function Home() {
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [benchmarkSymbols, setBenchmarkSymbols] = useState<string[]>(['GLD']);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [divDialogOpen, setDivDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currencyView, setCurrencyView] = useState<'USD' | 'TRY'>('USD');
  const [currentUser, setCurrentUser] = useState<{ userId: string; username: string; displayName?: string | null; createdAt?: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const initialLoadDone = useRef(false);

  // ── Auth check helper ─────────────────────────────────────────────────────
  const handleAuthError = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = '/login';
      return true;
    }
    return false;
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchPortfolioData = useCallback(async (force = false) => {
    setPortfolioLoading(true);
    try {
      const url = force ? '/api/portfolio?force=1' : '/api/portfolio';
      const res = await fetch(url);
      if (handleAuthError(res)) return;
      if (res.ok) setPortfolioData(await res.json());
    } catch (err) { console.error('Failed to fetch portfolio:', err); }
    finally { setPortfolioLoading(false); }
  }, [handleAuthError]);

  const fetchTimeSeries = useCallback(async (force = false) => {
    setTimeseriesLoading(true);
    try {
      const url = force ? '/api/portfolio/timeseries?force=1' : '/api/portfolio/timeseries';
      const res = await fetch(url);
      if (handleAuthError(res)) return;
      if (res.ok) setTimeSeries(await res.json());
    } catch (err) { console.error('Failed to fetch timeseries:', err); }
    finally { setTimeseriesLoading(false); }
  }, [handleAuthError]);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions');
      if (handleAuthError(res)) return;
      if (res.ok) setTransactions(await res.json());
    } catch (err) { console.error('Failed to fetch transactions:', err); }
  }, [handleAuthError]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (handleAuthError(res)) return;
      if (res.ok) {
        const data = await res.json();
        const s = data.settings;
        if (s.benchmark_symbols) {
          setBenchmarkSymbols(s.benchmark_symbols.split(',').map((x: string) => x.trim()).filter(Boolean));
        } else if (s.benchmark_symbol) {
          setBenchmarkSymbols([s.benchmark_symbol]);
        }
      }
    } catch (err) { console.error('Failed to fetch settings:', err); }
  }, [handleAuthError]);

  // Force refresh — bypasses 24h cache, fetches fresh data from Yahoo
  const refreshAll = useCallback(async (force = false) => {
    setRefreshing(true);
    await Promise.allSettled([
      fetchPortfolioData(force),
      fetchTimeSeries(force),
      fetchTransactions(),
      fetchSettings(),
    ]);
    setRefreshing(false);
  }, [fetchPortfolioData, fetchTimeSeries, fetchTransactions, fetchSettings]);

  // Fetch current user info
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCurrentUser({ userId: data.userId, username: data.username, displayName: data.displayName, createdAt: data.createdAt });
      }
    } catch (err) { console.error('Failed to fetch current user:', err); }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch {
      toast({ title: 'Hata', description: 'Çıkış yapılamadı.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const init = async () => {
      setLoading(true);
      // Fetch critical data first (auth, settings, transactions) — these are fast, no API calls
      await Promise.all([fetchCurrentUser(), fetchSettings(), fetchTransactions()]);
      // Mark page as loaded so user sees the dashboard immediately
      setLoading(false);
      // Fetch portfolio & timeseries in background — these use cached Yahoo data (instant after first daily fetch)
      await Promise.allSettled([fetchPortfolioData(), fetchTimeSeries()]);
    };
    init();
  }, [fetchCurrentUser, fetchSettings, fetchTransactions, fetchPortfolioData, fetchTimeSeries]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleTransactionAdded = async () => {
    setTxDialogOpen(false);
    await refreshAll();
    toast({ title: 'İşlem eklendi', description: 'Portföy güncellendi.' });
  };

  const handleDividendAdded = async () => {
    setDivDialogOpen(false);
    await refreshAll();
    toast({ title: 'Temettü eklendi', description: 'Portföy güncellendi.' });
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshAll();
        toast({ title: 'İşlem silindi', description: 'Portföy güncellendi.' });
      }
    } catch { toast({ title: 'Hata', description: 'İşlem silinemedi.', variant: 'destructive' }); }
  };

  const handleEditTransaction = async (id: string, data: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await refreshAll();
        toast({ title: 'İşlem güncellendi', description: 'Portföy güncellendi.' });
        return true;
      } else {
        const errData = await res.json();
        toast({ title: 'Hata', description: errData.error || 'İşlem güncellenemedi.', variant: 'destructive' });
        return false;
      }
    } catch {
      toast({ title: 'Hata', description: 'İşlem güncellenemedi.', variant: 'destructive' });
      return false;
    }
  };

  const handleBenchmarkChange = async (symbols: string[], names: string[]) => {
    setBenchmarkSymbols(symbols);
    // Save to settings
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'benchmark_symbols', value: symbols.join(',') }),
    });
    // Save individual benchmark names
    for (let i = 0; i < symbols.length; i++) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `benchmark_name_${symbols[i]}`, value: names[i] || symbols[i] }),
      });
    }
    setSettingsOpen(false);
    await refreshAll();
    toast({ title: 'Benchmark güncellendi', description: `${symbols.length} benchmark seçili: ${symbols.join(', ')}` });
  };

  // ── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-lg">Portföy yükleniyor...</p>
        </div>
      </div>
    );
  }

  const hasData = transactions.length > 0;
  const portfolio = portfolioData?.portfolio;
  const benchmarks = portfolioData?.benchmarks || [];
  const comparison = portfolioData?.comparison;
  const bestBenchmark = benchmarks.length > 0 ? benchmarks.reduce((a, b) => a.totalReturnPct > b.totalReturnPct ? a : b) : null;

  const fmtValue = currencyView === 'USD' ? formatUSD : formatTRY;
  const getVal = (usd: number, tryVal: number) => currencyView === 'USD' ? usd : tryVal;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Portföy Benchmark</h1>
                <p className="text-sm text-muted-foreground">ETF yatırımlarınızı karşılaştırın</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* User Info */}
              {currentUser && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setProfileOpen(true)}
                  title="Profil Ayarları"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline font-medium">{currentUser.displayName || currentUser.username}</span>
                </Button>
              )}
              {/* Currency Toggle */}
              <div className="flex items-center bg-muted rounded-lg p-1">
                <button onClick={() => setCurrencyView('USD')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${currencyView === 'USD' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>USD</button>
                <button onClick={() => setCurrencyView('TRY')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${currencyView === 'TRY' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>TRY</button>
              </div>
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" />
                    <span className="text-muted-foreground">Benchmark:</span>
                    <span className="font-semibold">{benchmarkSymbols.length > 0 ? benchmarkSymbols.join(', ') : 'Seçin'}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Benchmark Enstrümanları Seçin</DialogTitle>
                    <DialogDescription>
                      Birden fazla benchmark seçerek portföyünüzü farklı enstrümanlarla aynı anda karşılaştırabilirsiniz.
                    </DialogDescription>
                  </DialogHeader>
                  <BenchmarkSelector
                    selectedSymbols={benchmarkSymbols}
                    onSelectionChange={handleBenchmarkChange}
                  />
                </DialogContent>
              </Dialog>
              {/* Refresh button — uses cached data by default. Hold Shift+click for force refresh. */}
              <Button
                variant="outline"
                size="icon"
                onClick={(e) => refreshAll(e.shiftKey)}
                disabled={refreshing}
                title="Fiyatları güncelle (Shift+click: önbelleği atla)"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setProfileOpen(true)} title="Profil Ayarları">
                <UserCog className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleLogout} title="Çıkış Yap">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="bg-muted rounded-full p-6"><BarChart3 className="h-16 w-16 text-muted-foreground" /></div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Hoş Geldiniz!</h2>
              <p className="text-muted-foreground max-w-md">Portföyünüzü oluşturmak için ilk işleminizi ekleyin.</p>
            </div>
            <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
              <DialogTrigger asChild><Button size="lg"><Plus className="h-5 w-5 mr-2" />İlk İşlemi Ekle</Button></DialogTrigger>
              <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Yeni İşlem Ekle</DialogTitle><DialogDescription>ETF alım, satım veya DRIP işleminizi kaydedin</DialogDescription></DialogHeader><TransactionForm onSuccess={handleTransactionAdded} /></DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />İşlem Ekle</Button></DialogTrigger>
                <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Yeni İşlem Ekle</DialogTitle></DialogHeader><TransactionForm onSuccess={handleTransactionAdded} /></DialogContent>
              </Dialog>
              <Dialog open={divDialogOpen} onOpenChange={setDivDialogOpen}>
                <DialogTrigger asChild><Button variant="outline"><Gift className="h-4 w-4 mr-2" />Temettü Ekle</Button></DialogTrigger>
                <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Temettü Ekle</DialogTitle></DialogHeader><DividendForm symbols={[...new Set(transactions.filter(t => t.type !== 'DIVIDEND_CASH').map(t => t.symbol))]} onSuccess={handleDividendAdded} /></DialogContent>
              </Dialog>
              <Button variant="outline" onClick={() => refreshAll()} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Güncelle
              </Button>
              <Button variant="ghost" onClick={() => refreshAll(true)} disabled={refreshing} title="Önbelleği atlayarak Yahoo Finance'den yeni veri çeker">
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Zorla Güncelle
              </Button>
              {(portfolioLoading || timeseriesLoading) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Veri yükleniyor...
                </span>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Real Portfolio */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Gerçek Portföy</CardDescription>
                  <CardTitle className="text-2xl">{fmtValue(getVal(portfolio?.currentValueUSD ?? 0, portfolio?.currentValueTRY ?? 0))}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {(portfolio?.totalReturnPct ?? 0) >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : <ArrowDownRight className="h-4 w-4 text-red-500" />}
                    <span className={`text-sm font-medium ${(portfolio?.totalReturnPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(portfolio?.totalReturnPct ?? 0)}</span>
                    <span className="text-xs text-muted-foreground">({fmtValue(getVal(portfolio?.totalReturnUSD ?? 0, portfolio?.totalReturnTRY ?? 0))})</span>
                  </div>
                </CardContent>
              </Card>

              {/* Best Benchmark */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>En İyi Benchmark ({bestBenchmark?.symbol || '-'})</CardDescription>
                  <CardTitle className="text-2xl">{fmtValue(getVal(bestBenchmark?.currentValueUSD ?? 0, (bestBenchmark?.currentValueUSD ?? 0) * (portfolio?.currentValueTRY ?? 1) / (portfolio?.currentValueUSD ?? 1)))}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {(bestBenchmark?.totalReturnPct ?? 0) >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : <ArrowDownRight className="h-4 w-4 text-red-500" />}
                    <span className={`text-sm font-medium ${(bestBenchmark?.totalReturnPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(bestBenchmark?.totalReturnPct ?? 0)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Difference */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Fark (Gerçek - En İyi Benchmark)</CardDescription>
                  <CardTitle className="text-2xl">{fmtValue(getVal(comparison?.diffUSD ?? 0, comparison?.diffTRY ?? 0))}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {(comparison?.diffPct ?? 0) >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : <ArrowDownRight className="h-4 w-4 text-red-500" />}
                    <span className={`text-sm font-medium ${(comparison?.diffPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(comparison?.diffPct ?? 0)}</span>
                    <span className="text-xs text-muted-foreground">{(comparison?.diffUSD ?? 0) >= 0 ? 'Gerçek önde' : 'Benchmark önde'}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Total Invested */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Toplam Yatırılan</CardDescription>
                  <CardTitle className="text-2xl">{fmtValue(getVal(portfolio?.totalInvestedUSD ?? 0, portfolio?.totalInvestedTRY ?? 0))}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>Nakit: {formatUSD(portfolio?.cashBalance ?? 0)}</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{portfolio?.positions.length ?? 0} pozisyon</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* All Benchmarks Mini Cards */}
            {benchmarks.length > 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {benchmarks.map((bm, idx) => {
                  const color = BENCHMARK_COLORS[idx % BENCHMARK_COLORS.length];
                  return (
                    <div key={bm.symbol} className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: `${color}40` }}>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{bm.symbol}</p>
                        <p className={`text-xs font-medium ${bm.totalReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(bm.totalReturnPct)}</p>
                      </div>
                      <p className="ml-auto text-xs text-muted-foreground">{formatUSD(bm.currentValueUSD)}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tabs */}
            <Tabs defaultValue="comparison" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="comparison">Karşılaştırma</TabsTrigger>
                <TabsTrigger value="portfolio">Portföyüm</TabsTrigger>
                <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
              </TabsList>

              {/* ── Comparison Tab ────────────────────────────────────── */}
              <TabsContent value="comparison" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Portföy Değeri Zaman Serisi</CardTitle>
                    <CardDescription>Gerçek portföy vs Benchmarklar - {currencyView} cinsinden</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {timeSeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={timeSeries}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })} tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={(v) => currencyView === 'USD' ? `$${(v/1000).toFixed(0)}k` : `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(value: number, name: string) => [fmtValue(value), name]} labelFormatter={(label) => formatDate(label)} />
                          <Legend />
                          <Line type="monotone" dataKey={currencyView === 'USD' ? 'realValueUSD' : 'realValueTRY'} stroke="#2563eb" strokeWidth={2.5} dot={false} name="Gerçek Portföy" />
                          {benchmarkSymbols.map((bs, idx) => (
                            <Line
                              key={bs}
                              type="monotone"
                              dataKey={(d: TimeSeriesPoint) => d.benchmarks?.[bs]?.[currencyView === 'USD' ? 'valueUSD' : 'valueTRY'] ?? undefined}
                              stroke={BENCHMARK_COLORS[idx % BENCHMARK_COLORS.length]}
                              strokeWidth={1.5}
                              strokeDasharray={idx > 0 ? '5 5' : undefined}
                              dot={false}
                              name={bs}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        <div className="text-center space-y-2">
                          <AlertCircle className="h-8 w-8 mx-auto" />
                          <p>{timeseriesLoading ? 'Zaman serisi yükleniyor...' : 'Zaman serisi verisi yüklenemedi.'}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Return % Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Getiri Yüzdesi Karşılaştırması</CardTitle>
                    <CardDescription>Gerçek portföy vs tüm benchmarklar</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {timeSeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={timeSeries}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })} tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(value: number, name: string) => [formatPct(value), name]} labelFormatter={(label) => formatDate(label)} />
                          <Legend />
                          <Line type="monotone" dataKey="realReturnPct" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Gerçek Portföy" />
                          {benchmarkSymbols.map((bs, idx) => (
                            <Line
                              key={bs}
                              type="monotone"
                              dataKey={(d: TimeSeriesPoint) => d.benchmarks?.[bs]?.returnPct ?? undefined}
                              stroke={BENCHMARK_COLORS[idx % BENCHMARK_COLORS.length]}
                              strokeWidth={1.5}
                              strokeDasharray={idx > 0 ? '5 5' : undefined}
                              dot={false}
                              name={bs}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[200px] text-muted-foreground"><p>{timeseriesLoading ? 'Yükleniyor...' : 'Veri yok'}</p></div>
                    )}
                  </CardContent>
                </Card>

                {/* Comparison Table */}
                <Card>
                  <CardHeader><CardTitle>Özet Karşılaştırma</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Metrik</th>
                            <th className="text-right py-3 px-4 font-medium">Gerçek Portföy</th>
                            {benchmarkSymbols.map((bs, idx) => (
                              <th key={bs} className="text-right py-3 px-4 font-medium" style={{ color: BENCHMARK_COLORS[idx % BENCHMARK_COLORS.length] }}>{bs}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="py-3 px-4">Güncel Değer (USD)</td>
                            <td className="text-right py-3 px-4 font-medium">{formatUSD(portfolio?.currentValueUSD ?? 0)}</td>
                            {benchmarks.map((bm) => (
                              <td key={bm.symbol} className="text-right py-3 px-4">{formatUSD(bm.currentValueUSD)}</td>
                            ))}
                          </tr>
                          <tr className="border-b">
                            <td className="py-3 px-4">Getiri %</td>
                            <td className={`text-right py-3 px-4 font-medium ${(portfolio?.totalReturnPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(portfolio?.totalReturnPct ?? 0)}</td>
                            {benchmarks.map((bm) => (
                              <td key={bm.symbol} className={`text-right py-3 px-4 font-medium ${bm.totalReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(bm.totalReturnPct)}</td>
                            ))}
                          </tr>
                          <tr>
                            <td className="py-3 px-4">Fark (Gerçek - Benchmark)</td>
                            <td className="text-right py-3 px-4">-</td>
                            {benchmarks.map((bm) => {
                              const diff = (portfolio?.totalReturnPct ?? 0) - bm.totalReturnPct;
                              return <td key={bm.symbol} className={`text-right py-3 px-4 font-medium ${diff >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(diff)}</td>;
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Portfolio Tab ──────────────────────────────────────── */}
              <TabsContent value="portfolio" className="space-y-4">
                <Card>
                  <CardHeader><CardTitle>Açık Pozisyonlar</CardTitle></CardHeader>
                  <CardContent>
                    {portfolio && portfolio.positions.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Sembol</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Adet</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Ort. Maliyet</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Güncel Fiyat</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Değer</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Kar/Zarar</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Getiri %</th></tr></thead>
                          <tbody>
                            {portfolio.positions.map((pos) => (
                              <tr key={pos.symbol} className="border-b hover:bg-muted/50">
                                <td className="py-3 px-4 font-medium">{pos.symbol}</td>
                                <td className="text-right py-3 px-4">{pos.quantity.toFixed(6)}</td>
                                <td className="text-right py-3 px-4">{formatUSD(pos.averageCost)}</td>
                                <td className="text-right py-3 px-4">{formatUSD(pos.currentPrice)}</td>
                                <td className="text-right py-3 px-4">{formatUSD(pos.currentValue)}</td>
                                <td className={`text-right py-3 px-4 font-medium ${pos.profitLoss >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatUSD(pos.profitLoss)}</td>
                                <td className={`text-right py-3 px-4 font-medium ${pos.profitLossPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(pos.profitLossPct)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <div className="text-center py-8 text-muted-foreground">Açık pozisyon bulunmuyor</div>}
                  </CardContent>
                </Card>
                {(portfolio?.cashBalance ?? 0) > 0 && <Card><CardHeader className="pb-2"><CardDescription>Nakit Bakiye</CardDescription><CardTitle className="text-xl">{formatUSD(portfolio?.cashBalance ?? 0)}</CardTitle></CardHeader></Card>}
                <Card>
                  <CardHeader><CardTitle>İşlem Geçmişi</CardTitle></CardHeader>
                  <CardContent><TransactionTable transactions={transactions} onDelete={handleDeleteTransaction} onEdit={handleEditTransaction} /></CardContent>
                </Card>
              </TabsContent>

              {/* ── Benchmark Tab ──────────────────────────────────────── */}
              <TabsContent value="benchmark" className="space-y-4">
                {benchmarks.length === 0 ? (
                  <Card><CardContent className="text-center py-8 text-muted-foreground"><p>Benchmark seçilmedi. Ayarlar butonundan benchmark ekleyin.</p></CardContent></Card>
                ) : benchmarks.map((bm, idx) => {
                  const color = BENCHMARK_COLORS[idx % BENCHMARK_COLORS.length];
                  return (
                    <Card key={bm.symbol}>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                          <CardTitle className="text-base">{bm.name || bm.symbol} ({bm.symbol})</CardTitle>
                        </div>
                        <CardDescription>Aynı tutarı {bm.symbol}&apos;a yatırmış olsaydınız</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="space-y-1"><p className="text-sm text-muted-foreground">Toplam Hisse</p><p className="text-lg font-bold">{(bm.positions[0]?.quantity ?? 0).toFixed(6)}</p></div>
                          <div className="space-y-1"><p className="text-sm text-muted-foreground">Ort. Maliyet</p><p className="text-lg font-bold">{formatUSD(bm.positions[0]?.averageCost ?? 0)}</p></div>
                          <div className="space-y-1"><p className="text-sm text-muted-foreground">Güncel Değer</p><p className="text-lg font-bold">{formatUSD(bm.currentValueUSD)}</p></div>
                          <div className="space-y-1"><p className="text-sm text-muted-foreground">Getiri</p><p className={`text-lg font-bold ${bm.totalReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPct(bm.totalReturnPct)}</p></div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* ── Profile Dialog ───────────────────────────────────────────────── */}
      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        currentUser={currentUser}
        onProfileUpdated={(updatedUser) => {
          // Re-fetch user info from server to ensure state is fully consistent
          fetchCurrentUser();
        }}
        onDataRefresh={async () => {
          // Refresh all dashboard data after profile change
          await refreshAll();
        }}
      />

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-muted-foreground text-center">Portföy Benchmark Dashboard — Veriler günlük olarak Yahoo Finance üzerinden önbelleğe alınır. Yatırım tavsiyesi değildir.</p>
        </div>
      </footer>
    </div>
  );
}
