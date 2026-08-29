import { requireTeacher } from "@/lib/auth/session";
import { teacherOverview, teacherStudents } from "@/lib/data/teacher";
import { fmtDate } from "@/lib/format";
import { PageTitle, Progress, Tabs } from "@/components/panel/ui";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course } = await searchParams;
  const user = await requireTeacher();
  const ov = await teacherOverview(user);
  const courseId = Number(course) || undefined;
  const rows = await teacherStudents(user, courseId);
  return (
    <>
      <PageTitle title="Öğrencilerim" sub={`${rows.length} kayıt`} />
      <Tabs items={[{ href: "/egitmen/ogrenciler", label: "Tümü", active: !courseId }, ...ov.courses.map((c) => ({ href: `/egitmen/ogrenciler?course=${c.id}`, label: c.title, count: c.students, active: courseId === c.id }))]} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Öğrenci</th><th>Eğitim</th><th>İlerleme</th><th>Kayıt tarihi</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">Öğrenci yok.</td></tr>}
            {rows.map((s) => (
              <tr key={`${s.userId}-${s.courseId}`}>
                <td><p className="font-semibold text-navy-800">{s.name}</p><p className="text-xs text-muted">{s.email}</p></td>
                <td className="text-sm">{s.courseTitle}</td>
                <td className="w-56"><div className="flex items-center gap-2"><Progress percent={s.percent} /><span className="text-xs">%{s.percent}</span></div></td>
                <td className="text-xs"><span className="date-chip">{fmtDate(s.enrolledAt)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
