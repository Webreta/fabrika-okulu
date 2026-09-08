"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/site/Icon";

export type MountainStep = {
  id: number;
  title: string;
  note: string;
  href: string;
  imageUrl: string;
  meta: string;
  /** done: tamamlandı · current: devam ediyor · next: sıradaki · open: henüz başlanmadı */
  state: "done" | "current" | "next" | "open";
  percent?: number;
};

const W = 1000;
const H = 620;
// Yol ara noktaları: sol etekten zigzag (switchback) çıkarak zirveye. Hepsi dağ siluetinin içinde kalır.
const WAYPOINTS: [number, number][] = [[110, 590], [330, 548], [250, 492], [480, 440], [400, 392], [620, 322], [580, 272], [720, 202], [760, 122]];
const SUMMIT: [number, number] = [760, 122];

/** Catmull-Rom → kübik Bezier; hem SVG path'i hem de örneklenmiş noktaları (uzunluğa göre yerleşim için) üretir */
function buildPath(pts: [number, number][]) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  const samples: [number, number][] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? pts[i + 1];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
    for (let k = 1; k <= 24; k++) {
      const t = k / 24, mt = 1 - t;
      samples.push([
        mt ** 3 * p1[0] + 3 * mt ** 2 * t * c1[0] + 3 * mt * t ** 2 * c2[0] + t ** 3 * p2[0],
        mt ** 3 * p1[1] + 3 * mt ** 2 * t * c1[1] + 3 * mt * t ** 2 * c2[1] + t ** 3 * p2[1],
      ]);
    }
  }
  const cum = [0];
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (frac: number): [number, number] => {
    const target = Math.max(0, Math.min(1, frac)) * total;
    let i = cum.findIndex((c) => c >= target);
    if (i <= 0) return samples[0];
    const seg = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return [samples[i - 1][0] + (samples[i][0] - samples[i - 1][0]) * seg, samples[i - 1][1] + (samples[i][1] - samples[i - 1][1]) * seg];
  };
  return { d, at };
}

/**
 * "Rotam" dağı: sıralı eğitim adımları, sol etekten zirveye tırmanan yol üzerine dizilir.
 * Adımın üzerine gelince/tıklayınca baloncukta eğitim + admin notu. Öğrencide tamamlanan adımlar yeşil,
 * devam eden mavi (nabız), sıradaki halkalı; yolun tamamlanan kısmı yeşil dolar.
 */
