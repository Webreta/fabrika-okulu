#!/bin/sh
# Her açılışta migration'ları uygula, ardından sunucuyu başlat.
# Ayrıca 15 dakikada bir /api/cron çağıran basit zamanlayıcı (hatırlatmalar, günlük rapor).
set -e
# Saat dilimi ortamda tanımlı değilse Türkiye saati (tarih/saat kuralları yerel saate göre çalışır)
export TZ="${TZ:-Europe/Istanbul}"
# Yükleme klasörleri (Easypanel volume'ları) konteynere root sahipliğiyle bağlanır; sunucu "nextjs" kullanıcısıyla
# çalıştığı için görsel/dosya yüklemeleri "EACCES" ile düşerdi. Konteyner root açılır, sahiplik burada düzeltilir,
# sunucu aşağıda su-exec ile nextjs kullanıcısına düşürülür. (Dockerfile'daki chown derleme anında çalışır, volume'u etkilemez.)
APP_USER="nextjs:nodejs"
for d in /app/public/uploads /app/private/korumali; do
  mkdir -p "$d" 2>/dev/null || true
  chown -R "$APP_USER" "$d" 2>/dev/null || echo "Uyarı: $d sahipliği düzeltilemedi (root değil mi?)"
done
if command -v su-exec >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  if su-exec "$APP_USER" sh -c 'touch /app/public/uploads/.yazma-testi && rm -f /app/public/uploads/.yazma-testi'; then
    echo "Yükleme klasörü yazılabilir."
  else
    echo "UYARI: /app/public/uploads nextjs kullanıcısıyla yazılamıyor; görsel/dosya yüklemeleri çalışmaz."
  fi
fi
node scripts/migrate.mjs
# Canlıda örnek veri ve bilinen parolalı test hesabı ÜRETİLMEZ: örnek veri betikleri (seed-*.mts) yalnızca
# geliştirme ortamında elle çalıştırılır.
# Yönetici hesabı: ADMIN_EMAIL + ADMIN_PASSWORD tanımlıysa ve hesap yoksa oluşturulur (varsa şifresine dokunulmaz)
node scripts/ensure-admin.mjs || echo "ensure-admin atlandı"
# Eksik yasal sayfalar (KVKK, mesafeli satış, iade…) eklenir; var olan sayfanın içeriğine dokunulmaz
node scripts/ensure-pages.mjs || echo "ensure-pages atlandı"
# Başlangıç kategorileri (yalnızca kategori tablosu boşsa: eski üç grup kategori olur)
node node_modules/tsx/dist/cli.mjs scripts/seed-kategoriler.mts || echo "seed-kategoriler atlandı"
# Zamanlayıcı anahtarı tanımsız ya da örnek değerdeyse bu açılışa özel rastgele anahtar üretilir:
# /api/cron dışarıdan tetiklenemez, aşağıdaki iç zamanlayıcı çalışmaya devam eder.
# (Harici bir zamanlayıcı kullanılacaksa ortam değişkenlerine gerçek bir CRON_SECRET tanımlanmalı.)
if [ -z "${CRON_SECRET}" ] || [ "${CRON_SECRET}" = "degistir-beni" ] || [ "${#CRON_SECRET}" -lt 16 ]; then
  CRON_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")"
  export CRON_SECRET
  export CRON_SECRET_AUTO=1
  echo "CRON_SECRET tanımlı değil ya da örnek değerde; bu açılış için rastgele anahtar üretildi."
fi
(
  sleep 90
  while true; do
    wget -qO- "http://127.0.0.1:${PORT:-3000}/api/cron?key=${CRON_SECRET}" >/dev/null 2>&1 || true
    sleep 900
  done
) &
# Sunucu düşük yetkili kullanıcıyla çalışır (konteyner root açıldı; su-exec yoksa yerel/elle çalıştırmada olduğu gibi devam eder)
if command -v su-exec >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  exec su-exec "$APP_USER" node server.js
fi
exec node server.js
