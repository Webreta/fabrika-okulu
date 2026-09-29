import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courses, modules, lessons, quizzes, quizQuestions, assignments, periods, periodEnrollments, courseRelations, courseCategories, enrollments } from "@/db/schema";
import { notifyWaitlistIfOpen, notifyComingSoonOpened } from "@/lib/waitlist";
import { notifyFavoritesOnSale } from "@/lib/favorites";
import { notifyPreorderOpened } from "@/lib/preorder";
import { isPreorder } from "@/lib/course-logic";
import { cleanHtml } from "@/lib/sanitize";
import { slugify } from "@/lib/uploads";
import { normalizeDuration, isDuration } from "@/lib/course-logic";
import { addDays, todayISO, isWaNumber } from "@/lib/format";
import { COURSE_LIMITS, ASSIGN_NEEDS_PERIOD } from "@/lib/course-limits";

// ---- Doğrulama yardımcıları ----
// Hatalı değer sessizce düzeltilmez (eksi fiyat → 0, kontenjan 0 → 20 gibi); kullanıcıya Türkçe hata döner.
const tr = (n: number) => n.toLocaleString("tr-TR");
const text = (max: number) => z.string({ error: "metin olmalı" }).max(max, `en fazla ${tr(max)} karakter olabilir`);
const num = (min: number, max: number) =>
  z.coerce.number({ error: "sayı olmalı" }).min(min, min === 0 ? "eksi olamaz" : `en az ${tr(min)} olmalı`).max(max, `en fazla ${tr(max)} olabilir`);
const int = (min: number, max: number) =>
  z.coerce.number({ error: "sayı olmalı" }).int("tam sayı olmalı").min(min, min === 0 ? "eksi olamaz" : `en az ${tr(min)} olmalı`).max(max, `en fazla ${tr(max)} olabilir`);

const L = COURSE_LIMITS;

/** Gerçek bir takvim günü mü ("YYYY-MM-DD", 2000–2100 arası) */
const isDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= "2000-01-01" && s <= "2100-12-31";
};
/** Geçerli saat mi ("SS:DD", saniye isteğe bağlı) */
const isTime = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(s);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
};

// Editörden gelen müfredat şeması — sınav soruları da inline gelir
const questionSchema = z.object({
  id: z.number().optional(),
  qtype: z.enum(["multiple_choice", "true_false", "open_ended"]),
  text: text(L.questionText).trim(),
  points: int(1, 1000).default(1),
  options: z.array(text(L.optionText)).max(12, "en fazla 12 şık olabilir").default([]),
  correct: z.union([z.number(), z.string(), z.boolean(), z.null()]).optional(),
  explanation: text(L.explanation).default(""),
  image: text(L.url).default(""),
});

const lessonSchema = z.object({
  id: z.number().optional(),
  type: z.enum(["video", "quiz", "assign", "file"]),
  title: text(L.lessonTitle).trim(),
  videoUrl: text(L.url).trim().default(""),
  duration: text(20).default(""),
  preview: z.boolean().default(false),
  description: text(L.lessonDescription).default(""),
  dueDays: int(0, 3650).default(0),
  // Takvimli kursta teslim mutlak tarihle girilir (YYYY-MM-DD + isteğe bağlı HH:MM)
  dueDate: z.string().default(""),
  dueTime: z.string().default(""),
  fileUrl: text(L.url).default(""),
  fileName: text(300).default(""),
  fileMime: text(100).default(""),
  questions: z.array(questionSchema).max(200, "en fazla 200 soru olabilir").default([]),
  timeLimit: int(0, 1440).default(0),
  passScore: int(0, 100).default(0),
  maxAttempts: int(0, 100).default(1),
  shuffleQuestions: z.boolean().default(false),
  showCorrectAnswers: z.boolean().default(true),
  isGraded: z.boolean().default(false),
  maxScore: int(0, 1000).default(100),
  allowFile: z.boolean().default(true),
  allowVoice: z.boolean().default(true),
  allowText: z.boolean().default(true),
});

const moduleSchema = z.object({
  id: z.number().optional(),
  title: text(L.moduleTitle).trim(),
  lessons: z.array(lessonSchema).max(300, "en fazla 300 içerik olabilir").default([]),
});

const scheduleSchema = z.object({
  date: z.string().default(""),
  time: z.string().default(""),
  title: text(L.sessionTitle).default(""),
  link: text(L.url).default(""),
  notes: text(1000).default(""),
});

// İlişkili kurs önerisi (yalnızca admin kaydeder)
const relationSchema = z.object({
  relatedCourseId: z.coerce.number().int().min(1, "eğitim seçilmeli"),
  trigger: z.enum(["completed", "purchased"]).default("completed"),
  discountPercent: int(0, 100).default(0),
  note: text(L.note).default(""),
});

const periodSchema = z.object({
  id: z.number().optional(),
  name: text(L.periodName).trim(),
  startDate: z.string().default(""),
  startTime: z.string().default(""),
  endDate: z.string().default(""),
  capacity: int(1, L.maxCapacity).default(20),
  description: text(L.periodDescription).default(""),
  schedule: z.array(scheduleSchema).max(200, "en fazla 200 oturum olabilir").default([]),
});

