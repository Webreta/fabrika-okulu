import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/site/Icon";

type Contact = { phones?: string[]; whatsapps?: string[]; email?: string; address?: string; instagram?: string; linkedin?: string; youtube?: string };

/**
 * Lacivert footer, ortalı düzen: üstte logo + slogan + kısa metin + iletişim hapları + sosyal ikonlar,
 * ortada dağ motifli ayraç, altında üç bağlantı sütunu (site haritası / eğitimler / yasal), en altta telif şeridi.
 * Arka planda sönük dağ silüeti.
 */
export function Footer({ text, categories = [], contact = {} }: { text: string; categories?: { name: string; slug: string }[]; contact?: Contact }) {
  const link = "inline-block text-sm text-navy-200 transition hover:translate-x-0.5 hover:text-white";
  const head = "mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300";
  const phone = contact.phones?.[0];
  const wa = contact.whatsapps?.[0];
  const socials = [
    contact.instagram && { href: contact.instagram, icon: "instagram" as const, label: "Instagram" },
    contact.linkedin && { href: contact.linkedin, icon: "linkedin" as const, label: "LinkedIn" },
    contact.youtube && { href: contact.youtube, icon: "play" as const, label: "YouTube" },
  ].filter((s): s is { href: string; icon: "instagram" | "linkedin" | "play"; label: string } => !!s);

  const columns: { title: string; items: { href: string; label: string }[] }[] = [
    { title: "Site Haritası", items: [{ href: "/", label: "Anasayfa" }, { href: "/hakkimizda", label: "Fabrika Okulu" }, { href: "/rotam", label: "Rotam" }, { href: "/sss", label: "S.S.S." }, { href: "/iletisim", label: "İletişim" }, { href: "/panel", label: "Hesabım" }] },
    { title: "Eğitimler", items: [...categories.map((k) => ({ href: `/kategori/${k.slug}`, label: k.name })), { href: "/kesfet", label: "Tüm Eğitimler" }] },
    { title: "Yasal", items: [{ href: "/kvkk-aydinlatma-metni", label: "KVKK Aydınlatma Metni" }, { href: "/cerez-politikasi", label: "Çerez Politikası" }, { href: "/mesafeli-satis-sozlesmesi", label: "Mesafeli Satış Sözleşmesi" }, { href: "/gizlilik-sozlesmesi", label: "Gizlilik Sözleşmesi" }, { href: "/teslimat-ve-iade-sartlari", label: "Teslimat ve İade Şartları" }] },
  ];

  return (
    <footer className="relative mt-16 overflow-hidden bg-navy-950 text-white">
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
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Image src="/img/site/footer-logo.png" alt="Fabrika Okulu" width={800} height={293} className="h-auto w-60" />
          <p className="mt-4 font-script text-3xl text-sky-300">Kariyer gelişiminde yol arkadaşın.</p>
          <p className="mt-4 text-sm leading-relaxed text-navy-200">{text}</p>
          {(phone || wa || contact.email) && (
            <div className="mt-7 grid w-full max-w-2xl divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.07] to-white/[.02] backdrop-blur-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                phone && { href: `tel:${phone.replace(/\s/g, "")}`, icon: "phone" as const, tint: "text-sky-300", label: "Telefon", value: phone, ext: false },
                wa && { href: `https://wa.me/90${wa.replace(/\D/g, "").replace(/^0/, "")}`, icon: "whatsapp" as const, tint: "text-emerald-400", label: "WhatsApp", value: wa, ext: true },
                contact.email && { href: `mailto:${contact.email}`, icon: "mail" as const, tint: "text-sky-300", label: "E-posta", value: contact.email, ext: false },
              ]
                .filter((c): c is { href: string; icon: "phone" | "whatsapp" | "mail"; tint: string; label: string; value: string; ext: boolean } => !!c)
                .map((c) => (
                  <a key={c.label} href={c.href} {...(c.ext ? { target: "_blank", rel: "noopener" } : {})} className="group/c flex items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[.06]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 ring-1 ring-white/10 transition group-hover/c:ring-sky-400/60"><Icon name={c.icon} className={`size-4 ${c.tint}`} /></span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-navy-300">{c.label}</span>
                      <span className="block truncate text-sm font-semibold text-white">{c.value}</span>
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

        {/* Bağlantı sütunları (ortalı) */}
        <div className="mx-auto grid max-w-4xl gap-10 text-center sm:grid-cols-3">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className={head}>{col.title}</h3>
              <ul className="space-y-2.5">
                {col.items.map((it) => <li key={it.href}><Link href={it.href} className={link}>{it.label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Telif şeridi */}
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-navy-300 sm:flex-row">
          <span>© {new Date().getFullYear()} Fabrika Okulu · Tüm Hakları Saklıdır</span>
          <Image src="/img/site/odeme.png" alt="Visa, Mastercard, iyzico" width={513} height={73} className="h-6 w-auto" />
          <a href="https://webreta.com.tr" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white">
            Design By <Image src="/img/site/webreta.webp" alt="Webreta" width={300} height={50} className="h-3 w-auto" />
          </a>
        </div>
      </div>
    </footer>
  );
}
