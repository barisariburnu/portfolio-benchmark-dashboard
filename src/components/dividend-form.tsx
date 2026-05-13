'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DividendFormProps {
  symbols: string[];
  onSuccess: () => void;
}

export function DividendForm({ symbols, onSuccess }: DividendFormProps) {
  const [divType, setDivType] = useState<'DRIP' | 'CASH'>('DRIP');
  const [symbol, setSymbol] = useState(symbols[0] || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [price, setPrice] = useState(''); // For DRIP: price per share (manual entry)
  const [quantity, setQuantity] = useState(''); // For DRIP: shares added
  const [amount, setAmount] = useState(''); // For CASH: USD amount
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!symbol || !date) {
      toast({ title: 'Hata', description: 'Lütfen tüm alanları doldurun.', variant: 'destructive' });
      return;
    }

    if (divType === 'DRIP' && (!quantity || !price)) {
      toast({ title: 'Hata', description: 'DRIP için fiyat ve eklenen hisse adedini girin.', variant: 'destructive' });
      return;
    }

    if (divType === 'CASH' && !amount) {
      toast({ title: 'Hata', description: 'Nakit temettü tutarını girin.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.toUpperCase().trim(),
          date,
          type: divType,
          price: divType === 'DRIP' ? parseFloat(price) : undefined,
          quantity: divType === 'DRIP' ? parseFloat(quantity) : undefined,
          amount: divType === 'CASH' ? parseFloat(amount) : undefined,
        }),
      });

      if (res.ok) {
        setPrice('');
        setQuantity('');
        setAmount('');
        onSuccess();
      } else {
        const data = await res.json();
        toast({
          title: 'Hata',
          description: data.error || 'Temettü kaydedilemedi.',
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Dividend Type */}
      <div className="space-y-2">
        <Label>Temettü Tipi</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={divType === 'DRIP' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setDivType('DRIP')}
          >
            DRIP (Yeniden Yatırım)
          </Button>
          <Button
            type="button"
            variant={divType === 'CASH' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setDivType('CASH')}
          >
            Nakit Temettü
          </Button>
        </div>
      </div>

      {/* Symbol */}
      <div className="space-y-2">
        <Label>Sembol</Label>
        <Select value={symbol} onValueChange={(v) => setSymbol(v)}>
          <SelectTrigger>
            <SelectValue placeholder="ETF seçin" />
          </SelectTrigger>
          <SelectContent>
            {symbols.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="div-date">Temettü Tarihi</Label>
        <Input
          id="div-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      {/* Conditional Fields */}
      {divType === 'DRIP' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="div-price">DRIP Günündeki Fiyat (USD/adet)</Label>
            <Input
              id="div-price"
              type="number"
              step="0.000001"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              DRIP tarihindeki hisse fiyatını manuel olarak girin.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="div-quantity">Eklenen Hisse Adedi</Label>
            <Input
              id="div-quantity"
              type="number"
              step="0.000001"
              placeholder="ör: 2.5"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              DRIP ile eklenen hisse adedini girin.
            </p>
          </div>
          {price && quantity && (
            <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">USD Değer:</span>{' '}
                <span className="font-medium">
                  ${(parseFloat(price) * parseFloat(quantity)).toFixed(6)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                USD Değer = Fiyat × Adet
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="div-amount">Temettü Tutarı (USD)</Label>
          <Input
            id="div-amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Nakit olarak alınan temettü tutarını USD cinsinden girin.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
        {divType === 'DRIP' ? (
          <>
            <p className="font-medium">DRIP Nasıl Hesaplanır?</p>
            <p className="text-muted-foreground">
              USD Değer = Fiyat × Adet. DRIP tarihindeki fiyatı ve eklenen hisse adedini girin.
              Bu tutar hem gerçek portföyünüze (aynı ETF&apos;ten ek hisse) hem benchmark&apos;a
              (karşılık gelen enstrüman) yansıtılır.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Nakit Temettü</p>
            <p className="text-muted-foreground">
              Temettü tutarı her iki portföyde de (gerçek ve benchmark) nakit bakiyeye eklenir.
            </p>
          </>
        )}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Kaydediliyor...
          </>
        ) : (
          'Temettüyü Kaydet'
        )}
      </Button>
    </form>
  );
}
