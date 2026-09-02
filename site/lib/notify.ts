import "server-only";
import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, pushSubscriptions, notificationLog, users } from "@/db/schema";
import { categoryOfTag, wantsNotification } from "@/lib/notify-prefs";
import { siteUrl } from "@/lib/mailer";

// Uygulama içi bildirim her zaman yazılır; web push varsa ayrıca gönderilir.

function vapidReady() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:info@uretmer.com.tr", pub, priv);
    return true;
  } catch {
    return false;
  }
}

export async function notifyUser(
  userId: number,
  n: { title: string; body?: string; url?: string; tag?: string }
) {
  await notifyUsers([userId], n);
}

export async function notifyUsers(
  userIds: number[],
  n: { title: string; body?: string; url?: string; tag?: string }
): Promise<number> {
  let ids = [...new Set(userIds)].filter((x) => x > 0);
  if (ids.length === 0) return 0;
  // Kategorili bildirimde kullanıcı tercihine bak: kapattıysa hiç gönderme (uygulama içi + push)
  if (categoryOfTag(n.tag)) {
    const rows = await db.select({ id: users.id, prefs: users.notifyPrefs }).from(users).where(inArray(users.id, ids));
    ids = rows.filter((r) => wantsNotification(r.prefs, n.tag)).map((r) => r.id);
    if (ids.length === 0) return 0;
  }
  await db.insert(notifications).values(
    ids.map((userId) => ({
      userId,
      title: n.title,
      body: n.body ?? "",
      url: n.url ?? "",
      tag: n.tag ?? "",
    }))
  );

  if (!vapidReady()) return ids.length;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, ids));
  const payload = JSON.stringify({
    title: n.title,
    body: n.body ?? "",
    url: n.url ? (n.url.startsWith("http") ? n.url : siteUrl(n.url)) : siteUrl("/panel"),
    icon: siteUrl("/img/panel-icon.png"),
    tag: n.tag ?? "",
  });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
      }
    })
  );
  return ids.length;
}

export async function logNotification(entry: {
  channel: string;
  title: string;
  body?: string;
  target: string;
  sentCount: number;
  createdBy?: number;
}) {
  await db.insert(notificationLog).values({
    channel: entry.channel,
    title: entry.title,
    body: entry.body ?? "",
    target: entry.target,
    sentCount: entry.sentCount,
    createdBy: entry.createdBy ?? null,
  });
}

export async function unreadCount(userId: number) {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return rows.length;
}
