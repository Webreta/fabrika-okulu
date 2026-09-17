/**
 * Anket mantığı — hem sunucuda hem istemcide kullanılır (server-only DEĞİL).
 * Görünürlük kuralları, bölüm gruplama ve tanım normalizasyonu burada.
 */
import type { SurveyCondition, SurveyMode, SurveyQuestion } from "@/db/schema";

export type Answers = Record<string, string | string[]>;

export type SurveyDef = {
  id?: number;
  title: string;
  intro: string;
  mode?: SurveyMode;
  /** Cevaplar sonradan değiştirilebilir mi (varsayılan: evet) */
  editable?: boolean;
  sections: Record<string, string>;
  questions: SurveyQuestion[];
};

export const SURVEY_MODES: { value: SurveyMode; label: string; desc: string }[] = [
  { value: "flow", label: "Akış (tek sayfa)", desc: "Sorular alt alta; koşullu sorular verilen cevaba göre aşağıda açılır. Tüm yollar tek bakışta görülür." },
  { value: "steps", label: "Adım adım (kart)", desc: "Her seferinde tek soru kartı; cevap verilmeden \"Devam\" edilemez, sonraki soru kayarak gelir." },
];

export const QUESTION_TYPES: { value: SurveyQuestion["type"]; label: string; hasOptions: boolean }[] = [
  { value: "radio", label: "Tek seçim", hasOptions: true },
  { value: "checkbox", label: "Çoklu seçim", hasOptions: true },
  { value: "text", label: "Kısa metin", hasOptions: false },
  { value: "textarea", label: "Uzun metin", hasOptions: false },
  { value: "date", label: "Tarih", hasOptions: false },
];

/** Hedef bayrağı renkleri (ana soru seçeneklerine atanır). hex: bayrak/kenarlık, soft: kart zemini */
export const GOAL_COLORS: { key: string; label: string; hex: string; soft: string }[] = [
  { key: "orange", label: "Turuncu", hex: "#f97316", soft: "#fff4e8" },
  { key: "yellow", label: "Sarı", hex: "#eab308", soft: "#fefae6" },
  { key: "green", label: "Yeşil", hex: "#22c55e", soft: "#ecfdf3" },
  { key: "blue", label: "Mavi", hex: "#3b82f6", soft: "#ebf3ff" },
  { key: "teal", label: "Turkuaz", hex: "#14b8a6", soft: "#e8faf7" },
  { key: "purple", label: "Mor", hex: "#8b5cf6", soft: "#f3eefe" },
  { key: "pink", label: "Pembe", hex: "#ec4899", soft: "#fdeef5" },
  { key: "red", label: "Kırmızı", hex: "#ef4444", soft: "#feeeee" },
  { key: "navy", label: "Lacivert", hex: "#142b56", soft: "#eceff5" },
  { key: "gray", label: "Gri", hex: "#6b7280", soft: "#f1f2f4" },
];
export function goalColor(key?: string | null) {
  return GOAL_COLORS.find((c) => c.key === key) ?? GOAL_COLORS[GOAL_COLORS.length - 1];
}
/** Anketin ana sorusu (varsa) */
export function goalQuestion(def: Pick<SurveyDef, "questions">): SurveyQuestion | null {
  return def.questions.find((q) => q.goal && q.type === "radio") ?? null;
}
/** Öğrencinin ana soruya verdiği cevap (seçenek + renk) */
export function goalOf(def: Pick<SurveyDef, "questions">, a: Answers): { question: SurveyQuestion; option: { value: string; label: string; color?: string } } | null {
  const q = goalQuestion(def);
  if (!q) return null;
  const v = toArr(a[q.key])[0];
  const option = q.options?.find((o) => o.value === v);
  return option ? { question: q, option } : null;
}

export function hasOptions(type: SurveyQuestion["type"]) {
  return type === "radio" || type === "checkbox";
}

