/**
 * "Yakında!" kurdelesi: görselin sağ üst köşesini çapraz sarar.
 * Kapsayıcı `relative overflow-hidden` olmalı. size: sm (kart) · md (program sayfası görseli)
 */
export function SoonRibbon({ size = "sm" }: { size?: "sm" | "md" }) {
  const box = size === "md" ? "size-28" : "size-24";
  const band = size === "md" ? "right-[-44px] top-[24px] w-[190px] py-1.5 text-xs" : "right-[-40px] top-[20px] w-[170px] py-1 text-[11px]";
  return (
    <span className={`pointer-events-none absolute right-0 top-0 z-[5] overflow-hidden ${box}`} aria-hidden>
      <span className={`absolute rotate-45 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 text-center font-extrabold uppercase tracking-[0.16em] text-navy-900 shadow-[0_4px_12px_rgba(0,0,0,.25)] ring-1 ring-white/60 ${band}`}>Yakında!</span>
    </span>
  );
}
