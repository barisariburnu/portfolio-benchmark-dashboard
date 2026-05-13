# Portföy Benchmark Dashboard

ETF yatırımlarınızı benchmark enstrümanlarıyla karşılaştırmalı analiz edin. USD ve TRY cinsinden portföy takibi sağlayan modern ve açık kaynaklı bir finansal araçtır.

## 🚀 Özellikler

- **Gelişmiş Portföy Takibi**: Yatırımlarınızı gerçek zamanlı verilerle izleyin.
- **Benchmark Karşılaştırma**: Portföy performansınızı popüler benchmarklar (S&P 500, Altın, vb.) ile kıyaslayın.
- **Çift Para Birimi Desteği**: Hem TRY hem de USD cinsinden analizler yapın.
- **İşlem Geçmişi**: Tüm alım-satım işlemlerinizi kaydedin ve yönetin.
- **Görsel Analiz**: Recharts kullanarak hazırlanan etkileşimli grafiklerle verilerinizi görselleştirin.
- **Modern Arayüz**: Tailwind CSS ve shadcn/ui ile tasarlanmış, karanlık mod destekli premium kullanıcı deneyimi.

## 🛠 Teknoloji Yığını

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS
- **UI Bileşenleri**: shadcn/ui, Lucide Icons, Framer Motion
- **Veri Görselleştirme**: Recharts
- **Backend**: Next.js API Routes
- **Veritabanı**: Prisma ORM ile SQLite
- **Kimlik Doğrulama**: Next Auth
- **Paket Yöneticisi**: Bun

## ⚙️ Kurulum

### Gereksinimler

- [Bun](https://bun.sh/) yüklü olmalıdır.

### Adımlar

1. Depoyu klonlayın:
   ```bash
   git clone https://github.com/kullaniciadi/portfolio.git
   cd portfolio
   ```

2. Bağımlılıkları yükleyin:
   ```bash
   bun install
   ```

3. Çevresel değişkenleri ayarlayın:
   `.env` dosyasını oluşturun ve gerekli bilgileri girin (örneğin SQLite dosya yolu).

4. Veritabanını hazırlayın:
   ```bash
   bun run db:push
   ```

5. Uygulamayı başlatın:
   ```bash
   bun run dev
   ```

## 🐳 Docker ile Çalıştırma

Uygulamayı Docker kullanarak kolayca ayağa kaldırabilirsiniz:

```bash
docker-compose up --build -d
```

Uygulama varsayılan olarak `7505` portunda çalışacaktır.

## 📝 Lisans

Bu proje MIT Lisansı ile lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakabilirsiniz.
