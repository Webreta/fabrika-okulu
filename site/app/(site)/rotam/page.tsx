import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { publicRoutes } from "@/lib/data/routes";
import { getCurrentUser } from "@/lib/auth/session";
import { studentCourses } from "@/lib/data/student";
import { getSetting } from "@/lib/settings";
import { RouteMountain, type MountainStep } from "@/components/site/RouteMountain";
import { CtaBand } from "@/components/site/Sections";
import { Icon } from "@/components/site/Icon";
import { fmtMoney, excerpt } from "@/lib/format";

export const metadata: Metadata = { title: "Rotam", description: "Zirveye giden yol: adım adım sıralanmış eğitim rotaları." };

type RouteView = Awaited<ReturnType<typeof publicRoutes>>[number];

/** Rota adımlarını dağ bileşeninin beklediği biçime çevirir; giriş yapan öğrencide ilerlemeye göre durum işaretlenir */
function toSteps(r: RouteView, progress: Map<number, number>, loggedIn: boolean): MountainStep[] {
  let nextMarked = false;
  return r.steps.map((s) => {
    const p = progress.get(s.courseId);
    let state: MountainStep["state"] = "open";
    if (p !== undefined && p >= 100) state = "done";
    else if (p !== undefined) state = "current";
    else if (loggedIn && !nextMarked) { state = "next"; nextMarked = true; }
    if (state === "current") nextMarked = true;
    return {
      id: s.id,
      title: s.title,
      note: s.note,
      href: p !== undefined ? `/kurs-izle/${s.courseId}` : `/program/${s.slug}`,
      imageUrl: s.imageUrl,
      meta: [s.isFree ? "Ücretsiz" : fmtMoney(s.price), s.durationText].filter(Boolean).join(" · "),
      state,
      percent: p,
    };
  });
}

