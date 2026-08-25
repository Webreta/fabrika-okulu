"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/site/Icon";
import { logout } from "@/app/actions/auth";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean };

/**
 * Öğrenci + eğitmen paneli ortak kabuk: üst çubuk (logo, pill nav, zil, kullanıcı menüsü),
 * mobilde sol çekmece.
 */
export function Shell({
  primary, secondary, user, unread, homeHref, children, accent = "student", theme = "yok",
}: {
  primary: NavItem[];
  secondary: NavItem[];
  user: { name: string; email: string; initial: string; roleLabel: string };
  unread: number;
  homeHref: string;
  accent?: "student" | "teacher";
  theme?: string;
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"));
  const bellHref = homeHref + "/bildirim";

  return (
    <div className="fo-theme min-h-screen bg-surface" data-theme={theme}>
      <div className="sticky top-0 z-40">
        <header className="relative z-20 border-b border-line bg-white">
          <div className="mx-auto grid max-w-[1310px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-2">
              <button className="rounded-lg p-2 hover:bg-surface lg:hidden" onClick={() => setDrawer(true)} aria-label="Menü"><Icon name="menu" className="size-6 text-navy-800" /></button>
              <nav className="hidden items-center gap-1 lg:flex">
                {primary.map((n) => (
                  <Link key={n.href} href={n.href} className={`flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-[13px] font-semibold transition ${isActive(n) ? "border-navy-800 text-navy-800" : "border-transparent text-muted hover:bg-surface"}`}>
                    <Icon name={n.icon} className="size-4" />{n.label}
                    {n.badge ? <span className="rounded-full bg-sky-400 px-1.5 text-[10px] text-white">{n.badge}</span> : null}
                  </Link>
                ))}
              </nav>
            </div>
            <Link href="/" className="justify-self-center"><Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={120} height={137} className="fo-logo h-12 w-auto lg:h-14" /></Link>
            <div className="flex items-center justify-end gap-1">
              <Link href={bellHref} className="relative rounded-lg p-2 hover:bg-surface" aria-label="Bildirimler">
                <Icon name="bell" className="size-6 text-navy-800" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
              </Link>
              <div className="relative">
                <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 hover:bg-surface">
                  <span className="flex size-8 items-center justify-center rounded-full bg-navy-800 text-sm font-bold text-white">{user.initial}</span>
                  <span className="hidden text-sm font-semibold text-navy-800 sm:inline">{user.name.split(" ")[0]}</span>
                  <Icon name="chevronDown" className="size-4 text-muted" />
                </button>
                {menu && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-lg" onMouseLeave={() => setMenu(false)}>
                    <div className="border-b border-line px-3 py-2">
                      <p className="truncate text-sm font-semibold text-navy-800">{user.name}</p>
                      <p className="truncate text-xs text-muted">{user.email} · {user.roleLabel}</p>
                    </div>
                    <div className="py-1">
                      {secondary.map((n) => (
                        <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-800 hover:bg-surface">
                          <Icon name={n.icon} className="size-4 text-muted" />{n.label}
                          {n.badge ? <span className="ml-auto rounded-full bg-sky-400 px-1.5 text-[10px] text-white">{n.badge}</span> : null}
                        </Link>
                      ))}
                      <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-800 hover:bg-surface"><Icon name="external" className="size-4 text-muted" />Anasayfa</Link>
                    </div>
                    <form action={logout} className="border-t border-line pt-1">
                      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Icon name="logout" className="size-4" />Çıkış</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {/* İkincil menü: yatay butonlar (yalnızca masaüstü) */}
        <div className="relative z-10 hidden border-b border-line bg-white/95 backdrop-blur lg:block">
          <div className="mx-auto flex max-w-[1310px] items-center gap-1.5 overflow-x-auto px-4 py-1.5 lg:px-6">
            <button onClick={() => router.back()} className="flex shrink-0 items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-200"><Icon name="arrowLeft" className="size-3.5" /> Geri</button>
            <span className="mx-1 h-4 w-px bg-line" />
            {secondary.map((n) => (
              <Link key={n.href} href={n.href} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${isActive(n) ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800 hover:bg-surface"}`}>
                <Icon name={n.icon} className="size-3.5" />{n.label}
                {n.badge ? <span className={`rounded-full px-1.5 text-[10px] ${isActive(n) ? "bg-white text-navy-800" : "bg-sky-400 text-white"}`}>{n.badge}</span> : null}
              </Link>
            ))}
            <form action={logout} className="ml-auto shrink-0">
              <button className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"><Icon name="logout" className="size-3.5" /> Çıkış</button>
            </form>
          </div>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-900/50" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-[270px] overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-bold text-navy-800">Menü</span>
              <button onClick={() => setDrawer(false)} aria-label="Kapat"><Icon name="x" className="size-5" /></button>
            </div>
            <nav className="space-y-1">
              {[...primary, ...secondary].map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setDrawer(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive(n) ? "bg-navy-800 text-white" : "text-navy-800 hover:bg-surface"}`}>
                  <Icon name={n.icon} className="size-5" />{n.label}
                  {n.badge ? <span className="ml-auto rounded-full bg-sky-400 px-1.5 text-[10px] text-white">{n.badge}</span> : null}
                </Link>
              ))}
              <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-800 hover:bg-surface"><Icon name="external" className="size-5" />Anasayfa</Link>
              <form action={logout}><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"><Icon name="logout" className="size-5" />Çıkış</button></form>
            </nav>
          </aside>
        </div>
      )}

      <div className="mx-auto max-w-[1310px] px-4 py-6 lg:px-6 lg:py-7">{children}</div>
    </div>
  );
}
