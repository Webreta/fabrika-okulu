"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { recentNotifications } from "@/app/actions/panel";

type Item = { id: number; title: string; body: string; url: string };

const POLL_MS = 30_000; // panel açıkken 30 sn'de bir yeni bildirim yoklaması

/**
 * Panel açıkken gelen bildirimleri anında gösterir:
 *  - tarayıcı izni varsa masaüstü bildirimi (Windows'ta sağ alt köşe),
 *  - her hâlükârda panel içinde sağ altta bir toast yığını.
 * Web-push'tan farklı olarak abonelik/VAPID gerektirmez; yalnızca sekme açıkken çalışır.
 */
export function NotificationWatcher() {
  const router = useRouter();
  const lastSeen = useRef<number | null>(null); // görülen en yüksek bildirim id'si
  const primed = useRef(false); // ilk yoklamada mevcut bildirimler için tetiklenme
  const [toasts, setToasts] = useState<Item[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const showDesktop = useCallback((n: Item) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      const notif = new Notification(n.title, {
        body: n.body || undefined,
        icon: "/img/panel-icon.png",
        badge: "/img/panel-icon.png",
        tag: `fo-note-${n.id}`,
      });
      notif.onclick = () => {
        window.focus();
        if (n.url) window.location.href = n.url;
        notif.close();
      };
    } catch {
      // masaüstü bildirimi başarısızsa köşe toast'u yine gösterilir
    }
  }, []);

  const poll = useCallback(async () => {
    let res: { items: Item[] } | null = null;
    try {
      res = await recentNotifications();
    } catch {
      return; // geçici hata; bir sonraki yoklamada tekrar denenir
    }
    const items = res?.items ?? [];
    if (items.length === 0) return;
    const maxId = items[0].id;

    if (!primed.current) {
      // ilk yoklama yalnızca taban çizgisini belirler, eski bildirimler için uyarı vermez
      lastSeen.current = maxId;
      primed.current = true;
      return;
    }

    const base = lastSeen.current ?? maxId;
    const fresh = items.filter((n) => n.id > base).sort((a, b) => a.id - b.id);
    if (fresh.length === 0) return;

    lastSeen.current = maxId;
    for (const n of fresh) showDesktop(n);
    setToasts((t) => [...t, ...fresh].slice(-4)); // aynı anda en çok 4 toast
    router.refresh(); // zil rozeti güncellensin
  }, [router, showDesktop]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // izin daha önce sorulmadıysa bir kez iste
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    let alive = true;
    const tick = () => { if (alive) poll(); };
    tick(); // ilk yoklama (taban çizgisi)
    const iv = setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // toast otomatik kapanması
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((n) => setTimeout(() => dismiss(n.id), 7000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((n) => (
        <div
          key={n.id}
          onClick={() => { if (n.url) window.location.href = n.url; else dismiss(n.id); }}
          className="cursor-pointer rounded-xl border border-line bg-white p-4 shadow-lg ring-1 ring-black/5 transition hover:shadow-xl"
          role="status"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy-800">{n.title}</p>
              {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
              aria-label="Kapat"
              className="shrink-0 rounded-md p-1 text-muted hover:bg-surface"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