export function toArr(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

export function condMatches(c: SurveyCondition, a: Answers) {
  const arr = toArr(a[c.q]).filter((x) => x !== "");
  switch (c.op) {
    case "filled": return arr.length > 0;
    case "empty": return arr.length === 0;
    case "in": return arr.some((x) => (c.val ?? []).includes(x));
    case "not_in": return !arr.some((x) => (c.val ?? []).includes(x));
  }
  return true;
}

/** Soru görünür mü? Koşul yoksa her zaman. Birden çok koşulda varsayılan: herhangi biri sağlanınca. */
export function isVisible(q: SurveyQuestion, a: Answers) {
  if (!q.showIf || q.showIf.length === 0) return true;
  return q.showIfMode === "all" ? q.showIf.every((c) => condMatches(c, a)) : q.showIf.some((c) => condMatches(c, a));
}

export type SectionGroup = { key: string; label: string; questions: SurveyQuestion[] };

/**
 * Soruları bölümlere göre gruplar. Bölümü tanımsız (silinmiş / yeniden adlandırılmış) sorular
 * kaybolmasın diye ilk bölüme eklenir — eski editörde bu sorular hiç gösterilmiyor ama zorunlu sayılıyordu.
 */
export function groupBySection(sections: Record<string, string>, questions: SurveyQuestion[]): SectionGroup[] {
  const groups: SectionGroup[] = Object.entries(sections).map(([key, label]) => ({ key, label, questions: [] }));
  if (groups.length === 0) groups.push({ key: "", label: "", questions: [] });
  for (const q of questions) {
    const g = groups.find((x) => x.key === q.section) ?? groups[0];
    g.questions.push(q);
  }
  return groups;
}

/** Ekranda görünen sorular, bölüm sırasıyla (doğrulama ve numaralandırma için) */
export function visibleQuestions(def: Pick<SurveyDef, "sections" | "questions">, a: Answers) {
  return groupBySection(def.sections, def.questions).flatMap((g) => g.questions).filter((q) => isVisible(q, a));
}

export function isEmptyAnswer(v: string | string[] | undefined) {
  return toArr(v).filter((x) => x !== "").length === 0;
}

/** Görünen zorunlu sorulardan boş olanlar */
export function missingRequired(def: Pick<SurveyDef, "sections" | "questions">, a: Answers) {
  return visibleQuestions(def, a).filter((q) => q.required && isEmptyAnswer(a[q.key]));
}

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u" };

/** Etiketten kısa, güvenli anahtar (a-z0-9_) */
export function slugKey(text: string, max = 24) {
  const s = text
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/g, "");
  return s;
}

export function uniqueKey(base: string, taken: Set<string>, fallback: string) {
  let k = base || fallback;
  if (!taken.has(k)) { taken.add(k); return k; }
  for (let i = 2; i < 10000; i++) {
    const c = `${k}_${i}`;
    if (!taken.has(c)) { taken.add(c); return c; }
  }
  const c = `${k}_${Date.now()}`;
  taken.add(c);
  return c;
}

/** Seçenek değeri üret: etiketten slug, çakışırsa sonek; boşsa sıra numarası */
export function makeOptionValue(label: string, taken: Set<string>, index: number) {
  return uniqueKey(slugKey(label, 30), taken, `s${index + 1}`);
}

/**
 * Tanımı kaydetmeden önce temizler; eski verilerle uyumludur (mevcut anahtar/değerlere dokunmaz):
 * - boş bölüm yoksa "genel" eklenir; sayısal bölüm anahtarları ("1") sıralama bozulmasın diye "b1" olur
 * - soru anahtarı boş/çakışıksa üretilir; bölümü tanımsızsa ilk bölüme alınır
 * - seçeneksiz tiplerde options silinir; boş seçenekler atılır; değeri boşsa üretilir
 * - koşulda başvurulan soru yoksa (ya da kendisiyse) koşul atılır; "in/not_in" boş değerle atılır
 */
