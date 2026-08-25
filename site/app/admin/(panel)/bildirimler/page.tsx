import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationLog, pushSubscriptions, users, courses } from "@/db/schema";
import { getSetting } from "@/lib/settings";
import { MAIL_TYPES } from "@/lib/mailer";
import { fmtDateTime } from "@/lib/format";
import { PageTitle, Tabs, Kpi } from "@/components/panel/ui";
import { AnnounceForm } from "@/components/teacher/AnnounceForm";
import { MailTemplatesForm } from "@/components/admin/MailTemplatesForm";

export default async function NotificationsAdminPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const { sekme = "gonder" } = await searchParams;
  const tabs = [["gonder", "Gönder"], ["gecmis", "Geçmiş"], ["aboneler", "Aboneler"], ["mail", "Mail Ayarları"]];
  const cs = await db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.status, "published")).orderBy(courses.title);
  return (
    <>
      <PageTitle title="Bildirimler" sub="Uygulama içi + web push duyuruları ve e-posta şablonları" />
      <Tabs items={tabs.map(([k, l]) => ({ href: `/admin/bildirimler?sekme=${k}`, label: l, active: sekme === k }))} />
      {sekme === "gonder" && (
        <>
          {!process.env.VAPID_PUBLIC_KEY && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">VAPID anahtarları tanımlı değil; duyurular yalnızca uygulama içi bildirim olarak gider. <code>npx web-push generate-vapid-keys</code> ile üretip .env&apos;e ekleyin.</p>}
          <AnnounceForm courses={cs} isAdmin />
        </>
      )}
      {sekme === "gecmis" && <History />}
      {sekme === "aboneler" && <Subscribers />}
      {sekme === "mail" && <MailTemplatesForm templates={await getSetting("mailTemplates")} types={Object.entries(MAIL_TYPES).map(([k, v]) => ({ key: k, title: v.title, to: v.to }))} />}
    </>
  );
}

async function History() {
  const log = await db.select().from(notificationLog).orderBy(desc(notificationLog.id)).limit(100);
  return (
    <div className="card overflow-x-auto p-0">
      <table className="table">
        <thead><tr><th>Tarih</th><th>Kanal</th><th>Başlık</th><th>Hedef</th><th>Adet</th></tr></thead>
        <tbody>{log.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">Kayıt yok.</td></tr>}{log.map((l) => <tr key={l.id}><td className="text-xs">{fmtDateTime(l.createdAt)}</td><td className="text-xs">{l.channel}</td><td className="font-semibold text-navy-800">{l.title}</td><td className="text-sm">{l.target}</td><td>{l.sentCount}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

async function Subscribers() {
  const [[all], [students], [teachers]] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number), u: sql<number>`count(distinct ${pushSubscriptions.userId})`.mapWith(Number) }).from(pushSubscriptions),
    db.select({ n: sql<number>`count(distinct ${pushSubscriptions.userId})`.mapWith(Number) }).from(pushSubscriptions).innerJoin(users, eq(pushSubscriptions.userId, users.id)).where(eq(users.role, "student")),
    db.select({ n: sql<number>`count(distinct ${pushSubscriptions.userId})`.mapWith(Number) }).from(pushSubscriptions).innerJoin(users, eq(pushSubscriptions.userId, users.id)).where(eq(users.role, "teacher")),
  ]);
  return <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><Kpi label="Toplam abonelik" value={all.n} icon="bell" /><Kpi label="Kullanıcı" value={all.u} icon="users" color="sky" /><Kpi label="Öğrenci" value={students.n} icon="user" color="green" /><Kpi label="Eğitmen" value={teachers.n} icon="users" color="amber" /></div>;
}
