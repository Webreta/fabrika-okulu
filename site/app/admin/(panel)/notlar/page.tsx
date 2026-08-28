import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes, courses, users } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { PageTitle, Chip, Kpi } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { NoteViewButton } from "@/components/admin/NoteViewButton";

function fmtSecs(s: number) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }

export default async function AdminNotesPage({ searchParams }: { searchParams: Promise<{ s?: string; course?: string }> }) {
  const { s, course } = await searchParams;
  const q = s?.trim() ?? "";
  const courseId = Number(course) || undefined;
  const [rows, cs, [stats]] = await Promise.all([
    db.select({ n: notes, courseTitle: courses.title, u: users })
      .from(notes)
      .innerJoin(users, eq(notes.userId, users.id))
      .leftJoin(courses, eq(notes.courseId, courses.id))
      .where(and(
        courseId ? eq(notes.courseId, courseId) : undefined,
        q ? sql`(${users.email} ilike ${"%" + q + "%"} or ${users.firstName} ilike ${"%" + q + "%"} or ${users.lastName} ilike ${"%" + q + "%"} or ${notes.text} ilike ${"%" + q + "%"})` : undefined,
      ))
      .orderBy(desc(notes.createdAt))
      .limit(300),
    db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(courses.title),
    db.select({ n: sql<number>`count(*)`.mapWith(Number), u: sql<number>`count(distinct ${notes.userId})`.mapWith(Number) }).from(notes),
  ]);
  return (
    <>
      <PageTitle title="Öğrenci Notları" sub="Öğrencilerin ders içinde ve genel olarak aldığı notlar (salt okunur)" />
      <div className="mb-5 grid grid-cols-3 gap-4"><Kpi label="Toplam not" value={stats.n} icon="edit" /><Kpi label="Not alan öğrenci" value={stats.u} icon="users" color="sky" /><Kpi label="Bu listede" value={rows.length} icon="list" /></div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="s" defaultValue={q} placeholder="Öğrenci / e-posta / not içinde ara" className="input max-w-xs" />
        <select name="course" defaultValue={courseId ?? ""} className="input w-auto"><option value="">Tüm kurslar</option>{cs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        <button className="btn-secondary">Filtrele</button>
        <a
          href={`/api/admin/disa-aktar/notlar?${new URLSearchParams({ ...(q ? { s: q } : {}), ...(courseId ? { course: String(courseId) } : {}) }).toString()}`}
          className="btn-primary ml-auto flex items-center gap-2"
        >
          <Icon name="download" className="size-4" /> Excel indir
        </a>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Öğrenci</th><th>Kurs / Ders</th><th>Tarih</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">Not yok.</td></tr>}
            {rows.map(({ n, courseTitle, u }) => (
              <tr key={n.id}>
                <td><Link href={`/admin/ogrenciler?detail=${u.id}`} className="font-semibold text-navy-800 hover:underline">{u.firstName} {u.lastName}</Link><p className="text-xs text-muted">{u.email}</p></td>
                <td className="text-sm">
                  {courseTitle ?? <Chip color="gray">Genel not</Chip>}
                  {n.lessonId && n.courseId && (
                    <Link href={`/kurs-izle/${n.courseId}?ders=${n.lessonId}${n.seconds != null ? `&t=${n.seconds}` : ""}`} target="_blank" className="mt-0.5 flex items-center gap-1 text-xs text-sky-600 hover:underline"><Icon name="play" className="size-3" /> {n.lessonTitle}{n.seconds != null && ` · ${fmtSecs(n.seconds)}`}</Link>
                  )}
                </td>
                <td className="text-xs">{fmtDateTime(n.createdAt)}</td>
                <td><NoteViewButton text={n.text} student={`${u.firstName} ${u.lastName}`.trim()} meta={`${courseTitle ?? "Genel not"}${n.lessonTitle ? ` · ${n.lessonTitle}` : ""}${n.seconds != null ? ` · ${fmtSecs(n.seconds)}` : ""} · ${fmtDateTime(n.createdAt)}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
