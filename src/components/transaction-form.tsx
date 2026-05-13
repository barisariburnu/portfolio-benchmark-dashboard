'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TransactionFormProps {
  onSuccess: () => void;
}

export function TransactionForm({ onSuccess }: TransactionFormProps) {
  const [type, setType] = useState<string>('BUY');
  const [symbol, setSymbol] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [commission, setCommission] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [autoFetchedPrice, setAutoFetchedPrice] = useState<number | null>(null);

  // Auto-fetch price when symbol and date change
  const fetchHistoricalPrice = useCallback(async (sym: string, dt: string) => {
    if (!sym || !dt) return;
    setFetchingPrice(true);
    setAutoFetchedPrice(null);
    try {
      const res = await fetch(`/api/prices?symbol=${encodeURIComponent(sym)}&date=${encodeURIComponent(dt)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.price) {
          setAutoFetchedPrice(data.price);
          // Only auto-fill if the user hasn't manually set a price yet
          if (!price) {
            setPrice(data.price.toFixed(6));
          }
        }
      }
    } catch {
      // Silently fail - user can still enter price manually
    } finally {
      setFetchingPrice(false);
    }
  }, [price]);

  // Fetch price when symbol or date changes (debounced)
  useEffect(() => {
    if (!symbol || !date) return;

    const timer = setTimeout(() => {
      fetchHistoricalPrice(symbol.trim(), date);
    }, 600);

    return () => clearTimeout(timer);
  }, [symbol, date, fetchHistoricalPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!symbol || !date || !price || !quantity) {
      toast({ title: 'Hata', description: 'Lütfen tüm zorunlu alanları doldurun.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          symbol: symbol.toUpperCase().trim(),
          date,
          price: parseFloat(price),
          quantity: parseFloat(quantity),
          commission: parseFloat(commission) || 0,
          notes: notes.trim() || null,
        }),
      });

      if (res.ok) {
        // Reset form
        setSymbol('');
        setPrice('');
        setQuantity('');
        setCommission('0');
        setNotes('');
        setAutoFetchedPrice(null);
        onSuccess();
      } else {
        const data = await res.json();
        toast({
          title: 'Hata',
          description: data.error || 'İşlem kaydedilemedi.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Hata',
        description: 'Bağlantı hatası. Lütfen tekrar deneyin.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const typeLabels: Record<string, string> = {
    BUY: 'Alım',
    SELL: 'Satım',
    DRIP: 'DRIP (Temettü Yeniden Yatırım)',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Transaction Type */}
      <div className="space-y-2">
        <Label>İşlem Tipi</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BUY">Alım (BUY)</SelectItem>
            <SelectItem value="SELL">Satım (SELL)</SelectItem>
            <SelectItem value="DRIP">DRIP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Symbol */}
      <div className="space-y-2">
        <Label htmlFor="symbol">Sembol (ETF Kodu)</Label>
        <Input
          id="symbol"
          placeholder="örn: VOO, QQQ, SPY"
          value={symbol}
          onChange={(e) => { setSymbol(e.target.value); setAutoFetchedPrice(null); }}
          required
        />
        <p className="text-xs text-muted-foreground">
          Amerikan borsası ETF kodu girin (örn: VOO, QQQ, SPY, VTI)
        </p>
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="date">İşlem Tarihi</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setAutoFetchedPrice(null); }}
          required
        />
      </div>

      {/* Price */}
      <div className="space-y-2">
        <Label htmlFor="price" className="flex items-center gap-2">
          {type === 'DRIP' ? 'DRIP Günündeki Fiyat (USD/adet)' : 'Fiyat (USD/adet)'}
          {fetchingPrice && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </Label>
        <div className="relative">
          <Input
            id="price"
            type="number"
            step="0.000001"
            placeholder="0.00"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setAutoFetchedPrice(null); }}
            required
          />
          {autoFetchedPrice !== null && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:underline"
              onClick={() => setPrice(autoFetchedPrice.toFixed(6))}
              title={`Otomatik çekilen fiyat: $${autoFetchedPrice.toFixed(6)}`}
            >
              {autoFetchedPrice.toFixed(2)} ↗
            </button>
          )}
        </div>
        {(type === 'DRIP' || type === 'BUY') && (
          <p className="text-xs text-muted-foreground">
            {fetchingPrice
              ? 'Tarihteki fiyat otomatik çekiliyor...'
              : autoFetchedPrice !== null
                ? `Otomatik çekilen fiyat: $${autoFetchedPrice.toFixed(6)} — değiştirmek istemezseniz olduğu gibi bırakın.`
                : 'Sembol ve tarih girildiğinde fiyat otomatik çekilecektir. Farklıysa manuel düzeltebilirsiniz.'
            }
          </p>
        )}
      </div>

      {/* Quantity */}
      <div className="space-y-2">
        <Label htmlFor="quantity">
          {type === 'DRIP' ? 'Eklenen Hisse Adedi' : 'Miktar (Adet)'}
        </Label>
        <Input
          id="quantity"
          type="number"
          step="0.000001"
          placeholder="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
        {type === 'DRIP' && (
          <p className="text-xs text-muted-foreground">
            DRIP ile eklenen hisse adedini girin. USD tutarı otomatik hesaplanır.
          </p>
        )}
      </div>

      {/* Commission */}
      <div className="space-y-2">
        <Label htmlFor="commission">Komisyon (USD)</Label>
        <Input
          id="commission"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Toplam komisyon tutarı (DRIP işlemlerinde genelde 0)
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Not (Opsiyonel)</Label>
        <Textarea
          id="notes"
          placeholder="ör: Aylık birikim"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      {/* Preview */}
      {price && quantity && (
        <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">İşlem Tipi:</span>{' '}
            <span className="font-medium">{typeLabels[type]}</span>
          </p>
          <p>
            <span className="text-muted-foreground">USD Tutar:</span>{' '}
            <span className="font-medium">
              ${(parseFloat(price) * parseFloat(quantity) + (type !== 'SELL' ? parseFloat(commission) || 0 : -(parseFloat(commission) || 0))).toFixed(6)}
            </span>
          </p>
          {type === 'SELL' && (
            <p className="text-xs text-muted-foreground">
              Satış gelirinden komisyon düşülecektir
            </p>
          )}
        </div>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Kaydediliyor...
          </>
        ) : (
          'Kaydet'
        )}
      </Button>
    </form>
  );
}
