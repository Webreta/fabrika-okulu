"use client";

import { useActionState, useMemo, useState } from "react";
import type { SurveyQuestion } from "@/db/schema";
import { submitSurvey } from "@/app/actions/panel";
import type { FormState } from "@/app/actions/auth";

type SurveyLike = { id: number; title: string; intro: string; sections: Record<string, string>; questions: SurveyQuestion[] };

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

export function SurveyForm({ schema, answers, onDone }: { schema: SurveyLike; answers: Answers; onDone?: () => void }) {
  const [a, setA] = useState<Answers>(answers);
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const r = await submitSurvey(schema.id, p, fd);
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

