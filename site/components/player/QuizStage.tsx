"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQuiz, type QuizResult } from "@/app/actions/player";
import type { QuizReviewItem } from "@/lib/course-logic";
import { fmtDateTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

type Q = { id: number; text: string; type: string; options: string[]; image: string; points: number };
type Payload = {
  id: number; title: string; description: string; timeLimit: number; passScore: number; maxAttempts: number; shuffle?: boolean;
  questions: Q[];
  attempts: { id: number; score: number | null; earned: number; total: number; status: string; passed: boolean | null; at: string }[];
  canAttempt: boolean;
  /** Geçerli denemelerden biri geçti */
  passed?: boolean;
  /** Geçemedi ve deneme hakkı bitti */
  exhausted?: boolean;
  /** Kalan deneme hakkı (null = sınırsız) */
  left?: number | null;
  due: string | null;
  /** Yalnızca sınav GEÇİLDİYSE dolu: geçen denemenin cevapları (doğru cevap / açıklama ayarlara göre) */
  review?: QuizReviewItem[];
};

/**
 * Sınav sahnesi. Sorular tek tek gezilir (Önceki/Sonraki), cevaplar yalnızca "Sınavı bitir" ile gönderilir;
 * çözerken doğru/yanlış bilgisi verilmez (2026-10-10 kararı: soru bazlı anında geri bildirim kaldırıldı).
 * Sonuçta doğru/yanlış listesi yalnızca sınav geçildiyse gösterilir; geçemeyen öğrenci cevapları göremez
 * (yeniden çözebileceği için). Açıklamaların gösterilmesi yönetici ayarıdır (panel.quizExplanations).
 */
export function QuizStage({ payload, courseId, nextUrl, preview }: { payload: Payload; courseId: number; nextUrl: string | null; preview: boolean }) {
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [qs] = useState(() => payload.shuffle ? [...payload.questions].sort(() => Math.random() - 0.5) : payload.questions);
  const q = qs[idx];
  const last = payload.attempts[payload.attempts.length - 1];
  const unanswered = qs.filter((x) => answers[String(x.id)] === undefined || answers[String(x.id)] === "").length;

  const begin = () => { setAnswers({}); setIdx(0); setResult(null); setStarted(true); };

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
            <h2 className="mt-2 text-xl font-bold text-navy-800">{result.passed ? "Tebrikler, geçtin 🎉" : "Sınav tamamlandı"}</h2>
            <p className="text-muted">Test soruların: {result.correct}/{result.count} doğru · Puan: %{result.score}{payload.passScore > 0 && (result.passed ? " · Geçtin" : ` · Geçme notu %${payload.passScore}`)}</p>
            {!result.passed && (
              <p className="mx-auto mt-3 max-w-xl rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Geçme notunun altında kaldın; bu sınav tamamlanmış sayılmadı.{" "}
                {result.canRetry
                  ? `Yeniden çözebilirsin${result.left ? ` (kalan hak: ${result.left})` : ""}.`
                  : "Deneme hakkın bitti. Sonraki içeriklere devam edebilirsin; yeni hak için eğitmenine yazabilirsin."}
              </p>
            )}
            {result.passed && result.review && result.review.length > 0 && <ReviewList items={result.review} light />}
          </>
        ) : (
          <>
            <Icon name="check" className="mx-auto size-12 text-emerald-500" />
            <h2 className="mt-3 text-xl font-bold text-navy-800">Yanıtların kaydedildi 🎉</h2>
            <p className="text-muted">Sınavı tamamladın.</p>
          </>
        )}
        <div className="mt-5 flex justify-center gap-2">
          {result.ok && !result.passed && result.canRetry && <button onClick={begin} className="btn-primary">Tekrar çöz</button>}
          {nextUrl && result.ok && (result.passed || !result.canRetry) && <Link href={nextUrl} className="btn-primary">Sıradaki içeriğe geç <Icon name="arrowRight" className="size-4" /></Link>}
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
          <p className="relative mt-3 text-sm text-[#fff]/80">
            {qs.length} soru{payload.passScore > 0 && <> · Geçme notu <span className="font-semibold">%{payload.passScore}</span></>}{payload.maxAttempts > 0 && <> · Deneme hakkı <span className="font-semibold">{payload.maxAttempts}</span></>}
            {payload.due && <> · Son tarih: <span className="font-semibold">{fmtDateTime(payload.due)}</span></>}
          </p>
          {last && (
            <div className="relative mt-4 rounded-xl border border-[#fff]/25 bg-[#000]/15 p-3 text-sm">
              <span className="font-semibold">Sonucun:</span> {last.total > 0 ? `${last.earned}/${last.total} puan · %${last.score}` : "Yanıtların kaydedildi"}{payload.passScore > 0 && last.total > 0 && (last.passed ? " · Geçtin" : ` · Geçme notu %${payload.passScore}`)} · <span className="text-[#fff]/70">{fmtDateTime(last.at)}</span>
            </div>
          )}
          {last && !payload.passed && (
            <p className="relative mt-3 rounded-xl border border-amber-200/50 bg-amber-400/15 p-3 text-sm">
              Geçme notunun altında kaldın; bu sınav tamamlanmış sayılmadı.{" "}
              {payload.canAttempt
                ? `Yeniden çözebilirsin${payload.left ? ` (kalan hak: ${payload.left})` : ""}.`
                : "Deneme hakkın bitti. Sonraki içeriklere devam edebilirsin; yeni hak için eğitmenine yazabilirsin."}
            </p>
          )}
          {payload.passed && (payload.review?.length ?? 0) > 0 && <ReviewList items={payload.review!} />}
          <div className="relative mt-6 flex flex-wrap items-center gap-3">
            {payload.canAttempt && !preview && qs.length > 0 ? (
              <button onClick={begin} className="inline-flex items-center gap-2 rounded-lg bg-[#fff] px-5 py-2.5 text-sm font-bold text-[#142b56] shadow transition hover:bg-[#eaf6fc]"><Icon name="play" className="size-4" /> {last ? "Tekrar çöz" : "Sınava başla"}</button>
            ) : (
              <span className="text-sm text-[#fff]/80">{preview ? "Önizleme modunda sınav çözülemez." : qs.length === 0 ? "Sınavda soru yok." : payload.passed === false ? "Deneme hakkın bitti." : "Bu sınavı tamamladın. Cevaplarını yukarıda görebilirsin."}</span>
            )}
            {nextUrl && last && (payload.passed !== false || !payload.canAttempt) && <Link href={nextUrl} className="inline-flex items-center gap-2 rounded-lg border border-[#fff]/50 px-4 py-2.5 text-sm font-semibold text-[#fff] hover:bg-[#fff]/10">Sıradaki içerik <Icon name="arrowRight" className="size-4" /></Link>}
          </div>
        </div>
      </div>
    );
  }

  const a = answers[String(q.id)];
  const optionCls = (selected: boolean) => (selected ? "border-navy-800 bg-navy-50" : "border-line hover:bg-surface");
  const isLast = idx >= qs.length - 1;
  return (
    <div className="card">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Soru {idx + 1} / {qs.length}</span>
        <span>{qs.length - unanswered} cevaplandı</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100"><div className="h-full bg-sky-400" style={{ width: `${((idx + 1) / qs.length) * 100}%` }} /></div>
      <h2 className="mt-5 text-lg font-semibold text-navy-800">{q.text}</h2>
      {q.image && <img src={q.image} alt="" className="mt-3 max-h-72 rounded-lg" />}
      <div className="mt-4 space-y-2">
        {q.type === "multiple_choice" && q.options.map((o, i) => (
          <button key={i} onClick={() => setAnswers({ ...answers, [q.id]: i })} aria-pressed={a === i} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${optionCls(a === i)}`}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold">{String.fromCharCode(65 + i)}</span>{o}
          </button>
        ))}
        {q.type === "true_false" && ["true", "false"].map((v) => (
          <button key={v} onClick={() => setAnswers({ ...answers, [q.id]: v })} aria-pressed={a === v} className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${optionCls(a === v)}`}>{v === "true" ? "Doğru" : "Yanlış"}</button>
        ))}
        {q.type === "open_ended" && <textarea aria-label="Cevabını yaz" rows={5} value={(a as string) ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} className="input" placeholder="Cevabını yaz…" />}
      </div>
      {/* Soru noktaları: cevaplanan dolu, cevapsız boş; tıklayınca o soruya gidilir */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {qs.map((x, i) => {
          const has = answers[String(x.id)] !== undefined && answers[String(x.id)] !== "";
          return <button key={x.id} onClick={() => setIdx(i)} aria-label={`Soru ${i + 1}`} className={`size-7 rounded-full border text-[11px] font-semibold transition ${i === idx ? "border-navy-800 bg-navy-800 text-white" : has ? "border-sky-400 bg-sky-100 text-navy-800" : "border-line text-muted hover:bg-surface"}`}>{i + 1}</button>;
        })}
      </div>
      {isLast && unanswered > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{unanswered} soru cevapsız. Cevapsız sorular yanlış sayılır; yukarıdaki numaralardan geri dönebilirsin.</p>}
      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="btn-secondary btn-sm">Önceki</button>
        <Link href={`/kurs-izle/${courseId}`} className="text-sm text-muted hover:underline">Çık</Link>
        {!isLast ? (
          <button onClick={() => setIdx(idx + 1)} className="btn-primary btn-sm">Sonraki</button>
        ) : (
          <button onClick={finish} disabled={pending} className="btn-primary btn-sm">{pending ? "Gönderiliyor…" : "Sınavı bitir"}</button>
        )}
      </div>
    </div>
  );
}

