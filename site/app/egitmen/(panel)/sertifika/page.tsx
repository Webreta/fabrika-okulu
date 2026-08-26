import { requireTeacher } from "@/lib/auth/session";
import { certificateFeed, teacherOverview } from "@/lib/data/teacher";
import { fmtDate } from "@/lib/format";
import { PageTitle, Chip } from "@/components/panel/ui";
import { IssueCertButton, RevokeCertButton } from "@/components/teacher/IssueCertButton";

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course } = await searchParams;
  const user = await requireTeacher();
  const courseId = Number(course) || undefined;
  const [ov, feed] = await Promise.all([teacherOverview(user), certificateFeed(user, courseId)]);
  return (
    <>
      <PageTitle title="Sertifikalar" />
      <form className="mb-4 flex gap-2" method="get">
        <select name="course" defaultValue={courseId ?? ""} className="input w-auto"><option value="">Tüm eğitimler</option>{ov.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        <button className="btn-secondary btn-sm">Filtrele</button>
      </form>
      {feed.templates.length === 0 ? (
        <p className="card text-muted">Henüz sertifika tasarımı yok. Yönetim panelinden oluşturulmalı.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Öğrenci</th><th>Eğitim</th><th>Son başarım</th><th>Sertifika</th></tr></thead>
            <tbody>
              {feed.rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">Uygun öğrenci yok.</td></tr>}
              {feed.rows.map((r) => (
                <tr key={`${r.userId}-${r.courseId}`}>
                  <td><p className="font-semibold text-navy-800">{r.name}</p><p className="text-xs text-muted">{r.email}</p></td>
                  <td className="text-sm">{r.courseTitle}<span className="block text-xs text-muted">%{r.percent} tamamlandı</span></td>
                  <td><Chip color={r.level === 3 ? "green" : r.level === 2 ? "sky" : "gray"}>{r.level === 3 ? "Kursu bitirdi" : r.level === 2 ? "Kursu başlattı" : "Kayıt oldu"}</Chip></td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.issued.map((i) => (
                        <span key={i.id} className="flex items-center gap-1 text-xs"><a href={`/sertifika/${i.token}`} target="_blank" className="text-sky-600 underline">{i.title}</a><span className="text-muted">({fmtDate(i.issuedAt)})</span><RevokeCertButton id={i.id} /></span>
                      ))}
                      <IssueCertButton userId={r.userId} courseId={r.courseId} eligible={r.eligible.map((t) => ({ id: t.id, title: t.title }))} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
