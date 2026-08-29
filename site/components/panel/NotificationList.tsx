"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationRead, markAllNotificationsRead, deleteNotification } from "@/app/actions/panel";
import { relTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

type N = { id: number; title: string; body: string; url: string; read: boolean; createdAt: string };

// Eski bildirimlerde başta kalmış olabilecek emoji ikonunu göstermeden ayıkla.
function cleanTitle(s: string) {
  return s.replace(/^\p{Extended_Pictographic}️?\s*/u, "");
}

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
        <p className="px-5 py-10 text-center text-sm text-muted">Henüz bildirimin yok.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex items-stretch ${n.read ? "" : "bg-gradient-to-r from-navy-900 via-navy-800 to-sky-700 text-white"}`}
            >
              <Link
                href={n.url || "#"}
                onClick={() => { if (!n.read) markNotificationRead(n.id); }}
                className={`flex flex-1 gap-3 px-5 py-3 ${n.read ? "hover:bg-surface" : "hover:brightness-110"}`}
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-white"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${n.read ? "text-navy-800" : "text-white"}`}>{cleanTitle(n.title)}</p>
                  {n.body && <p className={`text-sm ${n.read ? "text-muted" : "text-white/85"}`}>{n.body}</p>}
                  <p className="mt-1"><span className={`date-chip ${n.read ? "" : "bg-white/15 text-white"}`}>{relTime(n.createdAt)}</span></p>
                </div>
                {n.url && <Icon name="arrowRight" className={`size-4 self-center ${n.read ? "text-muted" : "text-white/80"}`} />}
              </Link>
              <button
                onClick={async () => { await deleteNotification(n.id); router.refresh(); }}
                aria-label="Bildirimi sil"
                title="Sil"
                className={`flex shrink-0 items-center px-4 ${n.read ? "text-muted hover:text-red-600 hover:bg-red-50" : "text-white/70 hover:text-white hover:bg-white/10"}`}
              >
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