export function RouteMountain({ name, goal, description, steps, compact = false }: { name: string; goal?: string; description?: string; steps: MountainStep[]; compact?: boolean }) {
  const path = useMemo(() => buildPath(WAYPOINTS), []);
  const [active, setActive] = useState<number | null>(null);
  const [mobile, setMobile] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const n = steps.length;

  // Mobil (dar ekran / dokunmatik): baloncuk dağın içinde kesilmesin diye ekranın ortasında kart olarak açılır
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px), (hover: none)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  // Dışarı tıklama ve Esc kapatır
  useEffect(() => {
    if (active === null) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-route-node]") || t?.closest("[data-route-bubble]")) return;
      setActive(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActive(null); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [active]);
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  // Fare düğüm/baloncuktan ayrılınca kısa gecikmeyle kapat (düğümden baloncuğa geçerken aradaki boşlukta kapanmasın)
  const scheduleClose = () => { if (mobile) return; cancelClose(); closeTimer.current = setTimeout(() => setActive(null), 160); };
  // Adımlar yolun %6-%88 aralığına eşit dağılır; zirve bayrağa ayrılır
  const fracOf = (i: number) => (n === 1 ? 0.5 : 0.06 + (0.82 * i) / (n - 1));
  const nodes = steps.map((s, i) => ({ ...s, pos: path.at(fracOf(i)) }));
  const doneCount = steps.filter((s) => s.state === "done").length;
  const allDone = n > 0 && doneCount === n;
  // Yeşil parçalar: her tamamlanan adıma giden yol (önceki düğüm → bu düğüm). Ardışık olmayan tamamlamalar arada boşluk bırakır;
  // hepsi tamamsa zirveye kadar yeşil. Yol uzunluğu 1 kabul edilir (pathLength), parça = [başlangıç, uzunluk].
  const greenSegments: [number, number][] = steps.flatMap((s, i) => (s.state === "done" ? [[i === 0 ? 0 : fracOf(i - 1), fracOf(i) - (i === 0 ? 0 : fracOf(i - 1))] as [number, number]] : []));
  if (allDone) greenSegments.push([fracOf(n - 1), 1 - fracOf(n - 1)]);
  const summitLabel = goal?.trim() || "Zirve";

  return (
    <div ref={rootRef} className="relative w-full overflow-hidden" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="rm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe9f5" /><stop offset="1" stopColor="#f6fbfe" /></linearGradient>
          <linearGradient id="rm-main" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3663" /><stop offset="1" stopColor="#0f2043" /></linearGradient>
          <linearGradient id="rm-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6a82ab" /><stop offset="1" stopColor="#3f5b8d" /></linearGradient>
          <linearGradient id="rm-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c5cfe0" /><stop offset="1" stopColor="#9aabc7" /></linearGradient>
          <radialGradient id="rm-sun"><stop offset="0" stopColor="#fff7d6" /><stop offset="0.6" stopColor="#ffe08a" /><stop offset="1" stopColor="#ffe08a" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#rm-sky)" />
        <circle cx="560" cy="120" r="70" fill="url(#rm-sun)" />
        <circle cx="560" cy="120" r="34" fill="#ffe9a8" />
        {/* Bulutlar */}
        <g className="route-cloud" fill="#ffffff" opacity="0.9">
          <ellipse cx="300" cy="180" rx="70" ry="22" /><ellipse cx="340" cy="168" rx="50" ry="26" /><ellipse cx="260" cy="172" rx="40" ry="20" />
          <ellipse cx="880" cy="140" rx="60" ry="18" /><ellipse cx="910" cy="130" rx="40" ry="22" />
        </g>
        {/* Uzak ve orta sıradağlar */}
        <polygon fill="url(#rm-far)" points="0,470 90,380 170,420 260,330 340,400 420,300 520,380 600,270 700,360 800,250 880,330 1000,240 1000,620 0,620" />
        <polygon fill="url(#rm-mid)" points="0,540 80,470 160,500 240,420 330,470 430,390 520,450 640,330 760,420 860,320 1000,420 1000,620 0,620" />
        {/* Ana dağ */}
        <polygon fill="url(#rm-main)" points="0,620 120,520 240,470 330,400 430,350 520,300 600,230 700,150 760,90 820,150 880,240 1000,380 1000,620" />
        {/* Kar başlığı */}
        <polygon fill="#ffffff" opacity="0.95" points="700,150 760,90 820,150 800,165 780,150 760,170 740,152 720,168" />
        {/* Ağaçlar (etek) */}
        <g fill="#0a1530" opacity="0.85">
          {[40, 70, 95, 130, 160, 900, 930, 960].map((x, i) => <polygon key={i} points={`${x},620 ${x + 14},${590 - (i % 3) * 8} ${x + 28},620`} />)}
        </g>
        {/* Yol: beyaz kesikli, tamamlanan kısım yeşil */}
        <path d={path.d} fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="6" strokeLinecap="round" strokeDasharray="14 12" className="route-path" />
        {greenSegments.map(([start, len], i) => (
          <path key={i} d={path.d} fill="none" stroke="#34d399" strokeWidth="7" strokeLinecap="round" pathLength={1} strokeDasharray={`${len} 1`} strokeDashoffset={-start} />
        ))}
        {/* Zirve bayrağı */}
        <g className="route-flag" style={{ transformOrigin: `${SUMMIT[0]}px ${SUMMIT[1]}px` }}>
          <line x1={SUMMIT[0]} y1={SUMMIT[1]} x2={SUMMIT[0]} y2={SUMMIT[1] - 62} stroke="#0a1530" strokeWidth="4" strokeLinecap="round" />
          <path d={`M ${SUMMIT[0] + 2} ${SUMMIT[1] - 60} l 46 12 l -46 12 z`} fill={allDone ? "#34d399" : "#f43f5e"} />
          <circle cx={SUMMIT[0]} cy={SUMMIT[1]} r="7" fill="#ffffff" stroke="#0a1530" strokeWidth="3" />
        </g>
      </svg>

      {/* Başlık */}
      <div className={`pointer-events-none absolute left-4 top-4 max-w-[46%] ${compact ? "" : "sm:left-8 sm:top-8"}`}>
        <p className={`font-script text-navy-800 ${compact ? "text-xl" : "text-2xl sm:text-4xl"}`}>{name}</p>
        {description && !compact && <p className="mt-1 hidden text-sm leading-snug text-navy-700/80 sm:block">{description}</p>}
      </div>
      {/* Zirve etiketi */}
      <div className="pointer-events-none absolute -translate-x-1/2 text-center" style={{ left: `${(SUMMIT[0] / W) * 100}%`, top: `${((SUMMIT[1] - 100) / H) * 100}%` }}>
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 font-bold text-navy-800 shadow ${compact ? "text-[10px]" : "text-[11px] sm:text-sm"}`}>
          <Icon name="trophy" className="size-3.5 text-amber-500" /> {summitLabel}
        </span>
      </div>

      {/* Adım düğümleri */}
      {nodes.map((s, i) => {
        const left = (s.pos[0] / W) * 100, top = (s.pos[1] / H) * 100;
        const isActive = active === s.id;
        const cls =
          s.state === "done" ? "bg-emerald-500 text-white border-emerald-200" :
          s.state === "current" ? "bg-sky-400 text-white border-white route-current" :
          s.state === "next" ? "bg-white text-navy-800 border-amber-400 ring-4 ring-amber-300/40" :
          "bg-white text-navy-800 border-navy-200";
        const flipX = left > 62, flipY = top < 42;
        const bubble = (onClose?: () => void) => (
          <>
            {s.imageUrl && !compact && (
              <div className="mb-2 overflow-hidden rounded-lg bg-navy-50"><Image src={s.imageUrl} alt="" width={288} height={115} className="aspect-[5/2] w-full object-cover" /></div>
            )}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-navy-800 shadow hover:bg-surface"><Icon name="x" className="size-4" /></button>
            )}
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">{i + 1}. adım{s.state === "done" ? " · tamamlandı" : s.state === "current" ? ` · %${s.percent ?? 0}` : s.state === "next" ? " · sıradaki" : ""}</p>
            <p className="pr-6 font-bold leading-snug text-navy-800">{s.title}</p>
            {s.note && <p className="mt-1.5 text-sm leading-snug text-muted">{s.note}</p>}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{s.meta}</span>
              {s.href !== "#" && <Link href={s.href} className="btn-sky btn-sm">{s.state === "done" ? "Tekrar bak" : s.state === "current" ? "Devam et" : "Eğitime git"}</Link>}
            </div>
          </>
        );
        return (
          <div key={s.id} className="absolute" style={{ left: `${left}%`, top: `${top}%` }} data-route-node onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
            <button
              type="button"
              onMouseEnter={() => { if (!mobile) setActive(s.id); }}
              onFocus={() => { if (!mobile) setActive(s.id); }}
              onClick={() => setActive(isActive ? null : s.id)}
              aria-label={`${i + 1}. adım: ${s.title}`}
              aria-expanded={isActive}
              className={`route-node flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] font-bold shadow-lg transition hover:scale-110 ${compact ? "size-7 text-[11px]" : "size-8 text-xs sm:size-11 sm:text-sm"} ${cls} ${isActive ? "scale-110" : ""}`}
              style={{ animationDelay: `${0.4 + i * 0.22}s` }}
            >
              {s.state === "done" ? <Icon name="check" className="size-4" /> : i + 1}
            </button>
            {/* Masaüstü baloncuğu: düğümün yanında; fare ayrılınca kapanır */}
            {isActive && !mobile && (
              <div role="tooltip" data-route-bubble className={`absolute z-20 ${flipX ? "right-0 translate-x-4 pr-0" : "left-0 -translate-x-4"} ${flipY ? "top-4 pt-3" : "bottom-4 pb-3"}`}>
                <div className="relative w-64 rounded-2xl border border-line bg-white p-3 text-left shadow-2xl sm:w-72">{bubble()}</div>
              </div>
            )}
            {/* Mobil: ekranın ortasında kart; çarpı, dışarı dokunma ve Esc kapatır */}
            {isActive && mobile && typeof document !== "undefined" && createPortal(
              <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setActive(null)}>
                <div role="dialog" aria-modal="true" aria-label={s.title} data-route-bubble className="relative w-full max-w-sm rounded-2xl bg-white p-4 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  {bubble(() => setActive(null))}
                </div>
              </div>,
              document.body
            )}
          </div>
        );
      })}

      {n === 0 && (
        <div className="absolute inset-x-0 bottom-6 text-center text-sm font-semibold text-white/90">Henüz adım eklenmedi.</div>
      )}
    </div>
  );
}
