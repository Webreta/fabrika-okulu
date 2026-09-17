import Link from "next/link";
import Image from "next/image";
import { listCourses } from "@/lib/data/courses";
import { fmtMoney } from "@/lib/format";
import { hasActiveSale, effectivePrice } from "@/lib/course-logic";
import { GROUP_LABELS } from "@/lib/course-logic";
import { PageTitle, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { CourseActions } from "@/components/teacher/CourseActions";
import { waitlistCounts } from "@/lib/waitlist";

export default async function AdminCoursesPage() {
  const [list, demand] = await Promise.all([listCourses({ includeDrafts: true }), waitlistCounts()]);
  return (
    <>
      <PageTitle title="Kurslar" sub={`${list.length} eğitim`} action={<Link href="/admin/kurslar/editor/yeni" className="btn-primary"><Icon name="plus" className="size-4" /> Yeni eğitim</Link>} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Eğitim</th><th>Eğitmen</th><th>Grup</th><th>Öğrenci</th><th>Ders</th><th>Fiyat</th><th>Durum</th><th title="Açılınca / kontenjan açılınca haber ver diyenler">Talep</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted">Kurs yok.</td></tr>}
            {list.map((c) => (
              <tr key={c.id}>
                <td><div className="flex items-center gap-3"><div className="aspect-video w-20 shrink-0 overflow-hidden rounded bg-navy-50">{c.imageUrl && <Image src={c.imageUrl} alt="" width={160} height={90} className="h-full w-full object-cover" />}</div><span className="font-semibold text-navy-800"><Link href={`/admin/kurslar/detay/${c.id}`} className="hover:text-sky-600">{c.title}</Link>{c.featured && <span className="ml-1 text-amber-500" title="Öne çıkan">★</span>}</span></div></td>
                <td className="text-sm">{c.instructor?.name ?? "—"}</td>
                <td className="text-xs">{GROUP_LABELS[c.group]}</td>
                <td className="text-sm">{c.studentCount}</td>
                <td className="text-sm">{c.lessonCount}</td>
                <td className="text-sm">{c.isFree ? <Chip color="green">Ücretsiz</Chip> : hasActiveSale(c) ? <span className="flex flex-col"><span className="text-xs text-muted line-through">{fmtMoney(c.price)}</span><span className="font-semibold text-emerald-700">{fmtMoney(effectivePrice(c))}</span></span> : fmtMoney(c.price)}</td>
                <td><Chip color={c.closed ? "gray" : c.status !== "published" ? "amber" : c.comingSoon ? "amber" : "green"}>{c.closed ? "Kapalı" : c.status !== "published" ? "Taslak" : c.comingSoon ? "Yakında" : "Yayında"}</Chip></td>
                <td className="text-sm">{demand.get(c.id) ? <span className={`font-semibold ${c.comingSoon ? "text-amber-700" : "text-navy-800"}`}>{demand.get(c.id)} kişi</span> : <span className="text-muted">—</span>}</td>
                <td className="w-72"><CourseActions courseId={c.id} slug={c.slug} closed={c.closed} base="/admin/kurslar" showDetail={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
