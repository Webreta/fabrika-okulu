import Link from "next/link";
import Image from "next/image";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, users, enrollments, modules, lessons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { PageTitle, Empty } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { ArchiveActions } from "@/components/admin/ArchiveActions";

export const metadata = { title: "Arşiv" };

// Silinen eğitimler burada bekler: geri alınır (taslağa döner) ya da kalıcı silinir. Otomatik temizlik yok.
export default async function CourseArchivePage() {
  await requireAdmin();
  const list = await db
    .select({
      id: courses.id,
      title: courses.title,
      imageUrl: courses.imageUrl,
      deletedAt: courses.deletedAt,
      deletedByName: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}`,
      moduleCount: sql<number>`(select count(*) from ${modules} m where m.course_id = "courses"."id")`.mapWith(Number),
      lessonCount: sql<number>`(select count(*) from ${lessons} l where l.course_id = "courses"."id")`.mapWith(Number),
      studentCount: sql<number>`(select count(*) from ${enrollments} e where e.course_id = "courses"."id")`.mapWith(Number),
    })
    .from(courses)
    .leftJoin(users, eq(courses.deletedBy, users.id))
    .where(eq(courses.status, "archived"))
    .orderBy(desc(courses.deletedAt));
  return (
    <>
      <PageTitle title="Arşiv" sub={`${list.length} silinmiş eğitim`} action={<Link href="/admin/kurslar" className="btn-secondary"><Icon name="arrowLeft" className="size-4" /> Kurslar</Link>} />
      <p className="mb-4 text-sm text-muted">Silinen eğitimler burada bekler; sitede, katalogda ve listelerde görünmez. Geri alınan eğitim taslak olarak döner. Kalıcı silme geri alınamaz.</p>
      {list.length === 0 ? (
        <Empty text="Arşiv boş." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Eğitim</th><th>İçerik</th><th>Silinme</th><th>Silen</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><div className="flex items-center gap-3"><div className="aspect-video w-20 shrink-0 overflow-hidden rounded bg-navy-50">{c.imageUrl && <Image src={c.imageUrl} alt="" width={160} height={90} className="h-full w-full object-cover" />}</div><span className="font-semibold text-navy-800"><Link href={`/admin/kurslar/detay/${c.id}`} className="hover:text-sky-600">{c.title}</Link></span></div></td>
                  <td className="text-sm text-muted">{c.moduleCount} modül · {c.lessonCount} ders{c.studentCount > 0 && <> · {c.studentCount} kayıt</>}</td>
                  <td className="text-sm">{fmtDateTime(c.deletedAt)}</td>
                  <td className="text-sm">{c.deletedByName?.trim() || "—"}</td>
                  <td className="w-64"><ArchiveActions courseId={c.id} title={c.title} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
