import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCourseFull, openPeriods, catalogCourses } from "@/lib/data/courses";
import { CourseCard } from "@/components/site/CourseCard";
import { getCurrentUser } from "@/lib/auth/session";
import { getEnrollment } from "@/lib/data/student";
import { ownsCourse } from "@/lib/data/teacher";
import { getSetting } from "@/lib/settings";
import { GROUP_LABELS, GROUP_SLUGS, LEVEL_LABELS, parseVideo, effectivePrice, hasActiveSale } from "@/lib/course-logic";
import { fmtRange, fmtMoney, initials } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { Price } from "@/components/site/CourseCard";
import { Curriculum } from "./Curriculum";
import { BuyBox } from "./BuyBox";
import { MeetingDetailPopup } from "@/components/panel/MeetingDetailPopup";
import { studentMeeting } from "@/lib/data/student";
import { isOnWaitlist } from "@/lib/waitlist";
import { WaitlistButton } from "@/components/site/WaitlistButton";
import { SoonRibbon } from "@/components/site/SoonRibbon";
import { MountainBackdrop } from "@/components/site/MountainBackdrop";
import { isFavorite } from "@/lib/favorites";
import { checkPrerequisite } from "@/lib/prerequisites";
import { checkSurveyGate, surveyGateMap } from "@/lib/survey-gate";
import { getCart } from "@/lib/cart";
import { FavoriteButton } from "@/components/site/FavoriteButton";
import { db } from "@/db";
import { periodEnrollments, periods } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCourseFull(slug);
  return { title: c?.title ?? "Program", description: c?.shortDescription };
}

const LESSON_ICON = { video: "play", quiz: "quiz", assign: "task", file: "file" } as const;

/** İkon rozetli bölüm başlığı */
function SectionHead({ icon, title, sub }: { icon: "check" | "book" | "layers" | "calendar" | "list" | "users" | "user" | "star"; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-navy-50 text-sky-600 ring-1 ring-sky-100"><Icon name={icon} className="size-5" /></span>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-navy-800 sm:text-2xl">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-navy-700">{sub}</p>}
      </div>
    </div>
  );
}

