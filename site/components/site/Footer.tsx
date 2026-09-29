import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/site/Icon";
import { DEFAULT_FOOTER, FOOTER_MAX_COLUMNS, type FooterContent } from "@/lib/content-defaults";
import { waLink } from "@/lib/format";

/** Yalnızca site içi yol (tek / ile başlayan), http(s), mailto ve tel adresleri bağlantı olur (javascript:, //dış-adres vb. engellenir) */
const safeHref = (h: string) => (/^(\/(?![\/\\])|https?:\/\/|mailto:|tel:)/i.test(h.trim()) ? h.trim() : "#");
const COLS: Record<number, string> = { 1: "max-w-xs", 2: "max-w-2xl sm:grid-cols-2", 3: "max-w-4xl sm:grid-cols-3", 4: "max-w-6xl sm:grid-cols-2 lg:grid-cols-4" };

type Contact = { phones?: string[]; whatsapps?: string[]; email?: string; address?: string; instagram?: string; linkedin?: string; youtube?: string };

/**
 * Lacivert footer, ortalı düzen: üstte logo + slogan + kısa metin + iletişim hapları + sosyal ikonlar,
 * ortada dağ motifli ayraç, altında bağlantı sütunları, en altta telif şeridi. Arka planda sönük dağ silüeti.
 * Logo, slogan, metin, iletişim kutuları ve sütunlar admin → Site İçeriği → Footer'dan gelir (`content`); telif şeridi sabittir.
 */
