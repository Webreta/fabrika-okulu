// Örnek online görüşme ürünleri (idempotent: slug varsa dokunmaz).
// 1) "Tanışma Görüşmesi" — ücretsiz, 15 dk, 60 koltuk (Sal-Cum akşam 10'ar, Cmt gün boyu 20)
// 2) "Birebir Kariyer Danışmanlığı (3 Hafta)" — 5000 ₺, 50 dk x 3 hafta, 14 koltuk (Cmt 5/12/19 Eyl + Çar 9/16/23 Eyl)
// ogrenci@test.com her ikisinde birer koltuğa kayıtlı olur; diğer koltuklar boş kalır.
// Çalıştır: npx tsx scripts/seed-gorusme.mts  (prod: start.sh her açılışta çağırır)
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { courses, periods, periodEnrollments, enrollments, orders, users, surveys } from "../db/schema";
import { generateSlots } from "../lib/meeting";

const ZOOM = "https://zoom.us/j/0000000000?pwd=fabrikaokulu";
const DEFAULT_COVER = "/img/site/kurs-mulakat.png"; // "Kariyer Yolunda – Mülakat Teknikleri" kapağı; kapağı olmayan her eğitime uygulanır

async function ensureCourse(input: {
  slug: string; title: string; short: string; description: string; isFree: boolean; price: number; minutes: number;
  slots: ReturnType<typeof generateSlots>; enrollStudentInSlotName: string;
}) {
  const [exists] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, input.slug)).limit(1);
  if (exists) { console.log(`Var, atlandı: ${input.slug} (#${exists.id})`); return; }
  const [c] = await db.insert(courses).values({
    slug: input.slug, title: input.title, shortDescription: input.short, description: input.description, status: "published", imageUrl: DEFAULT_COVER,
    isFree: input.isFree, price: input.isFree ? "0" : input.price.toFixed(2), group: "takvimli", type: "meeting",
    meetingMinutes: input.minutes, meetingLink: ZOOM, durationText: input.slots[0]?.schedule.length > 1 ? `${input.slots[0].schedule.length} hafta · her görüşme ${input.minutes} dk` : `${input.minutes} dk`,
    outcomes: input.isFree ? ["Kariyer hedefini birlikte netleştiririz", "Sana uygun programı öneririz"] : ["Haftalık birebir görüşmeyle kişisel gelişim planı", "Hedefe yönelik somut aksiyonlar", "Üç hafta boyunca takip"],
    level: "all", lifetime: false, hasCertificate: false,
  }).returning({ id: courses.id });
  const inserted = await db.insert(periods).values(input.slots.map((s) => ({ courseId: c.id, name: s.name, startDate: s.startDate, startTime: s.startTime, endDate: s.endDate, capacity: s.capacity, description: s.description, schedule: s.schedule }))).returning({ id: periods.id, name: periods.name });
  console.log(`Oluşturuldu: ${input.title} (#${c.id}) · ${inserted.length} koltuk`);

  const [student] = await db.select().from(users).where(eq(users.email, "ogrenci@test.com")).limit(1);
  if (!student) { console.log("ogrenci@test.com yok; koltuk ataması atlandı."); return; }
  const slot = inserted.find((p) => p.name === input.enrollStudentInSlotName) ?? inserted[0];
  const [o] = await db.insert(orders).values({
    userId: student.id, status: "paid", provider: input.isFree ? "free" : "manual",
    items: [{ courseId: c.id, title: input.title, price: input.isFree ? 0 : input.price, periodId: slot.id, periodName: slot.name }],
    subtotal: input.isFree ? "0" : input.price.toFixed(2), discount: "0", total: input.isFree ? "0" : input.price.toFixed(2), paidAt: new Date(),
    billing: { name: `${student.firstName} ${student.lastName}`.trim(), email: student.email },
  }).returning({ id: orders.id });
  const [e] = await db.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.userId, student.id), eq(enrollments.courseId, c.id))).limit(1);
  if (!e) await db.insert(enrollments).values({ userId: student.id, courseId: c.id, orderId: o.id, status: "active" });
  await db.insert(periodEnrollments).values({ periodId: slot.id, userId: student.id, orderId: o.id });
  console.log(`  ogrenci@test.com → ${slot.name}`);
}

