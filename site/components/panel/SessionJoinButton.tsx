"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/site/Icon";
import { canJoin, JOIN_EARLY_MIN } from "@/lib/meeting";
import { fmtTime } from "@/lib/format";

/**
 * Canlı oturum katılım düğmesi (Gündemim, panel anasayfası, oynatıcı): bağlantı en erken başlangıçtan JOIN_EARLY_MIN dk önce
 * açılır, bitişten sonra "Bitti" olur. Saat ekranda kendiliğinden ilerler (30 sn'de bir yeniden hesaplanır).
 */
export function SessionJoinButton({ start, end, link, className = "" }: { start: string; end: string; link: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const s = new Date(start), e = new Date(end);
  const info = (text: string) => <span className={`inline-block rounded-lg bg-surface px-3 py-1.5 text-xs text-muted ${className}`}>{text}</span>;
  if (now > e.getTime()) return info("Bitti");
  if (!link) return info("Bağlantı henüz eklenmedi");
  if (!canJoin({ start: s, end: e }, new Date(now))) {
    const opensAt = new Date(s.getTime() - JOIN_EARLY_MIN * 60_000);
    const sameDay = opensAt.toDateString() === new Date(now).toDateString();
    return info(sameDay ? `Bağlantı ${fmtTime(opensAt)}'de açılır` : `Bağlantı oturumdan ${JOIN_EARLY_MIN} dk önce açılır`);
  }
  return (
    <a href={link} target="_blank" rel="noopener" className={`btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 ${className}`}>
      <Icon name="video" className="size-4" /> Katıl
    </a>
  );
}
