import Link from "next/link";
import { Icon, type IconName } from "@/components/site/Icon";

export type SideNavItem = { href: string; label: string; icon: IconName; count?: number; active: boolean };

/**
 * Bölüm içi sol menü (Tercihler, Kitaplığım); mobilde yatay kaydırılabilir sekmeye dönüşür. Kaydırılabildiği belli olsun
 * diye (2026-10-11) sağ kenarda silik geçiş + ok rozeti, kaydırma çubuğu gizli, sekmeler snap ile hizalanır.
 */
export function SideNav({ items, label }: { items: SideNavItem[]; label: string }) {
  return (
    <div className="relative lg:w-64 lg:shrink-0">
    <span className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-14 items-center justify-end bg-gradient-to-l from-surface via-surface/80 to-transparent lg:hidden" aria-hidden>
      <span className="mr-0.5 flex size-7 items-center justify-center rounded-full bg-white text-navy-800 shadow ring-1 ring-line"><Icon name="chevronRight" className="size-4" /></span>
    </span>
    <nav className="no-scrollbar flex snap-x gap-2 overflow-x-auto pr-12 lg:flex-col lg:overflow-visible lg:pr-0" aria-label={label}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={`flex shrink-0 snap-start items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 transition ${it.active ? "border-navy-800 bg-white text-navy-800" : "border-line bg-white text-muted hover:border-navy-300 hover:text-navy-800"}`}
        >
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${it.active ? "bg-navy-800 text-white" : "bg-surface"}`}><Icon name={it.icon} className="size-4" /></span>
          <span className="text-sm font-semibold">{it.label}</span>
          {it.count !== undefined && <span className={`ml-auto rounded-full px-2 text-xs ${it.active ? "bg-navy-800 text-white" : "bg-surface text-muted"}`}>{it.count}</span>}
        </Link>
      ))}
    </nav>
    </div>
  );
}
