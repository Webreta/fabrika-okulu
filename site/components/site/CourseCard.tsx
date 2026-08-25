import Link from "next/link";
import Image from "next/image";
import type { CourseWithMeta } from "@/lib/data/courses";
import { GROUP_LABELS, effectivePrice, hasActiveSale } from "@/lib/course-logic";
import { fmtMoney, excerpt } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

export function Price({ course }: { course: Pick<CourseWithMeta, "isFree" | "price" | "salePrice" | "saleTo"> }) {
  if (course.isFree) return <span className="font-bold text-emerald-600">ÜCRETSİZ</span>;
  const eff = effectivePrice(course);
  if (hasActiveSale(course)) {
    return (
      <span className="flex items-baseline gap-2">
        <span className="text-sm text-muted line-through">{fmtMoney(course.price)}</span>
        <span className="font-bold text-navy-800">{fmtMoney(eff)}</span>
      </span>
    );
  }
  return <span className="font-bold text-navy-800">{fmtMoney(eff)}</span>;
}

export function CourseCard({ course }: { course: CourseWithMeta }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/program/${course.slug}`} className="relative block overflow-hidden bg-navy-50">
        {course.imageUrl ? (
          <Image src={course.imageUrl} alt={course.title} width={640} height={440} className="cover transition group-hover:scale-[1.02]" />
        ) : (
          <div className="cover flex items-center justify-center text-navy-300"><Icon name="book" className="size-12" /></div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-navy-800 shadow">
          {GROUP_LABELS[course.group]}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-bold leading-snug text-navy-800">
          <Link href={`/program/${course.slug}`} className="hover:text-sky-600">{course.title}</Link>
        </h3>
        {course.instructor && <p className="mt-1 text-sm text-sky-600">{course.instructor.name}</p>}
        <p className="mt-2 flex-1 text-sm text-muted">{excerpt(course.shortDescription || course.description, 100)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Price course={course} />
          <Link href={`/program/${course.slug}`} className="btn-sky btn-sm">
            {course.closed ? "İncele" : course.isFree ? "Kayıt Ol" : "Sepete Ekle"}
          </Link>
        </div>
      </div>
    </article>
  );
}
