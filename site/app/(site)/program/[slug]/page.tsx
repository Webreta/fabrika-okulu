import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCourseFull, openPeriods, catalogCourses, listCourses } from "@/lib/data/courses";
import { CourseCard, PromoCourseCard } from "@/components/site/CourseCard";
import { getCurrentUser } from "@/lib/auth/session";
import { getEnrollment } from "@/lib/data/student";
import { ownsCourse } from "@/lib/data/teacher";
import { getSetting } from "@/lib/settings";
import { GROUP_LABELS, GROUP_SLUGS, parseVideo, effectivePrice, hasActiveSale, isPreorder, validDuration } from "@/lib/course-logic";
import { fmtRange, fmtMoney, fmtDay, initials, todayISO, waLink } from "@/lib/format";
import { Icon, type IconName } from "@/components/site/Icon";
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
import { cleanHtml } from "@/lib/sanitize";
import { checkPrerequisite } from "@/lib/prerequisites";
import { checkSurveyGate, surveyGateMap } from "@/lib/survey-gate";
import { getCart } from "@/lib/cart";
import { FavoriteButton } from "@/components/site/FavoriteButton";
import { db } from "@/db";
import { periodEnrollments, periods } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { pageMeta } from "@/lib/seo";
import { toId } from "@/lib/ids";
import { personalDiscountPercent } from "@/lib/recommendations";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCourseFull(slug);
  // Yayında olmayan eğitimin adı/görseli paylaşım etiketlerine yazılmaz
  if (!c || c.status !== "published") return pageMeta({ title: "Program", noindex: true });
  return pageMeta({ title: c.title, description: c.shortDescription, path: `/program/${c.slug}`, image: c.imageUrl });
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

/**
 * İçerik panelindeki bölüm: solda ray üzerinde ikon düğümü, sağda başlık + içerik.
 * Düğümler dikey çizgiyle birbirine bağlanır; bölümler ayrı kartlar değil tek panelin adımları gibi okunur.
 * Mobilde ray gizlenir, ikon başlığın yanına küçülerek gelir.
 */
