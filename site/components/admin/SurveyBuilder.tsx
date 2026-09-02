"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SurveyCondition, SurveyMode, SurveyQuestion } from "@/db/schema";
import { saveSurveyAdmin } from "@/app/actions/admin";
import { Icon } from "@/components/site/Icon";
import { SurveyForm } from "@/components/panel/SurveyForm";
import { QUESTION_TYPES, SURVEY_MODES, hasOptions, makeOptionValue, normalizeSurveyDef, slugKey, uniqueKey, validateSurveyDef, type SurveyDef } from "@/lib/survey-logic";

/*
 * Anket oluşturucu (admin).
 * Mantık: Anket = Bölümler → Sorular. Her soru "her zaman" ya da "belirli cevaplarda" görünür.
 * Teknik anahtarlar (soru/seçenek değerleri) otomatik üretilir ve "Gelişmiş" altında gizlidir;
 * mevcut anketlerin anahtarlarına dokunulmaz, böylece eski cevaplar korunur.
 */

type Section = { key: string; label: string };
type State = { id?: number; title: string; intro: string; mode: SurveyMode; editable: boolean; sections: Section[]; questions: SurveyQuestion[] };

const OPS: { value: SurveyCondition["op"]; label: string; needsVal: boolean }[] = [
  { value: "in", label: "cevabı şunlardan biriyse", needsVal: true },
  { value: "not_in", label: "cevabı şunlar DEĞİLSE", needsVal: true },
  { value: "filled", label: "cevaplanmışsa", needsVal: false },
  { value: "empty", label: "boş bırakılmışsa", needsVal: false },
];

function toState(def: SurveyDef): State {
  return { id: def.id, title: def.title, intro: def.intro, mode: def.mode === "steps" ? "steps" : "flow", editable: def.editable !== false, sections: Object.entries(def.sections).map(([key, label]) => ({ key, label })), questions: def.questions };
}
function toDef(s: State): SurveyDef {
  return { id: s.id, title: s.title, intro: s.intro, mode: s.mode, editable: s.editable, sections: Object.fromEntries(s.sections.map((x) => [x.key, x.label])), questions: s.questions };
}

/** Sorular bölüm sırasına göre dizilir; bölümü tanımsız sorular ilk bölüme alınır */
function ordered(s: State): SurveyQuestion[] {
  const keys = s.sections.map((x) => x.key);
  const first = keys[0];
  return keys.flatMap((k) => s.questions.filter((q) => (keys.includes(q.section) ? q.section : first) === k));
}

