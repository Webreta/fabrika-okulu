import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, enrollments, courses } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { PageTitle, Chip } from "@/components/panel/ui";
import { StudentDetail } from "@/components/admin/StudentDetail";

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<{ detail?: string; s?: string }> }) {
  const { detail, s } = await searchParams;
  if (detail) {
    const uid = Number(detail);
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!u) return <p className="card">Kullanıcı bulunamadı.</p>;
    const list = await db.select({ e: enrollments, c: courses }).from(enrollments).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(eq(enrollments.userId, uid)).orderBy(desc(enrollments.enrolledAt));
    const all = await db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(courses.title);
    return (
      <>
        <PageTitle title={`${u.firstName} ${u.lastName}`.trim() || u.email} sub={`${u.email} · Üyelik: ${fmtDate(u.createdAt)} · #${u.id}`} action={<div className="flex gap-2"><Link href="/admin/ogrenciler" className="btn-secondary btn-sm">← Liste</Link><Link href={`/admin/kullanicilar?s=${encodeURIComponent(u.email)}`} className="btn-secondary btn-sm">Kullanıcı kaydı</Link></div>} />
        <StudentDetail userId={u.id} enrollments={list.map(({ e, c }) => ({ courseId: c.id, title: c.title, enrolledAt: e.enrolledAt.toISOString(), orderId: e.orderId, status: e.status, startedAt: e.startedAt?.toISOString() ?? null }))} courses={all.filter((c) => !list.some((l) => l.c.id === c.id))} />
      </>
    );
  }

  const q = s?.trim() ?? "";
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
    .where(and(eq(enrollments.status, "active"), q ? sql`(${users.email} ilike ${"%" + q + "%"} or ${users.firstName} ilike ${"%" + q + "%"} or ${users.lastName} ilike ${"%" + q + "%"})` : undefined))
    .groupBy(users.id)
    .orderBy(sql`3 desc`)
    .limit(300);

  return (
    <>
      <PageTitle title="Kayıtlı Öğrenciler" sub={`${rows.length} öğrenci`} />
      <form className="mb-4 flex gap-2"><input name="s" defaultValue={q} placeholder="Ad / e-posta ara" className="input max-w-xs" /><button className="btn-secondary">Ara</button></form>
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
