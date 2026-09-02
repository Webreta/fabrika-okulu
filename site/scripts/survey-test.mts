// Anket testi: görünürlük mantığı + normalizasyon + kayıt doğrulaması + sayfa render (dev sunucu :3005 gerekli).
// Çalıştır: npx tsx --conditions=react-server scripts/survey-test.mts [baseUrl]
import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, sessions, surveys, surveyAnswers, surveyCompletions, type SurveyQuestion } from "../db/schema";
import { isVisible, groupBySection, normalizeSurveyDef, missingRequired, validateSurveyDef } from "../lib/survey-logic";
import { saveSurvey, getSurveyById } from "../lib/survey";

const base = process.argv[2] || "http://localhost:3005";
let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };

// ---- 1) Görünürlük: birden çok koşul varsayılan "herhangi biri" (eski editörün AND'i hiç açılmayan soru üretiyordu)
const q: SurveyQuestion = { key: "x", section: "b1", step: 1, type: "radio", required: true, label: "x", showIf: [{ q: "a", op: "in", val: ["1"] }, { q: "a", op: "in", val: ["2"] }] };
check("çoklu koşul: herhangi biri (a=2)", isVisible(q, { a: "2" }));
check("çoklu koşul: hiçbiri (a=3)", !isVisible(q, { a: "3" }));
check("çoklu koşul: hepsi modu (imkânsız → gizli)", !isVisible({ ...q, showIfMode: "all" }, { a: "2" }));
check("dolu/boş", isVisible({ ...q, showIf: [{ q: "t", op: "filled" }] }, { t: "abc" }) && !isVisible({ ...q, showIf: [{ q: "t", op: "filled" }] }, { t: "" }));

// ---- 2) Bölümü tanımsız soru kaybolmaz (ss76 hatası: soru görünmüyor ama zorunlu sayılıyordu)
const orphan: SurveyQuestion = { key: "1", section: "kariyer", step: 1, type: "radio", required: true, label: "Bugünkü kariyerim:", options: [{ value: "a", label: "A" }] };
const groups = groupBySection({ b1: "Bugünkü Kariyerim", b2: "Eğitimim" }, [orphan, { ...orphan, key: "2", section: "b2", required: false }]);
check("bölümsüz soru ilk bölüme düşer", groups[0].questions.some((x) => x.key === "1") && groups[1].questions.length === 1);
check("zorunlu kontrolü görünen soruyu sayar", missingRequired({ sections: { b1: "A" }, questions: [orphan] }, {}).length === 1);
check("cevaplanınca eksik yok", missingRequired({ sections: { b1: "A" }, questions: [orphan] }, { "1": "a" }).length === 0);

// ---- 3) Normalizasyon
const norm = normalizeSurveyDef({
  title: "  T ", intro: "", sections: { "1": "Bir", "2": "İki" },
  questions: [
    { key: "", section: "1", step: 0, type: "radio", required: true, label: "Soru bir", options: [{ value: "", label: "Evet" }, { value: "", label: "Hayır" }, { value: "", label: "" }] },
    { key: "s2", section: "yok", step: 1, type: "text", required: false, label: "Metin", options: [{ value: "a", label: "a" }], showIf: [{ q: "silinmis", op: "in", val: ["x"] }, { q: "soru_bir", op: "in", val: [] }, { q: "soru_bir", op: "in", val: ["evet"] }] },
    { key: "s2", section: "2", step: 1, type: "textarea", required: false, label: "Çakışan anahtar" },
  ],
});
check("sayısal bölüm anahtarı b1/b2 oldu", Object.keys(norm.sections).join(",") === "b1,b2", Object.keys(norm.sections).join(","));
check("boş soru anahtarı etiketten üretildi", norm.questions[0].key === "soru_bir", norm.questions[0].key);
check("boş seçenek değeri etiketten üretildi, boş seçenek atıldı", norm.questions[0].options?.map((o) => o.value).join(",") === "evet,hayir", norm.questions[0].options?.map((o) => o.value).join(","));
check("tanımsız bölüm → ilk bölüm; metin tipinde options yok", norm.questions[1].section === "b1" && norm.questions[1].options === undefined);
check("geçersiz koşullar atıldı, geçerli kaldı", norm.questions[1].showIf?.length === 1 && norm.questions[1].showIf[0].q === "soru_bir");
check("çakışan anahtar sonek aldı", norm.questions[2].key === "s2_2", norm.questions[2].key);
check("doğrulama: boş etiket/seçenek yakalanır", validateSurveyDef({ ...norm, questions: [{ ...norm.questions[0], label: "", options: [] }] }).length === 2);