function Block({ icon, title, sub, last = false, children }: { icon: IconName; title: string; sub?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section className="relative flex gap-5">
      <div className="hidden shrink-0 flex-col items-center sm:flex" aria-hidden>
        <span className="relative z-10 flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-800 to-sky-500 text-white shadow-[0_10px_22px_-8px_rgba(20,43,86,.65)] ring-4 ring-white"><Icon name={icon} className="size-5" /></span>
        {!last && <span className="w-px flex-1 bg-gradient-to-b from-sky-300 via-sky-100 to-line" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-10"}`}>
        <div className="flex items-center gap-3 sm:min-h-11">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-800 to-sky-500 text-white sm:hidden" aria-hidden><Icon name={icon} className="size-4" /></span>
          <div>
            <h2 className="text-lg font-bold leading-tight tracking-tight text-navy-800 sm:text-xl">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-navy-700">{sub}</p>}
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

/** Panel içi satır: yumuşak zeminli, ince çerçeveli madde (Kimin için / Ne öğreneceksin) */
const ITEM = "flex items-start gap-3 rounded-2xl bg-surface/70 px-4 py-2.5 text-[13px] text-navy-800 ring-1 ring-line/70 transition hover:bg-white hover:ring-sky-200";

export default async function CoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ hata?: string; kayit?: string; donem?: string }> }) {
  const { slug } = await params;
  const { hata, kayit, donem } = await searchParams;
  const [course, user, contact] = await Promise.all([getCourseFull(slug), getCurrentUser(), getSetting("contact")]);
  if (!course) notFound();
  const isOwner = !!user && (user.role === "admin" || (user.role === "teacher" && (await ownsCourse(user, course.id))));
  if (course.status !== "published" && !isOwner) notFound();

  const enrollment = user ? await getEnrollment(user.id, course.id) : null;
  const enrolled = !!enrollment && enrollment.status === "active";
  // Erken kayıt: açılış tarihi gelecekte. awaiting: öğrenci kayıtlı ama eğitim henüz açılmadı
  const early = isPreorder(course) && !course.comingSoon && !course.closed && course.type !== "meeting";
  const awaiting = enrolled && early && !enrollment?.startedAt;
  const opensDay = fmtDay(course.opensAt, true);
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
  // Misafirken başlatılan kayıt (ücretsiz eğitim / görüşme koltuğu) girişten sonra sürdürülür: niyet, düğmeye basıldığında
  // yazılan çerezde durur (adresle tetiklenemez); sayfa seçili dönemi geri getirir ve kaydı kendiliğinden tamamlar.
  let intent: { courseId?: number; periodId?: number | null } = {};
  try {
    const v: unknown = JSON.parse((await cookies()).get("fabo_intent")?.value ?? "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) intent = v as typeof intent;
  } catch {}
  const intentMine = intent.courseId === course.id;
  const wantedPeriod = toId(donem) ?? (intentMine ? toId(intent.periodId) : null);
  const resume = kayit === "1" && !hata && !!user && !enrolled && intentMine && course.isFree;
  // Kişiye özel indirim (kurs önerilerinden): sepette uygulanan fiyatla aynı hesap
  const personalPercent = user && !enrolled && !course.isFree && !course.comingSoon ? Math.max(0, Math.min(100, await personalDiscountPercent(user.id, course.id))) : 0;
  const personalPrice = Math.round(effectivePrice(course) * (1 - personalPercent / 100) * 100) / 100;
  const preview = parseVideo(course.previewVideo);
  const hasVideo = preview.type === "youtube" || preview.type === "vimeo";
  const targets = course.target.split("\n").map((s) => s.trim()).filter(Boolean);
  const open = openPeriods(course.periods);
  // Misafirken seçilen dönem/koltuk, giriş yapılana kadar dolmuş ya da kapanmış olabilir: kayıt denenmez, neden söylenir
  const wantedGone = resume && !!wantedPeriod && !open.some((p) => p.id === wantedPeriod && p.enrolled + p.held < p.capacity);
  // Canlı oturum sayısı: bitmemiş dönemlerin en uzun takvimi, yoksa tüm dönemlerin (katalog kartıyla aynı kural)
  const livePeriods = course.periods.filter((p) => p.endDate >= todayISO());
  const sessionCount = Math.max(0, ...(livePeriods.length ? livePeriods : course.periods).map((p) => p.schedule.length));
  const waitlisted = user && !enrolled ? await isOnWaitlist(course.id, user.email) : false;
  // Dönemli eğitimde / görüşmede açık dönem yok ya da hepsi dolu
  const noSeat = (course.group === "takvimli" || course.type === "meeting") && (open.length === 0 || open.every((p) => p.enrolled + p.held >= p.capacity));
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
  // waLink ülke kodunu tamamlar (0532… → 90532…); yalnızca rakam dışını atmak geçersiz adres üretiyordu
  const waUrl = wa ? `${waLink(wa)}?text=${encodeURIComponent(waMsg)}` : "";
  // Öne çıkan eğitim (editörde seçilir): yayında ve kapalı değilse eğitmen künyesinden sonra yatay kart
  const promo = course.promoCourseId && course.promoCourseId !== course.id ? (await listCourses({ ids: [course.promoCourseId] })).find((c) => !c.closed) ?? null : null;
  const related = (await catalogCourses()).filter((c) => c.id !== course.id && c.id !== promo?.id).sort((a, b) => (a.group === course.group ? -1 : 0) - (b.group === course.group ? -1 : 0)).slice(0, 3);

  // İçerik paneli bölümleri: sırayla tek panelde, solda birbirine bağlı düğümlerle
  const blocks: { key: string; icon: IconName; title: string; sub?: string; body: React.ReactNode }[] = [];
  if (targets.length > 0) blocks.push({
    key: "kimin", icon: "users", title: "Kimin için?",
    body: (
      <ul className={`grid gap-2.5 ${targets.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {targets.map((r, i) => (
          <li key={i} className={ITEM}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"><Icon name="user" className="size-3.5" /></span>
            <span className="leading-snug">{r}</span>
          </li>
        ))}
      </ul>
    ),
  });
  if (course.outcomes.length > 0) blocks.push({
    key: "ogren", icon: "check", title: "Ne öğreneceksin?", sub: "Bu eğitim sonunda şu konularda yetkinlik kazanacaksın",
    body: (
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {course.outcomes.map((o, i) => (
          <li key={i} className={ITEM}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="size-3.5" /></span>
            <span className="leading-snug">{o}</span>
          </li>
        ))}
      </ul>
    ),
  });
  if (course.description) blocks.push({
    key: "yolculuk", icon: "book", title: "Bu programla gelişim yolculuğun",
    body: <div className="prose-fabo rounded-2xl border-l-4 border-sky-400 bg-gradient-to-br from-sky-50/80 to-white px-5 py-1.5 text-sm text-navy-800 ring-1 ring-sky-100 sm:px-6" dangerouslySetInnerHTML={{ __html: cleanHtml(course.description) }} />,
  });
  if (course.type !== "meeting") blocks.push({
    key: "moduller", icon: "layers", title: "Program modülleri",
    sub: `${course.stats.modules} modül · ${course.stats.lessons} bölüm${course.stats.quizzes > 0 ? ` · ${course.stats.quizzes} sınav` : ""}${course.stats.assigns > 0 ? ` · ${course.stats.assigns} görev` : ""}`,
    body: (
      <Curriculum
        modules={course.modules.map((m, mi) => ({
          id: m.id,
          title: m.title,
          showcase: m.showcase,
          count: m.lessons.length,
          // Ders adları yalnızca önizleme modülünde istemciye gider; diğer modüllerde yalnızca bölüm sayısı
          lessons: m.showcase ? m.lessons.map((l, li) => ({ id: l.id, title: `${mi + 1}.${li + 1}. ${l.title}`, type: l.type, icon: LESSON_ICON[l.type], duration: l.type === "video" ? validDuration(l.duration) : "" })) : [],
        }))}
      />
    ),
  });
  if (course.periods.length > 0 && course.type !== "meeting") blocks.push({
    key: "donemler", icon: "calendar", title: "Dönemler", sub: "Kayıt açık dönemi seç, plana göre ilerle",
    body: (
      // Her dönem tam genişlikte: solda başlangıç → bitiş tarih kutuları, altında oturumlar tarih rozetleriyle
      <div className="space-y-3">
        {course.periods.map((p) => {
          const isOpen = open.some((o) => o.id === p.id);
          // Doluluk: kayıtlı + bekleyen siparişlerin tuttuğu koltuk
          const taken = p.enrolled + p.held;
          const free = isOpen && taken < p.capacity;
          const [sd, sm] = fmtDay(p.startDate).split(" ");
          const [ed, em] = fmtDay(p.endDate).split(" ");
          return (
            <div key={p.id} className={`overflow-hidden rounded-2xl ring-1 ${free ? "bg-emerald-50/60 ring-emerald-200" : "bg-surface/70 ring-line/70"}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
                <div className="flex shrink-0 items-center gap-2" title={fmtRange(p.startDate, p.endDate)}>
                  <span className="flex size-14 flex-col items-center justify-center rounded-xl bg-navy-800 text-white shadow-[0_8px_16px_-8px_rgba(20,43,86,.7)]">
                    <span className="text-lg font-extrabold leading-none">{sd}</span>
                    <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-200">{sm}</span>
                  </span>
                  <Icon name="arrowRight" className="size-4 text-navy-300" />
                  <span className="flex size-14 flex-col items-center justify-center rounded-xl bg-white text-navy-800 ring-1 ring-navy-200">
                    <span className="text-lg font-extrabold leading-none">{ed}</span>
                    <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-600">{em}</span>
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-navy-800">{p.name}</h3>
                  <p className="mt-0.5 text-[13px] text-navy-700">
                    <b className="font-semibold text-navy-800">{fmtRange(p.startDate, p.endDate)}</b> · {p.capacity} kişilik kontenjan{free && ` · ${p.capacity - taken} yer kaldı`}
                  </p>
                  {p.description && <p className="mt-1 text-[13px] text-navy-700">{p.description}</p>}
                </div>
                <span className={`badge shrink-0 ${isOpen ? (taken >= p.capacity ? "bg-red-50 text-red-700" : "bg-emerald-500 text-white") : "bg-white text-muted ring-1 ring-line"}`}>
                  {isOpen ? (taken >= p.capacity ? "Dolu" : "Kayıt açık") : "Kapalı"}
                </span>
              </div>
              {p.schedule.length > 0 && (
                <div className="border-t border-line/70 bg-white/60 p-4 sm:px-5">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Canlı oturumlar</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {p.schedule.slice(0, 8).map((sc, i) => {
                      const [d, m] = fmtDay(sc.date).split(" ");
                      return (
                        <li key={i} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-line/70">
                          <span className="flex shrink-0 flex-col items-center rounded-lg bg-sky-50 px-2.5 py-1 text-center ring-1 ring-sky-100">
                            <span className="whitespace-nowrap text-[13px] font-extrabold leading-tight text-navy-800">{d} {m}</span>
                            {sc.time && <span className="text-[11px] font-semibold leading-tight text-sky-700">{sc.time}</span>}
                          </span>
                          <span className="min-w-0 text-[13px] font-medium leading-snug text-navy-800">{sc.title || "Canlı oturum"}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {p.schedule.length > 8 && <p className="mt-2 text-xs text-muted">+{p.schedule.length - 8} oturum daha</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    ),
  });
  if (course.instructor) blocks.push({
    key: "egitmen", icon: "user", title: "Eğitmen",
    body: (
      <div className="flex flex-col gap-5 rounded-2xl bg-surface/70 p-5 ring-1 ring-line/70 sm:flex-row">
        {course.instructor.photoUrl ? (
          <Image src={course.instructor.photoUrl} alt={course.instructor.name} width={120} height={120} className="size-24 shrink-0 rounded-2xl object-cover ring-4 ring-white" />
        ) : (
          <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-700 to-sky-500 text-2xl font-bold text-white ring-4 ring-white">{initials(course.instructor.name)}</div>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-bold text-navy-800">{course.instructor.name}</h3>
          {course.instructor.title && <p className="text-[13px] font-medium text-sky-600">{course.instructor.title}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-[13px] text-navy-700">
            {course.instructor.email && <a href={`mailto:${course.instructor.email}`} className="flex items-center gap-1 hover:text-sky-600"><Icon name="mail" className="size-4" /> {course.instructor.email}</a>}
            {course.instructor.socialLinks.linkedin && <a href={course.instructor.socialLinks.linkedin} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="linkedin" className="size-4" /> LinkedIn</a>}
            {course.instructor.socialLinks.instagram && <a href={course.instructor.socialLinks.instagram} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="instagram" className="size-4" /> Instagram</a>}
            {course.instructor.socialLinks.website && <a href={course.instructor.socialLinks.website} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-sky-600"><Icon name="globe" className="size-4" /> Web</a>}
          </div>
          {course.instructor.bio && <p className="mt-3 text-[13px] leading-relaxed text-navy-800">{course.instructor.bio}</p>}
        </div>
      </div>
    ),
  });
  // Sıra: eğitmen künyesi modüllerin hemen ardından ve panelin en altında; dönemler bu yüzden modüllerden önce gelir
  if (promo) blocks.push({
    key: "one-cikan", icon: "star", title: course.promoTitle || "Bu eğitmenden mentorluk al",
    body: <PromoCourseCard course={promo} />,
  });
  const ORDER = ["kimin", "ogren", "yolculuk", "donemler", "moduller", "egitmen", "one-cikan"];
  blocks.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  return (
    <>
      {awaiting && (
        <div className="bg-violet-50 text-violet-800">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2"><Icon name="check" className="size-4" /> Erken kaydın alındı. Eğitim {opensDay} tarihinde aktifleşecek.</span>
            <Link href="/panel/egitim" className="font-semibold underline">Kitaplığım →</Link>
          </div>
        </div>
      )}
      {enrolled && !awaiting && (
        <div className="bg-emerald-50 text-emerald-800">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2"><Icon name="check" className="size-4" /> Bu programa kayıtlısın.</span>
            {meetingPopup ? <MeetingDetailPopup {...meetingPopup} trigger={{ label: "Programı gör →", className: "font-semibold underline" }} /> : <Link href={`/kurs-izle/${course.id}`} className="font-semibold underline">Programı izle →</Link>}
          </div>
        </div>
      )}
      {course.status !== "published" && <div className="bg-amber-100 text-amber-800 text-center text-sm py-2">Taslak önizleme — yalnızca siz görüyorsunuz.</div>}
      {hata === "donem" && <div className="bg-red-50 text-red-700 text-center text-sm py-2">Lütfen bir dönem seçin.</div>}
      {hata === "kapali" && <div className="bg-red-50 text-red-700 text-center text-sm py-2">Seçilen dönemin kaydı kapandı ya da tarihi geçti. Açık dönemlerden birini seçebilirsin.</div>}
      {hata === "kosul" && !prereq.ok && <div className="bg-red-50 text-red-700 text-center text-sm py-2">{prereq.message}</div>}
      {hata === "anket" && !gate.ok && <div className="bg-red-50 text-red-700 text-center text-sm py-2">{gate.message} <Link href={`/panel/anket/${gate.survey.id}?donus=${surveyReturn}`} className="font-semibold underline underline-offset-2">Testi doldur →</Link></div>}
      {hata === "yakinda" && course.comingSoon && <div className="bg-amber-50 text-amber-800 text-center text-sm py-2">Bu eğitim henüz açılmadı. Açılınca haber vermemizi isteyebilirsin.</div>}
      {wantedGone && <div className="bg-red-50 text-red-700 text-center text-sm py-2">Seçtiğin {course.type === "meeting" ? "görüşme saati" : "dönem"} sen giriş yapana kadar doldu ya da kapandı. Aşağıdan başka bir {course.type === "meeting" ? "saat" : "dönem"} seçebilirsin.</div>}
      {hata === "dolu" && <div className="bg-red-50 text-red-700 text-center text-sm py-2">Üzgünüz, seçilen dönemin kontenjanı doldu. Başka bir dönem seçebilir ya da tekrar açılınca haber verilmesini isteyebilirsin.</div>}

      {/* Hero */}
      {/* Hero + içerik: sağdaki kart hero ile beyaz alanın sınırında durur ve kaydırınca takip eder */}
      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[560px] overflow-hidden bg-navy-900 lg:h-[440px]"><MountainBackdrop className="absolute inset-x-0 bottom-0 h-[70%] opacity-80" /></div>
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1fr_400px]">
          {/* min-w-0: uzun (kesilen) ders adları sütunu ekran genişliğinin dışına itmesin (telefonda yatay kayma) */}
          <div className="min-w-0">
            <div className="flex min-h-[560px] flex-col justify-center py-10 text-white lg:min-h-[440px]">
                {/* Konum + grup çipleri */}
                <nav aria-label="Konum" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <ol className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 backdrop-blur-md">
                    <li><Link href="/" className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-white/75 transition hover:bg-white/10 hover:text-white"><Icon name="home" className="size-3.5" /> Anasayfa</Link></li>
                    <li className="flex items-center gap-1"><Icon name="chevronRight" className="size-3.5 text-white/40" /><Link href="/kesfet" className="rounded-full px-2 py-0.5 text-white/75 transition hover:bg-white/10 hover:text-white">Eğitimler</Link></li>
                    <li className="flex items-center gap-1"><Icon name="chevronRight" className="size-3.5 text-white/40" /><Link href={`/${GROUP_SLUGS[course.group]}`} className="rounded-full bg-white px-2.5 py-0.5 text-navy-800 shadow">{GROUP_LABELS[course.group]}</Link></li>
                  </ol>
                  {course.comingSoon && <span className="rounded-full bg-amber-400 px-3 py-1 text-navy-900 shadow">Yakında!</span>}
                  {early && <span className="rounded-full bg-violet-600 px-3 py-1 text-white shadow">Erken Kayıt</span>}
                  {hasActiveSale(course) && !course.comingSoon && !early && <span className="rounded-full bg-rose-500 px-3 py-1 text-white shadow">İndirimde</span>}
                </nav>
                <h1 className="mt-5 text-3xl font-semibold tracking-tight [text-shadow:0_2px_12px_rgba(10,21,48,.8)] md:text-[2.6rem] md:leading-tight">{course.title}</h1>
                {course.shortDescription && <p className="mt-3 max-w-2xl text-lg text-white/85 [text-shadow:0_1px_8px_rgba(10,21,48,.8)]">{course.shortDescription}</p>}
                {/* Cam efektli bilgi çipleri: yalnızca modül ve canlı oturum sayısı (erken kayıtta ayrıca açılış tarihi) */}
                <div className="mt-6 flex flex-wrap gap-2 text-sm">
                  {[
                    ...(early ? [{ icon: "calendar" as const, text: `Açılış: ${opensDay}` }] : []),
                    ...(course.stats.modules > 0 ? [{ icon: "layers" as const, text: `${course.stats.modules} modül` }] : []),
                    ...(sessionCount > 0 ? [{ icon: "video" as const, text: `${sessionCount} canlı oturum` }] : []),
                  ].map((c) => (
                    <span key={c.text} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-white/90 backdrop-blur-md"><Icon name={c.icon} className="size-4 text-sky-300" /> {c.text}</span>
                  ))}
                </div>
            </div>
            {/* İçerik paneli: tüm bölümler tek çerçevede, solda birbirine bağlı düğümlerle; altta erişim notu şeridi */}
            <div className="py-10 lg:py-12">
              <div className="relative overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_80px_-45px_rgba(20,43,86,.6)] ring-1 ring-navy-900/5">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-navy-800 via-sky-400 to-navy-800" />
                <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-sky-200/40 blur-3xl" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40 [background-image:radial-gradient(rgba(20,43,86,.13)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
                <div className="relative p-6 sm:p-9">
                  {blocks.map((b, i) => (
                    <Block key={b.key} icon={b.icon} title={b.title} sub={b.sub} last={i === blocks.length - 1}>{b.body}</Block>
                  ))}
                </div>
                {/* Erişim süresi notu: tüm eğitimlerde sabit metin (görüşme ürününde içerik olmadığı için yok) */}
                {course.type !== "meeting" && (
                  <p className="relative flex items-center gap-3 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-700 px-6 py-3.5 text-[13px] font-medium text-white sm:px-9">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sky-300 ring-1 ring-white/15"><Icon name="clock" className="size-4" /></span>
                    Eğitimi tamamladıktan sonra tüm içeriğe 1 ay süreyle erişebilirsin.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="min-w-0 lg:pt-24">
            {/* Satın alma kartı iki parça: görsel normal akışta kalır (kaydırınca yukarıda kalır, takip etmez);
                alttaki gövde yapışkandır ve site başlığının altında takip eder. Gövde görselin alt kenarına biner, tek kart gibi görünür. */}
            {hasVideo ? (
              <div className="overflow-hidden rounded-3xl bg-navy-900 shadow-[0_20px_40px_-20px_rgba(10,21,48,.5)] ring-1 ring-black/5">
                <iframe src={preview.type === "youtube" || preview.type === "vimeo" ? preview.embed : undefined} className="aspect-video w-full" allow="autoplay; fullscreen" allowFullScreen title="Önizleme" />
              </div>
            ) : course.imageUrl ? (
              <div className="relative overflow-hidden rounded-t-3xl bg-navy-50 shadow-[0_20px_40px_-20px_rgba(10,21,48,.5)] ring-1 ring-black/5">
                <Image src={course.imageUrl} alt={course.title} width={800} height={450} sizes="400px" className="aspect-video w-full object-cover" />
                {/* Alt kenar gölgesi: görsel açık renkli olsa da üstüne binen gövdenin yuvarlak köşeleri iki yanda da belirgin kalır */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-navy-950/60 via-navy-950/20 to-transparent" />
                {course.comingSoon && <SoonRibbon size="md" />}
              </div>
            ) : null}
            <div id="satin-al" className={`relative z-10 scroll-mt-40 rounded-3xl bg-white text-ink shadow-[0_30px_60px_-15px_rgba(10,21,48,.45),0_10px_20px_-10px_rgba(10,21,48,.3)] ring-1 ring-black/5 lg:sticky lg:top-[148px] ${hasVideo ? "mt-3" : course.imageUrl ? "-mt-6" : ""}`}>
              <div className="p-5 sm:p-6">
                <div className="flex items-end justify-between gap-3">
                  <div className="text-3xl">
                    {personalPercent > 0 ? (
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm text-muted line-through">{fmtMoney(effectivePrice(course))}</span>
                        <span className="font-bold text-navy-800">{fmtMoney(personalPrice)}</span>
                      </span>
                    ) : (
                      <Price course={course} />
                    )}
                  </div>
                  {personalPercent > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Sana özel %{personalPercent} indirim</span>}
                  {personalPercent === 0 && hasActiveSale(course) && !course.comingSoon && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600">%{Math.round((1 - effectivePrice(course) / Number(course.price)) * 100)} indirim</span>}
                  {course.isFree && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Hemen başla</span>}
                </div>
                {early && !enrolled && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900"><Icon name="calendar" className="mt-0.5 size-4 shrink-0 text-violet-600" /> <span><b>Erken kayıt:</b> eğitim <b>{opensDay}</b> tarihinde açılacak. Şimdi kaydol, eğitim Kitaplığına eklensin; açılış günü kendiliğinden aktifleşir.{hasActiveSale(course) && " Erken kayıt fiyatı açılışa kadar geçerli."}</span></p>
                )}
                {awaiting ? (
                  <div className="mt-4 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-4 text-center">
                    <p className="flex items-center justify-center gap-2 font-semibold text-violet-800"><Icon name="lock" className="size-4" /> {opensDay} tarihinde aktifleşecek</p>
                    <p className="mt-1 text-xs text-violet-700">Erken kaydın alındı. Eğitim açıldığında sana haber vereceğiz.</p>
                    <Link href="/panel/egitim" className="btn-secondary btn-sm mt-3">Kitaplığıma git</Link>
                  </div>
                ) : enrolled ? (
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
                    periods={open.map((p) => ({ id: p.id, name: p.name, range: course.type === "meeting" ? (p.schedule.length > 1 ? `${p.schedule.length} görüşme · her görüşme ${course.meetingMinutes} dk` : `${course.meetingMinutes} dk`) : fmtRange(p.startDate, p.endDate), left: p.capacity - p.enrolled - p.held, full: p.enrolled + p.held >= p.capacity, schedule: p.schedule.length, date: p.startDate, time: p.startTime?.slice(0, 5) ?? "", sessions: p.schedule.map((s) => s.date) }))}
                    buttonType={course.buttonType}
                    initialPeriodId={wantedPeriod}
                    autoSubmit={resume && !wantedGone}
                    preorder={early}
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
                {/* Kutu altı: yalnızca modül ve canlı oturum sayısı (kartlardaki bilgi satırıyla aynı) */}
                {(course.stats.modules > 0 || sessionCount > 0) && (
                  <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5 border-t border-line pt-5 text-[13px] font-medium text-navy-800">
                    {course.stats.modules > 0 && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="layers" className="size-3.5" /></span> {course.stats.modules} modül</li>}
                    {sessionCount > 0 && <li className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="video" className="size-3.5" /></span> {sessionCount} canlı oturum</li>}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-4 pt-[30px]">
          <div className="mb-6"><SectionHead icon="star" title="İlgili programlar" sub="Bu eğitimden sonra önerdiğimiz eğitimler" /></div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((c) => <CourseCard key={c.id} course={c} />)}</div>
        </section>
      )}
      {/* Mobil yapışkan alt çubuk */}
      {!enrolled && !course.closed && !course.comingSoon && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(20,43,86,.08)] lg:hidden">
          <div className="text-lg">{personalPercent > 0 ? <span className="font-bold text-navy-800">{fmtMoney(personalPrice)}</span> : <Price course={course} />}</div>
          {/* Boş koltuk/dönem yoksa satın alma yerine bekleme listesi (satın alma kutusuyla aynı kural) */}
          <a href="#satin-al" className={noSeat ? "btn bg-amber-500 text-white hover:bg-amber-600" : "btn-primary"}>{noSeat ? (waitlisted ? "Haber listesindesin" : "Tekrar açılınca haber ver") : course.type === "meeting" ? "Görüşme Saati Seç" : course.group === "takvimli" ? "Dönem Seçiniz" : early ? "Erken Kayıt Ol" : course.isFree ? "Kitaplığa Ekle" : "Hemen Kayıt Ol"}</a>
        </div>
      )}
    </>
  );
}