const courseObjectSchema = z.object({
  id: z.number().optional(),
  title: text(L.title).trim().min(2, "gerekli (en az 2 karakter)"),
  shortDescription: text(L.shortDescription).default(""),
  description: text(L.description).default(""),
  imageUrl: text(L.url).default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  isFree: z.boolean().default(false),
  price: num(0, L.maxPrice).default(0),
  salePrice: num(0, L.maxPrice).default(0),
  saleTo: z.string().default(""),
  outcomes: z.array(text(L.outcome)).max(L.outcomeCount * 3, `en fazla ${L.outcomeCount} madde olabilir`).default([]),
  requirements: text(5000).default(""),
  target: text(L.target).default(""),
  previewVideo: text(L.url).default(""),
  level: text(40).default("all"),
  language: text(40).default("Türkçe"),
  hasCertificate: z.boolean().default(false),
  lifetime: z.boolean().default(true),
  buttonType: text(20).default("cart"),
  // Online görüşme ürünü: müfredat yok, koltuklar dönem olarak tutulur
  type: z.enum(["course", "meeting"]).default("course"),
  meetingMinutes: int(0, 600).default(0),
  meetingLink: text(L.url).trim().default(""),
  instructorId: z.number().nullable().optional(),
  modules: z.array(moduleSchema).max(100, "en fazla 100 modül olabilir").default([]),
  periods: z.array(periodSchema).max(500, "en fazla 500 dönem olabilir").default([]),
  relations: z.array(relationSchema).max(30, "en fazla 30 öneri olabilir").optional(),
  /** Kategori id'leri (yalnızca admin düzenler; undefined = dokunma) */
  categoryIds: z.array(z.number().int()).optional(),
  featured: z.boolean().optional(),
  closed: z.boolean().optional(),
  comingSoon: z.boolean().optional(),
  soonShowPrice: z.boolean().optional(),
  /** Erken kayıt (yalnızca admin): açılış tarihine kadar satın alınır, içerik açılışta aktifleşir */
  preorder: z.boolean().optional(),
  opensAt: z.string().optional(),
  preorderPrice: num(0, L.maxPrice).optional(),
  /** Program sayfasında eğitmenden sonra gösterilen öne çıkan eğitim (yalnızca admin); null/0 = yok */
  promoCourseId: z.number().int().nullable().optional(),
  promoTitle: text(120).trim().optional(),
  whatsappNumber: text(30).optional(),
  whatsappMessage: text(500).optional(),
});

/**
 * Kurs tipi kuralları:
 * - Esnek/ücretsiz (dönemsiz) kursta görev olmaz.
 * - Sınavlar her kurs tipinde anlık geri bildirimlidir: test/D-Y otomatik değerlendirilir,
 *   açık uçlu sorular yalnızca kaydedilir (puanlanmaz, eğitmen değerlendirmesi yoktur).
 *   Açık uçlu ve test/D-Y sorular aynı sınavda birlikte yer alabilir.
 * - Dönem: ad + başlangıç + bitiş zorunlu, bitiş başlangıçtan önce olamaz, oturumlar dönem aralığında olmalı.
 * - Fiyat: indirimli fiyat normal fiyattan düşük olmalı.
 */
