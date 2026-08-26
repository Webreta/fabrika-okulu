"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SurveyQuestion } from "@/db/schema";
import { saveSurveyAdmin } from "@/app/actions/admin";
import { Icon } from "@/components/site/Icon";

type EditorSurvey = { id?: number; title: string; intro: string; sections: Record<string, string>; questions: SurveyQuestion[] };

export function SurveySchemaEditor({ survey }: { survey: EditorSurvey }) {
  const [s, setS] = useState<EditorSurvey>(survey);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const setQ = (i: number, q: SurveyQuestion) => setS({ ...s, questions: s.questions.map((x, j) => (j === i ? q : x)) });
  const sections = Object.keys(s.sections);
  const move = (i: number, d: -1 | 1) => { const a = [...s.questions]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setS({ ...s, questions: a }); };

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 md:grid-cols-2">
        <div><label className="label">Anket başlığı</label><input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} className="input" /></div>
        <div><label className="label">Bölümler (anahtar|Etiket, virgülle)</label><input value={Object.entries(s.sections).map(([k, v]) => `${k}|${v}`).join(", ")} onChange={(e) => setS({ ...s, sections: Object.fromEntries(e.target.value.split(",").map((p) => p.trim()).filter(Boolean).map((p) => { const [k, v] = p.split("|"); return [k.trim(), (v ?? k).trim()]; })) })} className="input" /></div>
        <div className="md:col-span-2"><label className="label">Giriş metni</label><textarea rows={2} value={s.intro} onChange={(e) => setS({ ...s, intro: e.target.value })} className="input" /></div>
      </div>
      {s.questions.map((q, i) => (
        <div key={i} className="card space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted">{i + 1}.</span>
            <input value={q.key} onChange={(e) => setQ(i, { ...q, key: e.target.value.replace(/[^a-z0-9_]/g, "") })} placeholder="anahtar" className="input w-36 font-mono text-xs" />
            <select value={q.section} onChange={(e) => setQ(i, { ...q, section: e.target.value })} className="input w-40">{sections.map((k) => <option key={k} value={k}>{s.sections[k]}</option>)}</select>
            <select value={q.type} onChange={(e) => setQ(i, { ...q, type: e.target.value as SurveyQuestion["type"] })} className="input w-36"><option value="radio">Tek seçim</option><option value="checkbox">Çoklu seçim</option><option value="text">Kısa metin</option><option value="textarea">Uzun metin</option><option value="date">Tarih</option></select>
            <input type="number" min={1} value={q.step} onChange={(e) => setQ(i, { ...q, step: Number(e.target.value) })} className="input w-16" title="Adım" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { ...q, required: e.target.checked })} /> Zorunlu</label>
            <div className="ml-auto flex gap-1">
              <button onClick={() => move(i, -1)} className="rounded p-1 hover:bg-surface"><Icon name="chevronUp" className="size-4" /></button>
              <button onClick={() => move(i, 1)} className="rounded p-1 hover:bg-surface"><Icon name="chevronDown" className="size-4" /></button>
              <button onClick={() => setS({ ...s, questions: s.questions.filter((_, j) => j !== i) })} className="rounded p-1 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
            </div>
          </div>
          <input value={q.label} onChange={(e) => setQ(i, { ...q, label: e.target.value })} placeholder="Soru metni" className="input" />
          <input value={q.help ?? ""} onChange={(e) => setQ(i, { ...q, help: e.target.value })} placeholder="Yardım metni (isteğe bağlı)" className="input text-xs" />
          {(q.type === "radio" || q.type === "checkbox") && (
            <textarea rows={3} value={(q.options ?? []).map((o) => `${o.value}|${o.label}`).join("\n")} onChange={(e) => setQ(i, { ...q, options: e.target.value.split("\n").filter(Boolean).map((l) => { const [v, lab] = l.split("|"); return { value: v.trim(), label: (lab ?? v).trim() }; }) })} placeholder={"deger|Etiket (her satıra bir seçenek)"} className="input font-mono text-xs" />
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Göster eğer:</span>
            {(q.showIf ?? []).map((c, ci) => (
              <span key={ci} className="flex items-center gap-1 rounded-lg bg-surface px-2 py-1">
                <select value={c.q} onChange={(e) => setQ(i, { ...q, showIf: q.showIf!.map((x, k) => (k === ci ? { ...x, q: e.target.value } : x)) })} className="input w-auto py-0.5 text-xs">{s.questions.filter((x) => x.key !== q.key).map((x) => <option key={x.key} value={x.key}>{x.key}</option>)}</select>
                <select value={c.op} onChange={(e) => setQ(i, { ...q, showIf: q.showIf!.map((x, k) => (k === ci ? { ...x, op: e.target.value as typeof c.op } : x)) })} className="input w-auto py-0.5 text-xs"><option value="in">içinde</option><option value="not_in">dışında</option><option value="filled">dolu</option><option value="empty">boş</option></select>
                {(c.op === "in" || c.op === "not_in") && <input value={(c.val ?? []).join(",")} onChange={(e) => setQ(i, { ...q, showIf: q.showIf!.map((x, k) => (k === ci ? { ...x, val: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } : x)) })} placeholder="deger1,deger2" className="input w-32 py-0.5 text-xs" />}
                <button onClick={() => setQ(i, { ...q, showIf: q.showIf!.filter((_, k) => k !== ci) })} className="text-red-600">×</button>
              </span>
            ))}
            <button onClick={() => setQ(i, { ...q, showIf: [...(q.showIf ?? []), { q: s.questions[0]?.key ?? "", op: "in", val: [] }] })} className="text-sky-600">+ koşul</button>
          </div>
        </div>
      ))}
      <button onClick={() => setS({ ...s, questions: [...s.questions, { key: `soru_${s.questions.length + 1}`, section: sections[0] ?? "genel", step: 1, type: "radio", required: false, label: "", options: [] }] })} className="btn-secondary btn-sm"><Icon name="plus" className="size-4" /> Soru ekle</button>
      {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm">{msg}</p>}
      <button disabled={pending} onClick={() => start(async () => { const r = await saveSurveyAdmin(s); setMsg(r.ok ? r.message ?? "Kaydedildi" : r.error); if (r.ok && !s.id && r.id) router.replace(`/admin/anketler/${r.id}`); else router.refresh(); })} className="btn-primary">{pending ? "…" : "Anketi kaydet"}</button>
    </div>
  );
}
