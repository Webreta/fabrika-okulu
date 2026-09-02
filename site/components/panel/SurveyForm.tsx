"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { SurveyMode, SurveyQuestion } from "@/db/schema";
import { submitSurvey } from "@/app/actions/panel";
import type { FormState } from "@/app/actions/auth";
import { estimateMinutes, groupBySection, isEmptyAnswer, isVisible, missingRequired, toArr, visibleQuestions, type Answers } from "@/lib/survey-logic";
import { Icon } from "@/components/site/Icon";

type SurveyLike = { id: number; title: string; intro: string; mode?: SurveyMode; sections: Record<string, string>; questions: SurveyQuestion[] };

function QuestionField({ q, value, onChange, invalid, autoFocus }: { q: SurveyQuestion; value: string | string[] | undefined; onChange: (v: string | string[]) => void; invalid: boolean; autoFocus?: boolean }) {
  const name = `q_${q.key}`;
  return (
    <div id={`soru-${q.key}`} className={`scroll-mt-24 rounded-xl transition ${invalid ? "-mx-3 border border-red-300 bg-red-50/60 px-3 py-2" : ""}`}>
      <label className="label">{q.label}{q.required && <span className="text-red-500"> *</span>}</label>
      {q.help && <p className="mb-1 text-xs text-muted">{q.help}</p>}
      {q.links && q.links.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {q.links.map((l, i) => l.style === "link" ? (
            <a key={i} href={l.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 underline underline-offset-2 hover:text-sky-700">{l.label} <Icon name="external" className="size-3.5" /></a>
          ) : (
            <a key={i} href={l.url} target="_blank" rel="noopener" className="btn-secondary btn-sm">{l.label} <Icon name="external" className="size-3.5" /></a>
          ))}
        </div>
      )}
      {q.type === "radio" && (
        <div className="space-y-1.5">
          {q.options?.map((o) => (
            <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${value === o.value ? "border-sky-400 bg-sky-50" : "border-line hover:bg-surface"}`}>
              <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} /> {o.label}
            </label>
          ))}
        </div>
      )}
      {q.type === "checkbox" && (
        <div className="space-y-1.5">
          {q.options?.map((o) => {
            const arr = toArr(value);
            const on = arr.includes(o.value);
            return (
              <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${on ? "border-sky-400 bg-sky-50" : "border-line hover:bg-surface"}`}>
                <input type="checkbox" name={name} value={o.value} checked={on} onChange={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])} /> {o.label}
              </label>
            );
          })}
        </div>
      )}
      {q.type === "text" && <input name={name} autoFocus={autoFocus} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />}
      {q.type === "date" && <input type="date" name={name} autoFocus={autoFocus} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />}
      {q.type === "textarea" && <textarea name={name} autoFocus={autoFocus} rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />}
      {invalid && <p className="mt-1 text-xs font-semibold text-red-600">Bu soru zorunlu.</p>}
    </div>
  );
}

/** Cevapları gizli input olarak taşır (adım adım modda ekranda yalnızca tek soru var) */
function HiddenAnswers({ answers, except }: { answers: Answers; except?: string }) {
  return (
    <>
      {Object.entries(answers).flatMap(([k, v]) => (k === except ? [] : toArr(v).filter((x) => x !== "").map((x, i) => <input key={`${k}-${i}`} type="hidden" name={`q_${k}`} value={x} />)))}
    </>
  );
}

/**
 * Öğrenci hedef testi formu.
 * 1) Karşılama ekranı: başlık + giriş metni + "Ankete başla" (skipIntro ile atlanır, örn. cevap güncelleme)
 * 2) mode="flow": tüm sorular tek sayfada, koşullu sorular cevaba göre aşağıda açılır
 *    mode="steps": tek soru kartı, cevap verilmeden "Devam" yok, sonraki soru kayarak gelir
 * preview=true: admin önizlemesi, kayıt yapılmaz.
 */