/** Geçilen sınavın cevapları: doğru/yanlış, (ayara göre) doğru cevap ve açıklama. light: açık zeminli sonuç kartında */
function ReviewList({ items, light = false }: { items: QuizReviewItem[]; light?: boolean }) {
  const txt = light ? "text-navy-800" : "text-[#fff]";
  const sub = light ? "text-muted" : "text-[#fff]/85";
  return (
    <div className={`relative mt-4 rounded-xl p-4 text-left text-sm ${light ? "border border-line bg-surface" : "border border-[#fff]/25 bg-[#000]/15"}`}>
      <p className={`mb-3 font-semibold ${txt}`}>Cevapların</p>
      <ol className="space-y-2">
        {items.map((r, i) => (
          <li key={i} className={`rounded-lg p-3 ${r.isCorrect === true ? (light ? "bg-emerald-50" : "bg-emerald-500/20") : r.isCorrect === false ? (light ? "bg-red-50" : "bg-red-500/20") : light ? "bg-white" : "bg-[#fff]/10"}`}>
            <p className={`font-semibold ${txt}`}>{i + 1}. {r.text}</p>
            <p className={`mt-1 ${sub}`}>
              Senin cevabın: <b>{r.yourAnswer ?? "—"}</b>
              {r.isCorrect === true && <span className={`ml-1 font-semibold ${light ? "text-emerald-700" : "text-emerald-200"}`}>✓ Doğru</span>}
              {r.isCorrect === false && <span className={`ml-1 font-semibold ${light ? "text-red-700" : "text-red-200"}`}>✗ Yanlış</span>}
            </p>
            {r.isCorrect === false && r.correctAnswer && <p className={sub}>Doğru cevap: <b>{r.correctAnswer}</b></p>}
            {r.type === "open_ended" && <p className={`text-[11px] ${light ? "text-muted" : "text-[#fff]/60"}`}>Açık uçlu soru — puanlanmaz</p>}
            {r.explanation && <p className={`mt-1 ${light ? "text-muted" : "text-[#fff]/75"}`}>{r.explanation}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