export const courseInputSchema = courseObjectSchema.superRefine((c, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });

  // ---- Fiyat
  if (!c.isFree) {
    if (c.salePrice > 0 && c.salePrice >= c.price) issue(["salePrice"], "normal fiyattan düşük olmalı (indirim yoksa 0 bırak)");
    if (c.saleTo && !isDay(c.saleTo)) issue(["saleTo"], "geçerli bir tarih değil");
  }
  if (c.outcomes.filter((o) => o.trim()).length > L.outcomeCount) issue(["outcomes"], `en fazla ${L.outcomeCount} madde olabilir`);
  // WhatsApp numarası (kurs özel): boş bırakılabilir (genel numara kullanılır); yazıldıysa geçerli olmalı
  if ((c.whatsappNumber ?? "").trim() && !isWaNumber(c.whatsappNumber ?? "")) issue(["whatsappNumber"], "geçerli bir telefon numarası değil (örnek: 905321234567; yalnızca rakam, 10–15 hane)");

  // ---- Dönemler / koltuklar
  c.periods.forEach((p, pi) => {
    const at = (...rest: (string | number)[]) => ["periods", pi, ...rest];
    if (!p.name || !p.startDate || !p.endDate) { issue(at(), "ad, başlangıç ve bitiş tarihi zorunlu (boş olanı doldur ya da sil)"); return; }
    const startOk = isDay(p.startDate), endOk = isDay(p.endDate);
    if (!startOk) issue(at("startDate"), "geçerli bir tarih değil");
    if (!endOk) issue(at("endDate"), "geçerli bir tarih değil");
    if (startOk && endOk && p.endDate < p.startDate) issue(at("endDate"), "başlangıç tarihinden önce olamaz");
    if (p.startTime && !isTime(p.startTime)) issue(at("startTime"), "geçerli bir saat değil (örnek: 19:30)");
    p.schedule.forEach((s, si) => {
      if (!s.date) {
        // Tümüyle boş satır kaydedilmez; içi dolu ama tarihsiz satır hatadır
        if (s.time || s.title.trim() || s.link.trim() || s.notes.trim()) issue(at("schedule", si, "date"), "gerekli (oturumu doldur ya da sil)");
        return;
      }
      if (!isDay(s.date)) { issue(at("schedule", si, "date"), "geçerli bir tarih değil"); return; }
      if (startOk && endOk && p.endDate >= p.startDate && (s.date < p.startDate || s.date > p.endDate)) issue(at("schedule", si, "date"), "dönemin başlangıç–bitiş tarihleri arasında olmalı");
      if (s.time && !isTime(s.time)) issue(at("schedule", si, "time"), "geçerli bir saat değil (örnek: 19:30)");
    });
  });

  // ---- Müfredat (online görüşme ürününde müfredat kaydedilmez)
  if (c.type !== "meeting") {
    const scheduled = c.periods.length > 0;
    c.modules.forEach((m, mi) => {
      if (!m.title) issue(["modules", mi, "title"], "gerekli (boş modülü sil)");
      m.lessons.forEach((l, li) => {
        const at = (...rest: (string | number)[]) => ["modules", mi, "lessons", li, ...rest];
        if (!scheduled && l.type === "assign") issue(at(), ASSIGN_NEEDS_PERIOD);
        if (l.type === "video" && l.duration.trim() && !isDuration(l.duration)) issue(at("duration"), "yalnızca rakam ve iki nokta içerebilir (örnek: 12, 12:30 ya da 1:05:00)");
        if (l.type === "quiz" || l.type === "assign") {
          if (l.dueDate && !isDay(l.dueDate)) issue(at("dueDate"), "geçerli bir tarih değil");
          if (l.dueTime && !isTime(l.dueTime)) issue(at("dueTime"), "geçerli bir saat değil (örnek: 19:30)");
        }
        if (l.type === "quiz") {
          l.questions.forEach((q, qi) => {
            if (!q.text || q.qtype !== "multiple_choice") return;
            const filled = q.options.filter((o) => o.trim() !== "").length;
            if (filled < 2) issue(at("questions", qi, "options"), "en az iki şık yazılmalı");
            else if (!(q.options[Number(q.correct ?? 0) || 0] ?? "").trim()) issue(at("questions", qi, "correct"), "boş bir şıkkı gösteriyor; doğru şıkkı işaretle");
          });
        }
      });
    });
  }

  // ---- Erken kayıt
  if (c.preorder) {
    if (!isDay(c.opensAt ?? "")) issue(["Erken kayıt"], "açılış tarihi gerekli");
    if (c.comingSoon) issue(["Erken kayıt"], "“Yakında” ile birlikte seçilemez; birini kaldır");
    if (c.type === "meeting") issue(["Erken kayıt"], "online görüşme ürününde kullanılamaz");
    if (!c.isFree && (c.preorderPrice ?? 0) > 0 && (c.preorderPrice ?? 0) >= c.price) issue(["Erken kayıt"], "erken kayıt fiyatı normal fiyattan düşük olmalı");
    // Erken kayıt fiyatı indirimin önüne geçtiği için indirimli fiyattan yüksekse erken kayıt olan daha pahalıya alırdı
    else if (!c.isFree && (c.preorderPrice ?? 0) > 0 && c.salePrice > 0 && c.salePrice < c.price && (c.preorderPrice ?? 0) > c.salePrice) issue(["Erken kayıt"], "erken kayıt fiyatı indirimli fiyattan yüksek olamaz");
  }
});

export type CourseInput = z.infer<typeof courseObjectSchema>;

// ---- Hata metni: "Form hatası (Dönem 2 › Bitiş): başlangıç tarihinden önce olamaz" ----
const FIELD_LABELS: Record<string, string> = {
  title: "Başlık", shortDescription: "Kısa açıklama", description: "Açıklama", imageUrl: "Görsel", price: "Fiyat", salePrice: "İndirimli fiyat",
  saleTo: "İndirim bitiş tarihi", outcomes: "Kazanımlar", target: "Hedef kitle", previewVideo: "Önizleme videosu", language: "Dil", level: "Seviye",
  buttonType: "Buton tipi", type: "Eğitim türü", status: "Durum", meetingMinutes: "Görüşme süresi", meetingLink: "Görüşme bağlantısı",
  preorderPrice: "Erken kayıt fiyatı", opensAt: "Açılış tarihi", promoTitle: "Öne çıkan eğitim başlığı", whatsappNumber: "WhatsApp numarası",
  whatsappMessage: "WhatsApp mesajı", name: "Ad", startDate: "Başlangıç", startTime: "Başlangıç saati", endDate: "Bitiş", capacity: "Kontenjan",
  date: "Tarih", time: "Saat", link: "Bağlantı", notes: "Not", discountPercent: "İndirim yüzdesi", note: "Mesaj", relatedCourseId: "Eğitim",
  points: "Puan", text: "Soru metni", options: "Şıklar", correct: "Doğru şık", explanation: "Açıklama", image: "Görsel", videoUrl: "Video adresi",
  duration: "Süre", dueDays: "Süre (gün)", dueDate: "Son tarih", dueTime: "Son tarih saati", passScore: "Geçme notu", maxScore: "Maks puan",
  timeLimit: "Süre sınırı", maxAttempts: "Deneme hakkı", fileName: "Dosya adı", requirements: "Gereksinimler", modules: "Müfredat",
  periods: "Dönemler", relations: "Kurs önerileri", questions: "Sorular", lessons: "İçerikler", schedule: "Oturumlar",
};

