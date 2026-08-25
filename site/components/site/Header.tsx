"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/site/Icon";

const NAV = [
  { href: "/kesfet", label: "Keşfet" },
  { href: "/esnek-programlar", label: "Esnek Programlar" },
  { href: "/takvimli-programlar", label: "Takvimli Programlar" },
  { href: "/ucretsiz-kaynaklar", label: "Ücretsiz Kaynaklar" },
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: "/iletisim", label: "İletişim" },
];

export function Header({ user, cartCount }: { user: { name: string; role: string } | null; cartCount: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelHref = user?.role === "teacher" || user?.role === "admin" ? "/egitmen" : "/panel";

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
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2 transition ${active ? "text-sky-600" : "text-navy-800 hover:text-sky-600"}`}
              >
                {n.label}
              </Link>
            );
          })}
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
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-navy-800 hover:bg-navy-50">
                {n.label}
              </Link>
            ))}
            <Link href={panelHref} onClick={() => setOpen(false)} className="btn-primary mt-2">
              {user ? "Çalışma Odam" : "Giriş Yap / Üye Ol"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
