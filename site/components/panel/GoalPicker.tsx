"use client";

import { useState, useTransition } from "react";
import { setSurveyGoal } from "@/app/actions/panel";
import { GOAL_COLORS, goalColor } from "@/lib/survey-logic";
import { Icon } from "@/components/site/Icon";

type Opt = { value: string; label: string; color?: string };

/**
 * Hedef bayrağı seçici: anketin ana sorusunun cevabı, test tek seferlik olsa bile
 * istediği zaman buradan değiştirilir. Seçilen renk üst çubuktaki bayrağa ve anket kartına yansır.
 */
export function GoalPicker({ surveyId, question, options, initial }: { surveyId: number; question: string; options: Opt[]; initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = options.find((o) => o.value === value) ?? null;
  const cur = goalColor(current?.color);

  const pick = (v: string) => {
    if (v === value || pending) return;
    const prev = value;
    setValue(v);
    setMsg(null);
    start(async () => {
      const r = await setSurveyGoal(surveyId, v);
      if (r.error) { setValue(prev); setMsg(r.error); } else setMsg("Hedefin güncellendi.");
    });
  };

  return (
    <section id="hedef" className="card mx-auto max-w-2xl scroll-mt-24" style={{ borderColor: cur.hex, background: cur.soft }}>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm" style={{ color: cur.hex }}><Icon name="flag" className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/70">Hedef bayrağım</p>
          <h3 className="font-bold text-navy-800">{question}</h3>
          <p className="mt-0.5 text-sm text-navy-700/80">{current ? <>Şu an: <b>{current.label}</b>. Bayrağını istediğin zaman değiştirebilirsin.</> : "Henüz bir hedef seçmedin."}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((o) => {
          const c = goalColor(o.color);
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              disabled={pending}
              aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-full border-2 bg-white px-3 py-1.5 text-sm font-semibold text-navy-800 transition hover:shadow ${on ? "shadow-md" : "border-transparent"}`}
              style={{ borderColor: on ? c.hex : undefined }}
            >
              <span className="flex size-5 items-center justify-center rounded-full" style={{ background: c.hex, color: "#fff" }}><Icon name="flag" className="size-3" /></span>
              {o.label}
            </button>
          );
        })}
      </div>
      {msg && <p className="mt-3 text-xs font-semibold text-navy-700">{msg}</p>}
      <p className="mt-3 text-[11px] text-muted">Renkler: {GOAL_COLORS.map((c) => c.label).join(", ")}.</p>
    </section>
  );
}
