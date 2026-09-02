import Link from "next/link";
import { Icon, type IconName } from "@/components/site/Icon";

export type SideNavItem = { href: string; label: string; icon: IconName; count?: number; active: boolean };

/** Bölüm içi sol menü (Tercihler, Kitaplığım); mobilde yatay kaydırılabilir sekmeye dönüşür */
export function SideNav({ items, label }: { items: SideNavItem[]; label: string }) {
  return (
    <nav className="flex gap-2 overflow-x-auto lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-visible" aria-label={label}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={`flex shrink-0 items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 transition ${it.active ? "border-navy-800 bg-white text-navy-800" : "border-line bg-white text-muted hover:border-navy-300 hover:text-navy-800"}`}
        >
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${it.active ? "bg-navy-800 text-white" : "bg-surface"}`}><Icon name={it.icon} className="size-4" /></span>
          <span className="text-sm font-semibold">{it.label}</span>
          {it.count !== undefined && <span className={`ml-auto rounded-full px-2 text-xs ${it.active ? "bg-navy-800 text-white" : "bg-surface text-muted"}`}>{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
