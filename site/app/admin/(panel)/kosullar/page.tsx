import { asc } from "drizzle-orm";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { listPrerequisites } from "@/lib/prerequisites";
import { PageTitle } from "@/components/panel/ui";
import { PrerequisitesManager } from "@/components/admin/PrerequisitesManager";
import { requireAdmin } from "@/lib/auth/session";

export default async function PrerequisitesPage() {
  // Sayfa kendi yetkisini denetler: layout'taki yönlendirme, sayfa verisinin yanıt gövdesine yazılmasını engellemez
  await requireAdmin();
  const [links, list] = await Promise.all([
    listPrerequisites(),
    db.select({ id: courses.id, title: courses.title, imageUrl: courses.imageUrl, group: courses.group, status: courses.status }).from(courses).orderBy(asc(courses.title)),
  ]);
  return (
    <>
      <PageTitle title="Satın Alım Koşulları" />
      <PrerequisitesManager courses={list} initial={links.map((l) => ({ courseId: l.courseId, requiredCourseId: l.requiredCourseId, condition: l.condition }))} />
    </>
  );
}