export function SurveyForm({ schema, answers, onDone, preview = false, skipIntro = false }: { schema: SurveyLike; answers: Answers; onDone?: () => void; preview?: boolean; skipIntro?: boolean }) {
  const [started, setStarted] = useState(skipIntro);
  const [a, setA] = useState<Answers>(answers);
  const [invalidKeys, setInvalidKeys] = useState<string[]>([]);
  const [clientError, setClientError] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const r = await submitSurvey(schema.id, p, fd);
    if (r.ok) onDone?.();
    return r;
  }, {});
  const questionCount = schema.questions.length;
  const steps = schema.mode === "steps";

  const set = (key: string, v: string | string[]) => {
    setA((prev) => ({ ...prev, [key]: v }));
    if (invalidKeys.includes(key)) setInvalidKeys((prev) => prev.filter((k) => k !== key));
    setClientError("");
  };

  /** Gönderimden önce istemci doğrulaması; hata varsa ilgili soruya kaydırır */
  const guard = (e: React.FormEvent<HTMLFormElement>) => {
    const missing = missingRequired(schema, a);
    if (preview || missing.length) {
      e.preventDefault();
      if (preview) { setClientError("Önizleme modunda kayıt yapılmaz."); return false; }
      setInvalidKeys(missing.map((q) => q.key));
      setClientError(missing.length === 1 ? `"${missing[0].label}" sorusu zorunlu.` : `${missing.length} zorunlu soru boş bırakıldı.`);
      document.getElementById(`soru-${missing[0].key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    setClientError("");
    return true;
  };

  if (!started) {
    return (
      <div className="mx-auto max-w-xl py-4 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-sky-100 text-sky-700"><Icon name="survey" className="size-8" /></span>
        <h2 className="mt-5 text-2xl font-bold text-navy-800">{schema.title}</h2>
        {schema.intro && <p className="mt-4 whitespace-pre-line text-left text-sm leading-relaxed text-muted sm:text-center">{schema.intro}</p>}
        <p className="mt-5 text-xs text-muted">{questionCount} soru · yaklaşık {estimateMinutes(questionCount)} dk</p>
        <button type="button" onClick={() => setStarted(true)} className="btn-primary mt-4">
          Teste başla <Icon name="arrowRight" className="size-4" />
        </button>
      </div>
    );
  }

  const feedback = (
    <>
      {(clientError || state.error) && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{clientError || state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
    </>
  );

  if (steps) {
    return <StepsForm schema={schema} a={a} set={set} action={action} guard={guard} pending={pending} preview={preview} feedback={feedback} onBackToIntro={skipIntro ? undefined : () => setStarted(false)} />;
  }

  // ---- Akış modu: tek sayfa
  const groups = groupBySection(schema.sections, schema.questions);
  return (
    <form action={action} onSubmit={guard} className="space-y-8" noValidate>
      {groups.map((g) => {
        const qs = g.questions.filter((q) => isVisible(q, a));
        if (!qs.length) return null;
        return (
          <fieldset key={g.key || "_"} className="space-y-4">
            {g.label && <legend className="mb-2 text-lg font-bold text-navy-800">{g.label}</legend>}
            {qs.map((q) => <QuestionField key={q.key} q={q} value={a[q.key]} onChange={(v) => set(q.key, v)} invalid={invalidKeys.includes(q.key)} />)}
          </fieldset>
        );
      })}
      {feedback}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">{pending ? "Kaydediliyor…" : preview ? "Kaydet (önizleme)" : "Kaydet"}</button>
        {!skipIntro && <button type="button" onClick={() => setStarted(false)} className="btn-secondary btn-sm">← Girişe dön</button>}
      </div>
    </form>
  );
}

// ---------------- Adım adım (kart) modu ----------------

function StepsForm({ schema, a, set, action, guard, pending, preview, feedback, onBackToIntro }: {
  schema: SurveyLike; a: Answers; set: (k: string, v: string | string[]) => void; action: (fd: FormData) => void;
  guard: (e: React.FormEvent<HTMLFormElement>) => boolean; pending: boolean; preview: boolean; feedback: React.ReactNode; onBackToIntro?: () => void;
}) {
  // Görünen sorular cevaplara göre değişir; konum soru anahtarıyla tutulur
  const list = useMemo(() => visibleQuestions(schema, a), [schema, a]);
  const [currentKey, setCurrentKey] = useState<string>(() => list[0]?.key ?? "");
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [shake, setShake] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Mevcut soru cevap değişince gizlenmişse (nadiren, kendi koşulu başka sorudaysa) en yakın görünene kay
  let idx = list.findIndex((q) => q.key === currentKey);
  if (idx < 0) idx = Math.min(list.length - 1, Math.max(0, schema.questions.findIndex((q) => q.key === currentKey)));
  const q = list[idx];
  if (!q) return <p className="text-sm text-muted">Bu testte gösterilecek soru yok.</p>;
  const isLast = idx === list.length - 1;
  const answered = !isEmptyAnswer(a[q.key]);
  const canContinue = answered; // cevap vermeden devam yok (zorunlu olmayan soruda "Atla" var)
  const sectionLabel = schema.sections[q.section] ?? Object.values(schema.sections)[0] ?? "";
  const sectionKeys = Object.keys(schema.sections);
  const sectionNo = Math.max(1, sectionKeys.indexOf(q.section) + 1);
  const answeredCount = list.filter((x) => !isEmptyAnswer(a[x.key])).length;
  const percent = Math.round((answeredCount / list.length) * 100);

  const go = (to: number, d: "next" | "prev") => {
    const target = list[to];
    if (!target) return;
    setDir(d);
    setCurrentKey(target.key);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const next = () => {
    if (!canContinue) { setShake(true); setTimeout(() => setShake(false), 400); return; }
    go(idx + 1, "next");
  };
  const skip = () => { if (!q.required) go(idx + 1, "next"); };

  return (
    <form
      action={action}
      onSubmit={(e) => { if (!isLast) { e.preventDefault(); next(); return; } guard(e); }}
      onKeyDown={(e) => { if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !isLast) { e.preventDefault(); next(); } }}
      className="mx-auto max-w-xl"
      noValidate
    >
      <HiddenAnswers answers={a} except={q.key} />

      {/* İlerleme */}
      <div ref={cardRef} className="mb-4 scroll-mt-24">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>{sectionKeys.length > 1 ? `Bölüm ${sectionNo}/${sectionKeys.length} · ` : ""}<b className="text-navy-800">{sectionLabel}</b></span>
          <span>Soru {idx + 1} / {list.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${percent}%` }} /></div>
      </div>

      {/* Soru kartı — anahtar değişince yeniden bağlanır ve kayarak gelir */}
      <div key={q.key} className={`rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6 ${dir === "next" ? "survey-card-next" : "survey-card-prev"} ${shake ? "ring-2 ring-red-300" : ""}`}>
        <QuestionField q={q} value={a[q.key]} onChange={(v) => set(q.key, v)} invalid={false} autoFocus />
        {!answered && shake && <p className="mt-2 text-xs font-semibold text-red-600">Devam etmek için önce cevap ver.</p>}
      </div>

      <div className="mt-4 space-y-3">
        {feedback}
        <div className="flex flex-wrap items-center gap-2">
          {idx > 0 ? (
            <button type="button" onClick={() => go(idx - 1, "prev")} className="btn-secondary btn-sm"><Icon name="arrowLeft" className="size-4" /> Geri</button>
          ) : onBackToIntro ? (
            <button type="button" onClick={onBackToIntro} className="btn-secondary btn-sm"><Icon name="arrowLeft" className="size-4" /> Giriş</button>
          ) : null}
          {!q.required && !answered && !isLast && <button type="button" onClick={skip} className="text-sm text-muted hover:underline">Bu soruyu atla</button>}
          <div className="ml-auto flex items-center gap-2">
            {isLast ? (
              <button disabled={pending || !canContinue} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                {pending ? "Kaydediliyor…" : preview ? "Tamamla (önizleme)" : "Testi tamamla"} <Icon name="check" className="size-4" />
              </button>
            ) : (
              <button type="button" onClick={next} aria-disabled={!canContinue} className={`btn-primary ${canContinue ? "" : "cursor-not-allowed opacity-50"}`}>
                Devam <Icon name="arrowRight" className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
