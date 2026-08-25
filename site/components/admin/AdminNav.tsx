"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/site/Icon";

export type AdminNavItem = { href: string; label: string; icon: IconName; badge?: number; group?: string };

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  let lastGroup = "";
  return (
    <>
      {items.map((item) => {
        const active = isActive(item.href);
        const head = item.group && item.group !== lastGroup ? item.group : null;
        lastGroup = item.group ?? lastGroup;
        return (
          <div key={item.href}>
            {head && <p className="mb-1 mt-3 px-3 text-[10px] font-bold uppercase tracking-wider text-muted">{head}</p>}
            <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-sky-100 text-navy-800" : "text-navy-800 hover:bg-navy-50"}`}>
              <Icon name={item.icon} className={`size-4 ${active ? "text-sky-600" : "text-navy-400"}`} />
              {item.label}
              {item.badge ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{item.badge}</span> : null}
            </Link>
          </div>
        );
      })}
    </>
  );
}
