import { asc } from "drizzle-orm";
import { db } from "@/db";
import { notArchived } from "@/lib/data/course-filters";
import { courses } from "@/db/schema";
import { PageTitle } from "@/components/panel/ui";
import { RoutesManager } from "@/components/admin/RoutesManager";
import { listRoutes } from "@/lib/data/routes";
import { effectivePrice } from "@/lib/course-logic";
import { requireAdmin } from "@/lib/auth/session";

export default async function RoutesPage() {
  // Sayfa kendi yetkisini denetler: layout'taki yönlendirme, sayfa verisinin yanıt gövdesine yazılmasını engellemez
  await requireAdmin();
  const [rs, list] = await Promise.all([
    listRoutes({ includeInactive: true }),
    db.select().from(courses).where(notArchived).orderBy(asc(courses.title)),
  ]);
  return (
    <>
      <PageTitle title="Rotalar" sub="Sitedeki “Rotam” sayfası: zirveye giden dağ yolu üzerinde sıralı eğitimler. Her adıma üzerine gelince görünecek bir not yaz; rotaya ad, açıklama ve zirve hedefi ver." />
      <RoutesManager
        initial={rs.map((r) => ({ id: r.id, name: r.name, slug: r.slug, description: r.description, goal: r.goal, active: r.active, steps: r.steps.map((s) => ({ courseId: s.courseId, note: s.note })) }))}
        courses={list.map((c) => ({ id: c.id, title: c.title, imageUrl: c.imageUrl, group: c.group, status: c.status, shortDescription: c.shortDescription, price: effectivePrice(c), isFree: c.isFree, comingSoon: c.comingSoon }))}
      />
    </>
  );
}
