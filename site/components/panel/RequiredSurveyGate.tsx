"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { requiredSurveyCheck } from "@/app/actions/panel";
import { Icon } from "@/components/site/Icon";

type Gate = { id: number; title: string };

/**
 * Zorunlu hedef testi kapısı: öğrenci testi tamamlayana kadar panelde yalnızca test sayfası açılır.
 * Sunucu tarafı (panel layout) ilk yüklemede yönlendirir; bu bileşen panel içi geçişleri (soft navigation) yakalar.
 * Panel içi geçişte layout yeniden çalışmadığı için her sayfa değişiminde sunucuya bir kez sorulur: yönetici testi
 * öğrencinin paneli açıkken zorunlu yaptıysa kilit bir sonraki tıklamada devreye girer (tüm öğrencilerde takılıdır).
 */
export function RequiredSurveyGate({ gate: initial, children }: { gate: Gate | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [gate, setGate] = useState<Gate | null>(initial);
  const current = useRef<Gate | null>(initial);
  // İlk yüklemede sunucu (layout) zaten kontrol etti; yalnızca sonraki sayfa değişimlerinde sorulur
  const checkedPath = useRef(pathname);
  const target = gate ? `/panel/anket/${gate.id}` : null;
  const blocked = !!target && pathname !== target;

  // Layout yenilendiğinde (test tamamlandı, router.refresh) sunucudaki durum esas alınır
  useEffect(() => {
    current.current = initial;
    setGate(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id, initial?.title]);

  useEffect(() => {
    if (checkedPath.current === pathname) return;
    checkedPath.current = pathname;
    let alive = true;
    requiredSurveyCheck()
      .then((g) => {
        if (!alive || (g?.id ?? null) === (current.current?.id ?? null)) return;
        current.current = g;
        setGate(g);
        // Menüler ve bayraklar layout'ta çizilir. Kilit açıldıysa layout hemen yenilenir; kilit kapandıysa
        // yenileme test sayfasına varınca yapılır (engellenen sayfadayken yenilenirse layout yönlendirme döndürür
        // ve menüler ekranda kalır)
        if (!g) router.refresh();
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname, router]);

  useEffect(() => {
    if (blocked && target) router.replace(target);
  }, [blocked, target, router]);

  // Kilit panel açıkken devreye girdiyse: test sayfasına varınca layout yenilenir, menüler ve bayraklar gizlenir
  useEffect(() => {
    if (gate && pathname === target && (initial?.id ?? null) !== gate.id) router.refresh();
  }, [gate, pathname, target, initial?.id, router]);

  if (!gate) return <>{children}</>;
  if (blocked) {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Icon name="lock" className="size-6" /></span>
        <p className="mt-3 font-semibold text-navy-800">Devam etmeden önce &quot;{gate.title}&quot; testini tamamlaman gerekiyor.</p>
        <p className="mt-1 text-sm text-muted">Teste yönlendiriliyorsun…</p>
      </div>
    );
  }
  return (
    <>
      <p className="mx-auto mb-4 flex max-w-2xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Icon name="lock" className="mt-0.5 size-4 shrink-0" />
        <span><b>Bu test zorunlu.</b> Tamamladığında Çalışma Odan ve tüm menüler açılacak.</span>
      </p>
      {children}
    </>
  );
}
