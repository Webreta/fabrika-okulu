"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/app/actions/panel";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("busy");

  useEffect(() => {
    if (!vapidKey || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setState("denied"); return; }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    }).catch(() => setState("unsupported"));
  }, [vapidKey]);

  const enable = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
      const j = sub.toJSON();
      await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth } });
      setState("on");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "off");
    }
  };
  const disable = async () => {
    setState("busy");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState("off");
  };

  if (state === "unsupported") return null; // uyarı gösterme; push yoksa alan sessizce boş kalır
  if (state === "denied") return <p className="text-sm text-red-600">Bildirim izni engellenmiş. Tarayıcı ayarlarından izin ver.</p>;
  return state === "on" ? (
    <button onClick={disable} className="btn-secondary">Bildirimleri kapat</button>
  ) : (
    <button onClick={enable} disabled={state === "busy"} className="btn-primary">Bildirimleri aç</button>
  );
}
