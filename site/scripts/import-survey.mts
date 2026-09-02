// Anket tanımını JSON dosyasından DB'ye yükler (aynı key varsa günceller, cevaplara dokunmaz).
// Çalıştır: npx tsx --conditions=react-server scripts/import-survey.mts db/surveys/guncel-kariyer-hedefim.json [--publish]
// JSON biçimi: admin editöründeki "Dışa aktar" çıktısı (+ isteğe bağlı "key").
import "dotenv/config";
import { readFileSync } from "fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { surveys } from "../db/schema";
import { normalizeSurveyDef, validateSurveyDef, slugKey, type SurveyDef } from "../lib/survey-logic";

const file = process.argv[2];
const publish = process.argv.includes("--publish");
if (!file) throw new Error("Kullanım: import-survey.mts <dosya.json> [--publish]");

const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<SurveyDef> & { key?: string };
const def = normalizeSurveyDef({ title: raw.title ?? "", intro: raw.intro ?? "", mode: raw.mode, editable: raw.editable, sections: raw.sections ?? {}, questions: raw.questions ?? [] });
const errors = validateSurveyDef(def);
if (errors.length) throw new Error(errors.join(" "));
const key = raw.key?.trim() || slugKey(def.title, 60) || "anket";

const [existing] = await db.select({ id: surveys.id, status: surveys.status }).from(surveys).where(eq(surveys.key, key)).limit(1);
if (existing) {
  await db.update(surveys).set({ title: def.title, intro: def.intro, mode: def.mode, editable: def.editable !== false, sections: def.sections, questions: def.questions, ...(publish ? { status: "published", publishedAt: new Date() } : {}) }).where(eq(surveys.id, existing.id));
  console.log(`Güncellendi: #${existing.id} ${key} (${def.questions.length} soru)`);
} else {
  const [c] = await db.insert(surveys).values({ key, title: def.title, intro: def.intro, mode: def.mode, editable: def.editable !== false, sections: def.sections, questions: def.questions, status: publish ? "published" : "draft", publishedAt: publish ? new Date() : null }).returning({ id: surveys.id });
  console.log(`Oluşturuldu: #${c.id} ${key} (${def.questions.length} soru, ${publish ? "yayında" : "taslak"})`);
}
process.exit(0);
