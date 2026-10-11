import Link from "next/link";
import Image from "next/image";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, users, enrollments, modules, lessons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { PageTitle, Empty, Chip } from "@/components/panel/ui";
import { ArchiveActions } from "@/components/admin/ArchiveActions";
import { ArchiveItemActions } from "@/components/admin/ArchiveItemActions";
import { ARCHIVE_KINDS, listArchive, type ArchiveKind } from "@/lib/archive";

export const metadata = { title: "Arşiv" };

/**
 * Genel arşiv: panelde silinen kayıtlar (anket, kullanıcı, kupon, kategori, rota, sertifika…) kalıcı silinmeden önce burada
 * bekler; geri alınır ya da kalıcı silinir. Otomatik temizlik yok. Silinen eğitimler de aynı sayfada (altta) listelenir:
 * onlar ayrı tabloda değil, `courses.status = "archived"` ile tutulur.
 */
export default async function ArchivePage() {
  await requireAdmin();
  const items = await listArchive();
  const courseList = await db
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
      <PageTitle title="Arşiv" sub={`${items.length} kayıt · ${courseList.length} eğitim`} />
      <p className="mb-4 text-sm text-muted">Silinen kayıtlar önce buraya düşer; sitede ve listelerde görünmez. &quot;Geri al&quot; kaydı bağlı verileriyle (ör. anketin cevapları, rotanın adımları) eski hâline getirir. &quot;Kalıcı sil&quot; geri alınamaz.</p>

      <h2 className="mb-2 font-bold text-navy-800">Silinen kayıtlar</h2>
      {items.length === 0 ? (
        <Empty text="Arşivde kayıt yok." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Tür</th><th>Kayıt</th><th>İçerik</th><th>Silinme</th><th>Silen</th><th></th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td><Chip color="sky">{ARCHIVE_KINDS[it.kind as ArchiveKind] ?? it.kind}</Chip></td>
                  <td className="font-semibold text-navy-800">{it.label}</td>
                  <td className="text-sm text-muted">{it.rowCount} satır</td>
                  <td className="text-sm">{fmtDateTime(it.deletedAt)}</td>
                  <td className="text-sm">{it.deletedByName?.trim() || "—"}</td>
                  <td className="w-64"><ArchiveItemActions id={it.id} label={it.label} kind={ARCHIVE_KINDS[it.kind as ArchiveKind] ?? "Kayıt"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 id="egitimler" className="mb-2 mt-8 scroll-mt-24 font-bold text-navy-800">Silinen eğitimler</h2>
      <p className="mb-3 text-sm text-muted">Geri alınan eğitim taslak olarak Kurslar listesine döner.</p>
      {courseList.length === 0 ? (
        <Empty text="Arşivde eğitim yok." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Eğitim</th><th>İçerik</th><th>Silinme</th><th>Silen</th><th></th></tr></thead>
            <tbody>
              {courseList.map((c) => (
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