/** Doğrulama hatasını kullanıcıya gösterilecek tek satıra çevirir */
export function courseIssueMessage(issues: readonly { path: PropertyKey[]; message: string }[], meeting = false): string {
  const first = issues[0];
  if (!first) return "Form hatası.";
  const parts: string[] = [];
  const path = first.path;
  path.forEach((seg, i) => {
    const prev = path[i - 1];
    const next = path[i + 1];
    if (typeof seg === "number") {
      if (prev === "modules") parts.push(`Modül ${seg + 1}`);
      else if (prev === "lessons") parts.push(`İçerik ${seg + 1}`);
      else if (prev === "questions") parts.push(`Soru ${seg + 1}`);
      else if (prev === "periods") parts.push(`${meeting ? "Koltuk" : "Dönem"} ${seg + 1}`);
      else if (prev === "schedule") parts.push(`Oturum ${seg + 1}`);
      else if (prev === "relations") parts.push(`Öneri ${seg + 1}`);
      else if (prev === "options") parts.push(`Şık ${String.fromCharCode(65 + seg)}`);
      else if (prev === "outcomes") parts.push(`Kazanımlar › ${seg + 1}. satır`);
    } else if (typeof next !== "number") {
      // Dizi adları (modules, lessons…) sıra numarasıyla birlikte yazılır; tek başına kalan alan adı etiketine çevrilir
      const key = String(seg);
      parts.push(FIELD_LABELS[key] ?? key);
    }
  });
  const msg = /^invalid/i.test(first.message) ? "geçersiz değer" : first.message;
  const more = issues.length > 1 ? ` (${issues.length - 1} hata daha var; önce bunu düzelt)` : "";
  return `Form hatası${parts.length ? ` (${parts.join(" › ")})` : ""}: ${msg}.${more}`;
}

// ---- Eğitmen kilidi ----
/**
 * Eğitmen (yönetici değil) için kilit: eğitim yayındaysa YA DA kayıtlı öğrencisi varsa müfredat, dönemler,
 * eğitim türü ve durum (yayından kaldırma) değiştirilemez; yalnızca oturum bağlantıları güncellenir.
 * Kayıtlı öğrenci ölçütü, "Sil" ile taslağa düşürülen eğitimin kilidinin açılmasını engeller. Yönetici kısıtlanmaz.
 */
export async function courseLockInfo(courseId: number) {
  const [c] = await db.select({ status: courses.status, type: courses.type, buttonType: courses.buttonType }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) return null;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, "active")));
  return { ...c, students: n, teacherLocked: c.status === "published" || n > 0 };
}
export type CourseLockInfo = NonNullable<Awaited<ReturnType<typeof courseLockInfo>>>;

// Kilitli kayıtta dönemlerden yalnızca oturum bağlantıları okunur
const periodLinksSchema = z.array(z.object({
  id: z.number().int().optional(),
  schedule: z.array(z.object({ link: text(L.url).default("") })).default([]),
})).default([]);
export type PeriodLinks = z.infer<typeof periodLinksSchema>;

/**
 * Editörden gelen ham veriyi doğrular. Kilitli alanlar istekten değil KAYITTAN alınır (elle gönderilen istekle aşılamaz):
 * - yönetici olmayan herkes: satış düğmesi tipi (buttonType)
 * - kilitli eğitim (bkz. courseLockInfo): müfredat, dönemler, eğitim türü; yayındaki eğitim taslağa çekilemez
 */
export function parseCourseInput(
  raw: unknown,
  opts: { isAdmin: boolean; stored: CourseLockInfo | null },
): { ok: true; input: CourseInput; locked: boolean; links: PeriodLinks } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Form hatası: veri okunamadı." };
  const locked = !opts.isAdmin && !!opts.stored?.teacherLocked;
  let data: Record<string, unknown> = raw as Record<string, unknown>;
  let links: PeriodLinks = [];
  if (!opts.isAdmin) {
    data = { ...data, buttonType: opts.stored?.buttonType ?? "cart" };
    if (locked && opts.stored) {
      const lp = periodLinksSchema.safeParse(data.periods ?? []);
      if (!lp.success) return { ok: false, error: `Form hatası (Oturum bağlantısı): en fazla ${L.url} karakter olabilir.` };
      links = lp.data;
      data = { ...data, modules: [], periods: [], type: opts.stored.type, status: opts.stored.status === "published" ? "published" : data.status };
    }
  }
  const parsed = courseInputSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: courseIssueMessage(parsed.error.issues, data.type === "meeting") };
  return { ok: true, input: parsed.data, locked, links };
}

/**
 * Kayıtlı veriye bakan kurallar: tümüyle geçmişte kalan dönem yalnızca YENİ eklenirken reddedilir
 * (süren eğitimin bitmiş dönemleri kaydı engellemez).
 */
