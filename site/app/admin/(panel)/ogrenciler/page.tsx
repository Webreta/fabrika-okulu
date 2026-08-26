import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  users, enrollments, courses, assignments, assignmentSubmissions, quizzes, quizAttempts,
  questions, notes, issuedCertificates, certificateTemplates, orders,
} from "@/db/schema";
import { courseProgress } from "@/lib/data/student";
import { certSerial } from "@/lib/certificates";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { PageTitle, Chip } from "@/components/panel/ui";
import { StudentDetail, StudentDangerZone } from "@/components/admin/StudentDetail";

const excerpt = (t: string, n = 90) => (t.length > n ? t.slice(0, n) + "…" : t);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-bold text-navy-800">{title}</h2>
      {children}
    </section>
  );
}

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<{ detail?: string; s?: string; kurs?: string }> }) {
  const { detail, s, kurs } = await searchParams;
  if (detail) {
    const uid = Number(detail);
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!u) return <p className="card">Kullanıcı bulunamadı.</p>;
    const [list, subs, atts, qs, nts, certs, ords] = await Promise.all([
      db.select({ e: enrollments, c: courses }).from(enrollments).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(eq(enrollments.userId, uid)).orderBy(desc(enrollments.enrolledAt)),
      db.select({ s: assignmentSubmissions, title: assignments.title, courseTitle: courses.title }).from(assignmentSubmissions).innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id)).innerJoin(courses, eq(assignments.courseId, courses.id)).where(eq(assignmentSubmissions.userId, uid)).orderBy(desc(assignmentSubmissions.submittedAt)),
      db.select({ a: quizAttempts, title: quizzes.title, courseTitle: courses.title }).from(quizAttempts).innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id)).innerJoin(courses, eq(quizzes.courseId, courses.id)).where(eq(quizAttempts.userId, uid)).orderBy(desc(quizAttempts.startedAt)),
      db.select({ q: questions, courseTitle: courses.title }).from(questions).innerJoin(courses, eq(questions.courseId, courses.id)).where(eq(questions.userId, uid)).orderBy(desc(questions.createdAt)),
      db.select({ n: notes, courseTitle: courses.title }).from(notes).leftJoin(courses, eq(notes.courseId, courses.id)).where(eq(notes.userId, uid)).orderBy(desc(notes.createdAt)),
      db.select({ ic: issuedCertificates, tplTitle: certificateTemplates.title }).from(issuedCertificates).innerJoin(certificateTemplates, eq(issuedCertificates.templateId, certificateTemplates.id)).where(eq(issuedCertificates.userId, uid)).orderBy(desc(issuedCertificates.issuedAt)),
      db.select().from(orders).where(eq(orders.userId, uid)).orderBy(desc(orders.createdAt)),
    ]);
    const all = await db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(courses.title);
    const prog = await Promise.all(list.map(({ c }) => courseProgress(uid, c.id)));

    const stats: [string, number][] = [
      ["Eğitim", list.length],
      ["Görev gönderimi", subs.length],
      ["Sınav denemesi", atts.length],
      ["Soru", qs.length],
      ["Not", nts.length],
      ["Sertifika", certs.length],
    ];

    return (
      <>
        <PageTitle
          title={`${u.firstName} ${u.lastName}`.trim() || u.email}
          sub={`${u.email}${u.phone ? ` · ${u.phone}` : ""} · Üyelik: ${fmtDate(u.createdAt)} · #${u.id}`}
          action={<div className="flex gap-2"><Link href="/admin/ogrenciler" className="btn-secondary btn-sm">← Liste</Link><Link href={`/admin/kullanicilar?s=${encodeURIComponent(u.email)}`} className="btn-secondary btn-sm">Kullanıcı kaydı</Link></div>}
        />
        <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {stats.map(([label, n]) => (
            <div key={label} className="rounded-xl border border-line bg-white p-3 text-center"><p className="text-xl font-bold text-navy-800">{n}</p><p className="text-[11px] text-muted">{label}</p></div>
          ))}
        </div>
        <div className="space-y-8">
          <Section title="Eğitimler & ilerleme">
            <StudentDetail
              userId={u.id}
              enrollments={list.map(({ e, c }, i) => ({
                courseId: c.id, title: c.title, enrolledAt: e.enrolledAt.toISOString(), orderId: e.orderId, status: e.status,
                startedAt: e.startedAt?.toISOString() ?? null,
                progress: { completed: prog[i].completed, total: prog[i].total, percent: prog[i].percent },
              }))}
              courses={all.filter((c) => !list.some((l) => l.c.id === c.id))}
            />
          </Section>

          <Section title={`Görev gönderimleri (${subs.length})`}>
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Görev</th><th>Eğitim</th><th>Teslim</th><th>Durum</th><th>Puan</th><th>Geri bildirim</th></tr></thead>
                <tbody>
                  {subs.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">Gönderim yok.</td></tr>}
                  {subs.map(({ s: x, title, courseTitle }) => (
                    <tr key={x.id}>
                      <td className="font-semibold text-navy-800">{title}</td>
                      <td className="text-sm">{courseTitle}</td>
                      <td className="text-xs">{fmtDateTime(x.submittedAt)}</td>
                      <td>{x.status === "graded" ? <Chip color="green">Değerlendirildi</Chip> : <Chip color="amber">Bekliyor</Chip>}</td>
                      <td className="text-sm">{x.score ?? "—"}</td>
                      <td className="max-w-[240px] truncate text-xs text-muted">{x.feedback || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Sınav denemeleri (${atts.length})`}>
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Sınav</th><th>Eğitim</th><th>Tarih</th><th>Durum</th><th>Puan</th><th>Sonuç</th></tr></thead>
                <tbody>
                  {atts.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">Sınav denemesi yok.</td></tr>}
                  {atts.map(({ a, title, courseTitle }) => (
                    <tr key={a.id}>
                      <td className="font-semibold text-navy-800">{title}</td>
                      <td className="text-sm">{courseTitle}</td>
                      <td className="text-xs">{fmtDateTime(a.completedAt ?? a.startedAt)}</td>
                      <td>{a.status === "completed" ? <Chip color="green">Tamamlandı</Chip> : a.status === "pending_review" ? <Chip color="amber">Değerlendirme bekliyor</Chip> : <Chip color="gray">Devam ediyor</Chip>}</td>
                      <td className="text-sm">{a.score !== null ? `%${Number(a.score)}` : "—"}</td>
                      <td className="text-sm">{a.passed === null ? "—" : a.passed ? "Geçti" : "Kaldı"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Sorular (${qs.length})`}>
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Soru</th><th>Ders</th><th>Eğitim</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
                <tbody>
                  {qs.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">Soru yok.</td></tr>}
                  {qs.map(({ q, courseTitle }) => (
                    <tr key={q.id}>
                      <td className="max-w-[320px] text-sm">{excerpt(q.text)}</td>
                      <td className="text-xs">{q.lessonTitle || "—"}</td>
                      <td className="text-sm">{courseTitle}</td>
                      <td>{q.status === "answered" ? <Chip color="green">Yanıtlandı</Chip> : <Chip color="amber">Bekliyor</Chip>}</td>
                      <td className="text-xs">{fmtDate(q.createdAt)}</td>
                      <td><Link href={`/admin/sorular?chat=${uid}_${q.courseId}`} className="text-xs text-sky-600 underline">Sohbet</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Ders notları (${nts.length})`}>
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Not</th><th>Ders</th><th>Eğitim</th><th>Tarih</th></tr></thead>
                <tbody>
                  {nts.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">Not yok.</td></tr>}
                  {nts.map(({ n, courseTitle }) => (
                    <tr key={n.id}>
                      <td className="max-w-[380px] text-sm">{excerpt(n.text)}</td>
                      <td className="text-xs">{n.lessonTitle || "Genel"}{n.seconds != null && ` · ${Math.floor(n.seconds / 60)}:${String(n.seconds % 60).padStart(2, "0")}`}</td>
                      <td className="text-sm">{courseTitle ?? "—"}</td>
                      <td className="text-xs">{fmtDate(n.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Sertifikalar (${certs.length})`}>
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Seri No</th><th>Tasarım</th><th>Eğitim</th><th>Veriliş</th><th>Bağlantı</th></tr></thead>
                <tbody>
                  {certs.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Sertifika yok.</td></tr>}
                  {certs.map(({ ic, tplTitle }) => (
                    <tr key={ic.id}>
                      <td className="font-mono text-xs">{certSerial(ic.id, ic.issuedAt)}</td>
                      <td className="font-semibold text-navy-800">{tplTitle}</td>
                      <td className="text-sm">{ic.courseName}</td>
                      <td className="text-xs">{fmtDate(ic.issuedAt)}</td>
                      <td><a href={`/sertifika/${ic.token}`} target="_blank" className="text-xs text-sky-600 underline">Görüntüle</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Siparişler (${ords.length})`}>
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Sipariş</th><th>İçerik</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
                <tbody>
                  {ords.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Sipariş yok.</td></tr>}
                  {ords.map((o) => (
                    <tr key={o.id}>
                      <td><Link href={`/admin/siparisler/${o.id}`} className="font-semibold text-sky-600 underline">#{o.id}</Link></td>
                      <td className="max-w-[280px] truncate text-sm">{o.items.map((i) => i.title).join(", ")}</td>
                      <td className="text-sm">{fmtMoney(o.total)}</td>
                      <td>{o.status === "paid" ? <Chip color="green">Ödendi</Chip> : o.status === "pending" ? <Chip color="amber">Bekliyor</Chip> : <Chip color="gray">{o.status}</Chip>}</td>
                      <td className="text-xs">{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {list.length > 0 && <StudentDangerZone userId={u.id} />}
        </div>
      </>
    );
  }

  const q = s?.trim() ?? "";
  const kursId = Number(kurs) || 0;
  const allCourses = await db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(courses.title);
  const rows = await db
    .select({
      u: users,
      total: sql<number>`count(${enrollments.id})`.mapWith(Number),
      last: sql<string>`max(${enrollments.enrolledAt})`,
      titles: sql<string>`string_agg(${courses.title}, '||')`,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(
      eq(enrollments.status, "active"),
      q ? sql`(${users.email} ilike ${"%" + q + "%"} or ${users.firstName} ilike ${"%" + q + "%"} or ${users.lastName} ilike ${"%" + q + "%"})` : undefined,
      // Kurs filtresi: o kursa aktif kaydı olan öğrenciler (diğer eğitimleri de listede görünür)
      kursId ? sql`exists (select 1 from ${enrollments} e2 where e2.user_id = ${users.id} and e2.course_id = ${kursId} and e2.status = 'active')` : undefined,
    ))
    .groupBy(users.id)
    .orderBy(sql`3 desc`)
    .limit(300);

  return (
    <>
      <PageTitle title="Kayıtlı Öğrenciler" sub={`${rows.length} öğrenci`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="kurs" defaultValue={kursId || ""} className="input w-auto max-w-xs">
          <option value="">Tüm eğitimler</option>
          {allCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <input name="s" defaultValue={q} placeholder="Ad / e-posta ara" className="input max-w-xs" />
        <button className="btn-secondary">Filtrele</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Öğrenci</th><th>Eğitimler</th><th>Adet</th><th>Son kayıt</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">Kayıt yok.</td></tr>}
            {rows.map(({ u, total, last, titles }) => {
              const t = (titles ?? "").split("||").filter(Boolean);
              return (
                <tr key={u.id}>
                  <td><p className="font-semibold text-navy-800">{u.firstName} {u.lastName}</p><p className="text-xs text-muted">{u.email}</p></td>
                  <td><div className="flex flex-wrap gap-1">{t.slice(0, 2).map((x) => <Chip key={x} color="navy">{x}</Chip>)}{t.length > 2 && <Chip color="gray">+{t.length - 2}</Chip>}</div></td>
                  <td>{total}</td>
                  <td className="text-xs">{fmtDate(last)}</td>
                  <td><Link href={`/admin/ogrenciler?detail=${u.id}`} className="btn-secondary btn-sm">Detay</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