// ---- 4) Gerçek kayıt: demo anket + bölümü bozuk kopya
const [student] = await db.select().from(users).where(eq(users.email, "ogrenci@test.com")).limit(1);
if (!student) throw new Error("ogrenci@test.com yok (önce smoke çalıştır)");
const [demo] = await db.select().from(surveys).where(eq(surveys.key, "guncel_kariyer_hedefim")).limit(1);
check("demo anket DB'de ve yayında", !!demo && demo.status === "published" && demo.questions.length === 15);

// ss76 senaryosu: soru 1'in bölümü eski/yanlış anahtarda
const brokenKey = "test_bozuk_bolum";
await db.delete(surveys).where(eq(surveys.key, brokenKey));
const [broken] = await db.insert(surveys).values({
  key: brokenKey, title: "Bozuk bölüm testi", intro: "", status: "published", publishedAt: new Date(),
  sections: { "1": "Bugünkü Kariyerim" },
  questions: [{ ...orphan, section: "kariyer" }, { key: "1a", section: "1", step: 1, type: "radio", required: true, label: "biraz açarsam..", options: [{ value: "a", label: "A" }] }],
}).returning();
const fullBroken = (await getSurveyById(broken.id))!;
const r1 = await saveSurvey(student.id, fullBroken, { "1a": "a" });
check("bölümsüz zorunlu soru boşsa hata (ama artık ekranda görünür)", "error" in r1 && /Bugünkü kariyerim/.test(r1.error ?? ""));
const r2 = await saveSurvey(student.id, fullBroken, { "1": "a", "1a": "a" });
check("ikisi de cevaplanınca kaydolur", "ok" in r2 && r2.ok === true);

// Demo anket: "Çalışıyorum" yolu — 2. soru koşulu (OR) açılmalı, "1a" zorunlu
const r3 = await saveSurvey(student.id, demo, { "1": "a" });
check("demo: 1=a iken 1a zorunlu", "error" in r3 && /biraz açarsam/.test(r3.error ?? ""), r3.error);
const r4 = await saveSurvey(student.id, demo, { "1": "a", "1a": "b" });
check("demo: 1=a,1a=b iken 2 (öğrenim) zorunlu ve görünür", "error" in r4 && /Öğrenim durumum/.test(r4.error ?? ""), r4.error);
// Canlıdaki gibi "1a" koşulsuz ve zorunlu: iş arayan da cevaplamak zorunda (canlı anketin bilinen kusuru)
  const r5 = await saveSurvey(student.id, demo, { "1": "b", "1a": "c", "2": "d", "3d": "b", "3db": ["b1", "b3"] });
check("demo: iş arıyorum yolu kaydolur", "ok" in r5 && r5.ok === true, "error" in r5 ? r5.error : "");
const saved = await db.select().from(surveyAnswers).where(eq(surveyAnswers.surveyKey, demo.key));
check("görünmeyen soruların cevabı yazılmadı, görünenler yazıldı", saved.some((a) => a.questionKey === "3db") && !saved.some((a) => a.questionKey === "3"));

// ---- 5) Sayfa render (dev sunucu)
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
async function session(email: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id: hash(token), userId: u.id, expiresAt: new Date(Date.now() + 3600e3) });
  return `fabo_session=${token}`;
}
async function get(cookie: string, path: string) {
  const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}
