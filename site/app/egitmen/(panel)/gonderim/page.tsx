import Link from "next/link";
import { requireTeacher } from "@/lib/auth/session";
import { teacherOverview, teacherSubmissions, teacherQuizAttempts } from "@/lib/data/teacher";
import { PageTitle, Kpi } from "@/components/panel/ui";
import { SubmissionCard } from "@/components/teacher/SubmissionCard";
import { QuizAttemptRow } from "@/components/teacher/QuizAttemptRow";
import { SubmissionsFilter } from "@/components/teacher/SubmissionsFilter";

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ course?: string; q?: string; durum?: string }> }) {
  const { course, q: search = "", durum = "" } = await searchParams;
  const user = await requireTeacher();
  const courseId = Number(course) || undefined;
  const filter = { q: search, status: durum };
  const [ov, subs, attempts] = await Promise.all([teacherOverview(user), teacherSubmissions(user, courseId, 200, filter), teacherQuizAttempts(user, courseId, 200, filter)]);
  const filtered = !!(courseId || search || durum);
  return (
    <>
      <PageTitle title="Görevler & Sınavlar" sub="Görev teslimleri ve sınav sonuçları" />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/egitmen/sorular"><Kpi label="Bekleyen soru" value={ov.pendingQuestions} icon="message" color={ov.pendingQuestions ? "red" : "green"} /></Link>
        <a href="#gorev"><Kpi label="Görev teslimi" value={subs.length} icon="task" color="amber" /></a>
        <a href="#sinav"><Kpi label="Sınav sonucu" value={attempts.length} icon="quiz" color="sky" /></a>
      </div>
      <SubmissionsFilter
        base="/egitmen/gonderim"
        courses={ov.courses.map((c) => ({ id: c.id, title: c.title }))}
        statuses={[
          { value: "passed", label: "Sınav: geçti" }, { value: "failed", label: "Sınav: kaldı" },
        ]}
        initial={{ course: courseId ? String(courseId) : "", q: search, durum }}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div id="gorev">
          <h2 className="mb-3 font-bold text-navy-800">Görev teslimleri</h2>
          <div className="space-y-3">
            {subs.length === 0 ? <p className="card text-sm text-muted">{filtered ? "Filtreye uyan gönderim yok." : "Henüz gönderim yok."}</p> : subs.map((r) => (
              <SubmissionCard key={r.s.id} row={{ id: r.s.id, student: `${r.u.firstName} ${r.u.lastName}`.trim(), title: r.a.title, course: r.courseTitle, text: r.s.text, files: r.s.files, voices: r.s.voices, at: r.s.submittedAt.toISOString(), transcript: r.s.voiceTranscript }} />
            ))}
          </div>
        </div>
        <div id="sinav">
          <h2 className="mb-3 font-bold text-navy-800">Sınav sonuçları</h2>
          <div className="space-y-3">
            {attempts.length === 0 ? <p className="card text-sm text-muted">{filtered ? "Filtreye uyan sonuç yok." : "Henüz sonuç yok."}</p> : attempts.map((r) => (
              <QuizAttemptRow key={r.at.id} row={{ id: r.at.id, student: `${r.u.firstName} ${r.u.lastName}`.trim(), title: r.q.title, course: r.courseTitle, status: r.at.status, earned: Number(r.at.earnedPoints), total: r.at.totalPoints, score: r.at.score ? Number(r.at.score) : null, at: (r.at.completedAt ?? r.at.startedAt).toISOString(), passed: r.at.passed, voided: r.at.voided, passScore: r.q.passScore }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