export function SurveyBuilder({ survey }: { survey: SurveyDef }) {
  const [s, setS] = useState<State>(() => toState(normalizeSurveyDef(survey)));
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<State> | ((prev: State) => State)) => {
    setS((prev) => (typeof patch === "function" ? patch(prev) : { ...prev, ...patch }));
    setDirty(true);
    setMsg(null);
  };

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const list = useMemo(() => ordered(s), [s]);
  const numberOf = useMemo(() => new Map(list.map((q, i) => [q.key, i + 1])), [list]);

  // ---- Bölümler
  const addSection = () => update((p) => {
    const taken = new Set(p.sections.map((x) => x.key));
    return { ...p, sections: [...p.sections, { key: uniqueKey(`bolum_${p.sections.length + 1}`, taken, "bolum"), label: `Bölüm ${p.sections.length + 1}` }] };
  });
  const moveSection = (i: number, d: -1 | 1) => update((p) => {
    const a = [...p.sections]; const j = i + d; if (j < 0 || j >= a.length) return p;
    [a[i], a[j]] = [a[j], a[i]]; return { ...p, sections: a };
  });
  const removeSection = (i: number) => {
    if (s.sections.length === 1) { setMsg({ kind: "err", text: "En az bir bölüm kalmalı." }); return; }
    const sec = s.sections[i];
    const target = s.sections[i === 0 ? 1 : i - 1];
    const n = s.questions.filter((q) => q.section === sec.key).length;
    if (n && !confirm(`"${sec.label}" bölümündeki ${n} soru "${target.label}" bölümüne taşınacak. Devam?`)) return;
    update((p) => ({ ...p, sections: p.sections.filter((_, j) => j !== i), questions: p.questions.map((q) => (q.section === sec.key ? { ...q, section: target.key } : q)) }));
  };

  // ---- Sorular
  const setQ = (key: string, patch: Partial<SurveyQuestion>) => update((p) => {
    // Anahtar değişiyorsa: çakışma varsa yoksay, koşullardaki başvuruları yeni anahtara taşı
    const nk = patch.key;
    if (nk !== undefined && nk !== key) {
      if (!nk || p.questions.some((q) => q.key === nk)) return p;
      return { ...p, questions: p.questions.map((q) => {
        const showIf = q.showIf?.map((c) => (c.q === key ? { ...c, q: nk } : c));
        return q.key === key ? { ...q, ...patch, showIf } : showIf ? { ...q, showIf } : q;
      }) };
    }
    return { ...p, questions: p.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)) };
  });
  const addQuestion = (sectionKey: string) => update((p) => {
    const taken = new Set(p.questions.map((q) => q.key));
    const key = uniqueKey(`soru_${p.questions.length + 1}`, taken, "soru");
    return { ...p, questions: [...p.questions, { key, section: sectionKey, step: 1, type: "radio", required: false, label: "", options: [{ value: "s1", label: "" }, { value: "s2", label: "" }] }] };
  });
  const moveQuestion = (key: string, d: -1 | 1) => update((p) => {
    // Aynı bölüm içinde komşu soruyla yer değiştir
    const q = p.questions.find((x) => x.key === key)!;
    const sibl = ordered(p).filter((x) => x.section === q.section);
    const i = sibl.findIndex((x) => x.key === key); const j = i + d;
    if (j < 0 || j >= sibl.length) return p;
    const other = sibl[j];
    const ai = p.questions.indexOf(q), bi = p.questions.indexOf(other);
    const a = [...p.questions]; [a[ai], a[bi]] = [a[bi], a[ai]];
    return { ...p, questions: a };
  });
  const removeQuestion = (key: string) => {
    const q = s.questions.find((x) => x.key === key)!;
    if (!confirm(`"${q.label || "İsimsiz soru"}" silinsin mi? Bu soruya verilmiş cevaplar sonuçlarda görünmez.`)) return;
    update((p) => ({ ...p, questions: p.questions.filter((x) => x.key !== key).map((x) => (x.showIf?.some((c) => c.q === key) ? { ...x, showIf: x.showIf.filter((c) => c.q !== key) } : x)) }));
  };
  const duplicateQuestion = (key: string) => update((p) => {
    const q = p.questions.find((x) => x.key === key)!;
    const taken = new Set(p.questions.map((x) => x.key));
    const nk = uniqueKey(`${q.key}_kopya`, taken, "soru");
    const i = p.questions.indexOf(q);
    const a = [...p.questions]; a.splice(i + 1, 0, { ...q, key: nk, label: q.label ? `${q.label} (kopya)` : "", options: q.options?.map((o) => ({ ...o })) });
    return { ...p, questions: a };
  });

  // ---- Kaydet / dışa-içe aktar
  const save = () => {
    const def = normalizeSurveyDef(toDef(s));
    const errors = validateSurveyDef(def);
    if (errors.length) { setMsg({ kind: "err", text: errors.join(" ") }); return; }
    start(async () => {
      const r = await saveSurveyAdmin(def);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setS(toState(def)); setDirty(false);
      setMsg({ kind: "ok", text: r.message ?? "Kaydedildi." });
      if (!s.id && r.id) router.replace(`/admin/anketler/${r.id}`); else router.refresh();
    });
  };
  const exportJson = () => {
    const def = normalizeSurveyDef(toDef(s));
    const blob = new Blob([JSON.stringify({ title: def.title, intro: def.intro, mode: def.mode, editable: def.editable, sections: def.sections, questions: def.questions }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `anket-${slugKey(def.title) || "anket"}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as Partial<SurveyDef>;
      if (!raw || !Array.isArray(raw.questions)) throw new Error("Dosyada soru listesi yok.");
      const def = normalizeSurveyDef({ id: s.id, title: raw.title ?? s.title, intro: raw.intro ?? "", mode: raw.mode ?? s.mode, editable: raw.editable ?? s.editable, sections: raw.sections ?? {}, questions: raw.questions });
      update(toState(def));
      setMsg({ kind: "ok", text: `İçe aktarıldı: ${def.questions.length} soru. Kaydetmeyi unutma.` });
    } catch (e) {
      setMsg({ kind: "err", text: `Dosya okunamadı: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Başlık + giriş */}
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-navy-800">1. Karşılama ekranı</h2>
            <p className="text-xs text-muted">Öğrenci anketi açınca önce başlık ve giriş metnini görür, &quot;Ankete başla&quot; deyince sorular gelir.</p>
          </div>
          <button type="button" onClick={() => setShowHelp((v) => !v)} className="btn-secondary btn-sm"><Icon name="info" className="size-4" /> Nasıl çalışır?</button>
        </div>
        {showHelp && (
          <div className="rounded-xl bg-sky-50 p-4 text-sm text-navy-800">
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Anket = Bölümler → Sorular.</b> Bölüm başlıkları öğrenciye ara başlık olarak görünür.</li>
              <li><b>Görünürlük:</b> Her soru varsayılan olarak herkese sorulur. &quot;Sadece belirli cevaplarda göster&quot; seçersen, başka bir sorunun cevabına göre açılır (örn. &quot;Çalışıyorum&quot; diyene &quot;Nerede çalışıyorsun?&quot;).</li>
              <li><b>Zorunlu</b> sorular yalnızca ekranda göründüğünde zorunludur; gizli kaldıysa öğrenciyi engellemez.</li>
              <li>Birden fazla kural varsa <b>herhangi biri</b> sağlandığında soru açılır (istersen &quot;hepsi&quot; yapabilirsin).</li>
              <li>Teknik anahtarlar otomatik üretilir; &quot;Gelişmiş&quot; altında görünür. Eski anketlerin anahtarları değişmez, cevaplar korunur.</li>
              <li><b>Görünüm:</b> &quot;Akış&quot; tüm soruları tek sayfada gösterir, koşullu sorular cevaba göre aşağıda açılır. &quot;Adım adım&quot; her seferinde tek soru kartı gösterir, cevap verilmeden ilerlenemez.</li>
              <li><b>Bağlantı / buton:</b> Her sorunun altına yeni sekmede açılan buton veya link ekleyebilirsin (örn. bir form, video ya da sayfa).</li>
              <li><b>Önizleme</b> ile anketi öğrenci gözüyle deneyebilirsin; kayıt yapmaz.</li>
            </ul>
          </div>
        )}
        <div><label className="label">Anket başlığı</label><input value={s.title} onChange={(e) => update({ title: e.target.value })} placeholder="Örn. Güncel Kariyer Hedefim" className="input" /></div>
        <div><label className="label">Giriş metni</label><textarea rows={4} value={s.intro} onChange={(e) => update({ intro: e.target.value })} placeholder="Anketin amacını kısaca anlat. Satır sonları korunur." className="input" /></div>
      </div>

      {/* Görünüm */}
      <div className="card space-y-3">
        <div>
          <h2 className="font-bold text-navy-800">2. Gösterim ve cevap kuralı</h2>
          <p className="text-xs text-muted">İstediğin zaman değiştirebilirsin; cevaplar etkilenmez. Önizleme ile ikisini de dene.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SURVEY_MODES.map((m) => (
            <label key={m.value} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition ${s.mode === m.value ? "border-sky-400 bg-sky-50" : "border-line hover:bg-surface"}`}>
              <input type="radio" name="survey-mode" className="mt-1" checked={s.mode === m.value} onChange={() => update({ mode: m.value })} />
              <span>
                <span className="block font-semibold text-navy-800">{m.label}</span>
                <span className="block text-xs text-muted">{m.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-sm font-semibold text-navy-800">Cevaplar sonradan değiştirilebilsin mi?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { v: true, label: "Düzenlenebilir", desc: "Öğrenci istediği zaman cevaplarını güncelleyebilir; gelişimine göre yeniden doldurur." },
              { v: false, label: "Tek seferlik", desc: "Tamamlanınca kilitlenir; öğrenci yalnızca verdiği cevapları görür, değiştiremez." },
            ] as const).map((o) => (
              <label key={String(o.v)} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition ${s.editable === o.v ? "border-sky-400 bg-sky-50" : "border-line hover:bg-surface"}`}>
                <input type="radio" name="survey-editable" className="mt-1" checked={s.editable === o.v} onChange={() => update({ editable: o.v })} />
                <span>
                  <span className="block font-semibold text-navy-800">{o.label}</span>
                  <span className="block text-xs text-muted">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Bölümler ve sorular */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-navy-800">3. Bölümler ve sorular</h2>
        <span className="text-xs text-muted">{s.questions.length} soru · {s.sections.length} bölüm</span>
      </div>
      {s.sections.map((sec, si) => {
        const qs = list.filter((q) => (s.sections.some((x) => x.key === q.section) ? q.section : s.sections[0].key) === sec.key);
        return (
          <div key={sec.key} className="rounded-2xl border-2 border-dashed border-line p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-lg bg-navy-800 px-2 py-1 text-xs font-bold text-white">Bölüm {si + 1}</span>
              <input value={sec.label} onChange={(e) => update((p) => ({ ...p, sections: p.sections.map((x, j) => (j === si ? { ...x, label: e.target.value } : x)) }))} placeholder="Bölüm başlığı" className="input flex-1 font-semibold" />
              <div className="flex gap-1">
                <button type="button" title="Yukarı" onClick={() => moveSection(si, -1)} className="rounded p-1 hover:bg-surface"><Icon name="chevronUp" className="size-4" /></button>
                <button type="button" title="Aşağı" onClick={() => moveSection(si, 1)} className="rounded p-1 hover:bg-surface"><Icon name="chevronDown" className="size-4" /></button>
                <button type="button" title="Bölümü sil" onClick={() => removeSection(si)} className="rounded p-1 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
              </div>
            </div>
            <div className="space-y-3">
              {qs.length === 0 && <p className="rounded-xl bg-surface px-4 py-3 text-center text-sm text-muted">Bu bölümde henüz soru yok.</p>}
              {qs.map((q) => (
                <QuestionCard
                  key={q.key}
                  q={q}
                  number={numberOf.get(q.key) ?? 0}
                  all={list}
                  numberOf={numberOf}
                  sections={s.sections}
                  onChange={(patch) => setQ(q.key, patch)}
                  onMove={(d) => moveQuestion(q.key, d)}
                  onDelete={() => removeQuestion(q.key)}
                  onDuplicate={() => duplicateQuestion(q.key)}
                />
              ))}
              <button type="button" onClick={() => addQuestion(sec.key)} className="btn-secondary btn-sm"><Icon name="plus" className="size-4" /> Bu bölüme soru ekle</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={addSection} className="btn-secondary"><Icon name="plus" className="size-4" /> Bölüm ekle</button>

      {/* Alt çubuk */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:left-64">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          <button type="button" onClick={() => setPreview(true)} className="btn-secondary btn-sm"><Icon name="eye" className="size-4" /> Önizleme</button>
          <button type="button" onClick={exportJson} className="btn-secondary btn-sm" title="Anket tanımını JSON dosyası olarak indir"><Icon name="download" className="size-4" /> Dışa aktar</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm" title="Daha önce dışa aktarılmış bir anket tanımını yükle"><Icon name="upload" className="size-4" /> İçe aktar</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
          {msg && <span className={`rounded-lg px-3 py-1.5 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</span>}
          {dirty && !msg && <span className="text-xs text-amber-700">Kaydedilmemiş değişiklikler var</span>}
          <button type="button" disabled={pending} onClick={save} className="btn-primary ml-auto"><Icon name="save" className="size-4" /> {pending ? "Kaydediliyor…" : "Anketi kaydet"}</button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 backdrop-blur-sm p-4" onClick={() => setPreview(false)}>
          <div className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Önizleme — öğrenci böyle görür, kayıt yapılmaz</span>
              <button type="button" onClick={() => setPreview(false)} className="rounded p-1 hover:bg-surface"><Icon name="x" className="size-5" /></button>
            </div>
            <PreviewForm def={normalizeSurveyDef(toDef(s))} />
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewForm({ def }: { def: SurveyDef }) {
  return <SurveyForm preview schema={{ id: def.id ?? 0, title: def.title || "İsimsiz anket", intro: def.intro, mode: def.mode, sections: def.sections, questions: def.questions }} answers={{}} />;
}

// ---------------- Soru kartı ----------------

function QuestionCard({ q, number, all, numberOf, sections, onChange, onMove, onDelete, onDuplicate }: {
  q: SurveyQuestion; number: number; all: SurveyQuestion[]; numberOf: Map<string, number>; sections: Section[];
  onChange: (patch: Partial<SurveyQuestion>) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [bulk, setBulk] = useState<string | null>(null);
  const conditional = !!q.showIf?.length;
  const others = all.filter((x) => x.key !== q.key);
  const qLabel = (x: SurveyQuestion) => `${numberOf.get(x.key) ?? "?"}. ${x.label || "(isimsiz soru)"}`;

  const setType = (type: SurveyQuestion["type"]) => {
    const patch: Partial<SurveyQuestion> = { type };
    if (hasOptions(type) && !q.options?.length) patch.options = [{ value: "s1", label: "" }, { value: "s2", label: "" }];
    onChange(patch);
  };

  // Seçenekler
  const opts = q.options ?? [];
  const setOpt = (i: number, label: string) => onChange({ options: opts.map((o, j) => (j === i ? { ...o, label } : o)) });
  const addOpt = (labels: string[] = [""]) => {
    const taken = new Set(opts.map((o) => o.value));
    const added = labels.map((raw, i) => {
      // "deger|Etiket" biçimi de kabul edilir (eski editörden alışkın olanlar için)
      const [a, b] = raw.includes("|") ? raw.split("|") : [undefined, raw];
      const label = (b ?? "").trim();
      const value = a?.trim() ? uniqueKey(a.trim(), taken, `s${opts.length + i + 1}`) : makeOptionValue(label, taken, opts.length + i);
      return { value, label };
    });
    onChange({ options: [...opts, ...added] });
  };
  const removeOpt = (i: number) => onChange({ options: opts.filter((_, j) => j !== i) });
  const moveOpt = (i: number, d: -1 | 1) => { const a = [...opts]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange({ options: a }); };

  // Koşullar
  const defaultRule = (): SurveyCondition => {
    const prev = [...all].slice(0, all.findIndex((x) => x.key === q.key)).reverse()[0] ?? others[0];
    if (!prev) return { q: "", op: "filled" };
    return hasOptions(prev.type) && prev.options?.length ? { q: prev.key, op: "in", val: [] } : { q: prev.key, op: "filled" };
  };
  const setRule = (i: number, patch: Partial<SurveyCondition>) => onChange({ showIf: (q.showIf ?? []).map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setConditional = (on: boolean) => {
    if (!on) { onChange({ showIf: [], showIfMode: undefined }); return; }
    if (!others.length) return;
    onChange({ showIf: [defaultRule()] });
  };

  return (
    <div className="card space-y-3 border-l-4 border-l-sky-400">
      {/* Üst satır */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">Soru {number}</span>
        <select value={q.type} onChange={(e) => setType(e.target.value as SurveyQuestion["type"])} className="input w-auto py-1.5 text-sm">
          {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {sections.length > 1 && (
          <select value={sections.some((x) => x.key === q.section) ? q.section : sections[0].key} onChange={(e) => onChange({ section: e.target.value })} className="input w-auto py-1.5 text-sm" title="Bölüm">
            {sections.map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-sm"><input type="checkbox" checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} /> Zorunlu</label>
        <div className="ml-auto flex gap-1">
          <button type="button" title="Yukarı taşı" onClick={() => onMove(-1)} className="rounded p-1 hover:bg-surface"><Icon name="chevronUp" className="size-4" /></button>
          <button type="button" title="Aşağı taşı" onClick={() => onMove(1)} className="rounded p-1 hover:bg-surface"><Icon name="chevronDown" className="size-4" /></button>
          <button type="button" title="Çoğalt" onClick={onDuplicate} className="rounded p-1 hover:bg-surface"><Icon name="copy" className="size-4" /></button>
          <button type="button" title="Sil" onClick={onDelete} className="rounded p-1 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
        </div>
      </div>

      <input value={q.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Soru metni — örn. Bugünkü kariyerim:" className="input font-medium" />
      <input value={q.help ?? ""} onChange={(e) => onChange({ help: e.target.value })} placeholder="Açıklama / ipucu (isteğe bağlı, sorunun altında küçük yazıyla görünür)" className="input text-xs" />

      {/* Seçenekler */}
      {hasOptions(q.type) && (
        <div className="rounded-xl bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">Seçenekler {q.type === "checkbox" && "(öğrenci birden fazla işaretleyebilir)"}</span>
            <button type="button" onClick={() => setBulk(bulk === null ? "" : null)} className="text-xs text-sky-700 hover:underline">{bulk === null ? "Toplu ekle" : "Vazgeç"}</button>
          </div>
          <div className="space-y-1.5">
            {opts.map((o, i) => (
              <div key={o.value} className="flex items-center gap-1.5">
                <span className="w-5 text-center text-xs text-muted">{q.type === "radio" ? "○" : "☐"}</span>
                <input value={o.label} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Seçenek ${i + 1}`} className="input py-1.5 text-sm" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOpt(); } }} />
                {advanced && <code className="rounded bg-white px-1.5 py-0.5 text-[10px] text-muted" title="Teknik değer (cevaplarda bu saklanır)">{o.value}</code>}
                <button type="button" onClick={() => moveOpt(i, -1)} className="rounded p-1 text-muted hover:bg-white"><Icon name="chevronUp" className="size-3.5" /></button>
                <button type="button" onClick={() => moveOpt(i, 1)} className="rounded p-1 text-muted hover:bg-white"><Icon name="chevronDown" className="size-3.5" /></button>
                <button type="button" onClick={() => removeOpt(i)} className="rounded p-1 text-red-600 hover:bg-white"><Icon name="x" className="size-3.5" /></button>
              </div>
            ))}
          </div>
          {bulk !== null ? (
            <div className="mt-2 space-y-1.5">
              <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Her satıra bir seçenek yaz, sonra Ekle'ye bas.\nÇalışıyorum\nİş arıyorum\nÖğrenciyim"} className="input text-sm" />
              <button type="button" onClick={() => { addOpt(bulk.split("\n").map((l) => l.trim()).filter(Boolean)); setBulk(null); }} className="btn-primary btn-sm">Ekle</button>
            </div>
          ) : (
            <button type="button" onClick={() => addOpt()} className="mt-2 text-sm text-sky-700 hover:underline">+ Seçenek ekle</button>
          )}
        </div>
      )}

      {/* Bağlantı / butonlar */}
      <div className="rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">Bağlantı / buton (isteğe bağlı, yeni sekmede açılır)</span>
          <button type="button" onClick={() => onChange({ links: [...(q.links ?? []), { label: "", url: "", style: "button" }] })} className="text-xs text-sky-700 hover:underline">+ Ekle</button>
        </div>
        {(q.links ?? []).length === 0 ? (
          <p className="text-xs text-muted">Sorunun altında bir sayfaya, forma ya da videoya yönlendiren buton veya link gösterebilirsin.</p>
        ) : (
          <div className="space-y-1.5">
            {(q.links ?? []).map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <input value={l.label} onChange={(e) => onChange({ links: (q.links ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Buton metni" className="input w-40 py-1.5 text-sm" />
                <input value={l.url} onChange={(e) => onChange({ links: (q.links ?? []).map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://…" className="input min-w-[200px] flex-1 py-1.5 text-sm" />
                <select value={l.style} onChange={(e) => onChange({ links: (q.links ?? []).map((x, j) => (j === i ? { ...x, style: e.target.value as "button" | "link" } : x)) })} className="input w-auto py-1.5 text-sm">
                  <option value="button">Buton</option><option value="link">Link</option>
                </select>
                <button type="button" onClick={() => onChange({ links: (q.links ?? []).filter((_, j) => j !== i) })} className="rounded p-1 text-red-600 hover:bg-red-50"><Icon name="x" className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Görünürlük */}
      <div className="rounded-xl border border-line p-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-xs font-semibold text-muted">Bu soru ne zaman görünsün?</span>
          <label className="flex cursor-pointer items-center gap-1.5"><input type="radio" checked={!conditional} onChange={() => setConditional(false)} /> Her zaman</label>
          <label className={`flex items-center gap-1.5 ${others.length ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`} title={others.length ? "" : "Önce başka bir soru ekle"}>
            <input type="radio" checked={conditional} disabled={!others.length} onChange={() => setConditional(true)} /> Sadece belirli cevaplarda
          </label>
        </div>
        {conditional && (
          <div className="mt-3 space-y-2">
            {(q.showIf ?? []).map((c, i) => {
              const target = all.find((x) => x.key === c.q);
              const targetOpts = target && hasOptions(target.type) ? target.options ?? [] : [];
              const needsVal = c.op === "in" || c.op === "not_in";
              return (
                <div key={i} className="rounded-lg bg-surface p-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs text-muted">{i === 0 ? "Eğer" : q.showIfMode === "all" ? "ve" : "veya"}</span>
                    <select value={c.q} onChange={(e) => { const t = all.find((x) => x.key === e.target.value); const canIn = t && hasOptions(t.type); setRule(i, { q: e.target.value, op: canIn ? (needsVal ? c.op : "in") : needsVal ? "filled" : c.op, val: [] }); }} className="input w-auto max-w-[320px] py-1 text-sm">
                      <option value="">— soru seç —</option>
                      {others.map((x) => <option key={x.key} value={x.key}>{qLabel(x)}</option>)}
                    </select>
                    <select value={c.op} onChange={(e) => setRule(i, { op: e.target.value as SurveyCondition["op"], val: [] })} className="input w-auto py-1 text-sm">
                      {OPS.filter((o) => !o.needsVal || targetOpts.length).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button type="button" onClick={() => onChange({ showIf: (q.showIf ?? []).filter((_, j) => j !== i) })} className="ml-auto rounded p-1 text-red-600 hover:bg-white" title="Kuralı kaldır"><Icon name="x" className="size-4" /></button>
                  </div>
                  {needsVal && targetOpts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {targetOpts.map((o) => {
                        const on = (c.val ?? []).includes(o.value);
                        return (
                          <button key={o.value} type="button" onClick={() => setRule(i, { val: on ? (c.val ?? []).filter((v) => v !== o.value) : [...(c.val ?? []), o.value] })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-sky-400 bg-sky-50 font-semibold text-sky-800" : "border-line bg-white text-muted"}`}>
                            {on ? "✓ " : ""}{o.label || o.value}
                          </button>
                        );
                      })}
                      {!(c.val ?? []).length && <span className="self-center text-xs text-amber-700">En az bir seçenek işaretle</span>}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button type="button" onClick={() => onChange({ showIf: [...(q.showIf ?? []), defaultRule()] })} className="text-sky-700 hover:underline">+ kural ekle</button>
              {(q.showIf?.length ?? 0) > 1 && (
                <label className="flex items-center gap-1.5 text-xs text-muted">Kuralların
                  <select value={q.showIfMode === "all" ? "all" : "any"} onChange={(e) => onChange({ showIfMode: e.target.value === "all" ? "all" : undefined })} className="input w-auto py-0.5 text-xs">
                    <option value="any">herhangi biri</option><option value="all">hepsi</option>
                  </select>
                  sağlanınca göster
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Gelişmiş */}
      <div>
        <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-xs text-muted hover:underline">{advanced ? "▾ Gelişmiş" : "▸ Gelişmiş (teknik anahtar)"}</button>
        {advanced && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Soru anahtarı</span>
            <input value={q.key} onChange={(e) => onChange({ key: e.target.value.replace(/[^a-z0-9_]/g, "") })} className="input w-40 py-1 font-mono text-xs" />
            <span className="text-amber-700">Anahtarı değiştirirsen bu soruya verilmiş eski cevaplar sonuçlarda eşleşmez.</span>
          </div>
        )}
      </div>
    </div>
  );
}