export default async function CoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ hata?: string }> }) {
  const { slug } = await params;
  const { hata } = await searchParams;
  const [course, user, contact] = await Promise.all([getCourseFull(slug), getCurrentUser(), getSetting("contact")]);
  if (!course) notFound();
  const isOwner = !!user && (user.role === "admin" || (user.role === "teacher" && (await ownsCourse(user, course.id))));
  if (course.status !== "published" && !isOwner) notFound();

  const enrollment = user ? await getEnrollment(user.id, course.id) : null;
  const enrolled = !!enrollment && enrollment.status === "active";
  let myPeriod: { name: string; startDate: string; endDate: string } | null = null;
  if (enrolled && user) {
    const [pe] = await db
      .select({ name: periods.name, startDate: periods.startDate, endDate: periods.endDate })
      .from(periodEnrollments)
      .innerJoin(periods, eq(periodEnrollments.periodId, periods.id))
      .where(and(eq(periodEnrollments.userId, user.id), eq(periods.courseId, course.id)))
      .limit(1);
    myPeriod = pe ?? null;
  }

  // Görüşme ürününde "Programı gör" sayfa açmaz; oturumları popup'ta gösterir
  let meetingPopup: { courseId: number; periodId: number; title: string; periodName: string; minutes: number; sessions: { index: number; title: string; start: string; end: string; link: string; attended: boolean }[] } | null = null;
  if (enrolled && user && course.type === "meeting") {
    const m = await studentMeeting(user.id, course.id, course.meetingMinutes, course.meetingLink);
    if (m) meetingPopup = { courseId: course.id, periodId: m.periodId, title: course.title, periodName: m.periodName, minutes: m.minutes, sessions: m.sessions.map((s) => ({ index: s.index, title: s.title, start: s.start.toISOString(), end: s.end.toISOString(), link: s.link, attended: s.attended })) };
  }
  const preview = parseVideo(course.previewVideo);
  const reqs = course.requirements.split("\n").map((s) => s.trim()).filter(Boolean);
  const targets = course.target.split("\n").map((s) => s.trim()).filter(Boolean);
  const open = openPeriods(course.periods);
  const waitlisted = user && !enrolled ? await isOnWaitlist(course.id, user.email) : false;
  const fav = user ? await isFavorite(user.id, course.id) : false;
  const prereq = enrolled ? { ok: true as const } : await checkPrerequisite({ userId: user?.id ?? null, courseId: course.id, cartCourseIds: (await getCart()).map((i) => i.courseId) });
  // Bağlı anket: giriş yapmış öğrenci doldurmadıysa satın alma kilitli; misafire yalnızca bilgi notu
  const gate = enrolled ? { ok: true as const } : await checkSurveyGate({ userId: user?.id ?? null, courseId: course.id });
  const gateSurveys = enrolled ? [] : (await surveyGateMap()).get(course.id) ?? [];
  const surveyReturn = encodeURIComponent(`/program/${course.slug}`);
  const wa = course.whatsappNumber || contact.whatsappNumber;
  const waMsg = (course.whatsappMessage || contact.whatsappMessage)
    .replace("{course_name}", course.title)
    .replace("{course_price}", course.isFree ? "Ücretsiz" : fmtMoney(effectivePrice(course)));
  const waUrl = wa ? `https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent(waMsg)}` : "";
  const related = (await catalogCourses()).filter((c) => c.id !== course.id).sort((a, b) => (a.group === course.group ? -1 : 0) - (b.group === course.group ? -1 : 0)).slice(0, 3);

  return (
    <>
      {enrolled && (
        <div className="bg-emerald-50 text-emerald-800">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2"><Icon name="check" className="size-4" /> Bu programa kayıtlısın.</span>
            {meetingPopup ? <MeetingDetailPopup {...meetingPopup} trigger={{ label: "Programı gör →", className: "font-semibold underline" }} /> : <Link href={`/kurs-izle/${course.id}`} className="font-semibold underline">Programı izle →</Link>}
          </div>
        </div>
      )}
      {course.status !== "published" && <div className="bg-amber-100 text-amber-800 text-center text-sm py-2">Taslak önizleme — yalnızca siz görüyorsunuz.</div>}
      {hata === "donem" && <div className="bg-red-50 text-red-700 text-center text-sm py-2">Lütfen bir dönem seçin.</div>}
      {hata === "kosul" && !prereq.ok && <div className="bg-red-50 text-red-700 text-center text-sm py-2">{prereq.message}</div>}
      {hata === "anket" && !gate.ok && <div className="bg-red-50 text-red-700 text-center text-sm py-2">{gate.message} <Link href={`/panel/anket/${gate.survey.id}?donus=${surveyReturn}`} className="font-semibold underline underline-offset-2">Testi doldur →</Link></div>}
      {hata === "yakinda" && course.comingSoon && <div className="bg-amber-50 text-amber-800 text-center text-sm py-2">Bu eğitim henüz açılmadı. Açılınca haber vermemizi isteyebilirsin.</div>}
      {hata === "dolu" && <div className="bg-red-50 text-red-700 text-center text-sm py-2">Üzgünüz, seçilen dönemin kontenjanı doldu. Başka bir dönem seçebilir ya da tekrar açılınca haber verilmesini isteyebilirsin.</div>}

      {/* Hero */}
      {/* Hero + içerik: sağdaki kart hero ile beyaz alanın sınırında durur ve kaydırınca takip eder */}
      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[560px] overflow-hidden bg-navy-900 lg:h-[440px]"><MountainBackdrop className="absolute inset-x-0 bottom-0 h-[70%] opacity-80" /></div>
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1fr_400px]">
          <div>
            <div className="flex min-h-[560px] flex-col justify-center py-10 text-white lg:min-h-[440px]">
                {/* Konum + grup çipleri */}
                <nav aria-label="Konum" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <ol className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 backdrop-blur-md">
                    <li><Link href="/" className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-white/75 transition hover:bg-white/10 hover:text-white"><Icon name="home" className="size-3.5" /> Anasayfa</Link></li>
                    <li className="flex items-center gap-1"><Icon name="chevronRight" className="size-3.5 text-white/40" /><Link href="/kesfet" className="rounded-full px-2 py-0.5 text-white/75 transition hover:bg-white/10 hover:text-white">Eğitimler</Link></li>
                    <li className="flex items-center gap-1"><Icon name="chevronRight" className="size-3.5 text-white/40" /><Link href={`/${GROUP_SLUGS[course.group]}`} className="rounded-full bg-white px-2.5 py-0.5 text-navy-800 shadow">{GROUP_LABELS[course.group]}</Link></li>
                  </ol>
                  {course.comingSoon && <span className="rounded-full bg-amber-400 px-3 py-1 text-navy-900 shadow">Yakında!</span>}
                  {hasActiveSale(course) && !course.comingSoon && <span className="rounded-full bg-rose-500 px-3 py-1 text-white shadow">İndirimde</span>}
                </nav>
                <h1 className="mt-5 text-3xl font-semibold tracking-tight [text-shadow:0_2px_12px_rgba(10,21,48,.8)] md:text-[2.6rem] md:leading-tight">{course.title}</h1>
                {course.shortDescription && <p className="mt-3 max-w-2xl text-lg text-white/85 [text-shadow:0_1px_8px_rgba(10,21,48,.8)]">{course.shortDescription}</p>}
                {/* Cam efektli bilgi çipleri */}
                <div className="mt-6 flex flex-wrap gap-2 text-sm">
                  {[
                    ...(course.level ? [{ icon: "chart" as const, text: LEVEL_LABELS[course.level] ?? course.level }] : []),
                    ...(course.stats.totalText ? [{ icon: "clock" as const, text: course.stats.totalText }] : []),
                    course.type === "meeting" ? { icon: "video" as const, text: `${course.meetingMinutes} dk birebir görüşme` } : { icon: "play" as const, text: `${course.stats.lessons} ders` },
                    ...(course.language ? [{ icon: "globe" as const, text: course.language }] : []),
                    ...(course.hasCertificate ? [{ icon: "award" as const, text: "Sertifikalı" }] : []),
                  ].map((c) => (
                    <span key={c.text} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-white/90 backdrop-blur-md"><Icon name={c.icon} className="size-4 text-sky-300" /> {c.text}</span>
                  ))}
                </div>
                {course.instructor && (
                  <div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 py-2 pl-2 pr-5 backdrop-blur-sm">
                    <span className="rounded-full bg-gradient-to-br from-sky-400 to-navy-500 p-0.5">
                      {course.instructor.photoUrl ? (
                        <Image src={course.instructor.photoUrl} alt={course.instructor.name} width={56} height={56} className="size-12 rounded-full object-cover ring-2 ring-navy-900" />
                      ) : (
                        <span className="flex size-12 items-center justify-center rounded-full bg-navy-800 font-bold ring-2 ring-navy-900">{initials(course.instructor.name)}</span>
                      )}
                    </span>
                    <span>
                      <span className="block text-[11px] uppercase tracking-wider text-white/60">Eğitmen</span>
                      <span className="block font-semibold leading-tight">{course.instructor.name}</span>
                      {course.instructor.title && <span className="block text-xs text-white/70">{course.instructor.title}</span>}
                    </span>
                  </div>
                )}
            </div>
            <div className="space-y-12 py-12">
        <div className="space-y-12">
          {course.outcomes.length > 0 && (
            <div>
              <SectionHead icon="check" title="Neler öğreneceksin?" sub="Program sonunda elinde olacak beceriler" />
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {course.outcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-3.5 text-sm text-navy-800 shadow-[0_8px_24px_-20px_rgba(20,43,86,.5)] transition hover:border-emerald-200 hover:bg-emerald-50/40">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="size-3.5" /></span>
                    <span className="leading-snug">{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {course.description && (
            <div>
              <SectionHead icon="book" title="Bu programla gelişim yolculuğun" />
              <div className="prose-fabo mt-5 rounded-3xl border border-line bg-gradient-to-br from-white to-sky-50/60 p-6 text-navy-800 sm:p-8" dangerouslySetInnerHTML={{ __html: course.description }} />
            </div>
          )}
          {course.type !== "meeting" && <div>
            <SectionHead icon="layers" title="Program modülleri" sub={`${course.stats.modules} modül · ${course.stats.lessons} bölüm${course.stats.quizzes > 0 ? ` · ${course.stats.quizzes} sınav` : ""}${course.stats.assigns > 0 ? ` · ${course.stats.assigns} görev` : ""}`} />
            <Curriculum
              modules={course.modules.map((m, mi) => ({
                id: m.id,
                title: m.title,
                lessons: m.lessons.map((l, li) => ({ id: l.id, title: `${mi + 1}.${li + 1}. ${l.title}`, type: l.type, icon: LESSON_ICON[l.type], duration: l.type === "video" ? l.duration : "", preview: l.preview })),
              }))}
            />
          </div>}
          {course.periods.length > 0 && course.type !== "meeting" && (
            <div>
              <SectionHead icon="calendar" title="Dönemler" sub="Kayıt açık dönemi seç, plana göre ilerle" />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {course.periods.map((p) => {
                  const isOpen = open.some((o) => o.id === p.id);
                  return (
                    <div key={p.id} className={`rounded-2xl border p-5 shadow-[0_8px_24px_-20px_rgba(20,43,86,.5)] ${isOpen && p.enrolled < p.capacity ? "border-emerald-200 bg-emerald-50/30" : "border-line bg-white"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-navy-800">{p.name}</h3>
                        <span className={`badge ${isOpen ? (p.enrolled >= p.capacity ? "bg-red-50 text-red-700" : "bg-emerald-500 text-white") : "bg-surface text-muted"}`}>
                          {isOpen ? (p.enrolled >= p.capacity ? "Dolu" : "Kayıt açık") : "Kapalı"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-navy-700">{fmtRange(p.startDate, p.endDate)} · {p.capacity} kişi</p>
                      {p.description && <p className="mt-2 text-sm">{p.description}</p>}
                      {p.schedule.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-navy-700">
                          {p.schedule.slice(0, 6).map((s, i) => (
                            <li key={i} className="flex items-center gap-2"><Icon name="calendar" className="size-3.5" /> {s.date}{s.time && ` ${s.time}`} — {s.title}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(reqs.length > 0 || targets.length > 0) && (
            <div className="grid gap-6 md:grid-cols-2">
              {reqs.length > 0 && (
                <div className="rounded-3xl border border-line bg-white p-6 shadow-[0_8px_24px_-20px_rgba(20,43,86,.5)]">
                  <SectionHead icon="list" title="Gereksinimler" />
                  <ul className="mt-4 space-y-2 text-sm text-navy-800">{reqs.map((r, i) => <li key={i} className="flex items-start gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" />{r}</li>)}</ul>
                </div>
              )}
              {targets.length > 0 && (
                <div className="rounded-3xl border border-line bg-white p-6 shadow-[0_8px_24px_-20px_rgba(20,43,86,.5)]">
                  <SectionHead icon="users" title="Kimin için?" />
                  <ul className="mt-4 space-y-2 text-sm text-navy-800">{targets.map((r, i) => <li key={i} className="flex items-start gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" />{r}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          {course.instructor && (
            <div>
              <SectionHead icon="user" title="Eğitmen" />
              <div className="relative mt-5 flex flex-col gap-5 overflow-hidden rounded-3xl border border-line bg-white p-6 shadow-[0_8px_24px_-20px_rgba(20,43,86,.5)] sm:flex-row">
                <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-sky-100/70 blur-3xl" />
                {course.instructor.photoUrl ? (
                  <Image src={course.instructor.photoUrl} alt={course.instructor.name} width={120} height={120} className="relative size-28 shrink-0 rounded-2xl object-cover ring-4 ring-sky-50" />
                ) : (
                  <div className="relative flex size-28 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-700 to-sky-500 text-2xl font-bold text-white">{initials(course.instructor.name)}</div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-navy-800">{course.instructor.name}</h3>
                  {course.instructor.title && <p className="text-sky-600">{course.instructor.title}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-navy-700">
                    {course.instructor.email && <a href={`mailto:${course.instructor.email}`} className="flex items-center gap-1 hover:text-sky-600"><Icon name="mail" className="size-4" /> {course.instructor.email}</a>}
                    {course.instructor.socialLinks.linkedin && <a href={course.instructor.socialLinks.linkedin} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="linkedin" className="size-4" /> LinkedIn</a>}
                    {course.instructor.socialLinks.instagram && <a href={course.instructor.socialLinks.instagram} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="instagram" className="size-4" /> Instagram</a>}
                    {course.instructor.socialLinks.website && <a href={course.instructor.socialLinks.website} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="globe" className="size-4" /> Web</a>}
                  </div>
                  {course.instructor.bio && <p className="mt-3 text-sm leading-relaxed text-navy-800">{course.instructor.bio}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
            </div>
          </div>
          <div className="lg:pt-24">
            <div id="satin-al" className="overflow-hidden rounded-3xl bg-white text-ink shadow-[0_30px_60px_-15px_rgba(10,21,48,.45),0_10px_20px_-10px_rgba(10,21,48,.3)] ring-1 ring-black/5 lg:sticky lg:top-[132px]">
              {preview.type === "youtube" || preview.type === "vimeo" ? (
                <iframe src={preview.embed} className="aspect-video w-full" allow="autoplay; fullscreen" allowFullScreen title="Önizleme" />
              ) : course.imageUrl ? (
                <div className="relative overflow-hidden">
                  <Image src={course.imageUrl} alt={course.title} width={800} height={450} sizes="400px" className="aspect-video w-full object-cover" />
                  {course.comingSoon && <SoonRibbon size="md" />}
                </div>
              ) : null}
              <div className="p-5 sm:p-6">
                <div className="flex items-end justify-between gap-3">
                  <div className="text-3xl"><Price course={course} /></div>
                  {hasActiveSale(course) && !course.comingSoon && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600">%{Math.round((1 - effectivePrice(course) / Number(course.price)) * 100)} indirim</span>}
                  {course.isFree && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Hemen başla</span>}
                </div>
                {enrolled ? (
                  <>
                    {myPeriod && (
                      <div className="mt-3 rounded-lg bg-sky-50 p-3 text-sm">
                        <p className="font-semibold text-navy-800">{course.type === "meeting" ? "Kayıtlı görüşme" : "Kayıtlı Dönem"}: {myPeriod.name}</p>
                        {course.type === "meeting" ? (
                          myPeriod.startDate !== myPeriod.endDate && <p className="text-muted">Haftalık, {fmtRange(myPeriod.startDate, myPeriod.endDate)}</p>
                        ) : (
                          <p className="text-muted">{fmtRange(myPeriod.startDate, myPeriod.endDate)}</p>
                        )}
                      </div>
                    )}
                    {meetingPopup ? <MeetingDetailPopup {...meetingPopup} trigger={{ label: "Programı Gör", className: "btn-primary mt-4 w-full py-3", icon: "video" }} /> : <Link href={`/kurs-izle/${course.id}`} className="btn-primary mt-4 w-full py-3"><Icon name="play" className="size-4" /> Programı İzle</Link>}
                  </>
                ) : course.closed ? (
                  <p className="mt-4 rounded-lg bg-surface p-3 text-center text-sm text-muted">Bu eğitim artık yayında değil.</p>
                ) : course.comingSoon ? (
                  <div className="mt-4 space-y-3">
                    <p className="flex items-start gap-2 rounded-lg bg-surface p-3 text-sm text-navy-800"><Icon name="clock" className="mt-0.5 size-4 shrink-0 text-amber-500" /> Bu eğitim henüz aktif değil; yakında açılacak. Açılınca ilk sana haber verelim.</p>
                    <WaitlistButton courseId={course.id} loggedIn={!!user} waitlisted={waitlisted} userEmail={user?.email ?? ""} comingSoon />
                  </div>
                ) : (
                  <BuyBox
                    courseId={course.id}
                    isFree={course.isFree}
                    periodBased={course.group === "takvimli" || course.type === "meeting"}
                    meeting={course.type === "meeting"}
                    minutes={course.meetingMinutes}
                    periods={open.map((p) => ({ id: p.id, name: p.name, range: course.type === "meeting" ? (p.schedule.length > 1 ? `${p.schedule.length} görüşme · her görüşme ${course.meetingMinutes} dk` : `${course.meetingMinutes} dk`) : fmtRange(p.startDate, p.endDate), left: p.capacity - p.enrolled, full: p.enrolled >= p.capacity, schedule: p.schedule.length, date: p.startDate, time: p.startTime?.slice(0, 5) ?? "", sessions: p.schedule.map((s) => s.date) }))}
                    buttonType={course.buttonType}
                    whatsappUrl={waUrl}
                    loggedIn={!!user}
                    waitlisted={waitlisted}
                    userEmail={user?.email ?? ""}
                    locked={!prereq.ok ? { message: prereq.message, href: `/program/${prereq.required.slug}`, cta: `${prereq.required.title} eğitimine git` } : !gate.ok ? { message: gate.message, href: `/panel/anket/${gate.survey.id}?donus=${surveyReturn}`, cta: "Hedef testini doldur" } : null}
                  />
                )}
                {!enrolled && !course.closed && !user && gateSurveys.length > 0 && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="survey" className="mt-0.5 size-3.5 shrink-0" /> Bu eğitim için üye olduktan sonra önce "{gateSurveys[0].title}" hedef testini doldurman istenir.</p>
                )}
                {!enrolled && (
                  <div className="mt-3">
                    <FavoriteButton courseId={course.id} initial={fav} variant="inline" />
                    {!course.isFree && !hasActiveSale(course) && <p className="mt-1 text-center text-[11px] text-muted">İndirime girerse sana haber veririz.</p>}
                  </div>
                )}
                <p className="mt-6 border-t border-line pt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Bu program dahilinde</p>
                {course.type === "meeting" ? (
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px] text-navy-800">
                  <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="video" className="size-3.5" /></span> {course.meetingMinutes} dk birebir görüşme</li>
                  {course.periods[0] && course.periods[0].schedule.length > 1 && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="calendar" className="size-3.5" /></span> {course.periods[0].schedule.length} haftalık görüşme</li>}
                  <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="link" className="size-3.5" /></span> Zoom bağlantısıyla</li>
                  <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="globe" className="size-3.5" /></span> Tüm cihazlardan katıl</li>
                </ul>
                ) : (
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px] text-navy-800">
                  <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="video" className="size-3.5" /></span> {course.stats.videos} video ders</li>
                  {course.stats.totalText && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="clock" className="size-3.5" /></span> {course.stats.totalText} içerik</li>}
                  {course.stats.quizzes > 0 && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="quiz" className="size-3.5" /></span> {course.stats.quizzes} sınav</li>}
                  {course.stats.assigns > 0 && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="task" className="size-3.5" /></span> {course.stats.assigns} görev</li>}
                  {course.lifetime && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="check" className="size-3.5" /></span> Ömür boyu erişim</li>}
                  {course.hasCertificate && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="award" className="size-3.5" /></span> Sertifika</li>}
                  <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="globe" className="size-3.5" /></span> Tüm cihazlarda izle</li>
                </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-4">
          <div className="mb-6"><SectionHead icon="star" title="İlgili programlar" sub="Bu eğitimle birlikte iyi giden diğer programlar" /></div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((c) => <CourseCard key={c.id} course={c} />)}</div>
        </section>
      )}
      {/* Mobil yapışkan alt çubuk */}
      {!enrolled && !course.closed && !course.comingSoon && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(20,43,86,.08)] lg:hidden">
          <div className="text-lg"><Price course={course} /></div>
          <a href="#satin-al" className="btn-primary">{course.type === "meeting" ? "Görüşme Saati Seç" : course.isFree ? "Kitaplığa Ekle" : course.group === "takvimli" ? "Dönem Seçiniz" : "Hemen Kayıt Ol"}</a>
        </div>
      )}
    </>
  );
}