// 1) Tanışma görüşmesi: 8-11 Eyl 2026 (Sal-Cum) 18:00-20:30 → 10'ar koltuk; 12 Eyl Cmt 10:00-15:00 → 20 koltuk
const tanisma = [
  ...generateSlots({ dates: ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"], startTime: "18:00", endTime: "20:30", minutes: 15, gap: 0, weeks: 1, capacity: 1, link: ZOOM }),
  ...generateSlots({ dates: ["2026-09-12"], startTime: "10:00", endTime: "15:00", minutes: 15, gap: 0, weeks: 1, capacity: 1, link: ZOOM }),
];
await ensureCourse({
  slug: "tanisma-gorusmesi", title: "Ücretsiz Tanışma Görüşmesi", short: "Fabrika Okulu ekibinden tecrübeli bir yöneticiyle 15 dakikalık birebir online görüşme.",
  description: "<p>Kariyer hedefini ve mevcut durumunu 15 dakikalık birebir bir Zoom görüşmesinde birlikte değerlendiririz. Görüşme ücretsizdir, kontenjan sınırlıdır; sana uygun saati seçmen yeterli.</p>",
  isFree: true, price: 0, minutes: 15, slots: tanisma, enrollStudentInSlotName: tanisma[0].name,
});

// 2) 3 haftalık danışmanlık: Cmt 5/12/19 Eyl ve Çar 9/16/23 Eyl, 11:00-17:50 arası 50 dk + 10 dk ara → 7'şer koltuk
const danismanlik = [
  ...generateSlots({ dates: ["2026-09-05"], startTime: "11:00", endTime: "18:00", minutes: 50, gap: 10, weeks: 3, capacity: 1, link: ZOOM }),
  ...generateSlots({ dates: ["2026-09-09"], startTime: "11:00", endTime: "18:00", minutes: 50, gap: 10, weeks: 3, capacity: 1, link: ZOOM }),
];
await ensureCourse({
  slug: "birebir-kariyer-danismanligi-3-hafta", title: "Birebir Kariyer Danışmanlığı (3 Hafta)", short: "Üç hafta boyunca haftada bir, 50 dakikalık birebir online danışmanlık görüşmesi.",
  description: "<p>Aynı gün ve saatte üç hafta üst üste 50 dakikalık birebir Zoom görüşmesi. Kariyer hedefin için kişisel gelişim planı çıkarır, her hafta ilerlemeni birlikte değerlendiririz.</p>",
  isFree: false, price: 5000, minutes: 50, slots: danismanlik, enrollStudentInSlotName: danismanlik[0].name,
});

// Hedef testinin son sorusu (4a) iki görüşme ürününe yönlendirsin (bağlantı yoksa ekle; idempotent)
const [survey] = await db.select().from(surveys).where(eq(surveys.key, "guncel_kariyer_hedefim")).limit(1);
if (survey) {
  const LINKS = [
    { label: "Ücretsiz Tanışma Görüşmesi", url: "/program/tanisma-gorusmesi", style: "button" as const },
    { label: "Birebir Kariyer Danışmanlığı (3 Hafta)", url: "/program/birebir-kariyer-danismanligi-3-hafta", style: "button" as const },
  ];
  const qs = survey.questions.map((q) => (q.key === "4a" && !(q.links?.length) ? { ...q, links: LINKS } : q));
  if (JSON.stringify(qs) !== JSON.stringify(survey.questions)) { await db.update(surveys).set({ questions: qs }).where(eq(surveys.id, survey.id)); console.log("Hedef testi 4a sorusuna görüşme bağlantıları eklendi"); }
}

// Kapağı olmayan tüm eğitimlere varsayılan kapak (her açılışta güvenle çalışır)
const fixed = await db.update(courses).set({ imageUrl: DEFAULT_COVER }).where(eq(courses.imageUrl, "")).returning({ id: courses.id });
if (fixed.length) console.log(`Kapak eklendi: ${fixed.length} eğitim`);

console.log(`Toplam koltuk: tanışma ${tanisma.length}, danışmanlık ${danismanlik.length}`);
process.exit(0);
