# Easypanel Yayın Notları

Proje Easypanel'de GitHub üzerinden **Dockerfile** ile dağıtılır (imaj Next.js standalone).

## 1. Veritabanı servisi

Projeye bir **Postgres** servisi ekle (ör. `db`). "Credentials" bölümündeki **Internal** bağlantı adresini not al
(`postgres://KULLANICI:SIFRE@projeadi_db:5432/VERITABANI`).

## 2. Uygulama servisi

Projeye bir **App** servisi ekle (ör. `web`):

- Kaynak: GitHub, bu repo, `main` dalı.
- Build: **Dockerfile** (repodaki Dockerfile). Start komutu imajın içinde: `sh scripts/start.sh`
  (her açılışta migration koşar, sunucuyu başlatır ve 15 dk'da bir `/api/cron`'u tetikler).

## 3. Ortam değişkenleri (App → Environment)

```
DATABASE_URL=postgres://KULLANICI:SIFRE@projeadi_db:5432/VERITABANI
NEXT_PUBLIC_SITE_URL=https://fabrikaokulu.com.tr
SEED_ADMIN_EMAIL=admin@fabrikaokulu.com.tr
SEED_ADMIN_NAME=Admin
SEED_ADMIN_PASSWORD=guclu-bir-sifre
CRON_SECRET=uzun-rastgele-bir-anahtar

# iyzico (canlı: https://api.iyzipay.com)
IYZICO_API_KEY=...
IYZICO_SECRET_KEY=...
IYZICO_BASE_URL=https://api.iyzipay.com

# Web push (bir kez üret: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:info@uretmer.com.tr
```

`NEXT_PUBLIC_SITE_URL` build sırasında da gerekir → Easypanel'de "Build arguments" değil, Environment'a yaz (Dockerfile ENV'i çalışma anında okur; e-posta linkleri bu adresi kullanır).

## 4. Kalıcı depolama (App → Mounts)

| Volume adı | Mount yolu              | İçerik                                   |
| ---------- | ----------------------- | ---------------------------------------- |
| uploads    | /app/public/uploads     | kurs görselleri, görev dosyaları, sesler |
| korumali   | /app/private/korumali   | öğrencinin indiremediği ders dosyaları   |

## 5. İlk açılış (tek seferlik)

App servisinin **Console** sekmesinden:

```
node --import tsx db/seed.ts      # veya: npx tsx db/seed.ts
```

(Seed admin kullanıcısını, yasal sayfaları ve örnek içeriği oluşturur; tekrar çalıştırmak güvenlidir.)

Sonra `/admin/giris` ile girip **Ayarlar → E-posta** (SMTP + yönetici e-postaları), **Ayarlar → Ödeme**, **Site İçeriği → İletişim** alanlarını doldur. SMTP testini aynı sayfadan yap.

## 6. Alan adı

App → Domains'den `fabrikaokulu.com.tr` ekle; Let's Encrypt otomatik. DNS A kaydı sunucu IP'sine bakmalı.

## 7. Eski WordPress'ten geçiş

Eklenti verisi (`wp_oes_*`) doğrudan taşınmaz; kurslar admin/eğitmen editöründen yeniden girilir
(müfredat, dönemler, sınav soruları). Yasal metinler ve iletişim bilgileri seed ile geldi.

Sonraki yayınlar: `main`'e push → Easypanel **Deploy**.
