'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, Search, Pencil, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

interface TransactionTableProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (id: string, data: Record<string, unknown>) => Promise<boolean>;
}

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTRY(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const typeLabels: Record<string, { label: string; color: string }> = {
  BUY: { label: 'Alım', color: 'bg-emerald-100 text-emerald-800' },
  SELL: { label: 'Satım', color: 'bg-red-100 text-red-800' },
  DRIP: { label: 'DRIP', color: 'bg-blue-100 text-blue-800' },
  DIVIDEND_CASH: { label: 'Nakit Temettü', color: 'bg-amber-100 text-amber-800' },
};

// ── Edit Transaction Dialog ────────────────────────────────────────────────

function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
  onSave,
}: {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [type, setType] = useState(transaction.type);
  const [symbol, setSymbol] = useState(transaction.symbol);
  const [date, setDate] = useState(transaction.date.split('T')[0]);
  const [price, setPrice] = useState(String(transaction.price));
  const [quantity, setQuantity] = useState(String(transaction.quantity));
  const [commission, setCommission] = useState(String(transaction.commission));
  const [notes, setNotes] = useState(transaction.notes || '');
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens with new transaction data
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setType(transaction.type);
      setSymbol(transaction.symbol);
      setDate(transaction.date.split('T')[0]);
      setPrice(String(transaction.price));
      setQuantity(String(transaction.quantity));
      setCommission(String(transaction.commission));
      setNotes(transaction.notes || '');
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!symbol || !date || !price || !quantity) {
      toast({ title: 'Hata', description: 'Lütfen tüm zorunlu alanları doldurun.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Check if date changed — if so, recalculate exchange rate
      const originalDate = transaction.date.split('T')[0];
      const dateChanged = date !== originalDate;

      const success = await onSave(transaction.id, {
        type,
        symbol: symbol.toUpperCase().trim(),
        date,
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        commission: parseFloat(commission) || 0,
        notes: notes.trim() || null,
        recalculateRate: dateChanged,
      });

      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  // Preview calculation
  const priceNum = parseFloat(price) || 0;
  const quantityNum = parseFloat(quantity) || 0;
  const commissionNum = parseFloat(commission) || 0;
  let previewTotal = 0;
  switch (type) {
    case 'BUY':
      previewTotal = priceNum * quantityNum + commissionNum;
      break;
    case 'SELL':
      previewTotal = priceNum * quantityNum - commissionNum;
      break;
    case 'DRIP':
      previewTotal = priceNum * quantityNum;
      break;
    case 'DIVIDEND_CASH':
      previewTotal = priceNum * quantityNum;
      break;
  }

  const typeLabelsMap: Record<string, string> = {
    BUY: 'Alım',
    SELL: 'Satım',
    DRIP: 'DRIP (Temettü Yeniden Yatırım)',
    DIVIDEND_CASH: 'Nakit Temettü',
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>İşlemi Düzenle</DialogTitle>
          <DialogDescription>
            İşlem detaylarını güncelleyin. Tarih değiştirilirse döviz kuru otomatik olarak yeniden hesaplanır.
          </DialogDescription>
        </DialogHeader>
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
                <SelectItem value="DIVIDEND_CASH">Nakit Temettü</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Symbol */}
          <div className="space-y-2">
            <Label htmlFor="edit-symbol">Sembol</Label>
            <Input
              id="edit-symbol"
              placeholder="örn: VOO, QQQ, SPY"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              required
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="edit-date">İşlem Tarihi</Label>
            <Input
              id="edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            {date !== transaction.date.split('T')[0] && (
              <p className="text-xs text-amber-600">
                Tarih değiştirildi. Döviz kuru yeni tarih için otomatik hesaplanacak.
              </p>
            )}
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="edit-price">Fiyat (USD/adet)</Label>
            <Input
              id="edit-price"
              type="number"
              step="0.000001"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="edit-quantity">
              {type === 'DRIP' ? 'Eklenen Hisse Adedi' : type === 'DIVIDEND_CASH' ? 'Miktar (1 bırakın)' : 'Miktar (Adet)'}
            </Label>
            <Input
              id="edit-quantity"
              type="number"
              step="0.000001"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          {/* Commission */}
          <div className="space-y-2">
            <Label htmlFor="edit-commission">Komisyon (USD)</Label>
            <Input
              id="edit-commission"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Not (Opsiyonel)</Label>
            <Textarea
              id="edit-notes"
              placeholder="ör: Aylık birikim"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Preview */}
          {priceNum > 0 && quantityNum > 0 && (
            <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">İşlem Tipi:</span>{' '}
                <span className="font-medium">{typeLabelsMap[type]}</span>
              </p>
              <p>
                <span className="text-muted-foreground">USD Tutar:</span>{' '}
                <span className="font-medium">${previewTotal.toFixed(2)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Orijinal: {formatUSD(transaction.totalUSD)}
                {Math.abs(previewTotal - transaction.totalUSD) > 0.005 && (
                  <span className="text-amber-600 ml-2">
                    (Değişti: {previewTotal > transaction.totalUSD ? '+' : ''}{(previewTotal - transaction.totalUSD).toFixed(2)} USD)
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              İptal
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                'Güncelle'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Transaction Table ─────────────────────────────────────────────────

export function TransactionTable({ transactions, onDelete, onEdit }: TransactionTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      tx.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesType = filterType === 'ALL' || tx.type === filterType;
    return matchesSearch && matchesType;
  });

  const sortedTransactions = [...filtered].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Henüz işlem yok.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sembol veya not ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="İşlem Tipi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tümü</SelectItem>
            <SelectItem value="BUY">Alım</SelectItem>
            <SelectItem value="SELL">Satım</SelectItem>
            <SelectItem value="DRIP">DRIP</SelectItem>
            <SelectItem value="DIVIDEND_CASH">Nakit Temettü</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <div className="min-w-[850px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-3 font-medium text-muted-foreground">Tarih</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground">Tip</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground">Sembol</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground">Fiyat</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground">Miktar</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground">Komisyon</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground">Kur</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground">USD Tutar</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground">TRY Tutar</th>
                <th className="text-center py-3 px-3 font-medium text-muted-foreground">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((tx) => {
                const typeInfo = typeLabels[tx.type] || { label: tx.type, color: 'bg-gray-100 text-gray-800' };
                return (
                  <tr key={tx.id} className="border-b hover:bg-muted/50 group">
                    <td className="py-3 px-3">
                      {new Date(tx.date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant="secondary" className={typeInfo.color}>
                        {typeInfo.label}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 font-medium">{tx.symbol}</td>
                    <td className="text-right py-3 px-3">{formatUSD(tx.price)}</td>
                    <td className="text-right py-3 px-3">{tx.quantity.toFixed(6)}</td>
                    <td className="text-right py-3 px-3">{formatUSD(tx.commission)}</td>
                    <td className="text-right py-3 px-3 text-muted-foreground">
                      {tx.exchangeRate > 0 ? tx.exchangeRate.toFixed(4) : '-'}
                    </td>
                    <td className="text-right py-3 px-3 font-medium">{formatUSD(tx.totalUSD)}</td>
                    <td className="text-right py-3 px-3 text-muted-foreground">
                      {tx.totalTRY > 0 ? formatTRY(tx.totalTRY) : '-'}
                    </td>
                    <td className="text-center py-3 px-3">
                      <div className="flex items-center justify-center gap-1">
                        {/* Edit Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 hover:text-blue-700"
                          onClick={() => setEditingTx(tx)}
                          title="Düzenle"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {/* Delete Button */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              title="Sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>İşlemi Sil</AlertDialogTitle>
                              <AlertDialogDescription>
                                Bu işlemi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>İptal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(tx.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Sil
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && transactions.length > 0 && (
        <div className="text-center py-4 text-muted-foreground">
          Filtre kriterlerine uygun işlem bulunamadı
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">
        Toplam {transactions.length} işlem | {filtered.length} gösteriliyor
      </p>

      {/* Edit Dialog */}
      {editingTx && (
        <EditTransactionDialog
          transaction={editingTx}
          open={!!editingTx}
          onOpenChange={(open) => {
            if (!open) setEditingTx(null);
          }}
          onSave={onEdit}
        />
      )}
    </div>
  );
}
