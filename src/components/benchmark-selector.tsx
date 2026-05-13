'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X } from 'lucide-react';

interface BenchmarkOption {
  symbol: string;
  name: string;
  category: string;
  icon: string;
}

export const PRESET_BENCHMARKS: BenchmarkOption[] = [
  // Altın
  { symbol: 'GLD', name: 'SPDR Gold Shares', category: 'Altın', icon: '🥇' },
  { symbol: 'IAU', name: 'iShares Gold Trust', category: 'Altın', icon: '🥇' },
  { symbol: 'GC=F', name: 'Ons Altın (Gold Futures)', category: 'Altın', icon: '🪙' },
  // Gümüş
  { symbol: 'SLV', name: 'iShares Silver Trust', category: 'Gümüş', icon: '🥈' },
  // Petrol
  { symbol: 'USO', name: 'United States Oil Fund', category: 'Petrol', icon: '🛢️' },
  { symbol: 'CL=F', name: 'Ham Petrol (Crude Futures)', category: 'Petrol', icon: '⛽' },
  // Tahvil
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond', category: 'Tahvil', icon: '📋' },
  { symbol: 'IEF', name: 'iShares 7-10 Year Treasury Bond', category: 'Tahvil', icon: '📋' },
  { symbol: 'BND', name: 'Vanguard Total Bond Market', category: 'Tahvil', icon: '📋' },
  // ETF
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', category: 'ETF', icon: '📊' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', category: 'ETF', icon: '📊' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market', category: 'ETF', icon: '📊' },
  { symbol: 'EFA', name: 'iShares MSCI EAFE (Uluslararası)', category: 'ETF', icon: '🌍' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets', category: 'ETF', icon: '🌐' },
  // Gayrimenkul
  { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', category: 'Gayrimenkul', icon: '🏠' },
  // Emtia
  { symbol: 'DJP', name: 'iPath Bloomberg Commodity', category: 'Emtia', icon: '📦' },
];

export function getBenchmarkName(symbol: string): string {
  const preset = PRESET_BENCHMARKS.find(b => b.symbol === symbol);
  return preset?.name || symbol;
}

// Color palette for multiple benchmarks on charts
export const BENCHMARK_COLORS = [
  '#f97316', // orange
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
];

interface BenchmarkSelectorProps {
  selectedSymbols: string[];
  onSelectionChange: (symbols: string[], names: string[]) => void;
}

export function BenchmarkSelector({ selectedSymbols, onSelectionChange }: BenchmarkSelectorProps) {
  const [customSymbol, setCustomSymbol] = useState('');
  const [customName, setCustomName] = useState('');

  const categories = [...new Set(PRESET_BENCHMARKS.map(b => b.category))];

  const toggleSymbol = (symbol: string, name: string) => {
    if (selectedSymbols.includes(symbol)) {
      // Remove
      const newSymbols = selectedSymbols.filter(s => s !== symbol);
      const newNames = newSymbols.map(s => getBenchmarkName(s));
      onSelectionChange(newSymbols, newNames);
    } else {
      // Add
      const newSymbols = [...selectedSymbols, symbol];
      const newNames = newSymbols.map(s => getBenchmarkName(s));
      onSelectionChange(newSymbols, newNames);
    }
  };

  const addCustomSymbol = () => {
    if (!customSymbol) return;
    if (selectedSymbols.includes(customSymbol)) return;
    const newSymbols = [...selectedSymbols, customSymbol];
    const newNames = [...selectedSymbols.map(s => getBenchmarkName(s))];
    newNames.push(customName || customSymbol);
    onSelectionChange(newSymbols, newNames);
    setCustomSymbol('');
    setCustomName('');
  };

  return (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
      {/* Current Selection */}
      <div className="bg-muted/60 rounded-lg p-3">
        <p className="text-xs text-muted-foreground mb-2">Seçili Benchmarklar ({selectedSymbols.length})</p>
        {selectedSymbols.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Henüz benchmark seçilmedi</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedSymbols.map((symbol, idx) => {
              const colorIdx = idx % BENCHMARK_COLORS.length;
              const name = getBenchmarkName(symbol);
              return (
                <span
                  key={symbol}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border"
                  style={{
                    backgroundColor: `${BENCHMARK_COLORS[colorIdx]}15`,
                    borderColor: `${BENCHMARK_COLORS[colorIdx]}40`,
                    color: BENCHMARK_COLORS[colorIdx],
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: BENCHMARK_COLORS[colorIdx] }}
                  />
                  {symbol}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSymbol(symbol, name);
                    }}
                    className="ml-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Preset Options by Category */}
      {categories.map((cat) => {
        const items = PRESET_BENCHMARKS.filter(b => b.category === cat);
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{cat}</h4>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">{items.length} seçenek</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {items.map((opt) => {
                const isSelected = selectedSymbols.includes(opt.symbol);
                const colorIdx = selectedSymbols.indexOf(opt.symbol) % BENCHMARK_COLORS.length;
                const activeColor = isSelected ? BENCHMARK_COLORS[colorIdx >= 0 ? colorIdx : 0] : undefined;
                return (
                  <button
                    key={opt.symbol}
                    type="button"
                    className={`
                      w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150
                      flex items-center gap-3 group
                      ${isSelected
                        ? 'shadow-sm'
                        : 'border-border bg-card hover:bg-muted/60 hover:border-muted-foreground/30'
                      }
                    `}
                    style={isSelected ? {
                      borderColor: `${activeColor}50`,
                      backgroundColor: `${activeColor}10`,
                      boxShadow: `0 0 0 1px ${activeColor}25`,
                    } : undefined}
                    onClick={() => toggleSymbol(opt.symbol, opt.name)}
                  >
                    {/* Icon */}
                    <span className="text-lg flex-shrink-0">{opt.icon}</span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold text-sm ${isSelected ? '' : 'text-foreground'}`}
                          style={isSelected ? { color: activeColor } : undefined}
                        >
                          {opt.symbol}
                        </p>
                        {isSelected && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              backgroundColor: activeColor,
                              color: '#fff',
                            }}
                          >
                            <Check className="h-2.5 w-2.5" />
                            Seçili
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{opt.name}</p>
                    </div>

                    {/* Color dot when selected */}
                    {isSelected && (
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: activeColor }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Custom Symbol */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground">Özel Sembol</h4>
          <div className="flex-1 h-px bg-border" />
        </div>
        <p className="text-xs text-muted-foreground">
          Aşağıdaki listede yoksa, Yahoo Finance formatında sembol girin.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="custom-symbol" className="text-xs">Sembol</Label>
            <Input
              id="custom-symbol"
              placeholder="ör: XU100.IS"
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-name" className="text-xs">Ad</Label>
            <Input
              id="custom-name"
              placeholder="ör: BIST 100"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={!customSymbol || selectedSymbols.includes(customSymbol)}
          onClick={addCustomSymbol}
        >
          Özel Sembolü Ekle
        </Button>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>• BIST 100: <code className="bg-muted px-1 rounded">XU100.IS</code></p>
          <p>• BIST 30: <code className="bg-muted px-1 rounded">XU030.IS</code></p>
          <p>• Bitcoin: <code className="bg-muted px-1 rounded">BTC-USD</code></p>
        </div>
      </div>
    </div>
  );
}
