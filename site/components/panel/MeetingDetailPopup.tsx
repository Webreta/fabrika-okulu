"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { canJoin, canMarkAttended } from "@/lib/meeting";
import { MeetingAttendButton } from "@/components/panel/MeetingAttendButton";
import { Icon, type IconName } from "@/components/site/Icon";
import { Modal } from "@/components/site/Modal";

type S = { index: number; title: string; start: string; end: string; link: string; attended: boolean };

/** Kitaplığım kartındaki "Görüşme detayı": sayfa açmak yerine oturum listesini popup'ta gösterir */
export function MeetingDetailPopup({ courseId, periodId, title, periodName, minutes, sessions, trigger }: { courseId: number; periodId: number; title: string; periodName: string; minutes: number; sessions: S[]; trigger?: { label: string; className: string; icon?: IconName } }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const done = sessions.filter((s) => s.attended).length;
  return (
    <>
      {trigger ? (
        <button type="button" onClick={() => setOpen(true)} className={trigger.className}>{trigger.icon && <Icon name={trigger.icon} className="size-4" />} {trigger.label}</button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 block w-full text-center text-xs text-muted hover:underline">Görüşme detayı</button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} className="max-w-lg">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-navy-800">{title}</h3>
                <p className="text-xs text-muted">{periodName}{minutes ? ` · ${minutes} dk` : ""}{sessions.length > 1 ? ` · ${done}/${sessions.length} görüşme tamamlandı` : ""}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-surface" aria-label="Kapat"><Icon name="x" className="size-5" /></button>
            </div>
            <ul className="divide-y divide-line">
              {sessions.map((s) => {
                const ses = { ...s, start: new Date(s.start), end: new Date(s.end) };
                const passed = ses.end.getTime() < now.getTime();
                return (
                  <li key={s.index} className="flex flex-wrap items-center gap-3 py-3">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${s.attended ? "bg-emerald-50 text-emerald-600" : passed ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700"}`}>
                      <Icon name={s.attended ? "check" : "video"} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-800">{s.title}</p>
                      <p className="text-xs text-muted"><span className="date-chip">{fmtDateTime(ses.start)}</span></p>
                    </div>
                    {s.attended ? (
                      <span className="text-xs font-semibold text-emerald-700">Katıldım ✓</span>
                    ) : canJoin(ses, now) && s.link ? (
                      <Link href={s.link} target="_blank" rel="noopener" className="btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700"><Icon name="video" className="size-4" /> Katıl</Link>
                    ) : canMarkAttended(ses, now) ? (
                      <MeetingAttendButton courseId={courseId} periodId={periodId} sessionIndex={s.index} label="Katıldım" className="btn-secondary btn-sm" />
                    ) : (
                      <span className="text-xs text-muted">Bağlantı 15 dk önce açılır</span>
                    )}
                  </li>
                );
              })}
            </ul>
      </Modal>
    </>
  );
}
