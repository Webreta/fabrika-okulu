"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/panel";
import { relTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

type N = { id: number; title: string; body: string; url: string; read: boolean; createdAt: string };

export function NotificationList({ items, unread }: { items: N[]; unread: number }) {
  const router = useRouter();
  return (
    <div className="card p-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="text-sm text-muted">{unread} okunmamış</span>
        {unread > 0 && (
          <button onClick={async () => { await markAllNotificationsRead(); router.refresh(); }} className="text-sm font-semibold text-sky-600 hover:underline">Tümünü okundu işaretle</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">Henüz mesajın yok.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((n) => (
            <li key={n.id} className={`${n.read ? "" : "bg-sky-50/60"}`}>
              <Link
                href={n.url || "#"}
                onClick={() => { if (!n.read) markNotificationRead(n.id); }}
                className="flex gap-3 px-5 py-3 hover:bg-surface"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-sky-400"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-800">{n.title}</p>
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted">{relTime(n.createdAt)}</p>
                </div>
                {n.url && <Icon name="arrowRight" className="size-4 self-center text-muted" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