// /rotam → tüm rotalar grid (küçük dağ kartları); /rotam?rota=<slug> → seçili rotanın büyük görünümü (dağ + adım listesi + ilerleme)
export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ rota?: string }> }) {
  const { rota } = await searchParams;
  const [list, user, general] = await Promise.all([publicRoutes(), getCurrentUser(), getSetting("general")]);
  const mine = user ? await studentCourses(user.id) : [];
  const progress = new Map(mine.map((c) => [c.id, c.percent]));
  const selected = rota ? list.find((r) => r.slug === rota) ?? null : null;

  // ---- Grid görünümü ----
  if (!selected) {
    return (
      <>
        <section className="relative overflow-hidden bg-navy-900 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(91,174,207,.35),transparent_60%)]" />
            {/* Dekoratif dağ silüeti (arka plan) */}
            <svg viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full w-full">
              <defs>
                <linearGradient id="peaks-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5baecf" stopOpacity=".22" /><stop offset="1" stopColor="#5baecf" stopOpacity="0" /></linearGradient>
              </defs>
              <path d="M0 320 L120 210 L210 250 L330 120 L420 190 L520 90 L610 160 L720 30 L830 150 L920 100 L1010 180 L1120 70 L1210 170 L1300 120 L1440 240 L1440 320 Z" fill="url(#peaks-fill)" />
              <path d="M0 320 L120 210 L210 250 L330 120 L420 190 L520 90 L610 160 L720 30 L830 150 L920 100 L1010 180 L1120 70 L1210 170 L1300 120 L1440 240" fill="none" stroke="#84bedc" strokeOpacity=".55" strokeWidth="2" strokeLinejoin="round" />
              <path d="M0 320 L180 260 L300 290 L460 200 L560 240 L700 150 L820 230 L980 190 L1100 250 L1260 200 L1440 290" fill="none" stroke="#84bedc" strokeOpacity=".22" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          <div className="relative mx-auto max-w-7xl px-4 py-12 text-center sm:py-16">
            <p className="font-script text-3xl text-sky-300 sm:text-4xl">Zirveye giden yol</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-5xl">Rotam</h1>
            <p className="mx-auto mt-4 max-w-3xl truncate text-white/80">Hedefine adım adım tırman: bir rota seç, hangi eğitimle başlayıp nasıl devam edeceğini gör.</p>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-10">
          {list.length === 0 ? (
            <div className="card py-16 text-center">
              <Icon name="mountain" className="mx-auto size-12 text-navy-300" />
              <p className="mt-3 text-muted">Henüz yayınlanmış bir rota yok.</p>
              <Link href="/kesfet" className="btn-primary mt-4">Programları keşfet</Link>
            </div>
          ) : (
            <div className={`grid gap-6 ${list.length === 1 ? "mx-auto max-w-3xl" : list.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>
              {list.map((r) => {
                const steps = toSteps(r, progress, !!user);
                const done = steps.filter((s) => s.state === "done").length;
                return (
                  <Link key={r.id} href={`/rotam?rota=${r.slug}`} className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl">
                    <div className="pointer-events-none">
                      <RouteMountain name={r.name} goal={r.goal} steps={steps} compact />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h2 className="text-lg font-bold text-navy-800 group-hover:text-sky-600">{r.name}</h2>
                      {r.description && <p className="mt-1 text-sm font-medium text-navy-700">{excerpt(r.description, 110)}</p>}
                      {user && steps.length > 0 && (
                        <div className="mt-3">
                          <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} /></div>
                          <p className="mt-1 text-xs text-muted">{done}/{steps.length} adım tamamlandı</p>
                        </div>
                      )}
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                        <span className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-navy-800 px-2.5 py-1 text-xs font-bold text-white"><Icon name="mountain" className="size-3.5" /> {steps.length} adım</span>
                          {r.goal && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"><Icon name="trophy" className="size-3.5" /> {r.goal}</span>}
                        </span>
                        <span className="btn-sky btn-sm">Rotayı incele</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        <CtaBand title={general.ctaTitle} text={general.ctaText} />
      </>
    );
  }

  // ---- Büyük görünüm ----
  const steps = toSteps(selected, progress, !!user);
  const done = steps.filter((s) => s.state === "done").length;
  const nx = steps.find((s) => s.state === "current") ?? steps.find((s) => s.state === "next");

  return (
    <>
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(91,174,207,.35),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:py-12">
          <Link href="/rotam" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-300 hover:text-sky-200"><Icon name="arrowLeft" className="size-4" /> Tüm rotalar</Link>
          <p className="mt-3 font-script text-2xl text-sky-300 sm:text-3xl">Zirveye giden yol</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-5xl">{selected.name}</h1>
          {selected.description && <p className="mt-3 max-w-2xl text-white/80">{selected.description}</p>}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="overflow-hidden rounded-3xl border border-line shadow-xl">
          <RouteMountain key={selected.id} name={selected.name} goal={selected.goal} description={selected.description} steps={steps} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-2xl font-bold text-navy-800">Adımlar</h2>
            <ol className="mt-6 space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className={`flex gap-4 rounded-2xl border p-3 transition ${s.state === "done" ? "border-emerald-200 bg-emerald-50/50" : s.state === "current" ? "border-sky-200 bg-sky-50/50" : s.state === "next" ? "border-amber-300 bg-amber-50/40" : "border-line bg-white"}`}>
                  <div className="flex flex-col items-center">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.state === "done" ? "bg-emerald-500 text-white" : s.state === "current" ? "bg-sky-400 text-white" : s.state === "next" ? "bg-amber-400 text-white" : "bg-navy-800 text-white"}`}>
                      {s.state === "done" ? <Icon name="check" className="size-4" /> : i + 1}
                    </span>
                    {i < steps.length - 1 && <span className="mt-1 w-0.5 flex-1 rounded bg-line" />}
                  </div>
                  {s.imageUrl && <div className="hidden w-36 shrink-0 overflow-hidden rounded-xl bg-navy-50 sm:block"><Image src={s.imageUrl} alt="" width={144} height={58} className="aspect-[5/2] w-full object-cover" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={s.href} className="font-bold text-navy-800 hover:text-sky-600">{s.title}</Link>
                      {s.state === "done" && <span className="badge bg-emerald-50 text-emerald-700">Tamamlandı</span>}
                      {s.state === "current" && <span className="badge bg-sky-50 text-sky-700">%{s.percent ?? 0} · devam ediyor</span>}
                      {s.state === "next" && <span className="badge bg-amber-50 text-amber-700">Sıradaki adımın</span>}
                    </div>
                    {s.note && <p className="mt-1 text-sm text-muted">{s.note}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted">{s.meta}</span>
                      <Link href={s.href} className="btn-sky btn-sm">{s.state === "done" ? "Tekrar bak" : s.state === "current" ? "Devam et" : "Eğitime git"}</Link>
                    </div>
                  </div>
                </li>
              ))}
              <li className="flex items-center gap-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white"><Icon name="trophy" className="size-4" /></span>
                <div><p className="font-bold text-navy-800">Zirve: {selected.goal || "Hedefine ulaştın"}</p><p className="text-sm text-muted">Tüm adımları tamamladığında buradasın.</p></div>
              </li>
            </ol>
          </div>
          <aside className="card h-fit lg:sticky lg:top-40">
            <p className="font-bold text-navy-800">Bu rotada neredesin?</p>
            {user ? (
              <>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%` }} /></div>
                <p className="mt-2 text-sm text-muted">{done}/{steps.length} adım tamamlandı{done === steps.length && steps.length > 0 ? " · Zirvedesin! 🏔️" : ""}</p>
                {nx && <Link href={nx.href} className="btn-primary mt-4 w-full"><Icon name="play" className="size-4" /> {nx.state === "current" ? "Devam et" : "Sıradaki adıma başla"}</Link>}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">Giriş yaparsan tamamladığın adımları yeşil, devam ettiğini mavi görürsün.</p>
                <Link href={`/panel/giris?r=/rotam?rota=${selected.slug}`} className="btn-primary mt-4 w-full"><Icon name="user" className="size-4" /> Giriş yap</Link>
              </>
            )}
            <ul className="mt-4 space-y-1.5 text-xs text-muted">
              <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-emerald-500" /> Tamamlandı</li>
              <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-sky-400" /> Devam ediyor</li>
              <li className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-amber-400 bg-white" /> Sıradaki adım</li>
              <li className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-navy-200 bg-white" /> Henüz başlanmadı</li>
            </ul>
            {list.length > 1 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Diğer rotalar</p>
                <ul className="mt-2 space-y-1">
                  {list.filter((r) => r.id !== selected.id).map((r) => (
                    <li key={r.id}><Link href={`/rotam?rota=${r.slug}`} className="flex items-center gap-2 text-sm font-semibold text-navy-800 hover:text-sky-600"><Icon name="mountain" className="size-4 text-navy-300" />{r.name}</Link></li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </section>
      <CtaBand title={general.ctaTitle} text={general.ctaText} />
    </>
  );
}
