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
import { fmtMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Rotam", description: "Zirveye giden yol: adım adım sıralanmış eğitim rotaları." };

// /rotam?rota=<slug> — admin'in kurduğu rotalar; seçili rota dağ yolu olarak çizilir, altında adım listesi.
export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ rota?: string }> }) {
  const { rota } = await searchParams;
  const [list, user, general] = await Promise.all([publicRoutes(), getCurrentUser(), getSetting("general")]);
  const selected = list.find((r) => r.slug === rota) ?? list[0] ?? null;
  const mine = user ? await studentCourses(user.id) : [];
  const progress = new Map(mine.map((c) => [c.id, c.percent]));

  const steps: MountainStep[] = selected
    ? (() => {
        let nextMarked = false;
        return selected.steps.map((s) => {
          const p = progress.get(s.courseId);
          let state: MountainStep["state"] = "open";
          if (p !== undefined && p >= 100) state = "done";
          else if (p !== undefined) state = "current";
          else if (user && !nextMarked) { state = "next"; nextMarked = true; }
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
      })()
    : [];
  const done = steps.filter((s) => s.state === "done").length;

  return (
    <>
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(91,174,207,.35),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 text-center sm:py-16">
          <p className="font-script text-3xl text-sky-300 sm:text-4xl">Zirveye giden yol</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-5xl">Rotam</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/80">Hedefine adım adım tırman. Her rota, önce hangi eğitimi alacağını, sonra hangisiyle devam edeceğini gösterir. Adımların üzerine gelip ne kazandıracağını gör.</p>
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
          <>
            {list.length > 1 && (
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                {list.map((r) => (
                  <Link key={r.id} href={`/rotam?rota=${r.slug}`} scroll={false} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${r.id === selected?.id ? "border-navy-800 bg-navy-800 text-white shadow" : "border-line bg-white text-navy-800 hover:border-navy-300"}`}>
                    <Icon name="mountain" className="mr-1.5 inline size-4" />{r.name}
                  </Link>
                ))}
              </div>
            )}
            {selected && (
              <>
                <div className="overflow-hidden rounded-3xl border border-line shadow-xl">
                  <RouteMountain key={selected.id} name={selected.name} goal={selected.goal} description={selected.description} steps={steps} />
                </div>

                <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div>
                    <h2 className="text-2xl font-bold text-navy-800">{selected.name}</h2>
                    {selected.description && <p className="mt-2 text-muted">{selected.description}</p>}
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
                        {(() => { const nx = steps.find((s) => s.state === "current") ?? steps.find((s) => s.state === "next"); return nx ? <Link href={nx.href} className="btn-primary mt-4 w-full"><Icon name="play" className="size-4" /> {nx.state === "current" ? "Devam et" : "Sıradaki adıma başla"}</Link> : null; })()}
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-sm text-muted">Giriş yaparsan tamamladığın adımları yeşil, devam ettiğini mavi görürsün.</p>
                        <Link href="/panel/giris?r=/rotam" className="btn-primary mt-4 w-full"><Icon name="user" className="size-4" /> Giriş yap</Link>
                      </>
                    )}
                    <ul className="mt-4 space-y-1.5 text-xs text-muted">
                      <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-emerald-500" /> Tamamlandı</li>
                      <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-sky-400" /> Devam ediyor</li>
                      <li className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-amber-400 bg-white" /> Sıradaki adım</li>
                      <li className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-navy-200 bg-white" /> Henüz başlanmadı</li>
                    </ul>
                  </aside>
                </div>
              </>
            )}
          </>
        )}
      </section>
      <CtaBand title={general.ctaTitle} text={general.ctaText} />
    </>
  );
}
