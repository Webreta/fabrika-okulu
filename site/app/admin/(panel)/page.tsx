import Link from "next/link";
import { and, desc, eq, sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, enrollments, users, questions, assignmentSubmissions, quizAttempts, documents, orders } from "@/db/schema";
import { fmtDate, fmtMoney, fmtDateTime } from "@/lib/format";
import { Kpi, PageTitle, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const { gun } = await searchParams;
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : new Date().toISOString().slice(0, 10);
  const n = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const count = sql<number>`count(*)`.mapWith(Number);

  const [totalCourses, totalStudents, activeEnroll, pendingQ, recent, popular, todayQ, todaySubs, todayQuiz, todayEnroll, overdueQ, idle, pendingDocs, revenue, pendingOrders] = await Promise.all([
    n(db.select({ n: count }).from(courses)),
    n(db.select({ n: sql<number>`count(distinct ${enrollments.userId})`.mapWith(Number) }).from(enrollments)),
    n(db.select({ n: count }).from(enrollments).where(eq(enrollments.status, "active"))),
    n(db.select({ n: count }).from(questions).where(eq(questions.status, "pending"))),
    db.select({ e: enrollments, u: users, c: courses }).from(enrollments).innerJoin(users, eq(enrollments.userId, users.id)).innerJoin(courses, eq(enrollments.courseId, courses.id)).orderBy(desc(enrollments.enrolledAt)).limit(8),
    db.select({ id: courses.id, title: courses.title, n: sql<number>`(select count(*) from ${enrollments} e where e.course_id = ${courses.id} and e.status='active')`.mapWith(Number) }).from(courses).orderBy(sql`3 desc`).limit(5),
    n(db.select({ n: count }).from(questions).where(sql`${questions.createdAt}::date = ${day}`)),
    n(db.select({ n: count }).from(assignmentSubmissions).where(sql`${assignmentSubmissions.submittedAt}::date = ${day}`)),
    n(db.select({ n: count }).from(quizAttempts).where(sql`${quizAttempts.completedAt}::date = ${day}`)),
    n(db.select({ n: count }).from(enrollments).where(sql`${enrollments.enrolledAt}::date = ${day}`)),
    db.select({ q: questions, u: users, c: courses }).from(questions).innerJoin(users, eq(questions.userId, users.id)).innerJoin(courses, eq(questions.courseId, courses.id)).where(eq(questions.status, "pending")).orderBy(questions.createdAt).limit(10),
    db.select({ e: enrollments, u: users, c: courses }).from(enrollments).innerJoin(users, eq(enrollments.userId, users.id)).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(and(isNull(enrollments.startedAt), sql`${enrollments.enrolledAt} < now() - interval '7 days'`, eq(enrollments.status, "active"))).limit(10),
    n(db.select({ n: count }).from(documents).where(eq(documents.status, "pending"))),
    db.select({ t: sql<string>`coalesce(sum(${orders.total}),0)` }).from(orders).where(eq(orders.status, "paid")).then((r) => Number(r[0]?.t ?? 0)),
    n(db.select({ n: count }).from(orders).where(eq(orders.status, "pending"))),
  ]);
  const max = Math.max(1, ...popular.map((p) => p.n));

  return (
    <>
      <PageTitle title="Gösterge Paneli" sub={`Bugün: ${fmtDate(new Date(), true)}`} action={<Link href="/admin/kurslar/editor/yeni" className="btn-primary"><Icon name="plus" className="size-4" /> Yeni eğitim</Link>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Toplam eğitim" value={totalCourses} icon="book" href="/admin/kurslar" />
        <Kpi label="Toplam öğrenci" value={totalStudents} icon="users" color="sky" href="/admin/ogrenciler" />
        <Kpi label="Aktif kayıt" value={activeEnroll} icon="check" color="green" />
        <Kpi label="Bekleyen soru" value={pendingQ} icon="message" color={pendingQ ? "red" : "gray"} href="/egitmen/sorular" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Toplam ciro" value={fmtMoney(revenue)} icon="chart" color="green" href="/admin/siparisler" />
        <Kpi label="Bekleyen sipariş" value={pendingOrders} icon="cart" color="amber" href="/admin/siparisler?durum=pending" />
        <Kpi label="Bekleyen belge" value={pendingDocs} icon="doc" color="amber" href="/admin/belgeler" />
        <Kpi label="Hiç başlamayan (7g+)" value={idle.length} icon="clock" color="amber" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-navy-800">Ne oldu?</h2>
            <form className="flex gap-2"><input type="date" name="gun" defaultValue={day} className="input w-auto py-1 text-xs" /><button className="btn-secondary btn-sm">Göster</button></form>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Yeni soru", todayQ], ["Görev teslimi", todaySubs], ["Sınav sonucu", todayQuiz], ["Yeni kayıt", todayEnroll]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg bg-surface p-3 text-center"><p className="text-2xl font-bold text-navy-800">{v as number}</p><p className="text-xs text-muted">{l}</p></div>
            ))}
          </div>
          <h3 className="mb-2 mt-5 text-sm font-bold text-navy-800">Yanıtlanmamış sorular</h3>
          {overdueQ.length === 0 ? <p className="text-sm text-muted">Yok 🎉</p> : (
            <ul className="divide-y divide-line text-sm">
              {overdueQ.map(({ q, u, c }) => {
                const age = Math.floor((Date.now() - q.createdAt.getTime()) / 86400000);
                return <li key={q.id} className="flex items-center gap-2 py-2"><span className={`size-2 rounded-full ${age > 2 ? "bg-red-500" : "bg-amber-400"}`} /><Link href={`/admin/sorular?chat=${u.id}_${c.id}`} className="flex-1 truncate hover:underline"><b>{u.firstName} {u.lastName}</b> · {c.title}</Link><span className="text-xs text-muted">{age} gün</span></li>;
              })}
            </ul>
          )}
          <h3 className="mb-2 mt-5 text-sm font-bold text-navy-800">Satın aldı ama başlamadı</h3>
          {idle.length === 0 ? <p className="text-sm text-muted">Yok</p> : (
            <ul className="divide-y divide-line text-sm">{idle.map(({ e, u, c }) => <li key={e.id} className="flex justify-between py-2"><span><b>{u.firstName} {u.lastName}</b> · {c.title}</span><span className="text-xs text-muted">{fmtDate(e.enrolledAt)}</span></li>)}</ul>
          )}
        </div>
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-bold text-navy-800">Son kayıtlar</h2>
            <ul className="divide-y divide-line text-sm">
              {recent.length === 0 && <li className="py-2 text-muted">Henüz kayıt yok.</li>}
              {recent.map(({ e, u, c }) => <li key={e.id} className="flex items-center justify-between py-2"><span><b className="text-navy-800">{u.firstName} {u.lastName}</b><span className="block text-xs text-muted">{c.title}</span></span><span className="text-xs text-muted">{fmtDateTime(e.enrolledAt)}</span></li>)}
            </ul>
          </div>
          <div className="card">
            <h2 className="mb-3 font-bold text-navy-800">Popüler eğitimler</h2>
            <ul className="space-y-2 text-sm">
              {popular.map((p) => (
                <li key={p.id}><div className="flex justify-between"><span className="truncate">{p.title}</span><span className="text-muted">{p.n}</span></div><div className="mt-1 h-1.5 rounded-full bg-navy-100"><div className="h-full rounded-full bg-sky-400" style={{ width: `${(p.n / max) * 100}%` }} /></div></li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="mb-2 font-bold text-navy-800">Hızlı erişim</h2>
            <div className="flex flex-wrap gap-2">
              {[["/admin/kurslar/editor/yeni", "Yeni eğitim"], ["/admin/kurslar", "Kurslar"], ["/admin/sertifikalar", "Sertifikalar"], ["/admin/belgeler", "Belgeler"], ["/admin/ayarlar", "Ayarlar"]].map(([h, l]) => <Link key={h} href={h} className="btn-secondary btn-sm">{l}</Link>)}
            </div>
            <p className="mt-3 text-xs text-muted"><Chip color="sky">Bilgi</Chip> Günlük rapor her sabah 07:00&apos;de yöneticilere ve eğitmenlere e-posta ile gider (Ayarlar → E-posta).</p>
          </div>
        </div>
      </div>
    </>
  );
}
