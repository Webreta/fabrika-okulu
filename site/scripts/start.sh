#!/bin/sh
# Her açılışta migration'ları uygula, ardından sunucuyu başlat.
# Ayrıca 15 dakikada bir /api/cron çağıran basit zamanlayıcı (hatırlatmalar, günlük rapor).
set -e
node scripts/migrate.mjs
# Örnek online görüşme ürünleri (slug varsa atlar); hata deploy'u durdurmaz
node node_modules/tsx/dist/cli.mjs scripts/seed-gorusme.mts || echo "seed-gorusme atlandı"
(
  sleep 90
  while true; do
    wget -qO- "http://127.0.0.1:${PORT:-3000}/api/cron?key=${CRON_SECRET}" >/dev/null 2>&1 || true
    sleep 900
  done
) &
exec node server.js
