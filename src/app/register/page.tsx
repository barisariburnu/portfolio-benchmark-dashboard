'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast({ title: 'Hata', description: 'Lütfen tüm alanları doldurun.', variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Hata', description: 'Şifreler eşleşmiyor.', variant: 'destructive' });
      return;
    }

    if (password.length < 6) {
      toast({ title: 'Hata', description: 'Şifre en az 6 karakter olmalıdır.', variant: 'destructive' });
      return;
    }

    if (username.length < 3) {
      toast({ title: 'Hata', description: 'Kullanıcı adı en az 3 karakter olmalıdır.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          displayName: displayName || undefined,
        }),
      });

      if (res.ok) {
        toast({ title: 'Kayıt başarılı', description: 'Yönlendiriliyorsunuz...' });
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: 'Kayıt başarısız',
          description: data.error || 'Kayıt oluşturulamadı.',
          variant: 'destructive',
        });
      }
    } catch {
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="bg-primary rounded-xl p-3">
            <BarChart3 className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Portföy Benchmark</h1>
            <p className="text-muted-foreground text-sm">ETF yatırımlarınızı karşılaştırın</p>
          </div>
        </div>

        {/* Register Card */}
        <Card>
          <CardHeader>
            <CardTitle>Kayıt Ol</CardTitle>
            <CardDescription>
              Yeni bir hesap oluşturarak portföyünüzü yönetmeye başlayın.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Kullanıcı Adı</Label>
                <Input
                  id="username"
                  placeholder="En az 3 karakter"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Görünen İsim (Opsiyonel)</Label>
                <Input
                  id="displayName"
                  placeholder="Adınız veya takma adınız"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="En az 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Şifre Tekrar</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Şifrenizi tekrar girin"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Kayıt oluşturuluyor...
                  </>
                ) : (
                  'Kayıt Ol'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Login Link */}
        <p className="text-center text-sm text-muted-foreground">
          Zaten hesabınız var mı?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Giriş Yapın
          </Link>
        </p>
      </div>
    </div>
  );
}