export function Footer({ content = DEFAULT_FOOTER, categories = [], contact = {} }: { content?: FooterContent; categories?: { name: string; slug: string }[]; contact?: Contact }) {
  // Telefonda bağlantılar en az 40 px yüksekliğinde dokunma hedefidir; md ve üstünde eski sıkı görünüm
  const link = "inline-flex min-h-10 min-w-10 items-center justify-center px-1 text-sm text-navy-200 transition hover:translate-x-0.5 hover:text-white md:inline-block md:min-h-0 md:min-w-0 md:px-0";
  const head = "mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300";
  const custom = content.contactMode === "custom";
  const phone = content.contactMode === "hidden" ? "" : custom ? content.phone : contact.phones?.[0];
  const wa = content.contactMode === "hidden" ? "" : custom ? content.whatsapp : contact.whatsapps?.[0];
  const email = content.contactMode === "hidden" ? "" : custom ? content.email : contact.email;
  const socials = !content.showSocials ? [] : [
    contact.instagram && { href: contact.instagram, icon: "instagram" as const, label: "Instagram" },
    contact.linkedin && { href: contact.linkedin, icon: "linkedin" as const, label: "LinkedIn" },
    contact.youtube && { href: contact.youtube, icon: "play" as const, label: "YouTube" },
  ].filter((s): s is { href: string; icon: "instagram" | "linkedin" | "play"; label: string } => !!s);

  const columns = content.columns
    .slice(0, FOOTER_MAX_COLUMNS)
    .map((c) => ({ title: c.title, items: [...(c.categories ? categories.map((k) => ({ href: `/kategori/${k.slug}`, label: k.name })) : []), ...c.links.map((l) => ({ href: safeHref(l.href), label: l.label }))] }))
    .filter((c) => c.title && c.items.length > 0);

  return (
    <footer id="footer" className="relative mt-16 overflow-hidden bg-navy-950 text-white">
      {/* Üst ışık çizgisi + zemin ışığı */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(91,174,207,.18),transparent_55%)]" />
      {/* Sönük dağ silüeti */}
      <svg viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full opacity-60">
        <defs>
          <linearGradient id="footer-peaks" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#142b56" stopOpacity="0" /><stop offset="1" stopColor="#142b56" stopOpacity=".9" /></linearGradient>
        </defs>
        <path d="M0 320 L140 220 L240 260 L360 150 L470 210 L580 110 L690 190 L800 60 L910 180 L1010 130 L1120 200 L1230 100 L1330 190 L1440 140 L1440 320 Z" fill="url(#footer-peaks)" />
        <path d="M0 320 L140 220 L240 260 L360 150 L470 210 L580 110 L690 190 L800 60 L910 180 L1010 130 L1120 200 L1230 100 L1330 190 L1440 140" fill="none" stroke="#84bedc" strokeOpacity=".25" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-16">
        {/* Marka bloğu (ortalı) */}
        <div className="flex flex-col items-center text-center">
          <Image src={content.logo || DEFAULT_FOOTER.logo} alt="Fabrika Okulu" width={800} height={293} className="h-auto max-h-28 w-60 object-contain" />
          {content.slogan && <p className="mt-4 max-w-2xl font-script text-3xl text-sky-300">{content.slogan}</p>}
          {content.text && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-navy-200">{content.text}</p>}
          {(phone || wa || email) && (
            // Kutular içeriğe göre genişler (eşit üçe bölünmez): uzun e-posta adresi kesilmeden görünür
            <div className="mt-7 flex w-full max-w-full flex-col divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.07] to-white/[.02] backdrop-blur-sm sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center sm:divide-x sm:divide-y-0">
              {[
                phone && { href: `tel:${phone.replace(/\s/g, "")}`, icon: "phone" as const, tint: "text-sky-300", label: "Telefon", value: phone, ext: false },
                wa && { href: waLink(wa), icon: "whatsapp" as const, tint: "text-emerald-400", label: "WhatsApp", value: wa, ext: true },
                email && { href: `mailto:${email}`, icon: "mail" as const, tint: "text-sky-300", label: "E-posta", value: email, ext: false },
              ]
                .filter((c): c is { href: string; icon: "phone" | "whatsapp" | "mail"; tint: string; label: string; value: string; ext: boolean } => !!c)
                .map((c) => (
                  <a key={c.label} href={c.href} {...(c.ext ? { target: "_blank", rel: "noopener" } : {})} className="group/c flex items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[.06]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 ring-1 ring-white/10 transition group-hover/c:ring-sky-400/60"><Icon name={c.icon} className={`size-4 ${c.tint}`} /></span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-navy-300">{c.label}</span>
                      <span className="block break-all text-sm font-semibold text-white sm:whitespace-nowrap sm:break-normal">{c.value}</span>
                    </span>
                  </a>
                ))}
            </div>
          )}
          {socials.length > 0 && (
            <div className="mt-4 flex gap-2">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label} className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-navy-100 transition hover:border-sky-400/60 hover:bg-sky-400/15 hover:text-white">
                  <Icon name={s.icon} className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Dağ motifli ayraç */}
        <div className="my-12 flex items-center gap-4">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
          <span className="flex size-10 items-center justify-center rounded-full border border-sky-400/40 bg-navy-900 text-sky-300 shadow-[0_0_24px_-4px_rgba(91,174,207,.6)]"><Icon name="mountain" className="size-5" /></span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
        </div>

        {/* Bağlantı sütunları (ortalı); dış adresler yeni sekmede açılır */}
        {columns.length > 0 && (
          <div className={`mx-auto grid gap-10 text-center ${COLS[columns.length] ?? COLS[3]}`}>
            {columns.map((col, ci) => (
              <div key={ci}>
                <h3 className={head}>{col.title}</h3>
                <ul className="space-y-0 md:space-y-2.5">
                  {col.items.map((it, i) => (
                    <li key={i}>
                      {it.href.startsWith("/") ? <Link href={it.href} className={link}>{it.label}</Link> : <a href={it.href} {...(/^https?:/i.test(it.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={link}>{it.label}</a>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Telif şeridi */}
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-navy-300 sm:flex-row">
          <span>© {new Date().getFullYear()} Fabrika Okulu · Tüm Hakları Saklıdır</span>
          <Image src="/img/site/odeme.png" alt="Visa, Mastercard, iyzico" width={513} height={73} className="h-6 w-auto" />
          <a href="https://webreta.com.tr" target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2 hover:text-white sm:min-h-0">
            Design By <Image src="/img/site/webreta.webp" alt="Webreta" width={300} height={50} className="h-3 w-auto" />
          </a>
        </div>
      </div>
    </footer>
  );
}
