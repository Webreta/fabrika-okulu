"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/site/Icon";
import { logout } from "@/app/actions/auth";
import { NotificationWatcher } from "@/components/panel/NotificationWatcher";
import { goalColor } from "@/lib/survey-logic";

/** match: bu yollarda da sekme aktif sayılır (örn. Tercihler altındaki alt sayfalar) */
/** end: ikincil menüde sağa, Çıkış butonunun yanına yaslanır */
export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean; match?: string[]; end?: boolean; newTab?: boolean };
/** Hedef bayrağı: ana sorusu olan anket + öğrencinin cevabı (cevapsızsa gri) */
export type GoalFlagItem = { surveyId: number; title: string; question: string; answer: string | null; color: string | null };

/**
 * Öğrenci + eğitmen paneli ortak kabuk: üst çubuk (logo, pill nav, zil, kullanıcı menüsü),
 * mobilde sol çekmece.
 */
export function Shell({
  primary, secondary, user, unread, homeHref, children, accent = "student", theme = "yok", menuStyle = "normal", flags = [],
}: {
  primary: NavItem[];
  secondary: NavItem[];
  user: { name: string; email: string; initial: string; roleLabel: string };
  unread: number;
  homeHref: string;
  accent?: "student" | "teacher";
  theme?: string;
  /** Ikincil menu: normal = ikon+metin; icon = buyuk ikon, uzerine gelince saga acilip metni gosterir */
  menuStyle?: "normal" | "icon" | "tooltip";
  /** İkincil çubukta sağa yaslı hedef bayrakları (öğrenci) */
  flags?: GoalFlagItem[];
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const current = search.size ? `${pathname}?${search.toString()}` : pathname;
  const under = (h: string) => pathname === h || pathname.startsWith(h + "/");
  // Sorgulu bağlantı (örn. ?sekme=devam) tam eşleşir; aynı yola giden sorgusuz bağlantı o durumda pasif kalır
  const queryMatch = (n: NavItem) => n.href.includes("?") && current === n.href;
  const anyQueryActive = [...primary, ...secondary].some((n) => queryMatch(n) && n.href.split("?")[0] === pathname);
  const isActive = (n: NavItem) => {
    if (n.href.includes("?")) return queryMatch(n);
    if (n.exact) return pathname === n.href;
    if (under(n.href) && anyQueryActive) return false;
    return under(n.href) || (n.match ?? []).some(under);
  };
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
                  <Link key={n.href} href={n.href} target={n.newTab ? "_blank" : undefined} rel={n.newTab ? "noopener" : undefined} className={`flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-[13px] font-semibold transition ${isActive(n) ? "border-navy-800 text-navy-800" : "border-transparent text-muted hover:bg-surface"}`}>
                    <Icon name={n.icon} className="size-4" />{n.label}
                    {n.badge ? <span className="rounded-full bg-sky-400 px-1.5 text-[10px] text-white">{n.badge}</span> : null}
                  </Link>
                ))}
              </nav>
            </div>
            <Link href="/" className="justify-self-center"><Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={120} height={137} className="fo-logo h-12 w-auto lg:h-14" /></Link>
            <div className="flex items-center justify-end gap-1">
              <Link href={bellHref} className="relative rounded-lg p-2 hover:bg-surface" aria-label="Gelen Kutusu">
                <Icon name="bell" className="size-6 text-navy-800" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
              </Link>
              <div className="relative">
                <button onClick={() => setMenu(!menu)} aria-label={`Hesap menüsü (${user.name})`} aria-expanded={menu} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 hover:bg-surface">
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
                        <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-navy-800 hover:bg-surface lg:py-2">
                          <Icon name={n.icon} className="size-4 text-muted" />{n.label}
                          {n.badge ? <span className="ml-auto rounded-full bg-sky-400 px-1.5 text-[10px] text-white">{n.badge}</span> : null}
                        </Link>
                      ))}
                      <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-navy-800 hover:bg-surface lg:py-2"><Icon name="external" className="size-4 text-muted" />Anasayfa</Link>
                    </div>
                    <form action={logout} className="border-t border-line pt-1">
                      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 lg:py-2"><Icon name="logout" className="size-4" />Çıkış</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {/* İkincil menü: yatay butonlar (yalnızca masaüstü) */}
        <div className="relative z-10 hidden border-b border-line bg-white/95 backdrop-blur lg:block">
          {/* Baloncuk modunda etiket çubuğun altına taştığı için overflow kırpılmaz */}
          <div className={`mx-auto flex max-w-[1310px] items-center gap-1.5 px-4 py-1.5 lg:px-6 ${menuStyle === "tooltip" ? "overflow-visible" : "overflow-x-auto"}`}>
            <button onClick={() => router.back()} className="flex shrink-0 items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-200"><Icon name="arrowLeft" className="size-3.5" /> Geri</button>
            <span className="mx-1 h-4 w-px bg-line" />
            {secondary.filter((n) => !n.end).map((n) => <SecondaryLink key={n.href} n={n} active={isActive(n)} mode={menuStyle} />)}
            <span className="ml-auto" />
            {/* Hedef bayrakları: her anket için renkli bayrak; üzerine gelince hedef cevabı, tıklayınca değiştirme alanı */}
            {flags.length > 0 && (
              <span className="mr-1 flex items-center gap-1 border-r border-line pr-2">
                {flags.map((f) => {
                  const c = f.answer ? goalColor(f.color) : null;
                  return (
                    <Link key={f.surveyId} href={`/panel/anket/${f.surveyId}#hedef`} aria-label={`${f.title}: ${f.answer ?? "hedef seçilmedi"}`} className="group relative flex size-9 shrink-0 items-center justify-center rounded-full transition hover:bg-surface">
                      <span className={`flex transition group-hover:scale-110 ${c ? "" : "text-navy-300"}`} style={c ? { color: c.hex } : undefined}><Icon name="flag" className="size-5" /></span>
                      {c && <span className="absolute bottom-1 right-1 size-2 rounded-full ring-2 ring-white" style={{ background: c.hex }} />}
                      <span role="tooltip" className="menu-tip pointer-events-none absolute right-0 top-full z-20 mt-2 w-max max-w-[260px] origin-top-right rounded-xl bg-navy-900 px-3 py-2 text-left text-white shadow-xl">
                        <span className="absolute -top-1 right-3 size-2.5 rotate-45 bg-navy-900" />
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/60">{f.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-sm font-bold"><span className="size-2.5 shrink-0 rounded-full" style={{ background: c ? c.hex : "#9aabc7" }} />{f.answer ?? "Hedef seçilmedi"}</span>
                        <span className="mt-0.5 block text-[11px] text-white/70">{f.answer ? "Değiştirmek için tıkla" : "Seçmek için tıkla"}</span>
                      </span>
                    </Link>
                  );
                })}
              </span>
            )}
            {/* Sağa yaslı sekmeler (Tercihler & Ayarlar) ikon modunda da metinli kalır, Çıkış gibi */}
            {secondary.filter((n) => n.end).map((n) => <SecondaryLink key={n.href} n={n} active={isActive(n)} />)}
            <form action={logout} className="shrink-0">
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
              <button onClick={() => setDrawer(false)} aria-label="Kapat" className="flex size-10 items-center justify-center rounded-lg hover:bg-surface"><Icon name="x" className="size-5" /></button>
            </div>
            <nav className="space-y-1">
              {[...primary, ...secondary].map((n) => (
                <Link key={n.href} href={n.href} target={n.newTab ? "_blank" : undefined} rel={n.newTab ? "noopener" : undefined} onClick={() => setDrawer(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive(n) ? "bg-navy-800 text-white" : "text-navy-800 hover:bg-surface"}`}>
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
      <NotificationWatcher />
    </div>
  );
}

function SecondaryLink({ n, active, mode = "normal" }: { n: NavItem; active: boolean; mode?: "normal" | "icon" | "tooltip" }) {
  // Sağa yaslı (end) sekmeler Çıkış gibi renkli kapsül: mavi ton
  const tone = n.end
    ? active ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
    : active ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800 hover:bg-surface";
  if (mode === "tooltip") {
    // Sabit genişlikte yalnız ikon; öğeler kaymaz. Üzerine gelince/odaklanınca adı hemen altında küçük bir baloncukta belirir.
    return (
      <Link href={n.href} aria-label={n.label} className={`group relative flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors ${tone}`}>
        <Icon name={n.icon} className="size-5 shrink-0" />
        <span role="tooltip" className="menu-tip pointer-events-none absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl bg-navy-900 px-3.5 py-2 text-sm font-semibold text-white shadow-xl">
          <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-navy-900" />
          <span className="flex size-6 items-center justify-center rounded-lg bg-white/15"><Icon name={n.icon} className="size-3.5" /></span>
          {n.label}
          {n.badge ? <span className="rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-white">{n.badge}</span> : null}
        </span>
        {n.badge ? <span className="absolute -right-1 -top-1 rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-white">{n.badge}</span> : null}
      </Link>
    );
  }
  if (mode === "icon") {
    // Yalnız ikon; üzerine gelince metin sağa doğru yumuşakça açılır (max-width geçişi)
    return (
      <Link href={n.href} title={n.label} aria-label={n.label} className={`group relative flex h-9 shrink-0 items-center rounded-full border px-2 transition-colors ${tone}`}>
        <Icon name={n.icon} className="size-5 shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold opacity-0 transition-[max-width,opacity,padding] duration-300 ease-out group-hover:max-w-[220px] group-hover:pl-2 group-hover:pr-1 group-hover:opacity-100 group-focus-visible:max-w-[220px] group-focus-visible:pl-2 group-focus-visible:pr-1 group-focus-visible:opacity-100">{n.label}</span>
        {n.badge ? <span className="absolute -right-1 -top-1 rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-white">{n.badge}</span> : null}
      </Link>
    );
  }
  return (
    <Link href={n.href} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${tone}`}>
      <Icon name={n.icon} className="size-3.5" />{n.label}
      {n.badge ? <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white text-navy-800" : "bg-sky-400 text-white"}`}>{n.badge}</span> : null}
    </Link>
  );
}
