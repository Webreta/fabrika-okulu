"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQuiz, answerQuizQuestion, type QuizResult } from "@/app/actions/player";
import { fmtDateTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

type Q = { id: number; text: string; type: string; options: string[]; image: string; points: number };
type ReviewItem = { text: string; type: string; options: string[]; image: string; points: number; yourAnswer: string | null; correctAnswer: string; isCorrect: boolean | null; explanation: string };
type Payload = {
  id: number; title: string; description: string; timeLimit: number; passScore: number; maxAttempts: number; shuffle?: boolean;
  questions: Q[];
  attempts: { id: number; score: number | null; earned: number; total: number; status: string; passed: boolean | null; at: string }[];
  canAttempt: boolean;
  due: string | null;
  review?: ReviewItem[];
};

type Feedback = { correct: boolean; correctAnswer: number | string | null; explanation: string };

export function QuizStage({ payload, courseId, nextUrl, preview, instant = false }: { payload: Payload; courseId: number; nextUrl: string | null; preview: boolean; instant?: boolean }) {
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [qs] = useState(() => payload.shuffle ? [...payload.questions].sort(() => Math.random() - 0.5) : payload.questions);
  const q = qs[idx];
  const last = payload.attempts[payload.attempts.length - 1];

  const finish = () =>
    start(async () => {
      const r = await submitQuiz(payload.id, answers);
      setResult(r);
      if (r.ok) router.refresh();
    });

  if (result) {
    return (
      <div className="card text-center">
        {!result.ok ? (
          <p className="text-red-600">{result.error}</p>
        ) : result.count > 0 ? (
          <>
            <p className="text-6xl font-bold text-navy-800">{result.correct}<span className="text-2xl text-muted">/{result.count}</span></p>
            <h2 className="mt-2 text-xl font-bold text-navy-800">Tamamlandı 🎉</h2>
            <p className="text-muted">Test soruların: {result.correct}/{result.count} doğru · Puan: %{result.score}{payload.passScore > 0 && (result.passed ? " · Geçtin" : ` · Geçme notu %${payload.passScore}`)}</p>
          </>
        ) : (
          <>
            <Icon name="check" className="mx-auto size-12 text-emerald-500" />
            <h2 className="mt-3 text-xl font-bold text-navy-800">Yanıtların kaydedildi 🎉</h2>
            <p className="text-muted">Sınavı tamamladın.</p>
          </>
        )}
        <div className="mt-5 flex justify-center gap-2">
          {nextUrl && result.ok && <Link href={nextUrl} className="btn-primary">Sıradaki içeriğe geç <Icon name="arrowRight" className="size-4" /></Link>}
          <Link href={`/kurs-izle/${courseId}`} className="btn-secondary">Kursa dön</Link>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#142b56] via-[#1d4a7a] to-[#3d97bd] text-[#fff] shadow-xl">
        <div className="relative p-6 md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-[#fff]/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-[#5baecf]/30 blur-3xl" />
          <span className="relative inline-flex items-center gap-1.5 rounded-full border border-[#fff]/40 bg-[#fff]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"><Icon name="quiz" className="size-3.5" /> Sınav</span>
          <h1 className="relative mt-4 text-2xl font-bold md:text-3xl">{payload.title}</h1>
          {payload.description && <p className="relative mt-2 max-w-2xl text-[#fff]/80">{payload.description}</p>}
          {payload.due && <p className="relative mt-3 text-sm text-[#fff]/80">Son tarih: <span className="font-semibold">{fmtDateTime(payload.due)}</span></p>}
          {last && (
            <div className="relative mt-4 rounded-xl border border-[#fff]/25 bg-[#000]/15 p-3 text-sm">
              <span className="font-semibold">Sonucun:</span> {last.total > 0 ? `${last.earned}/${last.total} puan · %${last.score}` : "Yanıtların kaydedildi"} · <span className="text-[#fff]/70">{fmtDateTime(last.at)}</span>
            </div>
          )}
          {(payload.review?.length ?? 0) > 0 && (
            <div className="relative mt-3 rounded-xl border border-[#fff]/25 bg-[#000]/15 p-4 text-sm">
              <p className="mb-3 font-semibold">Cevapların</p>
              <ol className="space-y-2">
                {payload.review!.map((r, i) => (
                  <li key={i} className={`rounded-lg p-3 ${r.isCorrect === true ? "bg-emerald-500/20" : r.isCorrect === false ? "bg-red-500/20" : "bg-[#fff]/10"}`}>
                    <p className="font-semibold">{i + 1}. {r.text}</p>
                    <p className="mt-1 text-[#fff]/85">
                      Senin cevabın: <b>{r.yourAnswer ?? "—"}</b>
                      {r.isCorrect === true && <span className="ml-1 font-semibold text-emerald-200">✓ Doğru</span>}
                      {r.isCorrect === false && <span className="ml-1 font-semibold text-red-200">✗ Yanlış</span>}
                    </p>
                    {r.isCorrect === false && r.correctAnswer && <p className="text-[#fff]/85">Doğru cevap: <b>{r.correctAnswer}</b></p>}
                    {r.type === "open_ended" && <p className="text-[11px] text-[#fff]/60">Açık uçlu soru — puanlanmaz</p>}
                    {r.explanation && <p className="mt-1 text-[#fff]/75">{r.explanation}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="relative mt-6 flex flex-wrap items-center gap-3">
            {payload.canAttempt && !preview && qs.length > 0 ? (
              <button onClick={() => setStarted(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#fff] px-5 py-2.5 text-sm font-bold text-[#142b56] shadow transition hover:bg-[#eaf6fc]"><Icon name="play" className="size-4" /> Sınava başla</button>
            ) : (
              <span className="text-sm text-[#fff]/80">{preview ? "Önizleme modunda sınav çözülemez." : qs.length === 0 ? "Sınavda soru yok." : "Bu sınavı tamamladın. Cevaplarını yukarıda görebilirsin."}</span>
            )}
            {nextUrl && last && <Link href={nextUrl} className="inline-flex items-center gap-2 rounded-lg border border-[#fff]/50 px-4 py-2.5 text-sm font-semibold text-[#fff] hover:bg-[#fff]/10">Sıradaki içerik <Icon name="arrowRight" className="size-4" /></Link>}
          </div>
        </div>
      </div>
    );
  }

  const a = answers[String(q.id)];
  // Anlık mod: cevabı kontrol et → doğru/yanlış + açıklama → sonraki soru
  const checkAnswer = () =>
    start(async () => {
      const r = await answerQuizQuestion(payload.id, q.id, a!);
      if (r.ok) setFeedback({ correct: r.correct, correctAnswer: r.correctAnswer, explanation: r.explanation });
    });
  const goNext = () => {
    setFeedback(null);
    if (idx < qs.length - 1) setIdx(idx + 1);
    else finish();
  };
  const optionCls = (selected: boolean, isCorrect: boolean) => {
    if (instant && feedback) {
      if (isCorrect) return "border-emerald-500 bg-emerald-50";
      if (selected && !feedback.correct) return "border-red-500 bg-red-50";
      return "border-line opacity-60";
    }
    return selected ? "border-navy-800 bg-navy-50" : "border-line hover:bg-surface";
  };
  return (
    <div className="card">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Soru {idx + 1} / {qs.length}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100"><div className="h-full bg-sky-400" style={{ width: `${((idx + 1) / qs.length) * 100}%` }} /></div>
      <h2 className="mt-5 text-lg font-semibold text-navy-800">{q.text}</h2>
      {q.image && <img src={q.image} alt="" className="mt-3 max-h-72 rounded-lg" />}
      <div className="mt-4 space-y-2">
        {q.type === "multiple_choice" && q.options.map((o, i) => (
          <button key={i} disabled={instant && !!feedback} onClick={() => setAnswers({ ...answers, [q.id]: i })} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${optionCls(a === i, instant && !!feedback && feedback!.correctAnswer === i)}`}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold">{String.fromCharCode(65 + i)}</span>{o}
          </button>
        ))}
        {q.type === "true_false" && ["true", "false"].map((v) => (
          <button key={v} disabled={instant && !!feedback} onClick={() => setAnswers({ ...answers, [q.id]: v })} className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${optionCls(a === v, instant && !!feedback && feedback!.correctAnswer === v)}`}>{v === "true" ? "Doğru" : "Yanlış"}</button>
        ))}
        {q.type === "open_ended" && <textarea rows={5} value={(a as string) ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} className="input" placeholder="Cevabını yaz…" />}
      </div>
      {instant && feedback && (
        <div className={`mt-4 rounded-xl p-4 text-sm ${feedback.correct ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          <p className="font-bold">{feedback.correct ? "🎉 Tebrikler, doğru!" : "Maalesef yanlış."}</p>
          {!feedback.correct && q.type === "multiple_choice" && typeof feedback.correctAnswer === "number" && (
            <p className="mt-1">Doğru cevap: <b>{String.fromCharCode(65 + feedback.correctAnswer)} — {q.options[feedback.correctAnswer]}</b></p>
          )}
          {!feedback.correct && q.type === "true_false" && <p className="mt-1">Doğru cevap: <b>{feedback.correctAnswer === "true" ? "Doğru" : "Yanlış"}</b></p>}
          {feedback.explanation && <p className="mt-1">{feedback.explanation}</p>}
        </div>
      )}
      <div className="mt-6 flex items-center justify-between">
        {instant ? <span /> : <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="btn-secondary btn-sm">Önceki</button>}
        <Link href={`/kurs-izle/${courseId}`} className="text-sm text-muted hover:underline">Çık</Link>
        {instant && q.type !== "open_ended" ? (
          feedback ? (
            <button onClick={goNext} disabled={pending} className="btn-primary btn-sm">{pending ? "Gönderiliyor…" : idx < qs.length - 1 ? "Sonraki soru" : "Sınavı bitir"}</button>
          ) : (
            <button onClick={checkAnswer} disabled={pending || a === undefined} className="btn-primary btn-sm">{pending ? "Kontrol ediliyor…" : "Cevabı kontrol et"}</button>
          )
        ) : idx < qs.length - 1 ? (
          <button onClick={() => setIdx(idx + 1)} className="btn-primary btn-sm">Sonraki</button>
        ) : (
          <button onClick={finish} disabled={pending} className="btn-primary btn-sm">{pending ? "Gönderiliyor…" : "Sınavı bitir"}</button>
        )}
      </div>
    </div>
  );
}
