/**
 * Sayfa başlıklarının ortak dağ illüstrasyonu: üç katmanlı sıra, ışıklı/gölgeli yüzler, kaya katman çizgileri,
 * alt kenarı zemine eriyen sis. `flags` ile birkaç zirveye kırmızı bayrak konur. Kapsayıcı konumu `className` ile verilir
 * (örn. `absolute inset-x-0 top-12 h-64 sm:h-80`); kutuya göre esner (preserveAspectRatio="none").
 */
export function MountainBackdrop({ className = "absolute inset-x-0 top-12 h-64 sm:h-80", flags = false }: { className?: string; flags?: boolean }) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden>
    <svg viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="pk-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fa7cf" stopOpacity=".28" /><stop offset="1" stopColor="#7fa7cf" stopOpacity=".04" /></linearGradient>
          <linearGradient id="pk-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b86bd" stopOpacity=".45" /><stop offset="1" stopColor="#5b86bd" stopOpacity=".08" /></linearGradient>
          <linearGradient id="pk-main" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a629c" /><stop offset="1" stopColor="#152c58" /></linearGradient>
          <linearGradient id="pk-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f2043" stopOpacity="0" /><stop offset="1" stopColor="#0f2043" stopOpacity=".85" /></linearGradient>
        </defs>
        {/* Uzak sıra */}
        <path d="M0 250 L60 222 L110 236 L170 190 L230 214 L290 170 L350 200 L410 150 L470 186 L540 130 L600 170 L660 120 L720 150 L790 100 L850 140 L910 110 L980 150 L1050 100 L1110 134 L1180 90 L1250 130 L1320 96 L1380 128 L1440 100 L1440 320 L0 320 Z" fill="url(#pk-far)" />
        {/* Orta sıra */}
        <path d="M0 290 L70 250 L130 268 L200 220 L260 246 L330 200 L400 232 L460 190 L530 226 L600 176 L660 212 L730 170 L800 208 L870 166 L940 204 L1000 168 L1070 206 L1140 160 L1210 198 L1280 156 L1350 196 L1440 170 L1440 320 L0 320 Z" fill="url(#pk-mid)" />
        <g fill="#0a1530" opacity=".22">
          <path d="M200 220 L260 246 L250 320 L180 320 Z" /><path d="M460 190 L530 226 L520 320 L450 320 Z" /><path d="M730 170 L800 208 L790 320 L720 320 Z" /><path d="M1000 168 L1070 206 L1060 320 L990 320 Z" /><path d="M1280 156 L1350 196 L1340 320 L1270 320 Z" />
        </g>
        {/* Ana sıra: silüet */}
        <path d="M0 320 L60 262 L120 210 L165 232 L210 250 L250 214 L290 176 L330 120 L360 150 L420 190 L470 150 L520 90 L560 128 L610 160 L650 122 L690 74 L720 30 L760 76 L800 118 L830 150 L870 128 L920 100 L960 138 L1010 180 L1050 148 L1090 110 L1120 70 L1160 116 L1210 170 L1250 146 L1300 120 L1360 174 L1400 208 L1440 240 L1440 320 Z" fill="url(#pk-main)" />
        {/* Gölgeli (sağ) yüzler */}
        <g fill="#0a1530" opacity=".42">
          <path d="M330 120 L360 150 L420 190 L430 320 L338 320 L342 200 Z" />
          <path d="M520 90 L560 128 L610 160 L620 320 L528 320 L534 190 Z" />
          <path d="M720 30 L760 76 L800 118 L830 150 L850 320 L732 320 L738 150 Z" />
          <path d="M920 100 L960 138 L1010 180 L1020 320 L928 320 L934 200 Z" />
          <path d="M1120 70 L1160 116 L1210 170 L1220 320 L1128 320 L1134 180 Z" />
          <path d="M1300 120 L1360 174 L1400 208 L1440 240 L1440 320 L1308 320 L1312 200 Z" />
          <path d="M120 210 L165 232 L210 250 L214 320 L126 320 L130 260 Z" />
        </g>
        {/* Işıklı (sol) yüz parlamaları */}
        <g fill="#ffffff" opacity=".07">
          <path d="M330 120 L290 176 L250 214 L262 320 L338 320 L342 200 Z" />
          <path d="M720 30 L690 74 L650 122 L610 160 L320 320 L732 320 L738 150 Z" />
          <path d="M1120 70 L1090 110 L1050 148 L1010 180 L1040 320 L1128 320 L1134 180 Z" />
          <path d="M520 90 L470 150 L420 190 L450 320 L528 320 L534 190 Z" />
        </g>
        {/* Kaya katmanları ve sırtlar (eskiz hissi) */}
        <g fill="none" stroke="#9cc7e0" strokeOpacity=".16" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M300 170 L360 205 L430 240 L500 262" /><path d="M250 230 L320 250 L400 290" />
          <path d="M660 110 L710 150 L760 200 L820 250 L880 290" /><path d="M620 170 L690 220 L760 270" />
          <path d="M1060 130 L1120 170 L1190 220 L1260 262" /><path d="M1010 200 L1090 240 L1160 290" />
          <path d="M880 150 L940 190 L1000 240" /><path d="M1280 160 L1340 210 L1400 250" /><path d="M120 240 L190 270 L260 300" />
        </g>
        <g fill="none" stroke="#0a1530" strokeOpacity=".35" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M342 200 L338 320" /><path d="M738 150 L732 320" /><path d="M1134 180 L1128 320" /><path d="M534 190 L528 320" /><path d="M934 200 L928 320" /><path d="M1312 200 L1308 320" />
        </g>
        {/* Alt sis: zemine yumuşak geçiş */}
        <rect x="0" y="180" width="1440" height="140" fill="url(#pk-haze)" />
      </svg>
      {flags && (
        <div className="absolute inset-0" aria-hidden>
          {[{ x: 720, y: 30 }, { x: 1120, y: 70 }, { x: 330, y: 120 }].map((f, i) => (
            <div key={i} className="absolute -translate-x-[3px] -translate-y-full" style={{ left: `${(f.x / 1440) * 100}%`, top: `${(f.y / 320) * 100}%` }}>
              <svg viewBox="0 0 24 30" className="route-flag h-6 w-5 sm:h-8 sm:w-6" style={{ animationDelay: `${i * 0.7}s` }}>
                <line x1="3" y1="1" x2="3" y2="30" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 2 L22 8 L4 14 Z" fill="#ef4444" />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
