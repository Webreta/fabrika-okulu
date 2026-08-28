import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { PageTitle } from "@/components/panel/ui";
import { NotificationList } from "@/components/panel/NotificationList";
import { Pagination } from "@/components/panel/Pagination";

const PAGE_SIZE = 20;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const user = (await getCurrentUser())!;
  const [rows, [{ total }], [{ unread }]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(notifications).where(eq(notifications.userId, user.id)),
    db.select({ unread: sql<number>`count(*)`.mapWith(Number) }).from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.read, false))),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <PageTitle title="Bildirimler" />
      <NotificationList
        items={rows.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, read: n.read, createdAt: n.createdAt.toISOString() }))}
        unread={unread}
      />
      <Pagination page={page} totalPages={totalPages} basePath="/panel/bildirim" />
    </>
  );
}