export function normalizeSurveyDef(input: SurveyDef): SurveyDef {
  // Bölümler
  const sectionEntries = Object.entries(input.sections ?? {})
    .map(([k, v]) => [k.trim(), String(v ?? "").trim()] as const)
    .filter(([k]) => k);
  const sectionMap = new Map<string, string>(); // eski anahtar -> yeni anahtar
  const sections: Record<string, string> = {};
  const takenSec = new Set<string>();
  for (const [k, label] of sectionEntries) {
    const nk = uniqueKey(/^\d+$/.test(k) ? `b${k}` : k, takenSec, "bolum");
    sectionMap.set(k, nk);
    sections[nk] = label || "Bölüm";
  }
  if (Object.keys(sections).length === 0) sections.genel = "Genel";
  const firstSection = Object.keys(sections)[0];

  // Soru anahtarları
  const takenQ = new Set<string>();
  const keyMap = new Map<number, string>();
  input.questions.forEach((q, i) => {
    const raw = (q.key ?? "").trim().replace(/[^a-z0-9_]/g, "");
    keyMap.set(i, uniqueKey(raw || slugKey(q.label ?? "", 20), takenQ, `soru_${i + 1}`));
  });
  const allKeys = new Set(keyMap.values());

  let goalSet = false; // ana soru anket başına bir tane (ilk işaretli radio)
  const questions: SurveyQuestion[] = input.questions.map((q, i) => {
    const key = keyMap.get(i)!;
    const type = QUESTION_TYPES.some((t) => t.value === q.type) ? q.type : "radio";
    const section = sectionMap.get((q.section ?? "").trim()) ?? (sections[q.section] ? q.section : firstSection);
    let options: SurveyQuestion["options"];
    if (hasOptions(type)) {
      const takenO = new Set<string>();
      options = (q.options ?? [])
        .map((o) => ({ value: String(o.value ?? "").trim(), label: String(o.label ?? "").trim(), color: GOAL_COLORS.some((c) => c.key === o.color) ? o.color : undefined }))
        .filter((o) => o.label || o.value)
        .map((o, oi) => ({ value: o.value ? uniqueKey(o.value, takenO, `s${oi + 1}`) : makeOptionValue(o.label, takenO, oi), label: o.label || o.value, ...(o.color ? { color: o.color } : {}) }));
    }
    const showIf = (q.showIf ?? [])
      .filter((c) => c && c.q && c.q !== key && allKeys.has(c.q))
      .map((c) => (c.op === "in" || c.op === "not_in" ? { q: c.q, op: c.op, val: (c.val ?? []).map((v) => String(v).trim()).filter(Boolean) } : { q: c.q, op: c.op }))
      .filter((c) => !("val" in c) || c.val!.length > 0);
    const out: SurveyQuestion = {
      key,
      section,
      step: Number(q.step) > 0 ? Number(q.step) : 1,
      type,
      required: !!q.required,
      label: (q.label ?? "").trim(),
    };
    if (q.help?.trim()) out.help = q.help.trim();
    const links = (q.links ?? [])
      .map((l) => ({ label: String(l.label ?? "").trim(), url: String(l.url ?? "").trim(), style: l.style === "link" ? "link" as const : "button" as const }))
      .filter((l) => l.url)
      .map((l) => ({ ...l, url: /^https?:\/\//i.test(l.url) || l.url.startsWith("/") ? l.url : `https://${l.url}`, label: l.label || l.url }));
    if (links.length) out.links = links;
    if (options) out.options = options;
    if (q.goal && type === "radio" && !goalSet) { out.goal = true; goalSet = true; }
    if (showIf.length) { out.showIf = showIf; if (q.showIfMode === "all") out.showIfMode = "all"; }
    return out;
  });

  return { id: input.id, title: (input.title ?? "").trim(), intro: (input.intro ?? "").trim(), mode: input.mode === "steps" ? "steps" : "flow", editable: input.editable !== false, sections, questions };
}

/** Kaydetmeyi engelleyen sorunlar (kullanıcıya gösterilecek, Türkçe) */
export function validateSurveyDef(def: SurveyDef): string[] {
  const errors: string[] = [];
  if (!def.title.trim()) errors.push("Anket başlığı boş olamaz.");
  if (def.questions.length === 0) errors.push("En az bir soru ekle.");
  def.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.label.trim()) errors.push(`${n}. sorunun metni boş.`);
    if (hasOptions(q.type) && (!q.options || q.options.length === 0)) errors.push(`${n}. soru (${q.label || "isimsiz"}) için en az bir seçenek gir.`);
    if (q.goal && q.options?.some((o) => !o.color)) errors.push(`${n}. soru ana soru: her seçeneğe bir bayrak rengi seç.`);
  });
  return errors;
}

/** Tahmini süre (dk): soru başına ~15 sn, en az 1 dk */
export function estimateMinutes(count: number) {
  return Math.max(1, Math.ceil((count * 15) / 60));
}