export async function checkCourseAgainstStored(input: CourseInput): Promise<string | null> {
  if (input.periods.length === 0) return null;
  const existing = input.id ? await db.select({ id: periods.id }).from(periods).where(eq(periods.courseId, input.id)) : [];
  const known = new Set(existing.map((p) => p.id));
  const today = todayISO();
  const label = input.type === "meeting" ? "Koltuk" : "Dönem";
  for (const [i, p] of input.periods.entries()) {
    if (p.id && known.has(p.id)) continue;
    if (p.endDate < today) return `Form hatası (${label} ${i + 1} › Bitiş): tarih geçmişte kalmış. Yeni ${label.toLowerCase()} geçmiş tarihli olamaz; tarihleri düzelt ya da sil.`;
  }
  return null;
}

async function uniqueSlug(title: string, id?: number) {
  const base = slugify(title) || "program";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const [ex] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, slug)).limit(1);
    if (!ex || ex.id === id) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Kursu ve tüm alt yapısını kaydeder.
 * locked=true (eğitmen + yayında ya da kayıtlı öğrencili eğitim): müfredat ve dönemler dokunulmaz; yalnızca bitmemiş dönemlerin
 * oturum linkleri güncellenir (opts.links; verilmezse input.periods içinden okunur). Kilitli alanların istekten değil kayıttan
 * alınması parseCourseInput'un işidir.
 */
export async function saveCourse(input: CourseInput, opts: { authorId: number; instructorId: number | null; locked: boolean; isAdmin: boolean; links?: PeriodLinks }) {
  const isNew = !input.id;
  // Adres yalnızca başlık değişince yeniden üretilir: başlığı aynı kalan eğitimin (elle verilmiş olabilen) adresi
  // her kayıtta değişirse eski bağlantılar kırılır ve adrese bakan örnek veri betikleri ürünü yeniden oluşturur
  const [prevSlug] = input.id ? await db.select({ title: courses.title, slug: courses.slug }).from(courses).where(eq(courses.id, input.id)).limit(1) : [];
  const slug = prevSlug && prevSlug.slug && prevSlug.title === input.title ? prevSlug.slug : await uniqueSlug(input.title, input.id);
  const saleValid = input.salePrice > 0 && input.salePrice < input.price;
  const base = {
    title: input.title,
    slug,
    shortDescription: input.shortDescription,
    // Eğitmenin yazdığı HTML temizlenir (betik, olay öznitelikleri, iframe ayıklanır)
    description: cleanHtml(input.description),
    imageUrl: input.imageUrl,
    status: input.status,
    isFree: input.isFree,
    price: input.isFree ? "0" : input.price.toFixed(2),
    salePrice: input.isFree || !saleValid ? null : input.salePrice.toFixed(2),
    saleTo: saleValid && input.saleTo ? input.saleTo : null,
    outcomes: input.outcomes.map((o) => o.trim()).filter(Boolean),
    requirements: input.requirements,
    target: input.target,
    previewVideo: input.previewVideo,
    level: input.level,
    language: input.language,
    hasCertificate: input.hasCertificate,
    lifetime: input.lifetime,
    buttonType: input.buttonType,
    type: input.type,
    meetingMinutes: input.type === "meeting" ? input.meetingMinutes : 0,
    meetingLink: input.type === "meeting" ? input.meetingLink : "",
    updatedAt: new Date(),
    ...(opts.isAdmin && input.instructorId !== undefined ? { instructorId: input.instructorId } : {}),
    ...(opts.isAdmin && input.featured !== undefined ? { featured: input.featured } : {}),
    ...(opts.isAdmin && input.closed !== undefined ? { closed: input.closed } : {}),
    ...(opts.isAdmin && input.comingSoon !== undefined ? { comingSoon: input.comingSoon } : {}),
    ...(opts.isAdmin && input.soonShowPrice !== undefined ? { soonShowPrice: input.soonShowPrice } : {}),
    ...(opts.isAdmin && input.preorder !== undefined
      ? {
          preorder: input.preorder,
          opensAt: input.preorder && input.opensAt ? input.opensAt : null,
          preorderPrice: input.preorder && !input.isFree && (input.preorderPrice ?? 0) > 0 ? (input.preorderPrice ?? 0).toFixed(2) : null,
        }
      : {}),
    ...(opts.isAdmin && input.promoCourseId !== undefined ? { promoCourseId: input.promoCourseId && input.promoCourseId !== input.id ? input.promoCourseId : null, promoTitle: input.promoTitle ?? "" } : {}),
    ...(opts.isAdmin && input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber } : {}),
    ...(opts.isAdmin && input.whatsappMessage !== undefined ? { whatsappMessage: input.whatsappMessage } : {}),
  };

  let courseId: number;
  let before: { isFree: boolean; price: string; salePrice: string | null; saleTo: string | null ; comingSoon: boolean; preorder: boolean; opensAt: string | null; preorderPrice: string | null } | null = null;
  if (isNew) {
    const [c] = await db.insert(courses).values({ ...base, authorId: opts.authorId, instructorId: opts.instructorId }).returning({ id: courses.id });
    courseId = c.id;
  } else {
    courseId = input.id!;
    const [old] = await db.select({ isFree: courses.isFree, price: courses.price, salePrice: courses.salePrice, saleTo: courses.saleTo, comingSoon: courses.comingSoon, preorder: courses.preorder, opensAt: courses.opensAt, preorderPrice: courses.preorderPrice }).from(courses).where(eq(courses.id, courseId)).limit(1);
    before = old ?? null;
    // Açılış tarihi değiştiyse açılış bildirimi yeniden gönderilebilir olsun
    const opensChanged = opts.isAdmin && input.preorder !== undefined && !!old && (base as { opensAt?: string | null }).opensAt !== old.opensAt;
    await db.update(courses).set({ ...base, ...(opensChanged ? { openNotifiedAt: null } : {}) }).where(eq(courses.id, courseId));
  }

  let created: Created = { quizzes: [], assignments: [] };
  if (!opts.locked) {
    created = await syncCurriculum(courseId, input.type === "meeting" ? [] : input.modules, opts.authorId, input.periods.length > 0);
    await syncPeriods(courseId, input.periods, opts.isAdmin, input.type === "meeting");
  } else {
    await syncPeriodLinks(courseId, opts.links ?? input.periods.map((p) => ({ id: p.id, schedule: p.schedule.map((s) => ({ link: s.link })) })));
  }

  // İlişkili kurs önerileri (yalnızca admin düzenler)
  if (opts.isAdmin && input.relations !== undefined) {
    await db.delete(courseRelations).where(eq(courseRelations.courseId, courseId));
    const seenRel = new Set<string>();
    const rels = input.relations
      .filter((r) => r.relatedCourseId !== courseId)
      .filter((r) => { const k = `${r.relatedCourseId}-${r.trigger}`; if (seenRel.has(k)) return false; seenRel.add(k); return true; })
      .map((r, i) => ({ courseId, relatedCourseId: r.relatedCourseId, trigger: r.trigger, discountPercent: r.discountPercent, note: r.note.slice(0, 300), sortOrder: i }));
    if (rels.length) await db.insert(courseRelations).values(rels);
  }

  // Kategoriler (yalnızca admin)
  if (opts.isAdmin && input.categoryIds !== undefined) {
    await db.delete(courseCategories).where(eq(courseCategories.courseId, courseId));
    const ids = [...new Set(input.categoryIds.filter((x) => x > 0))];
    if (ids.length) await db.insert(courseCategories).values(ids.map((categoryId) => ({ courseId, categoryId })));
  }

  // Grup: dönem varsa takvimli, ücretsizse ucretsiz, değilse esnek
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(periods).where(eq(periods.courseId, courseId));
  const group = n > 0 ? "takvimli" : input.isFree ? "ucretsiz" : "esnek";
  await db.update(courses).set({ group }).where(eq(courses.id, courseId));
  // "Yakında" kaldırıldıysa (eğitim açıldı) talep bırakanlara haber ver; yoksa boş yer açıldıysa bekleme listesine
  if (before?.comingSoon && opts.isAdmin && input.comingSoon === false) await notifyComingSoonOpened(courseId);
  await notifyWaitlistIfOpen(courseId);
  // Erken kayıt dönemi yönetici eliyle bitirildiyse (kutu kaldırıldı / tarih öne çekildi) bekleyen öğrencilere "açıldı" haberi
  if (before && isPreorder(before) && opts.isAdmin && input.preorder !== undefined && !isPreorder({ preorder: input.preorder, opensAt: input.opensAt })) await notifyPreorderOpened(courseId);
  // İndirim başladı/değiştiyse favorileyenlere haber ver (yalnızca yayındaki kurs)
  if (before && input.status === "published") await notifyFavoritesOnSale(courseId, before);
  return { courseId, slug, created };
}

