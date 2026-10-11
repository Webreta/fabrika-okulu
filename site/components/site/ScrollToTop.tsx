"use client";

import { useEffect } from "react";

/**
 * Sayfa açılınca en üste kaydırır. Sunucu işlemi yönlendirmesiyle (örn. "Sepete ekle" → /sepet) gelen sayfalarda
 * Next kaydırma konumunu sıfırlamıyor; kısa sepet sayfası uzun program sayfasının kaydırma konumunda açılıp
 * footer'da kalıyordu (2026-10-11). Adres çubuğunda #parça varsa dokunulmaz.
 */
export function ScrollToTop() {
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);
  return null;
}
