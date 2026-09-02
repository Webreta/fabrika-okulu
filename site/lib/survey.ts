import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { surveys, surveyAnswers, surveyCompletions, users, type Survey, type SurveyQuestion } from "@/db/schema";
import { getRawSetting } from "@/lib/settings";
import type { SessionUser } from "@/lib/auth/session";

import { missingRequired, visibleQuestions } from "@/lib/survey-logic";

export type { SurveyCondition, SurveyQuestion, Survey } from "@/db/schema";
export { isVisible } from "@/lib/survey-logic";

// Eski tek-anket modeli (site ayarındaki survey_schema) ilk erişimde surveys tablosuna taşınır.
type LegacySchema = {
  key: string;
  title: string;
  version: number;
  intro: string;
  sections: Record<string, string>;
  questions: SurveyQuestion[];
};

const LEGACY_DEFAULT: LegacySchema = {
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

/** Tek seferlik geçiş: surveys tablosu boşsa eski şemayı taşır, eski tamamlayanları işaretler. */
export async function ensureSurveysSeeded() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(surveys);
  if (n > 0) return;
  const legacy = await getRawSetting<LegacySchema>("survey_schema", LEGACY_DEFAULT);
  await db.insert(surveys).values({
    key: legacy.key, title: legacy.title, intro: legacy.intro, status: "published",
    sections: legacy.sections, questions: legacy.questions, publishedAt: new Date(),
  }).onConflictDoNothing();
  const doneUsers = await db.select({ id: users.id }).from(users).where(sql`${users.surveyVersion} > 0`);
  if (doneUsers.length) {
    await db.insert(surveyCompletions).values(doneUsers.map((u) => ({ userId: u.id, surveyKey: legacy.key }))).onConflictDoNothing();
  }
}

export async function listSurveys(onlyPublished = false) {
  await ensureSurveysSeeded();
  return db.select().from(surveys).where(onlyPublished ? eq(surveys.status, "published") : undefined).orderBy(desc(surveys.publishedAt), desc(surveys.id));
}

export async function getSurveyById(id: number): Promise<Survey | null> {
  await ensureSurveysSeeded();
  const [s] = await db.select().from(surveys).where(eq(surveys.id, id)).limit(1);
  return s ?? null;
}

/** Kullanıcının tamamladığı anket anahtarları */
export async function completedSurveyKeys(userId: number) {
  const rows = await db.select({ k: surveyCompletions.surveyKey }).from(surveyCompletions).where(eq(surveyCompletions.userId, userId));
  return new Set(rows.map((r) => r.k));
}

/** Popup için: yayında olup kullanıcının henüz doldurmadığı en yeni anket */
export async function pendingSurveyFor(user: SessionUser) {
  if (user.role !== "student") return null;
  const list = await listSurveys(true);
  if (!list.length) return null;
  const done = await completedSurveyKeys(user.id);
  const pending = list.filter((s) => !done.has(s.key));
  return pending[0] ?? null;
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

export async function saveSurvey(userId: number, survey: Survey, raw: Record<string, string | string[]>) {
  const missing = missingRequired(survey, raw);
  if (missing.length) return { error: `"${missing[0].label}" sorusu zorunlu.` };
  const visible = visibleQuestions(survey, raw);
  // Görünmeyen soruların cevapları silinir
  await db.delete(surveyAnswers).where(and(eq(surveyAnswers.userId, userId), eq(surveyAnswers.surveyKey, survey.key)));
  const values = visible
    .filter((q) => raw[q.key] !== undefined && raw[q.key] !== "")
    .map((q) => ({ userId, surveyKey: survey.key, questionKey: q.key, value: raw[q.key] }));
  if (values.length) await db.insert(surveyAnswers).values(values);
  await db.insert(surveyCompletions).values({ userId, surveyKey: survey.key }).onConflictDoNothing();
  return { ok: true };
}

export type SurveyStats = {
  participants: number;
  questions: { key: string; label: string; total: number; options: { value: string; label: string; count: number; percent: number }[] }[];
};

/** Kapalı uçlu (tek/çok seçim) soruların cevap dağılımı — açık uçlular hariç */
export async function getSurveyStats(survey: Survey): Promise<SurveyStats> {
  const closed = survey.questions.filter((q) => (q.type === "radio" || q.type === "checkbox") && q.options?.length);
  const [[{ n: participants }], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(surveyCompletions).where(eq(surveyCompletions.surveyKey, survey.key)),
    closed.length
      ? db.select({ questionKey: surveyAnswers.questionKey, value: surveyAnswers.value }).from(surveyAnswers)
          .where(and(eq(surveyAnswers.surveyKey, survey.key), inArray(surveyAnswers.questionKey, closed.map((q) => q.key))))
      : Promise.resolve([]),
  ]);
  const questions = closed.map((q) => {
    const answers = rows.filter((r) => r.questionKey === q.key).map((r) => (Array.isArray(r.value) ? r.value : [r.value]));
    const total = answers.length; // cevap veren kişi sayısı
    const options = (q.options ?? []).map((o) => {
      const count = answers.filter((a) => a.includes(o.value)).length;
      return { value: o.value, label: o.label, count, percent: total ? Math.round((count / total) * 100) : 0 };
    });
    return { key: q.key, label: q.label, total, options };
  });
  return { participants, questions };
}
