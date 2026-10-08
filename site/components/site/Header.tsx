"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/site/Icon";

type Cat = { name: string; slug: string };

// "Kariyer Hedefim" öğrenci panelindeki hedef testi sayfasını açar (giriş yoksa panel girişe yönlendirir)
const NAV_BEFORE = [{ href: "/panel/anket", label: "Kariyer Hedefim" }];
const NAV_AFTER = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: "/sss", label: "S.S.S." },
  { href: "/iletisim", label: "İletişim" },
];

/** href: sekmenin kendisi bir bağlantıdır (tıklayınca sayfa açılır, ok ya da üzerine gelme açılır listeyi gösterir) */
type Menu = { key: string; label: string; href?: string; active: boolean; icon: "layers" | "mountain"; items: { href: string; label: string }[]; all: { href: string; label: string }; empty: string };

/**
 * Üst menü: Kariyer Hedefim (/panel/anket) · Keşfet (sekme /kesfet'e gider; açılır listede kategoriler + Tüm Eğitimler,
 * admin → Kategoriler) · Rotam (rotalar, admin → Rotalar) · Hakkımızda · S.S.S. · İletişim.
 * Açılır menüler üzerine gelince/oka tıklayınca açılır; mobilde akordeon.
 */
export function Header({ user, cartCount, categories = [], routes = [] }: { user: { name: string; role: string } | null; cartCount: number; categories?: Cat[]; routes?: Cat[] }) {
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState<string | null>(null);
  const pathname = usePathname();
  const panelHref = user?.role === "teacher" || user?.role === "admin" ? "/egitmen" : "/panel";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const linkCls = (active: boolean) => `rounded-lg px-3 py-2 transition ${active ? "text-sky-600" : "text-navy-800 hover:text-sky-600"}`;

  const MENUS: Menu[] = [
    {
      key: "egitimler", label: "Keşfet", href: "/kesfet", icon: "layers", active: pathname === "/kesfet" || pathname.startsWith("/kategori/"),
      items: categories.map((k) => ({ href: `/kategori/${k.slug}`, label: k.name })),
      all: { href: "/kesfet", label: "Tüm Eğitimler" }, empty: "Henüz kategori tanımlanmadı.",
    },
    {
      key: "rotam", label: "Rotam", icon: "mountain", active: pathname === "/rotam",
      items: routes.map((r) => ({ href: `/rotam?rota=${r.slug}`, label: r.name })),
      all: { href: "/rotam", label: "Tüm Rotalar" }, empty: "Henüz rota yok.",
    },
  ];
  // Rota öğeleri query ile ayrıştığı için (useSearchParams layout'ta Suspense ister) yalnızca kategori sayfası vurgulanır
  const itemActive = (href: string) => !href.includes("?") && pathname === href;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-line">
      <div className="bg-navy-800 text-white text-center text-xs sm:text-sm py-1.5 px-4 tracking-wide">
        Kariyer gelişiminde yol arkadaşın.
      </div>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:py-4">
        <Link href="/" className="shrink-0" aria-label="Fabrika Okulu">
          <Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={180} height={205} className="h-14 w-auto lg:h-16" priority />
        </Link>
        <nav className="hidden lg:flex items-center gap-1 text-[15px] font-medium">
          {NAV_BEFORE.map((n) => <Link key={n.href} href={n.href} className={linkCls(isActive(n.href))}>{n.label}</Link>)}

          {/* Açılır menüler: Eğitimler (kategoriler) ve Rotam (rotalar) */}
          {MENUS.map((m) => {
            const isOpen = openMenu === m.key;
            return (
              <div key={m.key} className="relative" onMouseEnter={() => setOpenMenu(m.key)} onMouseLeave={() => setOpenMenu(null)}>
                {m.href ? (
                  <span className="flex items-center">
                    <Link href={m.href} onClick={() => setOpenMenu(null)} onFocus={() => setOpenMenu(m.key)} className={`${linkCls(m.active)} pr-1`}>{m.label}</Link>
                    <button type="button" aria-label={`${m.label} alt menüsü`} aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setOpenMenu(isOpen ? null : m.key)} className={`rounded-lg py-2 pl-0.5 pr-2 ${m.active ? "text-sky-600" : "text-navy-800 hover:text-sky-600"}`}>
                      <Icon name="chevronDown" className={`size-4 transition ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    onClick={() => setOpenMenu(isOpen ? null : m.key)}
                    onFocus={() => setOpenMenu(m.key)}
                    className={`flex items-center gap-1 ${linkCls(m.active)}`}
                  >
                    {m.label} <Icon name="chevronDown" className={`size-4 transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
                {isOpen && (
                  <div className="absolute left-0 top-full pt-2" role="menu">
                    <div className="w-max min-w-56 max-w-[90vw] rounded-2xl border border-line bg-white p-2 shadow-xl">
                      {m.items.length === 0 && <p className="px-3 py-2 text-sm text-muted">{m.empty}</p>}
                      {m.items.map((it) => {
                        const active = itemActive(it.href);
                        return (
                          <Link key={it.href} href={it.href} role="menuitem" onClick={() => setOpenMenu(null)} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${active ? "bg-sky-50 text-sky-700" : "text-navy-800 hover:bg-surface hover:text-sky-600"}`}>
                            <Icon name={m.icon} className="size-4 shrink-0 text-sky-400" /> {it.label}
                          </Link>
                        );
                      })}
                      <div className="mt-1 border-t border-line pt-1">
                        <Link href={m.all.href} role="menuitem" onClick={() => setOpenMenu(null)} className="flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-navy-800 hover:bg-surface hover:text-sky-600">
                          <Icon name="arrowRight" className="size-4" /> {m.all.label}
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {NAV_AFTER.map((n) => <Link key={n.href} href={n.href} className={linkCls(isActive(n.href))}>{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/sepet" className="relative rounded-lg p-2 text-navy-800 hover:bg-navy-50" aria-label="Sepet">
            <Icon name="cart" className="size-6" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-white">{cartCount}</span>
            )}
          </Link>
          <Link href={panelHref} className="hidden sm:inline-flex btn-primary">
            <Icon name="user" className="size-4" />
            {user ? "Çalışma Odam" : "Giriş Yap / Üye Ol"}
          </Link>
          <button className="lg:hidden rounded-lg p-2 text-navy-800 hover:bg-navy-50" onClick={() => setOpen(!open)} aria-label="Menü">
            <Icon name={open ? "x" : "menu"} className="size-6" />
          </button>
        </div>
      </div>
      {open && (
        <div className="lg:hidden border-t border-line bg-white px-4 py-3">
          <nav className="flex flex-col gap-1 text-[15px] font-medium">
            {NAV_BEFORE.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-navy-800 hover:bg-navy-50">{n.label}</Link>
            ))}
            {MENUS.map((m) => (
              <div key={m.key} className="contents">
                {m.href ? (
                  <div className="flex items-stretch">
                    <Link href={m.href} onClick={() => setOpen(false)} className="flex-1 rounded-lg px-3 py-2.5 text-navy-800 hover:bg-navy-50">{m.label}</Link>
                    <button type="button" aria-label={`${m.label} alt menüsü`} onClick={() => setMobileMenu(mobileMenu === m.key ? null : m.key)} className="rounded-lg px-3 text-navy-800 hover:bg-navy-50" aria-expanded={mobileMenu === m.key}>
                      <Icon name="chevronDown" className={`size-4 transition ${mobileMenu === m.key ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setMobileMenu(mobileMenu === m.key ? null : m.key)} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-navy-800 hover:bg-navy-50" aria-expanded={mobileMenu === m.key}>
                    {m.label} <Icon name="chevronDown" className={`size-4 transition ${mobileMenu === m.key ? "rotate-180" : ""}`} />
                  </button>
                )}
                {mobileMenu === m.key && (
                  <div className="ml-3 flex flex-col gap-0.5 border-l-2 border-line pl-3">
                    {m.items.map((it) => (
                      <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-navy-800 hover:bg-navy-50">{it.label}</Link>
                    ))}
                    <Link href={m.all.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-800 hover:bg-navy-50">{m.all.label} →</Link>
                  </div>
                )}
              </div>
            ))}
            {NAV_AFTER.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-navy-800 hover:bg-navy-50">{n.label}</Link>
            ))}
            <Link href={panelHref} onClick={() => setOpen(false)} className="btn-primary mt-2 min-h-10">
              {user ? "Çalışma Odam" : "Giriş Yap / Üye Ol"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
