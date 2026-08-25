import Link from "next/link";
import Image from "next/image";
import { requireTeacher } from "@/lib/auth/session";
import { teacherOverview } from "@/lib/data/teacher";
import { PageTitle, Chip, Empty } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { CourseActions } from "@/components/teacher/CourseActions";

export default async function MyCoursesPage() {
  const user = await requireTeacher();
  const ov = await teacherOverview(user);
  return (
    <>
      <PageTitle title="Eğitimlerim" action={<Link href="/egitmen/editor/yeni" className="btn-primary"><Icon name="plus" className="size-4" /> Yeni eğitim</Link>} />
      {ov.courses.length === 0 ? (
        <Empty text="Henüz eğitimin yok." action={<Link href="/egitmen/editor/yeni" className="btn-primary">İlk eğitimini oluştur</Link>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ov.courses.map((c) => (
            <div key={c.id} className="card p-0 overflow-hidden">
              <div className="relative h-36 bg-navy-50">
                {c.imageUrl && <Image src={c.imageUrl} alt="" width={480} height={280} className="h-full w-full object-cover" />}
                <span className="absolute left-3 top-3"><Chip color={c.closed ? "gray" : c.status === "published" ? "green" : "amber"}>{c.closed ? "Kapalı" : `${c.hasPeriods ? "Dönemli · " : ""}${c.status === "published" ? "Yayında" : "Taslak"}`}</Chip></span>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-navy-800">{c.title}</h3>
                <p className="mt-1 text-xs text-muted">{c.students} öğrenci · {c.lessonCount} ders · {c.hasPeriods ? "Takvimli" : "Esnek"}</p>
                <CourseActions courseId={c.id} slug={c.slug} closed={c.closed} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
