import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth/session";
import { ownsCourse, teacherStudents, teacherSubmissions, teacherQuizAttempts } from "@/lib/data/teacher";
import { getCourseFull } from "@/lib/data/courses";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { Kpi, Chip, Progress, Tabs } from "@/components/panel/ui";
import { CourseActions } from "@/components/teacher/CourseActions";
import { SubmissionCard } from "@/components/teacher/SubmissionCard";
import { QuizAttemptRow } from "@/components/teacher/QuizAttemptRow";

export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sekme?: string }> }) {
  const { id } = await params;
  const { sekme = "ogrenciler" } = await searchParams;
  const user = await requireTeacher();
  const courseId = Number(id);
  if (!courseId || !(await ownsCourse(user, courseId))) notFound();
  const [course, students] = await Promise.all([getCourseFull(courseId), teacherStudents(user, courseId)]);
  if (!course) notFound();
  const finished = students.filter((s) => s.total > 0 && s.completed >= s.total).length;
  const avg = students.length ? Math.round(students.reduce((a, s) => a + s.percent, 0) / students.length) : 0;
  const subs = sekme === "gonderimler" ? await teacherSubmissions(user, courseId) : [];
  const attempts = sekme === "gonderimler" ? await teacherQuizAttempts(user, courseId) : [];
  const base = `/egitmen/detay/${courseId}`;

  return (
    <>
      <div className="card mb-6 flex flex-col gap-4 md:flex-row">
        <div className="h-36 w-full shrink-0 overflow-hidden rounded-xl bg-navy-50 md:w-56">{course.imageUrl && <Image src={course.imageUrl} alt="" width={400} height={260} className="h-full w-full object-cover" />}</div>
        <div className="flex-1">
          <div className="flex flex-wrap gap-2">
            <Chip color={course.status === "published" ? "green" : "amber"}>{course.status === "published" ? "Yayında" : "Taslak"}</Chip>
            {course.periods.length > 0 && <Chip color="purple">Takvimli</Chip>}
            {course.closed && <Chip color="gray">Kapalı</Chip>}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-navy-800">{course.title}</h1>
          <p className="text-sm text-muted">{course.isFree ? "Ücretsiz" : fmtMoney(course.price)} · {course.stats.modules} modül · {course.stats.videos} video · {course.stats.quizzes} sınav · {course.stats.assigns} görev{course.stats.files ? ` · ${course.stats.files} dosya` : ""}</p>
          <CourseActions courseId={course.id} slug={course.slug} closed={course.closed} />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Kayıtlı öğrenci" value={students.length} icon="users" />
        <Kpi label="Bitirme oranı" value={`%${students.length ? Math.round((finished / students.length) * 100) : 0}`} icon="trophy" color="green" />
        <Kpi label="Ort. ilerleme" value={`%${avg}`} icon="chart" color="sky" />
        <Kpi label="Hiç başlamayan" value={students.filter((s) => !s.startedAt).length} icon="clock" color="amber" />
      </div>
      <Tabs items={[
        { href: `${base}?sekme=ogrenciler`, label: "Öğrenciler", count: students.length, active: sekme === "ogrenciler" },
        { href: `${base}?sekme=gonderimler`, label: "Görevler & Sınavlar", active: sekme === "gonderimler" },
        { href: `/egitmen/sorular`, label: "Sorular →", active: false },
      ]} />
      {sekme === "ogrenciler" && (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Öğrenci</th><th>İlerleme</th><th>Kayıt</th><th>Başladı</th></tr></thead>
            <tbody>
              {students.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">Henüz öğrenci yok.</td></tr>}
              {students.map((s) => (
                <tr key={s.userId}>
                  <td><p className="font-semibold text-navy-800">{s.name}</p><p className="text-xs text-muted">{s.email}</p></td>
                  <td className="w-56"><div className="flex items-center gap-2"><Progress percent={s.percent} /><span className="text-xs">{s.completed}/{s.total}</span></div></td>
                  <td className="text-xs">{fmtDate(s.enrolledAt)}</td>
                  <td className="text-xs">{s.startedAt ? fmtDateTime(s.startedAt) : <span className="text-amber-600">Başlamadı</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sekme === "gonderimler" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 font-bold text-navy-800">Görev teslimleri ({subs.length})</h2>
            <div className="space-y-3">{subs.length === 0 ? <p className="text-sm text-muted">Gönderim yok.</p> : subs.map((r) => <SubmissionCard key={r.s.id} row={{ id: r.s.id, student: `${r.u.firstName} ${r.u.lastName}`.trim(), title: r.a.title, course: r.courseTitle, text: r.s.text, files: r.s.files, voices: r.s.voices, status: r.s.status, score: r.s.score, feedback: r.s.feedback, at: r.s.submittedAt.toISOString(), isGraded: r.a.isGraded, maxScore: r.a.maxScore, transcript: r.s.voiceTranscript }} />)}</div>
          </div>
          <div>
            <h2 className="mb-3 font-bold text-navy-800">Sınav sonuçları ({attempts.length})</h2>
            <div className="space-y-3">{attempts.length === 0 ? <p className="text-sm text-muted">Sonuç yok.</p> : attempts.map((r) => <QuizAttemptRow key={r.at.id} row={{ id: r.at.id, student: `${r.u.firstName} ${r.u.lastName}`.trim(), title: r.q.title, course: r.courseTitle, status: r.at.status, earned: Number(r.at.earnedPoints), total: r.at.totalPoints, score: r.at.score ? Number(r.at.score) : null, at: (r.at.completedAt ?? r.at.startedAt).toISOString() }} />)}</div>
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-muted"><Link href="/egitmen/kurslarim" className="hover:underline">← Eğitimlerim</Link></p>
    </>
  );
}
