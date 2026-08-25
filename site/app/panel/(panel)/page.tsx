import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { studentCourses, studentActions } from "@/lib/data/student";
import { getSurveyState } from "@/lib/survey";
import { getSetting } from "@/lib/settings";
import { themeByKey } from "@/lib/panel-themes";
import { fmtDate, fmtTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { Progress, Kpi, Chip } from "@/components/panel/ui";
import { ThemeButton } from "@/components/panel/ThemePicker";
import { SurveyModal } from "@/components/panel/SurveyForm";
import { getSurveyAnswers } from "@/lib/survey";

export default async function PanelHome({ searchParams }: { searchParams: Promise<{ sifirlandi?: string }> }) {
  const user = (await getCurrentUser())!;
  const { sifirlandi } = await searchParams;
  const [courses, actions, survey, panel] = await Promise.all([studentCourses(user.id), studentActions(user.id), getSurveyState(user), getSetting("panel")]);
  const theme = themeByKey(user.panelTheme, panel.defaultTheme);
  const resume = courses.find((c) => c.percent > 0 && c.percent < 100) ?? courses.find((c) => c.percent < 100);
  const pendingTasks = actions.items.filter((i) => i.kind === "assignment" && !i.done).length;
  const upcomingQuiz = actions.items.filter((i) => i.kind === "quiz" && !i.done).length;
  const completed = courses.filter((c) => c.total > 0 && c.percent >= 100).length;
  const upcoming = actions.calendar.filter((e) => e.date.getTime() >= Date.now() - 86400000).slice(0, 6);
  const totalLessons = courses.reduce((s, c) => s + c.total, 0);
  const doneLessons = courses.reduce((s, c) => s + c.completed, 0);
  const overall = totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0;
  const answers = survey.mustAnswer ? await getSurveyAnswers(user.id, survey.schema.key) : {};

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_336px]">
      <div className="space-y-6">
        {/* Tema banner */}
        <div className="relative rounded-2xl">
          {theme.img ? (
            <Image src={theme.img} alt="" width={1310} height={260} className="h-44 w-full rounded-2xl object-cover md:h-64" style={{ objectPosition: theme.focus }} />
          ) : (
            <div className="h-44 w-full rounded-2xl bg-gradient-to-r from-navy-800 to-sky-500 md:h-64" />
          )}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-[#000]/75 via-[#000]/20 to-transparent" />
          <div className="absolute bottom-5 left-6 text-[#fff]">
            <p className="text-sm text-[#fff]/80">{fmtDate(new Date(), true)}</p>
            <h1 className="text-3xl font-bold md:text-4xl">Merhaba, {user.firstName || user.name} 👋</h1>
          </div>
          <ThemeButton current={theme.key} />
        </div>

        {sifirlandi && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Şifren güncellendi.</p>}

        {survey.needsAttention && !survey.mustAnswer && (
          <Link href="/panel/anket" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Icon name="survey" className="size-5" /> <span><b>{survey.title}</b> anketini tamamla, sana uygun programları önerelim.</span>
            <span className="ml-auto font-semibold">Doldur →</span>
          </Link>
        )}

        {/* Devam kartı */}
        {resume ? (
          <div className="rounded-2xl bg-gradient-to-br from-navy-700 to-navy-900 p-6 text-white">
            <p className="text-xs uppercase tracking-wide text-white/60">Kaldığın yerden devam et</p>
            <h2 className="mt-1 text-xl font-bold">{resume.title}</h2>
            <div className="mt-4 flex items-center gap-4">
              <Progress percent={resume.percent} className="bg-white/20" />
              <span className="shrink-0 text-sm font-semibold">%{resume.percent}</span>
            </div>
            <p className="mt-1 text-sm text-white/70">{resume.completed}/{resume.total} ders tamamlandı</p>
            <Link href={`/kurs-izle/${resume.id}`} className="btn-sky mt-4"><Icon name="play" className="size-4" /> Derse devam et</Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-navy-700 to-navy-900 p-6 text-white">
            <h2 className="text-xl font-bold">{courses.length ? "Tüm eğitimlerini tamamladın 🎉" : "Henüz bir programa kayıtlı değilsin"}</h2>
            <p className="mt-1 text-sm text-white/70">Yeni bir programla gelişimine devam et.</p>
            <Link href="/kesfet" className="btn-sky mt-4">Programları keşfet</Link>
          </div>
        )}

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Aktif eğitim" value={courses.filter((c) => c.percent < 100).length} icon="book" color="navy" href="/panel/egitim" />
          <Kpi label="Bekleyen görev" value={pendingTasks} icon="task" color="amber" href="/panel/aksiyon" />
          <Kpi label="Yaklaşan sınav" value={upcomingQuiz} icon="quiz" color="sky" href="/panel/aksiyon" />
          <Kpi label="Tamamlanan" value={completed} icon="trophy" color="green" href="/panel/egitim?sekme=bitmis" />
        </div>

        {/* Yaklaşan */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-navy-800">Yaklaşan</h2>
            <Link href="/panel/takvim" className="text-sm text-sky-600 hover:underline">Takvimi gör →</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="card text-sm text-muted">Yaklaşan bir etkinlik yok.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((e, i) => (
                <div key={i} className={`card ${e.done ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted">{fmtDate(e.date)} · {fmtTime(e.date)}</span>
                    <Chip color={e.type === "session" ? "purple" : e.type === "quiz" ? "sky" : "amber"}>{e.type === "session" ? "Canlı ders" : e.type === "quiz" ? "Sınav" : "Görev"}</Chip>
                  </div>
                  <p className="mt-2 font-semibold text-navy-800">{e.title}</p>
                  <p className="text-xs text-muted">{e.courseTitle}</p>
                  <Link href={e.link} target={e.external ? "_blank" : undefined} className="btn-secondary btn-sm mt-3">{e.type === "session" ? "Katıl" : "Git"}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sağ ray */}
      <aside className="space-y-4">
        <div className="card">
          <h3 className="font-bold text-navy-800">Hızlı Erişim</h3>
          <ul className="mt-3 space-y-1 text-sm">
            {[
              { href: "/panel/egitim", label: "Eğitimlerim", icon: "book", n: courses.length },
              { href: "/panel/aksiyon", label: "Aksiyonlarım", icon: "task", n: pendingTasks + upcomingQuiz },
              { href: "/panel/takvim", label: "Takvim", icon: "calendar", n: upcoming.length },
              { href: "/panel/sertifika", label: "Sertifikalarım", icon: "award" },
              { href: "/panel/bildirim", label: "Mesajlarım", icon: "mail" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface">
                  <Icon name={l.icon as "book"} className="size-4 text-sky-500" /><span className="flex-1 text-navy-800">{l.label}</span>
                  {l.n !== undefined && <span className="rounded-full bg-surface px-2 text-xs text-muted">{l.n}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="card text-center">
          <h3 className="font-bold text-navy-800">Genel ilerleme</h3>
          <div className="relative mx-auto mt-3 size-32">
            <svg viewBox="0 0 36 36" className="size-32 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e3e8ef" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#5baecf" strokeWidth="3.5" strokeDasharray={`${overall} 100`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-navy-800">%{overall}</span>
          </div>
          <p className="mt-2 text-xs text-muted">{courses.length} eğitimden {completed}&apos;i tamamlandı · toplam {totalLessons} ders</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-navy-700 p-5 text-white">
          <h3 className="font-bold">Yeni bir program mı?</h3>
          <p className="mt-1 text-sm text-white/80">Esnek ve takvimli programları keşfet.</p>
          <Link href="/kesfet" className="btn mt-3 bg-white text-navy-800 hover:bg-sky-50">Keşfet</Link>
        </div>
      </aside>

      {survey.mustAnswer && <SurveyModal schema={survey.schema} answers={answers} />}
    </div>
  );
}
