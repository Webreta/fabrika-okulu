"use client";

import { useState } from "react";
import { Icon } from "@/components/site/Icon";
import { SessionJoinButton } from "@/components/panel/SessionJoinButton";
import { fmtDate, fmtTime } from "@/lib/format";

export type LiveSessionView = { index: number; title: string; start: string; end: string; link: string; notes: string };

/**
 * Oynatıcı yan sütunu: öğrencinin kayıtlı olduğu dönemin canlı oturumları. Sıradaki oturum vurgulu; geçmiş oturumlar
 * "Geçmiş oturumlar" altında katlanır. Katılım bağlantısı SessionJoinButton kuralıyla (başlangıçtan 15 dk önce) açılır.
 */
export function LiveSessionsCard({ periodName, sessions }: { periodName: string; sessions: LiveSessionView[] }) {
  const [showPast, setShowPast] = useState(false);
  if (sessions.length === 0) return null;
  const now = Date.now();
  const upcoming = sessions.filter((s) => new Date(s.end).getTime() >= now);
  const past = sessions.filter((s) => new Date(s.end).getTime() < now);
  const Row = ({ s, next }: { s: LiveSessionView; next: boolean }) => (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-3 ${next ? "bg-emerald-50/60" : ""}`}>
      <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-navy-800 text-white">
        <span className="text-sm font-bold leading-none">{new Date(s.start).getDate()}</span>
        <span className="text-[10px] uppercase">{fmtDate(s.start).split(" ")[1]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-800">{s.title}{next && <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Sıradaki</span>}</p>
        <p className="text-xs text-muted">{fmtDate(s.start, true)} · {fmtTime(s.start)}</p>
        {s.notes && <p className="mt-0.5 text-xs text-muted">{s.notes}</p>}
      </div>
      <SessionJoinButton start={s.start} end={s.end} link={s.link} />
    </li>
  );
  return (
    <div className="card p-0">
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 className="flex items-center gap-2 font-bold text-navy-800"><Icon name="video" className="size-4 text-emerald-600" /> Canlı oturumlar</h2>
        <span className="text-xs text-muted">{periodName}</span>
      </div>
      {upcoming.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">Yaklaşan canlı oturum yok.</p>
      ) : (
        <ul className="divide-y divide-line">{upcoming.map((s, i) => <Row key={s.index} s={s} next={i === 0} />)}</ul>
      )}
      {past.length > 0 && (
        <div className="border-t border-line">
          <button onClick={() => setShowPast((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted hover:bg-surface">
            Geçmiş oturumlar ({past.length}) <Icon name={showPast ? "chevronUp" : "chevronDown"} className="size-4" />
          </button>
          {showPast && <ul className="divide-y divide-line opacity-70">{past.map((s) => <Row key={s.index} s={s} next={false} />)}</ul>}
        </div>
      )}
    </div>
  );
}
