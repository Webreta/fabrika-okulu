"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SurveySchema, SurveyQuestion } from "@/lib/survey";
import { submitSurvey, skipSurvey } from "@/app/actions/panel";
import type { FormState } from "@/app/actions/auth";

type Answers = Record<string, string | string[]>;

function visible(q: SurveyQuestion, a: Answers) {
  if (!q.showIf?.length) return true;
  return q.showIf.every((c) => {
    const v = a[c.q];
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    if (c.op === "filled") return arr.some((x) => x !== "");
    if (c.op === "empty") return !arr.some((x) => x !== "");
    if (c.op === "in") return arr.some((x) => (c.val ?? []).includes(x));
    return !arr.some((x) => (c.val ?? []).includes(x));
  });
}

function Question({ q, value, onChange }: { q: SurveyQuestion; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const name = `q_${q.key}`;
  return (
    <div>
      <label className="label">{q.label}{q.required && <span className="text-red-500"> *</span>}</label>
      {q.help && <p className="mb-1 text-xs text-muted">{q.help}</p>}
      {q.type === "radio" && (
        <div className="space-y-1.5">
          {q.options?.map((o) => (
            <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value === o.value ? "border-sky-400 bg-sky-50" : "border-line"}`}>
              <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} /> {o.label}
            </label>
          ))}
        </div>
      )}
      {q.type === "checkbox" && (
        <div className="space-y-1.5">
          {q.options?.map((o) => {
            const arr = Array.isArray(value) ? value : value ? [value] : [];
            const on = arr.includes(o.value);
            return (
              <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-sky-400 bg-sky-50" : "border-line"}`}>
                <input type="checkbox" name={name} value={o.value} checked={on} onChange={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])} /> {o.label}
              </label>
            );
          })}
        </div>
      )}
      {q.type === "text" && <input name={name} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />}
      {q.type === "date" && <input type="date" name={name} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />}
      {q.type === "textarea" && <textarea name={name} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />}
    </div>
  );
}

export function SurveyForm({ schema, answers, onDone }: { schema: SurveySchema; answers: Answers; onDone?: () => void }) {
  const [a, setA] = useState<Answers>(answers);
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const r = await submitSurvey(p, fd);
    if (r.ok) onDone?.();
    return r;
  }, {});
  const sections = useMemo(() => Object.entries(schema.sections), [schema]);
  return (
    <form action={action} className="space-y-8">
      {schema.intro && <p className="text-sm text-muted">{schema.intro}</p>}
      {sections.map(([key, label]) => {
        const qs = schema.questions.filter((q) => q.section === key && visible(q, a));
        if (!qs.length) return null;
        return (
          <fieldset key={key} className="space-y-4">
            <legend className="mb-2 text-lg font-bold text-navy-800">{label}</legend>
            {qs.map((q) => <Question key={q.key} q={q} value={a[q.key]} onChange={(v) => setA({ ...a, [q.key]: v })} />)}
          </fieldset>
        );
      })}
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button disabled={pending} className="btn-primary">{pending ? "Kaydediliyor…" : "Kaydet"}</button>
    </form>
  );
}

export function SurveyModal({ schema, answers }: { schema: SurveySchema; answers: Answers }) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-800">{schema.title}</h2>
            <p className="text-sm text-muted">Programlarına devam etmeden önce kısa anketi doldur.</p>
          </div>
          <button
            onClick={async () => { await skipSurvey(); setClosed(true); router.refresh(); }}
            className="text-sm text-muted hover:underline"
          >
            Şimdilik geç
          </button>
        </div>
        <SurveyForm schema={schema} answers={answers} onDone={() => { setClosed(true); router.refresh(); }} />
      </div>
    </div>
  );
}
