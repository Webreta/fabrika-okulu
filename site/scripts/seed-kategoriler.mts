// Başlangıç kategorileri (idempotent: kategori tablosu boş değilse dokunmaz).
// Eski üst menüdeki üç grup kategori olarak açılır ve mevcut eğitimler grubuna göre dağıtılır;
// admin sonra /admin/kategoriler'den istediği gibi değiştirir.
// Çalıştır: npx tsx --conditions=react-server scripts/seed-kategoriler.mts  (prod: start.sh her açılışta çağırır)
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { categories, courseCategories, courses } from "../db/schema";

const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(categories);
if (n > 0) { console.log(`Kategoriler var (${n}), atlandı.`); process.exit(0); }

const DEFAULTS: { name: string; slug: string; description: string; group: string }[] = [
  { name: "Esnek Programlar", slug: "esnek-programlar", description: "Kendine uygun saatlerde online içeriğe ulaş, çalışmaları tamamla, mentor eğitmenine sorularını sor.", group: "esnek" },
  { name: "Takvimli Programlar", slug: "takvimli-programlar", description: "Haftalık plana uyarak online içeriğe ulaş, mentor eğitmenle planlı oturumlara katıl.", group: "takvimli" },
  { name: "Ücretsiz Kaynaklar", slug: "ucretsiz-kaynaklar", description: "Ücretsiz kaynaklarla gelişimine hemen başla.", group: "ucretsiz" },
];
const all = await db.select({ id: courses.id, group: courses.group }).from(courses);
for (let i = 0; i < DEFAULTS.length; i++) {
  const d = DEFAULTS[i];
  const [k] = await db.insert(categories).values({ name: d.name, slug: d.slug, description: d.description, sortOrder: i }).returning({ id: categories.id });
  const ids = all.filter((c) => c.group === d.group).map((c) => c.id);
  if (ids.length) await db.insert(courseCategories).values(ids.map((courseId) => ({ courseId, categoryId: k.id })));
  console.log(`${d.name}: ${ids.length} eğitim`);
}
process.exit(0);
