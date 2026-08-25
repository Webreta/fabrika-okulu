"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/actions/panel";
import { Icon } from "@/components/site/Icon";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Sağ altta "Bildirimleri aç" çubuğu — izin verilmemişse ve daha önce kapatılmadıysa */
export function PushBanner({ vapidKey }: { vapidKey: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    try { if (localStorage.getItem("fabo_push_dismiss")) return; } catch {}
    if (Notification.permission !== "default") {
      if (Notification.permission === "granted") navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(() => setShow(true)).catch(() => {});
  }, [vapidKey]);
  if (!show) return null;
  const enable = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
      const j = sub.toJSON();
      await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth } });
    } catch {}
    setShow(false);
  };
  const dismiss = () => { try { localStorage.setItem("fabo_push_dismiss", "1"); } catch {} setShow(false); };
  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-sm items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-xl">
      <Icon name="bell" className="size-6 shrink-0 text-sky-500" />
      <div className="text-sm"><p className="font-semibold text-navy-800">Bildirimleri aç</p><p className="text-xs text-muted">Görev hatırlatmaları ve cevaplar için.</p></div>
      <button onClick={enable} className="btn-primary btn-sm">Aç</button>
      <button onClick={dismiss} className="text-muted" aria-label="Kapat"><Icon name="x" className="size-4" /></button>
    </div>
  );
}
