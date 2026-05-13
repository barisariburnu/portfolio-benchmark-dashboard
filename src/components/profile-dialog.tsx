'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, User, KeyRound, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: {
    userId: string;
    username: string;
    displayName?: string | null;
    createdAt?: string;
  } | null;
  onProfileUpdated: (updatedUser: { username: string; displayName?: string | null }) => void;
  onDataRefresh: () => Promise<void>;
}

export function ProfileDialog({
  open,
  onOpenChange,
  currentUser,
  onProfileUpdated,
  onDataRefresh,
}: ProfileDialogProps) {
  // Profile form state
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setDisplayName(currentUser?.displayName || '');
      setUsername(currentUser?.username || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    onOpenChange(newOpen);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);

    const usernameChanged = username.trim().toLowerCase() !== currentUser?.username?.toLowerCase();

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName,
          ...(usernameChanged ? { username: username.trim().toLowerCase() } : {}),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onProfileUpdated({
          username: data.username,
          displayName: data.displayName,
        });

        if (usernameChanged) {
          // Username changed — JWT token was re-signed and new cookie was set.
          // Do a full page refresh to ensure the new cookie is properly applied
          // and all data (transactions, portfolio, etc.) is re-fetched consistently.
          toast({
            title: 'Profil güncellendi',
            description: 'Kullanıcı adınız değiştirildi. Sayfa yenileniyor...',
          });
          // Small delay to ensure the toast is visible and cookie is processed
          setTimeout(() => {
            window.location.href = '/';
          }, 1000);
        } else {
          // Only displayName changed — no cookie change needed, just refresh data
          toast({
            title: 'Profil güncellendi',
            description: 'Profil bilgileriniz başarıyla kaydedildi.',
          });
          await onDataRefresh();
        }
      } else {
        toast({
          title: 'Hata',
          description: data.error || 'Profil güncellenemedi.',
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
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Hata',
        description: 'Yeni şifre ve onay şifresi eşleşmiyor.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Hata',
        description: 'Yeni şifre en az 6 karakter olmalıdır.',
        variant: 'destructive',
      });
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: 'Şifre değiştirildi',
          description: 'Şifreniz başarıyla güncellendi.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast({
          title: 'Hata',
          description: data.error || 'Şifre değiştirilemedi.',
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
      setPasswordLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profil Ayarları</DialogTitle>
          <DialogDescription>
            Hesap bilgilerinizi görüntüleyin ve güncelleyin.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-3.5 w-3.5" />
              Profil
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Şifre
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-4">
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-username">Kullanıcı Adı</Label>
                <Input
                  id="profile-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Kullanıcı adınız"
                  required
                  minLength={3}
                  maxLength={30}
                />
                <p className="text-xs text-muted-foreground">
                  Sadece harf, rakam ve alt çizgi içerebilir. Değiştirirseniz sayfa yenilenecektir.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-displayname">Görünen Ad</Label>
                <Input
                  id="profile-displayname"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Görünen adınız (isteğe bağlı)"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  Başkalarının sizi göreceği isim. Boş bırakabilirsiniz.
                </p>
              </div>

              {currentUser?.createdAt && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <span className="text-muted-foreground">Kayıt tarihi: </span>
                  <span className="font-medium">
                    {new Date(currentUser.createdAt).toLocaleDateString('tr-TR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={profileLoading}>
                {profileLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Profili Güncelle
                  </>
                )}
              </Button>
            </form>
          </TabsContent>

          {/* Password Tab */}
          <TabsContent value="password" className="mt-4">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Mevcut Şifre</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Mevcut şifrenizi girin"
                  required
                  autoComplete="current-password"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="new-password">Yeni Şifre</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni şifrenizi girin"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Yeni Şifre (Tekrar)</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Yeni şifrenizi tekrar girin"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                {confirmPassword && newPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-500">Şifreler eşleşmiyor</p>
                )}
                {confirmPassword && newPassword && confirmPassword === newPassword && (
                  <p className="text-xs text-emerald-500">Şifreler eşleşiyor</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={passwordLoading}>
                {passwordLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Değiştiriliyor...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Şifreyi Değiştir
                  </>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
