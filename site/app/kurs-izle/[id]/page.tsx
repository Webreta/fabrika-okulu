import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { playerAccess, playerState, stampStarted, quizForLesson, assignmentForLesson, quizPayload, assignmentPayload, lessonQuestions } from "@/lib/player";
import { getEnrollment, studentMeeting } from "@/lib/data/student";
import { MeetingView } from "./MeetingView";
import { db } from "@/db";
import { quizzes, assignments, progress, courseSuggestions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { parseVideo } from "@/lib/course-logic";
import { unreadCount } from "@/lib/notify";
import { Icon } from "@/components/site/Icon";
import { Curriculum } from "@/components/player/Curriculum";
import { VideoStage } from "@/components/player/VideoStage";
import { QuizStage } from "@/components/player/QuizStage";
import { AssignmentStage } from "@/components/player/AssignmentStage";
import { FileStage } from "@/components/player/FileStage";
import { logout } from "@/app/actions/auth";
import { initials } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { listCourseNotes } from "@/app/actions/notes";
import { autoIssueCertificates } from "@/lib/cert-issue";
import { themeByKey } from "@/lib/panel-themes";
import { PushBanner } from "@/components/panel/PushBanner";

type SP = { section?: string; lesson?: string; ders?: string; quiz?: string; gorev?: string; t?: string };

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const courseId = Number(id);
  if (!courseId) notFound();
  const user = await getCurrentUser();
  const acc = await playerAccess(user, courseId);
  if (!acc.ok) {
    if (acc.reason === "login") redirect(`/panel/giris?r=${encodeURIComponent(`/kurs-izle/${courseId}`)}`);
    redirect("/panel/egitim");
  }
  const state = await playerState(user!.id, courseId, acc.preview);
  if (!state) notFound();
  const { course, done, prog, frontier } = state;
  // Online görüşme ürünü: video oynatıcı yok, görüşme sayfası
  if (course.type === "meeting") {
    const meeting = acc.preview ? null : await studentMeeting(user!.id, courseId, course.meetingMinutes, course.meetingLink);
    return <MeetingView course={{ id: course.id, title: course.title, imageUrl: course.imageUrl, shortDescription: course.shortDescription, meetingMinutes: course.meetingMinutes, meetingLink: course.meetingLink }} meeting={meeting} preview={acc.preview} />;
  }
  const flat = course.flatLessons;

  if (!acc.preview) {
    const e = await getEnrollment(user!.id, courseId);
    if (e && !e.startedAt) await stampStarted(user!.id, courseId);
  }

  // Aktif öğeyi belirle
  let activeIdx = -1;
  if (sp.ders) activeIdx = flat.findIndex((l) => l.id === Number(sp.ders));
  else if (sp.quiz) {
    const [q] = await db.select({ lessonId: quizzes.lessonId }).from(quizzes).where(and(eq(quizzes.id, Number(sp.quiz)), eq(quizzes.courseId, courseId))).limit(1);
    activeIdx = q?.lessonId ? flat.findIndex((l) => l.id === q.lessonId) : -1;
    if (activeIdx === -1 && q) activeIdx = -2; // müfredat dışı sınav
  } else if (sp.gorev) {
    const [a] = await db.select({ lessonId: assignments.lessonId }).from(assignments).where(and(eq(assignments.id, Number(sp.gorev)), eq(assignments.courseId, courseId))).limit(1);
    activeIdx = a?.lessonId ? flat.findIndex((l) => l.id === a.lessonId) : -1;
    if (activeIdx === -1 && a) activeIdx = -2;
  } else if (sp.section && sp.lesson) {
    const m = course.modules[Number(sp.section)];
    const l = m?.lessons[Number(sp.lesson)];
    activeIdx = l ? flat.findIndex((x) => x.id === l.id) : -1;
  }
  if (activeIdx === -1) {
    // kaldığın yer: ilk tamamlanmamış (dosya hariç) ya da son öğe
    const firstUndone = flat.findIndex((l) => l.type !== "file" && !done.has(l.id));
    activeIdx = firstUndone === -1 ? Math.max(0, flat.length - 1) : firstUndone;
  }
  // Sıralı kilit
  if (activeIdx >= 0 && activeIdx > frontier) {
    const target = flat[frontier];
    redirect(target ? `/kurs-izle/${courseId}?ders=${target.id}` : `/kurs-izle/${courseId}`);
  }
  const active = activeIdx >= 0 ? flat[activeIdx] : null;

  // Dosya dersi açıldıysa sıralama için tamamlandı say
  if (active?.type === "file" && !acc.preview && !done.has(active.id)) {
    await db.insert(progress).values({ userId: user!.id, courseId, lessonId: active.id }).onConflictDoNothing();
    done.add(active.id);
    await autoIssueCertificates(user!.id, courseId);
  }

  const next = activeIdx >= 0 ? flat[activeIdx + 1] : undefined;
  const prev = activeIdx > 0 ? flat[activeIdx - 1] : undefined;
  const nextLocked = !!next && !acc.preview && activeIdx + 1 > frontier;
  const nextUrl = next ? `/kurs-izle/${courseId}?ders=${next.id}` : null;
  const prevUrl = prev ? `/kurs-izle/${courseId}?ders=${prev.id}` : null;
  const unread = await unreadCount(user!.id);
  const themeKey = themeByKey(user!.panelTheme, (await getSetting("panel")).defaultTheme).key;
  // Tüm sınavlar anlık geri bildirimli çözülür (test/D-Y anında; açık uçlu yalnız kaydedilir, eğitmene gönderim/değerlendirme yok)
  const instant = true;

  // Sahne verisi
  let stage: React.ReactNode = null;
  if (activeIdx === -2 && sp.quiz) {
    const p = await quizPayload(Number(sp.quiz), user!.id);
    stage = p ? <QuizStage payload={serializeQuiz(p)} courseId={courseId} nextUrl={null} preview={acc.preview} instant={instant} /> : <p className="card">Sınav bulunamadı.</p>;
  } else if (activeIdx === -2 && sp.gorev) {
    const p = await assignmentPayload(Number(sp.gorev), user!.id);
    stage = p ? <AssignmentStage payload={serializeAssignment(p)} nextUrl={null} preview={acc.preview} /> : <p className="card">Görev bulunamadı.</p>;
  } else if (active) {
    if (active.type === "video") {
      const [qs, myNotes, mySuggestions] = await Promise.all([
        lessonQuestions(user!.id, courseId),
        listCourseNotes(courseId),
        db
          .select({ id: courseSuggestions.id, text: courseSuggestions.text, createdAt: courseSuggestions.createdAt })
          .from(courseSuggestions)
          .where(and(eq(courseSuggestions.userId, user!.id), eq(courseSuggestions.courseId, courseId)))
          .orderBy(desc(courseSuggestions.id)),
      ]);
      stage = (
        <VideoStage
          key={active.id}
          courseId={courseId}
          lesson={{ id: active.id, title: active.title, description: active.description, video: parseVideo(active.videoUrl) }}
          done={done.has(active.id)}
          preview={acc.preview}
          nextUrl={nextUrl}
          nextLocked={nextLocked}
          prevUrl={prevUrl}
          questions={qs}
          userName={user!.name}
          notes={myNotes}
          suggestions={mySuggestions.map((s) => ({ id: s.id, text: s.text, createdAt: s.createdAt.toISOString() }))}
          startAt={sp.t ? Number(sp.t) : null}
        />
      );
    } else if (active.type === "quiz") {
      const q = await quizForLesson(active.id);
      const p = q ? await quizPayload(q.id, user!.id) : null;
      stage = p ? <QuizStage payload={serializeQuiz(p)} courseId={courseId} nextUrl={nextUrl} preview={acc.preview} instant={instant} /> : <p className="card">Bu derse bağlı sınav bulunamadı.</p>;
    } else if (active.type === "assign") {
      const a = await assignmentForLesson(active.id);
      const p = a ? await assignmentPayload(a.id, user!.id) : null;
      stage = p ? <AssignmentStage payload={serializeAssignment(p)} nextUrl={nextUrl} preview={acc.preview} /> : <p className="card">Bu derse bağlı görev bulunamadı.</p>;
    } else if (active.type === "file") {
      stage = <FileStage lesson={{ id: active.id, title: active.title, fileName: active.fileName, mime: active.fileMime }} nextUrl={nextUrl} prevUrl={prevUrl} />;
    }
  } else {
    stage = <div className="card text-center text-muted">Bu programda henüz içerik yok.</div>;
  }

  // Eğitim tümüyle tamamlandığında kutlama kartı (sertifika + yeni eğitim keşfet)
  const courseComplete = !acc.preview && prog.total > 0 && prog.percent === 100;
  const celebrationCard = courseComplete ? (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-6 text-[#fff] shadow-xl md:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-[#fff]/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-[#fff]/10 blur-3xl" />
      <div className="relative">
        <p className="text-4xl">🎉</p>
        <h2 className="mt-2 text-2xl font-bold md:text-3xl">Tebrikler, eğitimi tamamladın!</h2>
        <p className="mt-2 max-w-2xl text-[#fff]/90">
          <span className="font-semibold">{course.title}</span> programındaki tüm içerikleri bitirdin. Emeğine sağlık! Sertifikan hazırsa profilinden görüntüleyebilir, yeni eğitimlerle öğrenmeye devam edebilirsin.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/panel/sertifika" className="inline-flex items-center gap-2 rounded-lg bg-[#fff] px-5 py-2.5 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50">
            <Icon name="award" className="size-4" /> Sertifikanı gör
          </Link>
          <Link href="/kesfet" className="inline-flex items-center gap-2 rounded-lg border border-[#fff]/50 px-4 py-2.5 text-sm font-semibold text-[#fff] hover:bg-[#fff]/10">
            <Icon name="book" className="size-4" /> Yeni eğitimler keşfet
          </Link>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="fo-theme min-h-screen bg-surface" data-theme={themeKey}>
      {/* Üst çubuk */}
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto grid max-w-[1310px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[1fr_auto_1fr]">
          <nav className="hidden items-center gap-1 md:flex">
            {([["/panel", "Çalışma Odam", "home"], ["/panel/takvim", "Gündemim", "calendar"], ["/kesfet", "Keşfet", "compass"]] as const).map(([h, l, i]) => (
              <Link key={h} href={h} target={h === "/kesfet" ? "_blank" : undefined} rel={h === "/kesfet" ? "noopener" : undefined} className="flex items-center gap-2 rounded-full border-2 border-transparent px-3.5 py-1.5 text-[13px] font-semibold text-muted transition hover:bg-surface">
                <Icon name={i} className="size-4" />{l}
              </Link>
            ))}
          </nav>
          <Link href="/" className="justify-self-center"><Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={120} height={137} className="fo-logo h-12 w-auto lg:h-14" /></Link>
          <div className="flex items-center justify-end gap-1">
            <Link href="/panel/bildirim" className="relative rounded-lg p-2 hover:bg-surface"><Icon name="bell" className="size-5 text-navy-800" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}</Link>
            <Link href="/panel/hesap" className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 hover:bg-surface">
              <span className="flex size-8 items-center justify-center rounded-full bg-navy-800 text-sm font-bold text-white">{initials(user!.name)}</span>
              <span className="hidden text-sm font-semibold text-navy-800 sm:inline">{user!.name.split(" ")[0]}</span>
              <Icon name="chevronDown" className="size-4 text-muted" />
            </Link>
            <form action={logout}><button className="rounded-lg p-2 text-muted hover:bg-surface" title="Çıkış"><Icon name="logout" className="size-5" /></button></form>
          </div>
        </div>
      </header>

      {acc.preview && (
        <div className="bg-amber-100 text-center text-sm text-amber-800 py-2">
          Eğitmen önizlemesi — ilerleme kaydedilmez. <Link href={`/egitmen/editor/${courseId}`} className="font-semibold underline">Düzenleyiciye dön</Link>
        </div>
      )}

      {/* Kurs çubuğu */}
      <div className="border-b border-line bg-sky-100">
        <div className="mx-auto flex max-w-[1310px] flex-wrap items-center gap-4 px-4 py-2.5">
          <Link href="/panel/egitim" className="flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline"><Icon name="arrowLeft" className="size-4" /> Kitaplığım</Link>
          <span className="truncate font-bold text-navy-800">{course.title}</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-white"><div className="h-full bg-navy-800" style={{ width: `${prog.percent}%` }} /></div>
            <span className="text-sm font-semibold text-navy-800">%{prog.percent}</span>
          </div>
        </div>
      </div>

      <PushBanner vapidKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
      <div className="mx-auto grid max-w-[1310px] gap-6 px-4 py-5 lg:grid-cols-[1fr_372px]">
        <div className="min-w-0 space-y-5">{celebrationCard}{stage}</div>
        <Curriculum
          courseId={courseId}
          modules={course.modules.map((m) => ({
            id: m.id,
            title: m.title,
            lessons: m.lessons.map((l) => ({
              id: l.id, title: l.title, type: l.type, duration: l.duration,
              done: done.has(l.id), active: active?.id === l.id, locked: flat.findIndex((x) => x.id === l.id) > frontier,
            })),
          }))}
          progress={prog}
        />
      </div>
    </div>
  );
}

function serializeQuiz(p: NonNullable<Awaited<ReturnType<typeof quizPayload>>>) {
  return {
    id: p.quiz.id,
    title: p.quiz.title,
    description: p.quiz.description,
    timeLimit: p.quiz.timeLimit,
    passScore: p.quiz.passScore,
    maxAttempts: p.quiz.maxAttempts,
    shuffle: p.quiz.shuffleQuestions,
    questions: p.questions,
    attempts: p.attempts.map((a) => ({ id: a.id, score: a.score ? Number(a.score) : null, earned: Number(a.earnedPoints), total: a.totalPoints, status: a.status, passed: a.passed, at: a.completedAt?.toISOString() ?? a.startedAt.toISOString() })),
    canAttempt: p.canAttempt,
    due: p.due?.toISOString() ?? null,
    review: p.review,
  };
}

function serializeAssignment(p: NonNullable<Awaited<ReturnType<typeof assignmentPayload>>>) {
  return {
    id: p.assignment.id,
    title: p.assignment.title,
    description: p.assignment.description,
    allowFile: p.assignment.allowFile,
    allowVoice: p.assignment.allowVoice,
    allowText: p.assignment.allowText,
    isGraded: p.assignment.isGraded,
    maxScore: p.assignment.maxScore,
    due: p.due?.toISOString() ?? null,
    submission: p.submission
      ? { status: p.submission.status, score: p.submission.score, feedback: p.submission.feedback, text: p.submission.text, files: p.submission.files, voices: p.submission.voices, at: p.submission.submittedAt.toISOString() }
      : null,
  };
}
