# Easypanel Yayın Notları

Proje Easypanel'de GitHub üzerinden **Dockerfile** ile dağıtılır (imaj Next.js standalone).

## 1. Veritabanı servisi

Projeye bir **Postgres** servisi ekle (ör. `db`). "Credentials" bölümündeki **Internal** bağlantı adresini not al
(`postgres://KULLANICI:SIFRE@projeadi_db:5432/VERITABANI`).

## 2. Uygulama servisi

Projeye bir **App** servisi ekle (ör. `web`):

- Kaynak: GitHub, bu repo, `main` dalı.
- Build: **Dockerfile** (repodaki Dockerfile). Start komutu imajın içinde: `sh scripts/start.sh`.

Her açılışta `scripts/start.sh` sırayla şunları yapar:

1. Veritabanı güncellemelerini (migration) uygular; mevcut veriyi silmez.
2. `ensure-admin.mjs`: `ADMIN_EMAIL` + `ADMIN_PASSWORD` tanımlıysa ve hesap yoksa yönetici hesabını oluşturur (varsa şifresine dokunmaz).
3. `ensure-pages.mjs`: eksik yasal sayfaları ekler (var olan sayfanın içeriğine dokunmaz).
4. `seed-kategoriler`: yalnızca kategori tablosu boşsa başlangıç kategorilerini açar.
5. Sunucuyu başlatır ve 15 dakikada bir `/api/cron`'u tetikler.

Canlıda **örnek veri ve test hesabı üretilmez**.

## 3. Ortam değişkenleri (App → Environment)

```
DATABASE_URL=postgres://KULLANICI:SIFRE@projeadi_db:5432/VERITABANI
NEXT_PUBLIC_SITE_URL=https://fabrikaokulu.com.tr

# Yönetici hesabı (ilk açılışta oluşturulur; şifreyi panelden değiştirdikten sonra ADMIN_PASSWORD kaldırılabilir)
ADMIN_EMAIL=yonetici@alanadi.com
ADMIN_PASSWORD=en-az-8-karakter
ADMIN_NAME=Yönetici

# Bakım modu (dışarıya gösterme): on = site yalnızca yöneticiye açık. Satırı silince paneldeki ayar geçerli olur.
MAINTENANCE_MODE=on

# Zamanlanmış işler: en az 16 karakter, rastgele. Tanımlanmazsa her açılışta rastgele üretilir.
CRON_SECRET=uzun-rastgele-bir-anahtar

# iyzico (deneme: https://sandbox-api.iyzipay.com · canlı: https://api.iyzipay.com)
IYZICO_API_KEY=...
IYZICO_SECRET_KEY=...
IYZICO_BASE_URL=https://api.iyzipay.com

# Web push (bir kez üret: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:info@uretmer.com.tr
```

- Saat dilimi imajda `Europe/Istanbul` olarak tanımlı. Ortamda `TZ` adlı bir değişken varsa değeri `Europe/Istanbul` olmalı (yoksa eklemeye gerek yok).
- Şifre ve anahtarlar yalnızca burada durur; depoya yazılmaz.
- Kilitlenme durumunda: `ADMIN_PASSWORD_RESET=1` eklenip yeniden başlatılırsa yönetici şifresi `ADMIN_PASSWORD` olur; sonra bu satır silinmeli.

## 4. Kalıcı depolama (App → Mounts)

| Volume adı | Mount yolu              | İçerik                                   |
| ---------- | ----------------------- | ---------------------------------------- |
| uploads    | /app/public/uploads     | kurs görselleri, görev dosyaları, sesler |
| korumali   | /app/private/korumali   | öğrencinin indiremediği ders dosyaları   |

Bu iki mount yoksa her deploy'da yüklenen dosyalar silinir.

Volume'lar konteynere root sahipliğiyle bağlanır; açılış betiği (`scripts/start.sh`) her açılışta sahipliği
uygulama kullanıcısına (`nextjs`) çevirir ve logda "Yükleme klasörü yazılabilir." yazar. Yüklemeler
"Dosya sunucuya kaydedilemedi" hatası veriyorsa Yönetim → Ayarlar → Sistem sağlığı sekmesindeki
"Yükleme klasörü" satırına ve uygulama loglarına bak.

## 5. Alan adı

App → Domains'den `fabrikaokulu.com.tr` (ve istenirse `www.fabrikaokulu.com.tr`) ekle; Let's Encrypt otomatik.
DNS A kaydı sunucu IP'sine bakmalı. `NEXT_PUBLIC_SITE_URL` bu adresle aynı olmalı (e-posta bağlantıları,
ödeme dönüş adresi, sitemap ve paylaşım etiketleri bu adresi kullanır).

## 6. İlk açılıştan sonra

1. `https://fabrikaokulu.com.tr/admin/giris` adresinden yönetici hesabıyla gir (bakım modu açıkken de çalışır).
2. **Hesabım**'dan şifreyi değiştir; ardından Easypanel'den `ADMIN_PASSWORD` satırını sil.
3. **Ayarlar → Sistem sağlığı** sekmesine bak: örnek hesap uyarısı varsa "Pasif yap", saat dilimi ve zamanlayıcı satırları yeşil olmalı.
4. **Ayarlar → E-posta** (SMTP + yönetici e-postaları), **Ayarlar → Ödeme**, **Site İçeriği → İletişim / Footer** alanlarını doldur.
5. Yasal sayfaların metinlerini (**Site İçeriği → Sayfalar**) gözden geçir: örnek metinlerde alan adı ve şirket bilgileri geçiyor.

## 7. Bakım modu (dışarıya gösterme)

Açıkken ziyaretçiler, öğrenciler ve eğitmenler her adreste bakım sayfasını görür; giriş yapmış yönetici siteyi ve
panelleri normal kullanır. Kart ödemesi dönüşü ve zamanlanmış işler çalışmaya devam eder (sanal POS canlıda test edilebilir).

- `MAINTENANCE_MODE=on` tanımlıyken panelden kapatılamaz (paneldeki kutu yalnızca bu satır silinince geçerlidir).
- Siteyi açmak için: Easypanel'den `MAINTENANCE_MODE` satırını sil → yeniden başlat → **Ayarlar → Bakım modu**'nda kutunun kapalı olduğunu kontrol et.
- Sonradan kısa süreli bakım için yalnızca paneldeki kutu yeterlidir (yeniden başlatma gerekmez).

## 8. Eski WordPress'ten geçiş

Eklenti verisi (`wp_oes_*`) doğrudan taşınmaz; kurslar admin/eğitmen editöründen yeniden girilir
(müfredat, dönemler, sınav soruları).

Sonraki yayınlar: `main`'e push → Easypanel **Deploy**.