export type Created = { quizzes: { id: number; title: string }[]; assignments: { id: number; title: string }[] };

async function syncCurriculum(courseId: number, mods: CourseInput["modules"], authorId: number, scheduled: boolean): Promise<Created> {
  const created: Created = { quizzes: [], assignments: [] };
  const keepModules: number[] = [];
  const keepLessons: number[] = [];
  let mi = 0;
  for (const m of mods) {
    if (!m.title) continue;
    let moduleId = m.id;
    if (moduleId) {
      const r = await db.update(modules).set({ title: m.title, sortOrder: mi }).where(and(eq(modules.id, moduleId), eq(modules.courseId, courseId))).returning({ id: modules.id });
      if (!r[0]) moduleId = undefined;
    }
    if (!moduleId) {
      const [c] = await db.insert(modules).values({ courseId, title: m.title, sortOrder: mi }).returning({ id: modules.id });
      moduleId = c.id;
    }
    keepModules.push(moduleId);
    mi++;
    let li = 0;
    for (const l of m.lessons) {
      const isTask = l.type === "quiz" || l.type === "assign";
      // Takvimli kursta mutlak teslim tarihi; saat boşsa günün sonu (23:59:59).
      // Tarih girilmemişse eski göreli gün değeri (dueDays) geçerli kalır.
      const dueAt = scheduled && isTask && /^\d{4}-\d{2}-\d{2}$/.test(l.dueDate)
        ? new Date(`${l.dueDate}T${/^\d{1,2}:\d{2}$/.test(l.dueTime) ? `${l.dueTime}:00` : "23:59:59"}`)
        : null;
      const values = {
        courseId, moduleId, type: l.type, title: l.title || (l.type === "video" ? "Ders" : l.type === "quiz" ? "Sınav" : l.type === "assign" ? "Görev" : l.fileName || "Dosya"),
        sortOrder: li, videoUrl: l.type === "video" ? l.videoUrl : "", duration: l.type === "video" ? normalizeDuration(l.duration) : "",
        preview: l.type === "video" ? l.preview : false, description: cleanHtml(l.description), dueDays: isTask && !dueAt ? l.dueDays : 0,
        fileUrl: l.type === "file" ? l.fileUrl : "", fileName: l.type === "file" ? l.fileName : "", fileMime: l.type === "file" ? l.fileMime : "",
      };
      let lessonId = l.id;
      if (lessonId) {
        const r = await db.update(lessons).set(values).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId))).returning({ id: lessons.id });
        if (!r[0]) lessonId = undefined;
      }
      if (!lessonId) {
        const [c] = await db.insert(lessons).values(values).returning({ id: lessons.id });
        lessonId = c.id;
      }
      keepLessons.push(lessonId);
      li++;

      if (l.type === "quiz") {
        const [existing] = await db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).limit(1);
        const qv = { courseId, lessonId, title: values.title, description: l.description, timeLimit: l.timeLimit, passScore: l.passScore, maxAttempts: l.maxAttempts, shuffleQuestions: l.shuffleQuestions, showCorrectAnswers: l.showCorrectAnswers, extraDays: dueAt ? null : l.dueDays > 0 ? l.dueDays : null, endDate: dueAt, status: "active" as const };
        let quizId = existing?.id;
        if (quizId) await db.update(quizzes).set(qv).where(eq(quizzes.id, quizId));
        else { const [c] = await db.insert(quizzes).values(qv).returning({ id: quizzes.id }); quizId = c.id; created.quizzes.push({ id: quizId, title: values.title }); }
        // Sorular: id'si olanlar güncellenir, yeni olanlar eklenir, gelmeyenler silinir
        const keepQ: number[] = [];
        let qi = 0;
        for (const q of l.questions) {
          if (!q.text) continue;
          // Boş şıklar kaydedilmez; doğru şık sırası kalan şıklara göre yeniden hesaplanır (yoksa başka şıkkı gösterirdi)
          const kept = q.options.map((o, i) => ({ o, i })).filter((x) => x.o.trim() !== "");
          const correctIdx = Math.max(0, kept.findIndex((x) => x.i === (Number(q.correct ?? 0) || 0)));
          const correct = q.qtype === "multiple_choice" ? [correctIdx] : q.qtype === "true_false" ? (q.correct === false || q.correct === "false" ? "false" : "true") : null;
          const options = q.qtype === "multiple_choice" ? kept.map((x) => x.o) : q.qtype === "true_false" ? ["Doğru", "Yanlış"] : [];
          const row = { quizId, type: q.qtype, text: q.text, options, correct, points: q.points, explanation: q.explanation, image: q.image ?? "", sortOrder: qi++ };
          let qid = q.id;
          if (qid) {
            const r = await db.update(quizQuestions).set(row).where(and(eq(quizQuestions.id, qid), eq(quizQuestions.quizId, quizId))).returning({ id: quizQuestions.id });
            if (!r[0]) qid = undefined;
          }
          if (!qid) { const [c] = await db.insert(quizQuestions).values(row).returning({ id: quizQuestions.id }); qid = c.id; }
          keepQ.push(qid);
        }
        if (keepQ.length) await db.delete(quizQuestions).where(and(eq(quizQuestions.quizId, quizId), notInArray(quizQuestions.id, keepQ)));
        else await db.delete(quizQuestions).where(eq(quizQuestions.quizId, quizId));
      }
      if (l.type === "assign") {
        const [existing] = await db.select().from(assignments).where(eq(assignments.lessonId, lessonId)).limit(1);
        const av = { courseId, lessonId, title: values.title, description: l.description, extraDays: dueAt ? 0 : l.dueDays, dueDate: dueAt, status: "active", isGraded: l.isGraded, maxScore: l.isGraded ? l.maxScore : 0, allowFile: l.allowFile, allowVoice: l.allowVoice, allowText: l.allowText };
        if (existing) await db.update(assignments).set(av).where(eq(assignments.id, existing.id));
        else { const [c] = await db.insert(assignments).values({ ...av, createdBy: authorId }).returning({ id: assignments.id }); created.assignments.push({ id: c.id, title: values.title }); }
      }
    }
  }
  // Silinenler
  if (keepLessons.length) await db.delete(lessons).where(and(eq(lessons.courseId, courseId), notInArray(lessons.id, keepLessons)));
  else await db.delete(lessons).where(eq(lessons.courseId, courseId));
  if (keepModules.length) await db.delete(modules).where(and(eq(modules.courseId, courseId), notInArray(modules.id, keepModules)));
  else await db.delete(modules).where(eq(modules.courseId, courseId));
  // Dersi silinen sınav/görevleri pasifleştir
  await db.update(quizzes).set({ status: "deleted" }).where(and(eq(quizzes.courseId, courseId), sql`${quizzes.lessonId} is null`));
  await db.update(assignments).set({ status: "deleted" }).where(and(eq(assignments.courseId, courseId), sql`${assignments.lessonId} is null`));
  return created;
}

