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
import { GROUP_LABELS, GROUP_SLUGS, LEVEL_LABELS, parseVideo, effectivePrice } from "@/lib/course-logic";
import { fmtRange, fmtMoney, initials } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { Price } from "@/components/site/CourseCard";
import { CtaBand } from "@/components/site/Sections";
import { Curriculum } from "./Curriculum";
import { BuyBox } from "./BuyBox";
import { MeetingDetailPopup } from "@/components/panel/MeetingDetailPopup";
import { studentMeeting } from "@/lib/data/student";
import { db } from "@/db";
import { periodEnrollments, periods } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCourseFull(slug);
  return { title: c?.title ?? "Program", description: c?.shortDescription };
}

const LESSON_ICON = { video: "play", quiz: "quiz", assign: "task", file: "file" } as const;

export default async function CoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ hata?: string }> }) {
  const { slug } = await params;
  const { hata } = await searchParams;
  const [course, user, general, contact] = await Promise.all([getCourseFull(slug), getCurrentUser(), getSetting("general"), getSetting("contact")]);
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
      {hata === "dolu" && <div className="bg-red-50 text-red-700 text-center text-sm py-2">Seçilen dönemin kontenjanı dolu.</div>}

      {/* Hero */}
      {/* Hero + içerik: sağdaki kart hero ile beyaz alanın sınırında durur ve kaydırınca takip eder */}
      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[560px] bg-navy-900 lg:h-[440px]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1fr_400px]">
          <div>
            <div className="flex min-h-[560px] flex-col justify-center py-10 text-white lg:min-h-[440px]">
                <Link href={`/${GROUP_SLUGS[course.group]}`} className="badge w-fit self-start bg-sky-400/20 text-sky-200">{GROUP_LABELS[course.group]}</Link>
                <h1 className="mt-3 text-3xl font-bold md:text-4xl">{course.title}</h1>
                {course.shortDescription && <p className="mt-3 text-lg text-white/85">{course.shortDescription}</p>}
                <div className="mt-5 flex flex-wrap gap-4 text-sm text-white/85">
                  {course.level && <span className="flex items-center gap-1.5"><Icon name="chart" className="size-4" /> {LEVEL_LABELS[course.level] ?? course.level}</span>}
                  {course.stats.totalText && <span className="flex items-center gap-1.5"><Icon name="clock" className="size-4" /> {course.stats.totalText}</span>}
                  {course.type === "meeting" ? (
                    <span className="flex items-center gap-1.5"><Icon name="video" className="size-4" /> {course.meetingMinutes} dk birebir görüşme</span>
                  ) : (
                    <span className="flex items-center gap-1.5"><Icon name="play" className="size-4" /> {course.stats.lessons} Ders</span>
                  )}
                  {course.language && <span className="flex items-center gap-1.5"><Icon name="globe" className="size-4" /> {course.language}</span>}
                </div>
                {course.instructor && (
                  <div className="mt-6 flex items-center gap-3">
                    {course.instructor.photoUrl ? (
                      <Image src={course.instructor.photoUrl} alt={course.instructor.name} width={56} height={56} className="size-14 rounded-full object-cover" />
                    ) : (
                      <div className="flex size-14 items-center justify-center rounded-full bg-sky-400 font-bold">{initials(course.instructor.name)}</div>
                    )}
                    <div>
                      <p className="text-xs uppercase tracking-wide text-white/60">Eğitmen</p>
                      <p className="font-semibold">{course.instructor.name}</p>
                      {course.instructor.title && <p className="text-sm text-white/70">{course.instructor.title}</p>}
                    </div>
                  </div>
                )}
            </div>
            <div className="space-y-12 py-12">
        <div className="space-y-12">
          {course.outcomes.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-navy-800">Bu Programda Neler Öğreneceksiniz?</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.outcomes.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {o}</li>
                ))}
              </ul>
            </div>
          )}
          {course.description && (
            <div>
              <h2 className="text-2xl font-bold text-navy-800">Bu programla gelişim yolculuğun:</h2>
              <div className="prose-fabo mt-2" dangerouslySetInnerHTML={{ __html: course.description }} />
            </div>
          )}
          {course.type !== "meeting" && <div>
            <h2 className="text-2xl font-bold text-navy-800">Program Modülleri</h2>
            <p className="mt-1 text-sm text-muted">
              {course.stats.modules} Modül • {course.stats.lessons} Bölüm{course.stats.quizzes > 0 && ` • ${course.stats.quizzes} Sınav`}{course.stats.assigns > 0 && ` • ${course.stats.assigns} Görev`}
            </p>
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
              <h2 className="text-2xl font-bold text-navy-800">Dönemler</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {course.periods.map((p) => {
                  const isOpen = open.some((o) => o.id === p.id);
                  return (
                    <div key={p.id} className="card">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-navy-800">{p.name}</h3>
                        <span className={`badge ${isOpen ? (p.enrolled >= p.capacity ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700") : "bg-surface text-muted"}`}>
                          {isOpen ? (p.enrolled >= p.capacity ? "Dolu" : "Kayıt açık") : "Kapalı"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{fmtRange(p.startDate, p.endDate)} · {p.capacity} kişi</p>
                      {p.description && <p className="mt-2 text-sm">{p.description}</p>}
                      {p.schedule.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-muted">
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
          {reqs.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-navy-800">Gereksinimler</h2>
              <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{reqs.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          {targets.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-navy-800">Bu Program Kimin İçin?</h2>
              <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{targets.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          {course.instructor && (
            <div>
              <h2 className="text-2xl font-bold text-navy-800">Eğitmen</h2>
              <div className="card mt-4 flex flex-col gap-4 sm:flex-row">
                {course.instructor.photoUrl ? (
                  <Image src={course.instructor.photoUrl} alt={course.instructor.name} width={120} height={120} className="size-28 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex size-28 shrink-0 items-center justify-center rounded-xl bg-navy-100 text-2xl font-bold text-navy-800">{initials(course.instructor.name)}</div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-navy-800">{course.instructor.name}</h3>
                  {course.instructor.title && <p className="text-sky-600">{course.instructor.title}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
                    {course.instructor.email && <a href={`mailto:${course.instructor.email}`} className="flex items-center gap-1 hover:text-sky-600"><Icon name="mail" className="size-4" /> {course.instructor.email}</a>}
                    {course.instructor.socialLinks.linkedin && <a href={course.instructor.socialLinks.linkedin} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="linkedin" className="size-4" /> LinkedIn</a>}
                    {course.instructor.socialLinks.instagram && <a href={course.instructor.socialLinks.instagram} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="instagram" className="size-4" /> Instagram</a>}
                    {course.instructor.socialLinks.website && <a href={course.instructor.socialLinks.website} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="globe" className="size-4" /> Web</a>}
                  </div>
                  {course.instructor.bio && <p className="mt-3 text-sm leading-relaxed">{course.instructor.bio}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
            </div>
          </div>
          <div className="lg:pt-24">
            <div id="satin-al" className="overflow-hidden rounded-2xl bg-white text-ink shadow-[0_30px_60px_-15px_rgba(10,21,48,.45),0_10px_20px_-10px_rgba(10,21,48,.3)] ring-1 ring-black/5 lg:sticky lg:top-[132px]">
              {preview.type === "youtube" || preview.type === "vimeo" ? (
                <iframe src={preview.embed} className="aspect-video w-full" allow="autoplay; fullscreen" allowFullScreen title="Önizleme" />
              ) : course.imageUrl ? (
                <Image src={course.imageUrl} alt={course.title} width={800} height={320} sizes="400px" className="aspect-[5/2] w-full object-cover" />
              ) : null}
              <div className="p-5">
                <div className="text-2xl"><Price course={course} /></div>
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
                  />
                )}
                <p className="mt-5 border-t border-line pt-4 text-sm font-semibold text-navy-800">Bu Program Dahilinde</p>
                {course.type === "meeting" ? (
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-muted">
                  <li className="flex items-center gap-2"><Icon name="video" className="size-4 text-sky-500" /> {course.meetingMinutes} dk birebir görüşme</li>
                  {course.periods[0] && course.periods[0].schedule.length > 1 && <li className="flex items-center gap-2"><Icon name="calendar" className="size-4 text-sky-500" /> {course.periods[0].schedule.length} haftalık görüşme</li>}
                  <li className="flex items-center gap-2"><Icon name="link" className="size-4 text-sky-500" /> Zoom bağlantısıyla</li>
                  <li className="flex items-center gap-2"><Icon name="globe" className="size-4 text-sky-500" /> Tüm cihazlardan katıl</li>
                </ul>
                ) : (
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-muted">
                  <li className="flex items-center gap-2"><Icon name="video" className="size-4 text-sky-500" /> {course.stats.videos} video ders</li>
                  {course.stats.totalText && <li className="flex items-center gap-2"><Icon name="clock" className="size-4 text-sky-500" /> {course.stats.totalText} içerik</li>}
                  {course.stats.quizzes > 0 && <li className="flex items-center gap-2"><Icon name="quiz" className="size-4 text-sky-500" /> {course.stats.quizzes} sınav</li>}
                  {course.stats.assigns > 0 && <li className="flex items-center gap-2"><Icon name="task" className="size-4 text-sky-500" /> {course.stats.assigns} görev</li>}
                  {course.lifetime && <li className="flex items-center gap-2"><Icon name="check" className="size-4 text-sky-500" /> Ömür boyu erişim</li>}
                  {course.hasCertificate && <li className="flex items-center gap-2"><Icon name="award" className="size-4 text-sky-500" /> Sertifika</li>}
                  <li className="flex items-center gap-2"><Icon name="globe" className="size-4 text-sky-500" /> Tüm cihazlarda izle</li>
                </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-4">
          <h2 className="mb-4 text-2xl font-bold text-navy-800">İlgili Programlar</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((c) => <CourseCard key={c.id} course={c} />)}</div>
        </section>
      )}
      {/* Mobil yapışkan alt çubuk */}
      {!enrolled && !course.closed && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(20,43,86,.08)] lg:hidden">
          <div className="text-lg"><Price course={course} /></div>
          <a href="#satin-al" className="btn-primary">{course.type === "meeting" ? "Görüşme Saati Seç" : course.isFree ? "Kitaplığa Ekle" : course.group === "takvimli" ? "Dönem Seçiniz" : "Hemen Kayıt Ol"}</a>
        </div>
      )}
      <CtaBand title={general.ctaTitle} text={general.ctaText} />
    </>
  );
}
