"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { askQuestion } from "@/app/actions/player";
import { relTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

export type QuestionItem = {
  id: number;
  text: string;
  lessonTitle: string;
  status: string;
  createdAt: string;
  answers: { id: number; text: string; isInstructor: boolean; name: string; createdAt: string }[];
};

type Msg = { who: "me" | "teacher"; text: string; at: string; lesson?: string };

/** Öğrenci ↔ eğitmen sohbeti (eğitmen panelindeki görünümle aynı) */
export function QuestionsPanel({ courseId, lessonId, lessonTitle, items }: { courseId: number; lessonId: number | null; lessonTitle: string; items: QuestionItem[]; userName?: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const bottom = useRef<HTMLDivElement>(null);

  const messages: Msg[] = items
    .flatMap((q) => [
      { who: "me" as const, text: q.text, at: q.createdAt, lesson: q.lessonTitle },
      ...q.answers.map((a) => ({ who: a.isInstructor ? ("teacher" as const) : ("me" as const), text: a.text, at: a.createdAt })),
    ])
    .sort((a, b) => a.at.localeCompare(b.at));

  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const send = () =>
    start(async () => {
      const r = await askQuestion(courseId, lessonId, lessonTitle, text);
      if (!r.ok) { setErr(r.error ?? "Hata"); return; }
      setText(""); setErr("");
      router.refresh();
    });

  return (
    <div className="flex h-[420px] flex-col rounded-xl border border-line">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-sm text-muted">Eğitmenine bu dersle ilgili sorunu yazabilirsin; cevap geldiğinde burada ve bildirimlerde görünür.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.who === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.who === "me" ? "bg-navy-800 text-white" : "bg-surface text-ink"}`}>
              {m.lesson && <p className={`mb-0.5 text-[11px] ${m.who === "me" ? "text-white/70" : "text-muted"}`}>{m.lesson}</p>}
              {m.who === "teacher" && <p className="mb-0.5 text-[11px] font-semibold text-sky-700">Eğitmen</p>}
              <p className="whitespace-pre-line">{m.text}</p>
              <p className={`mt-1 text-[10px] ${m.who === "me" ? "text-white/60" : "text-muted"}`}>{relTime(m.at)}</p>
            </div>
          </div>
        ))}
        {items.some((q) => q.status === "pending") && <p className="text-center text-[11px] text-amber-600">Eğitmen cevabı bekleniyor…</p>}
        <div ref={bottom} />
      </div>
      {err && <p className="px-4 text-xs text-red-600">{err}</p>}
      <div className="flex gap-2 border-t border-line p-3">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim().length >= 3) send(); } }}
          placeholder="Bu dersle ilgili sorunu yaz… (Enter gönderir)"
          className="input"
        />
        <button onClick={send} disabled={pending || text.trim().length < 3} className="btn-primary"><Icon name="send" className="size-4" /></button>
      </div>
    </div>
  );
}
