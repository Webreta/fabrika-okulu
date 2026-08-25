import { desc } from "drizzle-orm";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/panel/ui";
import { MessageActions } from "@/components/admin/MessageActions";

export default async function MessagesPage() {
  const list = await db.select().from(contactMessages).orderBy(desc(contactMessages.id)).limit(200);
  return (
    <>
      <PageTitle title="İletişim Mesajları" sub={`${list.filter((m) => !m.read).length} okunmamış`} />
      <div className="space-y-3">
        {list.length === 0 && <p className="card text-muted">Mesaj yok.</p>}
        {list.map((m) => (
          <div key={m.id} className={`card ${m.read ? "" : "border-sky-300 bg-sky-50/40"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold text-navy-800">{m.name} <a href={`mailto:${m.email}`} className="text-sm font-normal text-sky-600">{m.email}</a></p><p className="text-xs text-muted">{m.subject && `${m.subject} · `}{fmtDateTime(m.createdAt)}</p></div>
              <MessageActions id={m.id} read={m.read} />
            </div>
            <p className="mt-3 whitespace-pre-line text-sm">{m.message}</p>
          </div>
        ))}
      </div>
    </>
  );
}
