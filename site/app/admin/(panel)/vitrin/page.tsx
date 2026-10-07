import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { notArchived } from "@/lib/data/course-filters";
import { courses } from "@/db/schema";
import { getRawSetting } from "@/lib/settings";
import { DEFAULT_SHOWCASE, type ShowcaseContent } from "@/lib/content-defaults";
import { PageTitle } from "@/components/panel/ui";
import { ShowcaseManager } from "@/components/admin/ShowcaseManager";
import { requireAdmin } from "@/lib/auth/session";

export default async function ShowcasePage() {
  // Sayfa kendi yetkisini denetler: layout'taki yönlendirme, sayfa verisinin yanıt gövdesine yazılmasını engellemez
  await requireAdmin();
  const [showcase, list] = await Promise.all([
    getRawSetting<ShowcaseContent>("showcase", DEFAULT_SHOWCASE),
    db.select({ id: courses.id, title: courses.title, imageUrl: courses.imageUrl, group: courses.group, status: courses.status, closed: courses.closed, featured: courses.featured, comingSoon: courses.comingSoon }).from(courses).where(notArchived).orderBy(desc(courses.featured), asc(courses.sortOrder), asc(courses.title)),
  ]);
  return (
    <>
      <PageTitle title="Vitrin" sub="Anasayfadaki vitrin bölümü: hangi eğitimler, hangi sırada ve kaçlı dizilimle görünsün. Kartları sürükleyerek sırala." />
      <ShowcaseManager initial={{ ...DEFAULT_SHOWCASE, ...showcase }} courses={list} />
    </>
  );
}
