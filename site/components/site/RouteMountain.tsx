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
  /** Yakında: henüz açılmamış eğitim; düğüm sarı kesikli, baloncukta rozet, bağlantı "Açılınca haber ver" */
  comingSoon?: boolean;
};

const W = 1000;
const H = 620;
/** Etekteki kır kuşağının üst kenarı (x → y); ağaç sınırı bu çizgiye oturur */
const MEADOW_EDGE: [number, number][] = [[0, 572], [40, 560], [90, 548], [140, 540], [190, 536], [240, 542], [290, 556], [340, 568], [390, 582], [440, 592], [500, 600], [560, 606], [640, 620]];
function meadowEdgeY(x: number) {
  for (let i = 1; i < MEADOW_EDGE.length; i++) {
    const [x0, y0] = MEADOW_EDGE[i - 1], [x1, y1] = MEADOW_EDGE[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 620;
}
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
/** Açıklamanın ilk cümlesi (dağ içindeki kısa alt başlık için). */
function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : text).trim();
}

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
  // Adımlar yolun %6-%95 aralığına eşit dağılır: son adım zirvede, bayrağın hemen altında biter
  const fracOf = (i: number) => (n === 1 ? 0.95 : 0.06 + (0.89 * i) / (n - 1));
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
          <linearGradient id="rm-main-lit" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stopColor="#2d4f88" /><stop offset="0.55" stopColor="#1b345f" /><stop offset="1" stopColor="#0f2043" /></linearGradient>
          <linearGradient id="rm-main-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#15294f" /><stop offset="1" stopColor="#09152e" /></linearGradient>
          <linearGradient id="rm-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d93b8" /><stop offset="1" stopColor="#4a6595" /></linearGradient>
          <linearGradient id="rm-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9d4e4" /><stop offset="1" stopColor="#a3b3cc" /></linearGradient>
          <linearGradient id="rm-far2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2e9f2" /><stop offset="1" stopColor="#c8d3e3" /></linearGradient>
          <linearGradient id="rm-meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5d9e5c" /><stop offset="1" stopColor="#35723f" /></linearGradient>
          <linearGradient id="rm-meadow-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f6339" /><stop offset="1" stopColor="#1f4a2c" /></linearGradient>
          <linearGradient id="rm-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#ffffff" stopOpacity="0.55" /></linearGradient>
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
        {/* Uzak sıradağlar: sisli, açık tonlu, çok tepeli (atmosferik perspektif) */}
        <polygon fill="url(#rm-far2)" points="0,430 40,412 80,398 130,418 175,372 205,388 255,340 290,362 325,335 360,368 405,318 440,342 480,322 520,352 560,300 590,318 625,332 660,282 690,300 735,320 775,262 805,282 845,300 890,246 925,266 960,236 1000,268 1000,620 0,620" />
        <polygon fill="url(#rm-far)" points="0,470 45,440 90,380 120,398 170,420 215,372 260,330 290,352 340,400 380,352 420,300 455,330 520,380 560,318 600,270 630,300 700,360 745,300 800,250 830,290 880,330 935,268 1000,240 1000,620 0,620" />
        <g fill="#ffffff" opacity="0.85">
          <polygon points="260,330 272,348 248,348" /><polygon points="420,300 434,320 406,320" /><polygon points="600,270 614,292 586,292" /><polygon points="800,250 816,272 784,272" /><polygon points="1000,240 1000,262 984,262" />
        </g>
        {/* Orta sıradağ: ışıklı (sol) ve gölgeli (sağ) yüzler */}
        <polygon fill="url(#rm-mid)" points="0,540 40,505 80,470 115,492 160,500 200,455 240,420 275,448 330,470 380,428 430,390 470,420 520,450 580,392 640,330 690,380 760,420 810,360 860,320 905,372 950,398 1000,420 1000,620 0,620" />
        <g fill="#0a1530" opacity="0.14">
          <polygon points="80,470 115,492 160,500 120,560 70,540" /><polygon points="240,420 275,448 330,470 300,540 220,520" /><polygon points="430,390 470,420 520,450 480,540 410,500" /><polygon points="640,330 690,380 760,420 700,540 640,470" /><polygon points="860,320 905,372 950,398 900,520 850,440" />
        </g>
        <g fill="#ffffff" opacity="0.08">
          <polygon points="200,455 240,420 250,470 200,500" /><polygon points="580,392 640,330 640,470 590,450" /><polygon points="810,360 860,320 850,440 800,420" />
        </g>
        {/* Vadi sisi */}
        <rect x="0" y="440" width={W} height="180" fill="url(#rm-mist)" />
        {/* Ana dağ: ışıklı sol yüz + gölgeli sağ yüz, sırtlar ve kayalık dokusu */}
        <polygon fill="url(#rm-main-lit)" points="0,620 60,560 120,520 170,505 240,470 280,430 330,400 370,385 430,350 470,335 520,300 560,280 600,230 640,215 700,150 730,125 760,90 745,180 700,290 690,400 640,620" />
        <polygon fill="url(#rm-main-shade)" points="760,90 790,120 820,150 850,205 880,240 930,300 1000,380 1000,620 640,620 690,400 700,290 745,180" />
        {/* Sol yüzde kuytu (koyu) ve sırt (açık) parçalar */}
        <g fill="#0a1530" opacity="0.18">
          <polygon points="640,215 700,290 690,400 640,620 560,620 600,430 560,300" />
          <polygon points="470,335 520,300 500,380 440,450 400,600 330,620 380,500" />
          <polygon points="240,470 280,430 260,520 200,600 150,620 190,540" />
        </g>
        <g fill="#ffffff" opacity="0.07">
          <polygon points="330,400 370,385 430,350 470,335 460,380 400,420 340,440" />
          <polygon points="600,230 640,215 620,300 580,340 560,280" />
          <polygon points="120,520 170,505 240,470 210,520 140,560" />
        </g>
        {/* Sağ yüzde kaya kırıkları */}
        <g fill="#0a1530" opacity="0.22">
          <polygon points="820,150 850,205 880,240 840,320 800,300 790,220" />
          <polygon points="930,300 1000,380 1000,500 940,460 900,380" />
        </g>
        {/* Kaya katmanları (ince çizgiler) */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 60 560 L 200 528 L 330 480 L 470 430 L 590 372" stroke="#ffffff" strokeOpacity="0.10" strokeWidth="2" />
          <path d="M 170 505 L 300 490 L 420 452 L 520 400 L 620 340" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="2" />
          <path d="M 330 400 L 380 440 L 360 500 L 390 560" stroke="#0a1530" strokeOpacity="0.25" strokeWidth="2" />
          <path d="M 560 280 L 590 350 L 570 420 L 600 500" stroke="#0a1530" strokeOpacity="0.25" strokeWidth="2" />
          <path d="M 745 180 L 700 290 L 690 400 L 640 620" stroke="#0a1530" strokeOpacity="0.35" strokeWidth="3" />
          <path d="M 790 120 L 830 230 L 900 330 L 960 470" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="2" />
          <path d="M 850 205 L 870 300 L 930 400 L 990 520" stroke="#0a1530" strokeOpacity="0.3" strokeWidth="2" />
        </g>
        {/* Kar başlığı: tek parça, opak; alt kenarı oluklara inen kar dilleriyle tırtıklı. Gölge yüz çok hafif soğuk beyaz; kar içinde yalnızca iki küçük, silik kaya dişi */}
        <polygon fill="#ffffff" points="760,90 790,120 820,150 850,205 840,225 828,208 816,238 804,214 792,246 780,222 768,256 756,228 744,262 732,236 718,252 706,226 692,244 678,214 662,222 650,205 640,215 700,150 730,125" />
        <polygon fill="#f4f7fc" points="760,90 790,120 820,150 850,205 840,225 828,208 816,238 804,214 792,246 780,222 768,256 756,228 744,262 745,180" />
        <g fill="#10224a" opacity="0.28">
          <polygon points="742,156 750,182 745,185 739,168" />
          <polygon points="798,164 808,190 801,189 793,174" />
        </g>
        {/* Etekler: kısa bir kır/orman kuşağı; üst kenarı ağaç sınırı, yukarısı kayalık kalır */}
        <polygon fill="url(#rm-meadow)" points="0,620 0,572 40,560 90,548 140,540 190,536 240,542 290,556 340,568 390,582 440,592 500,600 560,606 640,620" />
        <polygon fill="url(#rm-meadow-shade)" points="640,620 700,604 760,598 820,596 880,604 940,610 1000,616 1000,620" />
        <polygon fill="#ffffff" opacity="0.06" points="0,572 40,560 90,548 140,540 190,536 240,542 150,560 60,584 0,596" />
        {/* Ağaç sınırı: çamlar tam kuşağın üst kenarına oturur (kenar çizgisi boyunca enterpolasyon) */}
        <g fill="#245a37" opacity="0.9">
          {[8, 30, 380, 410, 442, 474, 508, 542, 576, 608].map((x, i) => {
            const y = meadowEdgeY(x) + 3;
            const h = 14 + ((i * 5) % 9);
            return <polygon key={i} points={`${x - 6},${y} ${x},${y - h} ${x + 6},${y}`} />;
          })}
        </g>
        {/* Çiçekler */}
        <g opacity="0.95">
          {[[30, 604, "#fde68a"], [58, 612, "#f9a8d4"], [84, 598, "#ffffff"], [118, 610, "#fde68a"], [96, 580, "#f9a8d4"], [140, 572, "#ffffff"], [70, 588, "#fde68a"], [190, 560, "#f9a8d4"], [250, 566, "#ffffff"], [130, 596, "#f9a8d4"], [150, 600, "#f9a8d4"], [176, 612, "#ffffff"], [206, 606, "#fde68a"], [236, 598, "#f9a8d4"], [268, 610, "#ffffff"], [300, 604, "#fde68a"], [336, 612, "#f9a8d4"], [372, 606, "#ffffff"], [410, 612, "#fde68a"], [452, 610, "#f9a8d4"], [490, 614, "#ffffff"], [530, 614, "#fde68a"]].map(([x, y, c], i) => (
            <circle key={i} cx={x as number} cy={y as number} r={i % 3 === 0 ? 2.6 : 2} fill={c as string} />
          ))}
        </g>
        {/* Etekte orman: arka sıra açık, ön sıra koyu; boyları değişken */}
        <g fill="#2f6b3f" opacity="0.85">
          {[8, 28, 880, 902, 924, 946, 968, 988].map((x, i) => <polygon key={i} points={`${x - 12},620 ${x},${576 - ((i * 7) % 16)} ${x + 12},620`} />)}
        </g>
        <g fill="#1b4a2b" opacity="0.95">
          {[0, 18, 36, 870, 894, 916, 940, 962, 984].map((x, i) => <polygon key={i} points={`${x - 9},620 ${x},${588 - ((i * 5) % 14)} ${x + 9},620`} />)}
        </g>
        {/* Yol: beyaz kesikli, tamamlanan kısım yeşil */}
        {/* Yolun koyu gölgesi: kar üzerinde de seçilsin diye beyaz kesikli çizginin altında ince lacivert taban */}
        <path d={path.d} fill="none" stroke="#0f2043" strokeOpacity="0.55" strokeWidth="10" strokeLinecap="round" />
        <path d={path.d} fill="none" stroke="#ffffff" strokeOpacity="0.95" strokeWidth="6" strokeLinecap="round" strokeDasharray="14 12" className="route-path" />
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
      <div className={`pointer-events-none absolute left-4 top-4 ${compact ? "max-w-[46%]" : "max-w-[72%] sm:left-8 sm:top-8"}`}>
        <p className={`font-bold leading-tight tracking-tight text-navy-800 ${compact ? "text-lg" : "truncate text-xl sm:text-3xl"}`}>{name}</p>
        {description && !compact && <p className="mt-1.5 hidden max-w-xl text-base font-medium leading-snug text-navy-700/85 sm:block md:text-lg">{firstSentence(description)}</p>}
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
          s.comingSoon ? "bg-amber-50 text-amber-700 border-amber-400 border-dashed" :
          "bg-white text-navy-800 border-navy-200";
        const flipX = left > 62, flipY = top < 42;
        const bubble = (onClose?: () => void) => compact && !onClose ? (
          <div className="flex items-center gap-3">
            {s.imageUrl && <div className="w-24 shrink-0 overflow-hidden rounded-lg bg-navy-50"><Image src={s.imageUrl} alt="" width={192} height={108} className="aspect-video w-full object-cover" /></div>}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">{i + 1}. adım{s.comingSoon && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-navy-900">Yakında</span>}</p>
              <p className="line-clamp-2 text-sm font-bold leading-snug text-navy-800">{s.title}</p>
              {s.href !== "#" && <Link href={s.href} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:underline">{s.comingSoon ? "Açılınca haber ver" : "Eğitime git"} <Icon name="arrowRight" className="size-3" /></Link>}
            </div>
          </div>
        ) : (
          <>
            {s.imageUrl && (
              <div className="mb-2 overflow-hidden rounded-lg bg-navy-50"><Image src={s.imageUrl} alt="" width={288} height={162} className="aspect-video w-full object-cover" /></div>
            )}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-navy-800 shadow hover:bg-surface"><Icon name="x" className="size-4" /></button>
            )}
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">{i + 1}. adım{s.state === "done" ? " · tamamlandı" : s.state === "current" ? ` · %${s.percent ?? 0}` : s.state === "next" ? " · sıradaki" : ""}{s.comingSoon && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-navy-900">Yakında</span>}</p>
            <p className="line-clamp-2 pr-6 font-bold leading-snug text-navy-800">{s.title}</p>
            {s.note && !compact && <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-muted">{s.note}</p>}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{s.meta}</span>
              {s.href !== "#" && <Link href={s.href} className={s.comingSoon ? "btn btn-sm bg-amber-400 text-navy-900 hover:bg-amber-500" : "btn-sky btn-sm"}>{s.comingSoon ? "Açılınca haber ver" : s.state === "done" ? "Tekrar bak" : s.state === "current" ? "Devam et" : "Eğitime git"}</Link>}
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
