"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerQuestion, deleteThread, markThreadRead } from "@/app/actions/teacher";
import { relTime, initials } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

export type Thread = {
  key: string; userId: number; courseId: number; name: string; email: string; courseTitle: string; pending: number; lastAt: string;
  messages: { who: "student" | "teacher"; text: string; at: string; lesson: string }[];
};

export function ChatUI({ threads, initialKey, isAdmin = false }: { threads: Thread[]; initialKey?: string; isAdmin?: boolean }) {
  const [sel, setSel] = useState(initialKey && threads.some((t) => t.key === initialKey) ? initialKey : threads[0]?.key ?? "");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const router = useRouter();
  const t = threads.find((x) => x.key === sel);
  const list = threads.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()) || x.courseTitle.toLowerCase().includes(q.toLowerCase()));
  const send = () => {
    if (!t || !text.trim()) return;
    start(async () => { const r = await answerQuestion(t.userId, t.courseId, text); if (r.ok) { setText(""); router.refresh(); } });
  };
  return (
    <div className="card grid h-[70vh] grid-cols-1 overflow-hidden p-0 md:grid-cols-[300px_1fr]">
      <aside className="flex flex-col border-r border-line">
        <div className="border-b border-line p-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" className="input" /></div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && <p className="p-4 text-sm text-muted">Soru yok.</p>}
          {list.map((x) => (
            <button key={x.key} onClick={() => setSel(x.key)} className={`flex w-full gap-3 border-b border-line px-3 py-3 text-left hover:bg-surface ${sel === x.key ? "bg-sky-50" : ""}`}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">{initials(x.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between"><span className="truncate text-sm font-semibold text-navy-800">{x.name}</span><span className="text-[11px] text-muted">{relTime(x.lastAt)}</span></span>
                <span className="block truncate text-xs text-muted">{x.courseTitle}</span>
                <span className="block truncate text-xs">{x.messages[x.messages.length - 1]?.text}</span>
              </span>
              {x.pending > 0 && <span className="mt-1 size-2 shrink-0 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>
      </aside>
      <section className="flex flex-col">
        {!t ? (
          <p className="p-6 text-sm text-muted">Bir sohbet seç.</p>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="font-semibold text-navy-800">{t.name} <span className="text-xs font-normal text-muted">· {t.email}</span></p>
                <p className="text-xs text-muted">{t.courseTitle}</p>
              </div>
              <div className="flex gap-2 text-xs">
                {t.pending > 0 && <button disabled={pending} onClick={() => start(async () => { await markThreadRead(t.userId, t.courseId); router.refresh(); })} className="btn-secondary btn-sm">Okundu işaretle</button>}
                {isAdmin && <button disabled={pending} onClick={() => { if (confirm("Sohbet ve tüm mesajları silinsin mi?")) start(async () => { await deleteThread(t.userId, t.courseId); setSel(""); router.refresh(); }); }} className="btn-secondary btn-sm text-red-600">Sil</button>}
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {t.messages.map((m, i) => (
                <div key={i} className={`flex ${m.who === "teacher" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.who === "teacher" ? "bg-navy-800 text-white" : "bg-surface text-ink"}`}>
                    {m.lesson && <p className={`mb-0.5 text-[11px] ${m.who === "teacher" ? "text-white/70" : "text-muted"}`}>{m.lesson}</p>}
                    <p className="whitespace-pre-line">{m.text}</p>
                    <p className={`mt-1 text-[10px] ${m.who === "teacher" ? "text-white/60" : "text-muted"}`}>{relTime(m.at)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-line p-3">
              <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Cevabını yaz… (Enter gönderir)" className="input" />
              <button onClick={send} disabled={pending || !text.trim()} className="btn-primary"><Icon name="send" className="size-4" /></button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
