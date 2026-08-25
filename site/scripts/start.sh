#!/bin/sh
# Her açılışta migration'ları uygula, ardından sunucuyu başlat.
# Ayrıca 15 dakikada bir /api/cron çağıran basit zamanlayıcı (hatırlatmalar, günlük rapor).
set -e
node scripts/migrate.mjs
(
  sleep 90
  while true; do
    wget -qO- "http://127.0.0.1:${PORT:-3000}/api/cron?key=${CRON_SECRET}" >/dev/null 2>&1 || true
    sleep 900
  done
) &
exec node server.js
