import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { pageMeta } from "@/lib/seo";
import { getSetting, getRawSetting } from "@/lib/settings";
import { DEFAULT_FAQ, DEFAULT_SHOWCASE, type FaqContent, type ShowcaseContent } from "@/lib/content-defaults";
import { catalogCourses, listCourses } from "@/lib/data/courses";
import { publicRoutes } from "@/lib/data/routes";
import { fmtMoney, excerpt } from "@/lib/format";
import { CourseCard } from "@/components/site/CourseCard";
import { SectionTitle } from "@/components/site/Sections";
import { MountainBackdrop } from "@/components/site/MountainBackdrop";
import { RouteMountain, type MountainStep } from "@/components/site/RouteMountain";
import { Icon } from "@/components/site/Icon";
import { FaqAccordion } from "@/components/site/FaqAccordion";

export const generateMetadata = (): Promise<Metadata> => pageMeta({ path: "/" });

// Anasayfa akışı: hero → vitrin → rotaları incele → merak edilenler (SSS) → footer (layout; iletişim bilgileri footer'da)
export default async function HomePage() {
  const [g, faq, sc, routes] = await Promise.all([
    getSetting("general"),
    getRawSetting<FaqContent>("faq", DEFAULT_FAQ).then((v) => ({ ...DEFAULT_FAQ, ...v })),
    getRawSetting<ShowcaseContent>("showcase", DEFAULT_SHOWCASE).then((v) => ({ ...DEFAULT_SHOWCASE, ...v })),
    publicRoutes(),
  ]);
  // Vitrin: admin elle seçtiyse o sırayla (yayında ve kapalı olmayanlar), yoksa katalogdan ilk `limit` kart
  const showcase = sc.courseIds.length > 0
    ? (await listCourses({ ids: sc.courseIds })).filter((k) => !k.closed).sort((a, b) => sc.courseIds.indexOf(a.id) - sc.courseIds.indexOf(b.id))
    : (await catalogCourses()).slice(0, sc.limit);
  const showcaseCols = sc.columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  const featuredRoutes = routes.filter((r) => r.steps.length > 0).slice(0, 3);
  const toSteps = (r: (typeof routes)[number]): MountainStep[] =>
    r.steps.map((s) => ({
      id: s.id,
      title: s.title,
      note: s.note,
      href: `/program/${s.slug}`,
      imageUrl: s.imageUrl,
      meta: [s.opensAt ? "Erken kayıt" : "", s.comingSoon && !s.soonShowPrice ? "Yakında" : s.isFree ? "Ücretsiz" : fmtMoney(s.price), s.durationText].filter(Boolean).join(" · "),
      comingSoon: s.comingSoon,
      state: "open",
    }));

  return (
    <>
      {/* 1. Giriş hero banner */}
      <section className="relative overflow-hidden bg-navy-800">
        {/* Görsel sağa yaslı: tırmanıcılar sağda; sol tarafa açık lacivert geçiş (çok koyu olmasın) */}
        <div className="absolute inset-y-0 right-0 w-full md:w-[74%] lg:w-[70%]">
          <Image src={g.heroImage || "/img/site/hero.jpg"} alt="" fill className="object-cover object-[80%_center] opacity-90" priority />
          <div className="absolute inset-y-0 -left-2 right-0 bg-gradient-to-r from-navy-800 from-3% via-navy-800/20 via-38% to-transparent" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-navy-800/70 via-navy-800/20 to-transparent md:hidden" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy-900/60 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-32 md:py-44">
          <div className="max-w-3xl text-white">
            <h1 className="text-3xl font-bold leading-tight md:text-4xl lg:whitespace-nowrap lg:text-[2.9rem]">{g.heroTitle}</h1>
            <p className="mt-5 text-lg text-white/85 md:text-xl lg:whitespace-nowrap">{g.heroText}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/kesfet" className="btn-sky px-7 py-3 text-base">Keşfet <Icon name="arrowRight" className="arrow-nudge size-4" /></Link>
              <Link href="#rotalar" className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-7 py-3 text-base font-semibold text-white transition hover:bg-white/10"><Icon name="flag" className="size-4 text-red-400" /> Rotaları incele</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Vitrin alanı */}
      <section id="vitrin" className="mx-auto max-w-7xl px-4 py-16">
        {/* Modern vitrin çerçevesi: yumuşak gradyan panel, ışık lekeleri, nokta dokusu */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-line bg-gradient-to-br from-white via-sky-50 to-navy-50 p-6 shadow-[0_30px_80px_-40px_rgba(20,43,86,.45)] sm:p-10">
          <div className="pointer-events-none absolute inset-0 opacity-[.35] [background-image:radial-gradient(rgba(20,43,86,.14)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 size-80 rounded-full bg-navy-300/25 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-navy-800 md:text-4xl">{sc.title}</h2>
              {sc.sub && <p className="mt-2 max-w-2xl text-muted">{sc.sub}</p>}
            </div>
            <Link href="/kesfet" className="btn-primary shrink-0 px-6 py-3 text-base">Tüm eğitimleri gör <Icon name="arrowRight" className="size-4" /></Link>
          </div>

          <div className="relative mt-8">
            {showcase.length === 0 ? (
              <p className="text-center text-muted">Henüz yayınlanmış program yok.</p>
            ) : (
              <div className={`grid gap-6 ${showcaseCols}`}>
                {showcase.map((k) => <CourseCard key={k.id} course={k} size={sc.columns === 2 ? "lg" : "md"} />)}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Rotaları incele */}
      {featuredRoutes.length > 0 && (
        <section id="rotalar" className="relative overflow-hidden bg-navy-900 text-white">
            {/* Güneş (dekoratif): kesilmesin diye bulut kutusunun dışında; hare katmanlı radyal gradyanlarla yumuşak yayılır */}
            <div className="sky-sun pointer-events-none absolute right-[12%] top-[88px] size-24 sm:size-32" aria-hidden>
              <div className="sky-glow absolute -inset-28 rounded-full bg-[radial-gradient(circle,rgba(253,224,130,.28)_0%,rgba(253,224,130,.12)_38%,rgba(253,224,130,.04)_58%,transparent_72%)] sm:-inset-40" />
              <div className="sky-glow-2 absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(254,235,160,.55)_0%,rgba(253,224,130,.28)_45%,rgba(253,224,130,.08)_65%,transparent_75%)] sm:-inset-14" />
              <div className="absolute inset-0 rounded-full bg-amber-200/85 blur-[2px]" />
            </div>
            {/* Süzülen bulutlar (dekoratif) */}
            <div className="pointer-events-none absolute inset-x-0 top-12 h-64 overflow-hidden sm:h-80" aria-hidden>
              {[
                { top: "12%", w: 220, dur: 52, delay: 0, o: .18 },
                { top: "38%", w: 160, dur: 42, delay: -20, o: .14 },
                { top: "58%", w: 260, dur: 68, delay: -40, o: .12 },
                { top: "24%", w: 120, dur: 36, delay: -10, o: .1 },
              ].map((c, i) => (
                <svg key={i} viewBox="0 0 200 70" className="sky-cloud absolute left-0" style={{ top: c.top, width: c.w, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, opacity: c.o }}>
                  <path fill="#ffffff" d="M40 60c-14 0-25-9-25-21 0-11 9-20 21-21 4-11 15-18 27-18 15 0 27 10 30 24 2-1 5-2 8-2 12 0 22 9 22 19 0 11-10 19-22 19H40z" />
                </svg>
              ))}
            </div>
            <MountainBackdrop flags />
          <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-24">
            <div className="relative mb-8 text-center">
              {/* Dağların üstünde okunurluk: başlığın arkasında yumuşak koyu hale + metin gölgesi */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] h-[180%] w-[min(100%,900px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy-900/70 blur-2xl" aria-hidden />
              <h2 className="text-2xl font-bold md:text-4xl [text-shadow:0_2px_12px_rgba(10,21,48,.9)]">Rotaları İncele</h2>
              <p className="mx-auto mt-2 max-w-3xl truncate text-white/90 [text-shadow:0_1px_8px_rgba(10,21,48,.9)]">Hedefine adım adım tırman: her rota hangi eğitimle başlayıp nasıl devam edeceğini gösterir.</p>
            </div>
            <div className={`grid gap-6 ${featuredRoutes.length === 1 ? "mx-auto max-w-3xl" : featuredRoutes.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>
              {featuredRoutes.map((r) => (
                <div key={r.id} className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white text-navy-800 shadow-xl">
                  <RouteMountain name={r.name} goal={r.goal} steps={toSteps(r)} compact />
                  <div className="flex flex-1 flex-col p-5">
                    {r.description && <p className="text-sm font-medium text-navy-700">{excerpt(r.description, 110)}</p>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                      <span className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-navy-800 px-2.5 py-1 text-xs font-bold text-white"><Icon name="mountain" className="size-3.5" /> {r.steps.length} adım</span>
                        {r.goal && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"><Icon name="trophy" className="size-3.5" /> {r.goal}</span>}
                      </span>
                      <Link href={`/rotam?rota=${r.slug}`} className="btn-sky btn-sm">Rotayı incele</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/rotam" className="inline-flex items-center gap-2 font-semibold text-sky-300 hover:text-sky-200">Tüm rotalar <Icon name="arrowRight" className="size-4" /></Link>
            </div>
          </div>
        </section>
      )}

      {/* 4. Merak edilenler (SSS) */}
      {faq.items.length > 0 && (
        <section id="merak-edilenler" className="mx-auto max-w-7xl px-4 py-16">
          <SectionTitle sub={faq.sub}>{faq.title}</SectionTitle>
          <FaqAccordion items={faq.items.slice(0, Math.max(1, faq.homeLimit || 6))} />
          {faq.items.length > (faq.homeLimit || 6) && (
            <div className="mt-6 text-center">
              <Link href="/sss" className="inline-flex items-center gap-2 font-semibold text-sky-600 hover:underline">Tüm soruları gör <Icon name="arrowRight" className="size-4" /></Link>
            </div>
          )}
        </section>
      )}

    </>
  );
}
