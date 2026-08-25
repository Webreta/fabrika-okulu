import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyAnswers, users } from "@/db/schema";
import { getRawSetting, getSetting } from "@/lib/settings";
import type { SessionUser } from "@/lib/auth/session";

// Anket şeması site ayarında (key: survey_schema) tutulur; cevaplar soru başına satır.

export type SurveyCondition = { q: string; op: "in" | "not_in" | "filled" | "empty"; val?: string[] };
export type SurveyQuestion = {
  key: string;
  section: string;
  step: number;
  type: "radio" | "checkbox" | "text" | "textarea" | "date";
  required: boolean;
  label: string;
  help?: string;
  options?: { value: string; label: string }[];
  showIf?: SurveyCondition[];
};
export type SurveySchema = {
  key: string;
  title: string;
  version: number;
  intro: string;
  sections: Record<string, string>;
  questions: SurveyQuestion[];
};

export const DEFAULT_SURVEY: SurveySchema = {
  key: "kariyer_rotam",
  title: "Kariyer Rotam",
  version: 1,
  intro: "Sana daha uygun programlar önerebilmemiz için birkaç soru. 2 dakikanı alır.",
  sections: { kariyer: "Kariyer Rotam", ogrenim: "Öğrenim Durumum" },
  questions: [
    {
      key: "durum", section: "kariyer", step: 1, type: "radio", required: true, label: "Şu anki durumun nedir?",
      options: [
        { value: "ogrenci", label: "Öğrenciyim" },
        { value: "yeni_mezun", label: "Yeni mezunum, iş arıyorum" },
        { value: "calisiyorum", label: "Çalışıyorum" },
        { value: "is_ariyorum", label: "İş arıyorum (tecrübeli)" },
      ],
    },
    {
      key: "degisim", section: "kariyer", step: 1, type: "radio", required: true, label: "İş değiştirmeyi düşünüyor musun?",
      showIf: [{ q: "durum", op: "in", val: ["calisiyorum"] }],
      options: [
        { value: "1ay", label: "Evet, 1 ay içinde" },
        { value: "6ay", label: "Evet, 6 ay içinde" },
        { value: "hayir", label: "Hayır" },
      ],
    },
    {
      key: "hedef", section: "kariyer", step: 1, type: "checkbox", required: true, label: "Gelişmek istediğin alanlar",
      options: [
        { value: "ozgecmis", label: "Özgeçmiş / profil" },
        { value: "mulakat", label: "Mülakat teknikleri" },
        { value: "liderlik", label: "Liderlik ve yönetim" },
        { value: "uretim", label: "Üretim / operasyon" },
        { value: "iletisim", label: "İletişim ve sunum" },
      ],
    },
    {
      key: "egitim", section: "ogrenim", step: 2, type: "radio", required: true, label: "Eğitim durumun",
      options: [
        { value: "lise", label: "Lise" },
        { value: "onlisans", label: "Ön lisans" },
        { value: "lisans", label: "Lisans" },
        { value: "yuksek", label: "Yüksek lisans / doktora" },
      ],
    },
    { key: "bolum", section: "ogrenim", step: 2, type: "text", required: false, label: "Bölümün / alanın" },
    { key: "beklenti", section: "ogrenim", step: 2, type: "textarea", required: false, label: "Fabrika Okulu'ndan beklentin" },
  ],
};

export async function getSurveySchema() {
  return getRawSetting<SurveySchema>("survey_schema", DEFAULT_SURVEY);
}

export function isVisible(q: SurveyQuestion, answers: Record<string, string | string[]>) {
  if (!q.showIf || q.showIf.length === 0) return true;
  return q.showIf.every((c) => {
    const v = answers[c.q];
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    switch (c.op) {
      case "filled": return arr.length > 0 && arr.some((x) => x !== "");
      case "empty": return arr.length === 0 || arr.every((x) => x === "");
      case "in": return arr.some((x) => (c.val ?? []).includes(x));
      case "not_in": return !arr.some((x) => (c.val ?? []).includes(x));
    }
  });
}

export async function getSurveyAnswers(userId: number, surveyKey: string) {
  const rows = await db
    .select()
    .from(surveyAnswers)
    .where(and(eq(surveyAnswers.userId, userId), eq(surveyAnswers.surveyKey, surveyKey)));
  const out: Record<string, string | string[]> = {};
  for (const r of rows) out[r.questionKey] = r.value;
  return out;
}

export async function getSurveyState(user: SessionUser) {
  const [schema, panel] = await Promise.all([getSurveySchema(), getSetting("panel")]);
  const completed = user.surveyVersion >= schema.version;
  const mustAnswer = panel.surveyRequired && !completed && !user.surveySkipped && user.role === "student";
  return { title: schema.title, completed, mustAnswer, needsAttention: !completed && !user.surveySkipped, schema };
}

export async function saveSurvey(userId: number, raw: Record<string, string | string[]>) {
  const schema = await getSurveySchema();
  const visible = schema.questions.filter((q) => isVisible(q, raw));
  for (const q of visible) {
    const v = raw[q.key];
    const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    if (q.required && empty) return { error: `"${q.label}" sorusu zorunlu.` };
  }
  // Görünmeyen soruların cevapları silinir
  await db.delete(surveyAnswers).where(and(eq(surveyAnswers.userId, userId), eq(surveyAnswers.surveyKey, schema.key)));
  const values = visible
    .filter((q) => raw[q.key] !== undefined && raw[q.key] !== "")
    .map((q) => ({ userId, surveyKey: schema.key, questionKey: q.key, value: raw[q.key] }));
  if (values.length) await db.insert(surveyAnswers).values(values);
  await db.update(users).set({ surveyVersion: schema.version, surveySkipped: false }).where(eq(users.id, userId));
  return { ok: true };
}
