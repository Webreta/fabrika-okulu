import { desc } from "drizzle-orm";
import { db } from "@/db";
import { notificationLog } from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { teacherOverview } from "@/lib/data/teacher";
import { fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/panel/ui";
import { AnnounceForm } from "@/components/teacher/AnnounceForm";

export default async function AnnouncePage() {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return <p className="card text-muted">Yalnızca süper eğitmenler duyuru gönderebilir.</p>;
  const [ov, log] = await Promise.all([teacherOverview(user), db.select().from(notificationLog).orderBy(desc(notificationLog.id)).limit(30)]);
  return (
    <>
      <PageTitle title="Duyuru Gönder" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <AnnounceForm courses={ov.courses.map((c) => ({ id: c.id, title: c.title }))} isAdmin={user.role === "admin"} />
        <div className="card">
          <h2 className="mb-3 font-bold text-navy-800">Son gönderimler</h2>
          <ul className="divide-y divide-line text-sm">
            {log.length === 0 && <li className="py-2 text-muted">Henüz yok.</li>}
            {log.map((l) => <li key={l.id} className="py-2"><p className="font-semibold text-navy-800">{l.title}</p><p className="text-xs text-muted">{l.target} · {l.sentCount} kişi · <span className="date-chip">{fmtDateTime(l.createdAt)}</span></p></li>)}
          </ul>
        </div>
      </div>
    </>
  );
}
