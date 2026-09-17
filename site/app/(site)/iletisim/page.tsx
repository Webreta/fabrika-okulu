import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";
import { PageHero } from "@/components/site/Sections";
import { Icon, type IconName } from "@/components/site/Icon";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "İletişim" };

/** Kanal kartı: renkli ikon kutusu + başlık + bağlantılar */
function Channel({ icon, tone, title, children }: { icon: IconName; tone: "sky" | "emerald" | "violet" | "amber"; title: string; children: React.ReactNode }) {
  const tones = {
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
  }[tone];
  return (
    <div className="group rounded-3xl border border-line bg-white p-5 shadow-[0_8px_24px_-20px_rgba(20,43,86,.5)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(20,43,86,.5)]">
      <span className={`flex size-11 items-center justify-center rounded-2xl ring-1 ${tones}`}><Icon name={icon} className="size-5" /></span>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">{title}</p>
      <div className="mt-1.5 space-y-1 text-sm font-semibold text-navy-800">{children}</div>
    </div>
  );
}

export default async function ContactPage() {
  const c = await getSetting("contact");
  const socials = [
    { key: "instagram", url: c.instagram, icon: "instagram" as IconName, label: "Instagram" },
    { key: "linkedin", url: c.linkedin, icon: "linkedin" as IconName, label: "LinkedIn" },
    { key: "youtube", url: c.youtube, icon: "youtube" as IconName, label: "YouTube" },
  ].filter((s) => s.url);
  const waHref = (p: string) => `https://wa.me/90${p.replace(/\D/g, "").replace(/^0/, "")}`;

  return (
    <>
      <PageHero title="İletişim" subtitle="Sorunu yaz, en kısa sürede dönüş yapalım." crumbs={[{ label: "İletişim" }]} />
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 top-24 size-96 rounded-full bg-sky-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-10 size-96 rounded-full bg-navy-100/50 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
          {/* Sol: kanallar */}
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-navy-700"><span className="size-1.5 rounded-full bg-emerald-500" /> Genellikle aynı gün dönüş</p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-navy-800 md:text-3xl">Neye ihtiyacın var?</h2>
            <p className="mt-3 max-w-xl text-navy-700">Hangi kanal sana kolaysa oradan yaz.</p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {c.phones.length > 0 && (
                <Channel icon="phone" tone="sky" title="Telefon">
                  {c.phones.map((p) => <a key={p} href={`tel:${p.replace(/\s/g, "")}`} className="block transition hover:text-sky-600">{p}</a>)}
                </Channel>
              )}
              {c.whatsapps.length > 0 && (
                <Channel icon="whatsapp" tone="emerald" title="WhatsApp">
                  {c.whatsapps.map((p) => <a key={p} href={waHref(p)} target="_blank" rel="noopener" className="block transition hover:text-emerald-600">{p}</a>)}
                  <a href={waHref(c.whatsapps[0])} target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"><Icon name="whatsapp" className="size-3.5" /> Sohbet başlat</a>
                </Channel>
              )}
              {c.email && (
                <Channel icon="mail" tone="violet" title="E-posta">
                  <a href={`mailto:${c.email}`} className="block break-all transition hover:text-violet-600">{c.email}</a>
                </Channel>
              )}
              {c.address && (
                <Channel icon="mapPin" tone="amber" title="Adres">
                  <p className="whitespace-pre-line font-medium text-navy-800/90">{c.address}</p>
                </Channel>
              )}
            </div>

            {socials.length > 0 && (
              <div className="mt-8 flex items-center gap-3">
                <span className="text-sm font-semibold text-navy-800">Bizi takip et</span>
                <span className="h-px flex-1 bg-line" />
                {socials.map((s) => (
                  <a key={s.key} href={s.url} target="_blank" rel="noopener" aria-label={s.label} title={s.label} className="flex size-10 items-center justify-center rounded-full border border-line bg-white text-navy-800 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-600"><Icon name={s.icon} className="size-4" /></a>
                ))}
              </div>
            )}

            {c.mapEmbed && (
              <div className="mt-8 overflow-hidden rounded-3xl ring-1 ring-black/5 shadow-[0_18px_40px_-24px_rgba(20,43,86,.5)] [&_iframe]:block [&_iframe]:h-72 [&_iframe]:w-full" dangerouslySetInnerHTML={{ __html: c.mapEmbed }} />
            )}
          </div>

          {/* Sağ: form kartı */}
          <div className="self-start overflow-hidden rounded-3xl bg-white shadow-[0_30px_60px_-30px_rgba(10,21,48,.45)] ring-1 ring-black/5 lg:sticky lg:top-[132px]">
            <div className="relative bg-navy-900 px-6 py-6 text-white sm:px-8">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-sky-400/20 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Icon name="mail" className="size-5 text-sky-300" /></span>
                <div>
                  <h2 className="text-xl font-bold">Bize yaz</h2>
                  <p className="text-sm text-white/70">Birkaç satır yeter; gerisini biz hallederiz.</p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