/** Kilitli kayıt: yalnızca bitmemiş dönemlerin oturum bağlantıları güncellenir; tarih, saat, başlık, kontenjan kayıttaki gibi kalır */
async function syncPeriodLinks(courseId: number, links: PeriodLinks) {
  const existing = await db.select().from(periods).where(eq(periods.courseId, courseId));
  const today = todayISO();
  for (const ex of existing) {
    if (ex.endDate < today) continue;
    const inp = links.find((l) => l.id === ex.id);
    if (!inp) continue;
    const merged = (ex.schedule ?? []).map((s, i) => ({ ...s, link: inp.schedule[i]?.link ?? s.link }));
    await db.update(periods).set({ schedule: merged }).where(eq(periods.id, ex.id));
  }
}

async function syncPeriods(courseId: number, list: CourseInput["periods"], force = false, meeting = false) {
  const existing = await db.select().from(periods).where(eq(periods.courseId, courseId));
  const keep: number[] = [];
  for (const p of list) {
    // Eksik dönem doğrulamada reddedilir (courseInputSchema); doğrulamasız çağrılar (örnek veri betikleri) için koruma
    if (!p.name || !p.startDate || !p.endDate) continue;
    const schedule = p.schedule.filter((s) => s.date).map((s) => ({ date: s.date, time: s.time, title: s.title, link: s.link, notes: s.notes ?? "" }));
    const ex = p.id ? existing.find((e) => e.id === p.id) : undefined;
    const startTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(p.startTime) ? p.startTime.slice(0, 5) : null;
    const values = {
      courseId, name: p.name, startDate: p.startDate, startTime, endDate: p.endDate, capacity: p.capacity, description: p.description, schedule,
      // Son kayıt: başlangıçtan bir gün önce (gün hesabı saat diliminden bağımsız yapılır).
      // Görüşme koltuğunda son kayıt günü yoktur: koltuk, saati gelene kadar aynı gün de satılır
      enrollmentDeadline: meeting ? null : addDays(p.startDate, -1),
    };
    if (ex) { await db.update(periods).set(values).where(eq(periods.id, ex.id)); keep.push(ex.id); }
    else { const [c] = await db.insert(periods).values(values).returning({ id: periods.id }); keep.push(c.id); }
  }
  // Gönderilmeyen dönemler: kayıt yoksa sil
  for (const e of existing) {
    if (keep.includes(e.id)) continue;
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(periodEnrollments).where(eq(periodEnrollments.periodId, e.id));
    // Kayıtlı öğrenci varsa yalnızca yönetici silebilir (dönem kayıtları da silinir; kurs kaydı kalır)
    if (n === 0 || force) await db.delete(periods).where(eq(periods.id, e.id));
  }
}

