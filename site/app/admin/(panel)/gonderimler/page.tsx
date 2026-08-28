import { requireAdmin } from "@/lib/auth/session";
import { teacherOverview, teacherSubmissions, teacherQuizAttempts } from "@/lib/data/teacher";
import { PageTitle, Kpi, Tabs } from "@/components/panel/ui";
import { SubmissionCard } from "@/components/teacher/SubmissionCard";
import { QuizAttemptRow } from "@/components/teacher/QuizAttemptRow";
import { Icon } from "@/components/site/Icon";

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<{ course?: string; sekme?: string }> }) {
  const { course, sekme = "gorev" } = await searchParams;
  const user = await requireAdmin();
  const courseId = Number(course) || undefined;
  const [ov, subs, attempts] = await Promise.all([teacherOverview(user), teacherSubmissions(user, courseId, 200), teacherQuizAttempts(user, courseId, 200)]);
  const q = courseId ? `&course=${courseId}` : "";
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Görevler & Sınavlar" sub="Görev teslimleri ve sınav sonuçları (tüm kurslar)" />
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href={`/api/admin/disa-aktar/gonderimler?tur=gorev${courseId ? `&course=${courseId}` : ""}`}
            className="btn-secondary flex items-center gap-2"
          >
            <Icon name="download" className="size-4" /> Görevler (Excel)
          </a>
          <a
            href={`/api/admin/disa-aktar/gonderimler?tur=sinav${courseId ? `&course=${courseId}` : ""}`}
            className="btn-primary flex items-center gap-2"
          >
            <Icon name="download" className="size-4" /> Sınavlar (Excel)
          </a>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-4">
        <Kpi label="Görev teslimi" value={subs.length} icon="task" />
        <Kpi label="Sınav sonucu" value={attempts.length} icon="quiz" color="sky" />
      </div>
      <form className="mb-4 flex gap-2" method="get">
        <input type="hidden" name="sekme" value={sekme} />
        <select name="course" defaultValue={courseId ?? ""} className="input w-auto"><option value="">Tüm kurslar</option>{ov.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        <button className="btn-secondary btn-sm">Filtrele</button>
      </form>
      <Tabs items={[{ href: `/admin/gonderimler?sekme=gorev${q}`, label: "Görev teslimleri", count: subs.length, active: sekme === "gorev" }, { href: `/admin/gonderimler?sekme=sinav${q}`, label: "Sınav sonuçları", count: attempts.length, active: sekme === "sinav" }]} />
      {sekme === "gorev" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {subs.length === 0 ? <p className="card text-sm text-muted">Gönderim yok.</p> : subs.map((r) => (
            <SubmissionCard key={r.s.id} row={{ id: r.s.id, student: `${r.u.firstName} ${r.u.lastName}`.trim(), title: r.a.title, course: r.courseTitle, text: r.s.text, files: r.s.files, voices: r.s.voices, status: r.s.status, score: r.s.score, feedback: r.s.feedback, at: r.s.submittedAt.toISOString(), isGraded: r.a.isGraded, maxScore: r.a.maxScore, transcript: r.s.voiceTranscript }} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {attempts.length === 0 ? <p className="card text-sm text-muted">Sonuç yok.</p> : attempts.map((r) => (
            <QuizAttemptRow key={r.at.id} row={{ id: r.at.id, student: `${r.u.firstName} ${r.u.lastName}`.trim(), title: r.q.title, course: r.courseTitle, status: r.at.status, earned: Number(r.at.earnedPoints), total: r.at.totalPoints, score: r.at.score ? Number(r.at.score) : null, at: (r.at.completedAt ?? r.at.startedAt).toISOString() }} />
          ))}
        </div>
      )}
    </>
  );
}