try {
  const stu = await session("ogrenci@test.com");
  // Not: soru metinleri RSC prop verisi olarak HTML'de zaten var; ekranda kaç soru çizildiğine (label sayısı) bakılır
  const labels = (html: string) => (html.match(/class="label"/g) ?? []).length;
  const adm = await session(process.env.SEED_ADMIN_EMAIL || "admin@fabrikaokulu.com.tr");
  // Öğrenci tamamladı → sonuç ekranı; ?duzenle=1 → form (giriş atlanır)
  const p1 = await get(stu, `/panel/anket/${demo.id}`);
  check("öğrenci: tamamlanmış anket sonuç ekranı", p1.status === 200 && p1.html.includes("Cevaplarımı güncelle"), String(p1.status));
  check("öğrenci: sonuç ekranı yalnızca kendi cevapları, ortalı", p1.html.includes("mx-auto max-w-2xl") && !p1.html.includes("katılımcının cevap dağılımı"));
  // Tek seferlik: güncelleme bağlantısı yok, ?duzenle=1 bile cevap görünümünde kalır, kayıt reddedilir
  await db.update(surveys).set({ editable: false }).where(eq(surveys.id, demo.id));
  const p1b = await get(stu, `/panel/anket/${demo.id}?duzenle=1`);
  check("tek seferlik: güncelleme yok, form açılmaz", p1b.status === 200 && !p1b.html.includes("Cevaplarımı güncelle") && p1b.html.includes("tek seferlik") && labels(p1b.html) === 0);
  await db.update(surveys).set({ editable: true }).where(eq(surveys.id, demo.id));
  const p2 = await get(stu, `/panel/anket/${demo.id}?duzenle=1`);
  check("öğrenci: güncelleme formu doğrudan sorular", p2.status === 200 && p2.html.includes("Bugünkü kariyerim:") && !p2.html.includes("Teste başla"));
  // Bozuk anketi doldurmamış → karşılama ekranı
  await db.delete(surveyCompletions).where(eq(surveyCompletions.surveyKey, brokenKey));
  // Adım adım mod: yalnızca ilk soru + ilerleme; akış modu: tüm görünen sorular
  await db.update(surveys).set({ mode: "steps" }).where(eq(surveys.id, demo.id));
  const ps = await get(stu, `/panel/anket/${demo.id}?duzenle=1`);
  const psParts = { status: ps.status === 200, progress: /Soru (<!-- -->)?1(<!-- -->)? \//.test(ps.html), oneQuestion: labels(ps.html) === 1, card: ps.html.includes("survey-card-next"), devam: ps.html.includes("Devam") };
  check("öğrenci: adım adım modda tek soru kartı + ilerleme", Object.values(psParts).every(Boolean), JSON.stringify(psParts));
  await db.update(surveys).set({ mode: "flow" }).where(eq(surveys.id, demo.id));
  const pf = await get(stu, `/panel/anket/${demo.id}?duzenle=1`);
  check("öğrenci: akış modunda görünen sorular alt alta", pf.status === 200 && labels(pf.html) > 1 && !pf.html.includes("survey-card-next"), `label sayısı ${labels(pf.html)}`);
  await db.update(surveys).set({ mode: demo.mode }).where(eq(surveys.id, demo.id));
  const p3 = await get(stu, `/panel/anket/${broken.id}`);
  check("öğrenci: karşılama ekranı (başlık + Teste başla)", p3.status === 200 && p3.html.includes("Teste başla") && p3.html.includes("Bozuk bölüm testi"));
  const p4 = await get(adm, `/admin/anketler/${demo.id}`);
  check("admin: yeni editör açılıyor", p4.status === 200 && p4.html.includes("Karşılama ekranı") && p4.html.includes("Bu soru ne zaman görünsün") && p4.html.includes("Gösterim ve cevap kuralı") && p4.html.includes("Tek seferlik"), String(p4.status));
  const p5 = await get(adm, `/admin/anketler/yeni`);
  check("admin: yeni anket sayfası", p5.status === 200 && p5.html.includes("Bölüm ekle"));
  const p6 = await get(adm, `/admin/anketler?sonuc=${demo.id}`);
  check("admin: sonuçlar sayfası", p6.status === 200 && p6.html.includes("Sonuçlar"));
} catch (e) {
  check("dev sunucu erişimi", false, String(e));
}

// Temizlik
await db.delete(surveyAnswers).where(eq(surveyAnswers.surveyKey, brokenKey));
await db.delete(surveyCompletions).where(eq(surveyCompletions.surveyKey, brokenKey));
await db.delete(surveys).where(eq(surveys.key, brokenKey));

console.log(fails ? `\n${fails} test başarısız` : "\nTüm anket testleri geçti");
process.exit(fails ? 1 : 0);
