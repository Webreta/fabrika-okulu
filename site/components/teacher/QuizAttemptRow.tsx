"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quizAttemptDetail, gradeOpenEnded } from "@/app/actions/teacher";
import { fmtDateTime } from "@/lib/format";
import { Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export type AttemptRow = { id: number; student: string; title: string; course: string; status: string; earned: number; total: number; score: number | null; at: string };
type Detail = NonNullable<Awaited<ReturnType<typeof quizAttemptDetail>>>;

export function QuizAttemptRow({ row }: { row: AttemptRow }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [grades, setGrades] = useState<Record<string, { points: number; feedback: string }>>({});
  const [feedback, setFeedback] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const open = () => start(async () => { const d = await quizAttemptDetail(row.id); setDetail(d); setFeedback(d?.feedback ?? ""); const g: typeof grades = {}; d?.questions.forEach((q) => { if (q.type === "open_ended") g[q.id] = q.grade ?? { points: 0, feedback: "" }; }); setGrades(g); });
  return (
    <div className="card flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-semibold text-navy-800">{row.title}</p>
        <p className="text-xs text-muted">{row.student} · {row.course} · {fmtDateTime(row.at)}</p>
      </div>
      <div className="flex items-center gap-2">
        {row.status === "pending_review" ? <Chip color="amber">Değerlendirme bekliyor</Chip> : <Chip color="green">{row.earned}/{row.total} · %{row.score}</Chip>}
        <button onClick={open} disabled={pending} className="btn-secondary btn-sm">{pending ? "…" : "İncele"}</button>
      </div>
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div><h3 className="text-lg font-bold text-navy-800">{detail.title}</h3><p className="text-sm text-muted">{detail.student}{detail.score !== null && ` · %${detail.score}`}</p></div>
              <button onClick={() => setDetail(null)}><Icon name="x" className="size-5" /></button>
            </div>
            <ol className="mt-4 space-y-3">
              {detail.questions.map((q, i) => (
                <li key={q.id} className={`rounded-lg border p-3 text-sm ${q.correct === true ? "border-emerald-200 bg-emerald-50" : q.correct === false ? "border-red-200 bg-red-50" : "border-line"}`}>
                  <p className="font-semibold text-navy-800">{i + 1}. {q.text} <span className="text-xs text-muted">({q.points} puan)</span></p>
                  <p className="mt-1">Cevap: <b>{q.answer ?? "—"}</b>{q.correct === false && <span className="text-muted"> · Doğru: {q.correctAnswer}</span>}</p>
                  {q.type === "open_ended" && detail.status === "pending_review" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="number" min={0} max={q.points} value={grades[q.id]?.points ?? 0} onChange={(e) => setGrades({ ...grades, [q.id]: { ...grades[q.id], points: Number(e.target.value), feedback: grades[q.id]?.feedback ?? "" } })} className="input w-20" />
                      <span className="text-xs text-muted">/ {q.points}</span>
                      <input value={grades[q.id]?.feedback ?? ""} onChange={(e) => setGrades({ ...grades, [q.id]: { points: grades[q.id]?.points ?? 0, feedback: e.target.value } })} placeholder="Geri bildirim" className="input flex-1" />
                    </div>
                  )}
                  {q.type === "open_ended" && q.grade && detail.status !== "pending_review" && <p className="mt-1 text-xs text-muted">Puan: {q.grade.points}/{q.points} {q.grade.feedback && `· ${q.grade.feedback}`}</p>}
                </li>
              ))}
            </ol>
            {detail.status === "pending_review" ? (
              <div className="mt-4 space-y-2">
                <label className="label">Öğrenciye cevap / genel geri bildirim</label>
                <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Değerlendirmeyle birlikte öğrenciye iletilecek cevabın…" className="input" />
                <button disabled={pending} onClick={() => start(async () => { await gradeOpenEnded(detail.id, grades, feedback); setDetail(null); router.refresh(); })} className="btn-primary">{pending ? "…" : "Puanla ve bildir"}</button>
              </div>
            ) : detail.feedback ? (
              <p className="mt-4 rounded-lg bg-surface p-3 text-sm"><b>Cevabın:</b> {detail.feedback}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
