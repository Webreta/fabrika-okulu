import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { PageTitle } from "@/components/panel/ui";
import { NotificationList } from "@/components/panel/NotificationList";

export default async function TeacherNotificationsPage() {
  const user = await requireTeacher();
  const list = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.id)).limit(60);
  return (
    <>
      <PageTitle title="Mesajlarım" />
      <NotificationList items={list.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, read: n.read, createdAt: n.createdAt.toISOString() }))} unread={list.filter((n) => !n.read).length} />
    </>
  );
}
