// İki örnek rota (idempotent: slug varsa dokunmaz). Adımlar mevcut örnek eğitimlerden; bulunamayan eğitim atlanır.
// Çalıştır: npx tsx scripts/seed-rotalar.mts  (prod: start.sh her açılışta çağırır)
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { routes, routeSteps, courses } from "../db/schema";

type Def = { slug: string; name: string; goal: string; description: string; steps: { title: string; note: string }[] };

const DEFS: Def[] = [
  {
    slug: "ise-alim-surecinde-one-cikma-rotasi",
    name: "İşe Alım Sürecinde Öne Çıkma Rotası",
    goal: "Hayalindeki İş",
    description: "Özgeçmişten mülakata, sunumdan birebir danışmanlığa: işe alım sürecinin her aşamasında seni öne çıkaran adımlar. Sırayla ilerle; her adım bir sonrakine zemin hazırlar.",
    steps: [
      { title: "Ücretsiz Tanışma Görüşmesi", note: "Başlangıç noktan. 15 dakikada hedefini netleştirir, sana uygun adımları birlikte belirleriz. Ücretsiz." },
      { title: "Başvurunuzu Mülakata Taşıyan Özgeçmiş", note: "Kapıyı açan belge. İK'nın 8 saniyede elediği özgeçmişi, mülakata çağırtan özgeçmişe dönüştürürsün." },
      { title: "Kariyer Yolunda – Ayrıntılı Mülakat Teknikleri ve STAR Yöntemi", note: "Mülakatta hikâyeni STAR yöntemiyle kurmayı öğrenirsin. Ücretsiz kaynak; özgeçmişin hazır olunca hemen geç." },
      { title: "Etkili İletişim ve Sunum Teknikleri", note: "Mülakatta ve ilk 90 günde derdini net anlatmak için. Vaka sunumu isteyen süreçlerde fark yaratır." },
      { title: "Birebir Kariyer Danışmanlığı (3 Hafta)", note: "Zirveye son adım: üç hafta boyunca gerçek başvurularını, tekliflerini ve pazarlığını birebir çalışırız." },
    ],
  },
  {
    slug: "sahada-lider-rotasi",
    name: "Sahada Lider Rotası",
    goal: "Vardiya Amiri",
    description: "Üretim sahasında operatörlükten takım liderliğine ve vardiya amirliğine giden yol. Önce iletişim, sonra zor durumlar, sonra sahne ve son olarak yalın üretimle ekibini verimli yönetmek.",
    steps: [
      { title: "Etkili İletişim ve Sunum Teknikleri", note: "Liderliğin temeli: talimatı net vermek, geri bildirimi doğru almak. Buradan başla." },
      { title: "Zor İnsanlarla İletişim", note: "Sahada çatışma kaçınılmaz. İtiraz eden, sessiz kalan ya da gerilim çıkaran çalışma arkadaşlarıyla soğukkanlı iletişim." },
      { title: "İleri Sunum: Sahne Hakimiyeti", note: "Vardiya toplantısı, üst yönetime rapor, ekibe hedef sunumu. Kalabalık önünde güven veren duruş." },
      { title: "Yalın Üretim ve Kaizen Uygulamaları", note: "Zirveye çıkaran adım: 5S ve kaizen ile israfı azaltıp ekibinin verimliliğini ölçülebilir biçimde artırırsın. Takvimli program." },
    ],
  },
];

const all = await db.select({ id: courses.id, title: courses.title }).from(courses);
const byTitle = new Map(all.map((c) => [c.title, c.id]));
const existing = await db.select({ slug: routes.slug }).from(routes).where(inArray(routes.slug, DEFS.map((d) => d.slug)));
const have = new Set(existing.map((e) => e.slug));

let order = (await db.select({ s: routes.sortOrder }).from(routes)).reduce((m, r) => Math.max(m, r.s), -1) + 1;
for (const d of DEFS) {
  if (have.has(d.slug)) { console.log(`Var, atlandı: ${d.name}`); continue; }
  const steps = d.steps.map((s) => ({ courseId: byTitle.get(s.title), note: s.note })).filter((s): s is { courseId: number; note: string } => !!s.courseId);
  if (steps.length === 0) { console.log(`Eğitim bulunamadı, atlandı: ${d.name}`); continue; }
  const [r] = await db.insert(routes).values({ name: d.name, slug: d.slug, description: d.description, goal: d.goal, active: true, sortOrder: order++ }).returning({ id: routes.id });
  await db.insert(routeSteps).values(steps.map((s, i) => ({ routeId: r.id, courseId: s.courseId, note: s.note, sortOrder: i })));
  console.log(`Oluşturuldu: ${d.name} · ${steps.length}/${d.steps.length} adım`);
}
process.exit(0);