export async function duplicateCourse(courseId: number) {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) return null;
  // Başlık uzunluk sınırını aşmasın (aşarsa kopya kaydedilemezdi)
  const title = `${c.title.slice(0, COURSE_LIMITS.title - 8)} (Kopya)`;
  const slug = await uniqueSlug(title);
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = c;
  void _id; void _ca; void _ua;
  const [n] = await db.insert(courses).values({ ...rest, slug, title, status: "draft", closed: false, group: c.isFree ? "ucretsiz" : "esnek", featured: false, preorder: false, opensAt: null, preorderPrice: null, openNotifiedAt: null }).returning({ id: courses.id });
  const mods = await db.select().from(modules).where(eq(modules.courseId, courseId)).orderBy(modules.sortOrder);
  const ls = await db.select().from(lessons).where(eq(lessons.courseId, courseId)).orderBy(lessons.sortOrder);
  for (const m of mods) {
    const [nm] = await db.insert(modules).values({ courseId: n.id, title: m.title, sortOrder: m.sortOrder }).returning({ id: modules.id });
    for (const l of ls.filter((x) => x.moduleId === m.id)) {
      const { id: lid, ...lrest } = l;
      const [nl] = await db.insert(lessons).values({ ...lrest, courseId: n.id, moduleId: nm.id }).returning({ id: lessons.id });
      if (l.type === "quiz") {
        const [q] = await db.select().from(quizzes).where(eq(quizzes.lessonId, lid)).limit(1);
        if (q) {
          const { id: qid, ...qrest } = q;
          const [nq] = await db.insert(quizzes).values({ ...qrest, courseId: n.id, lessonId: nl.id }).returning({ id: quizzes.id });
          const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, qid));
          if (qs.length) await db.insert(quizQuestions).values(qs.map(({ id: _q, ...r }) => { void _q; return { ...r, quizId: nq.id }; }));
        }
      }
      if (l.type === "assign") {
        const [a] = await db.select().from(assignments).where(eq(assignments.lessonId, lid)).limit(1);
        if (a) { const { id: _a, ...arest } = a; void _a; await db.insert(assignments).values({ ...arest, courseId: n.id, lessonId: nl.id, periodId: null }); }
      }
    }
  }
  return n.id;
}

