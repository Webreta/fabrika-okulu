import Link from "next/link";
import Image from "next/image";
import type { CourseWithMeta } from "@/lib/data/courses";
import { GROUP_LABELS, effectivePrice, hasActiveSale } from "@/lib/course-logic";
import { fmtMoney, excerpt } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { FavoriteButton } from "@/components/site/FavoriteButton";
import { getCurrentUser } from "@/lib/auth/session";
import { myFavoriteIds } from "@/lib/favorites";
import { prerequisiteMap } from "@/lib/prerequisites";

export function Price({ course, className = "" }: { course: Pick<CourseWithMeta, "isFree" | "price" | "salePrice" | "saleTo">; className?: string }) {
  if (course.isFree) return <span className={`font-bold text-emerald-600 ${className}`}>ÜCRETSİZ</span>;
  const eff = effectivePrice(course);
  if (hasActiveSale(course)) {
    return (
      <span className="flex items-baseline gap-2">
        <span className="text-sm text-muted line-through">{fmtMoney(course.price)}</span>
        <span className={`font-bold text-navy-800 ${className}`}>{fmtMoney(eff)}</span>
      </span>
    );
  }
  return <span className={`font-bold text-navy-800 ${className}`}>{fmtMoney(eff)}</span>;
}

/** size="lg": geniş kartlar (2'li vitrin) için masaüstünde büyük yazı ve düğme */
export async function CourseCard({ course, size = "md" }: { course: CourseWithMeta; size?: "md" | "lg" }) {
  const lg = size === "lg";
  // Kalp: giriş yapan kullanıcının favorileri istek başına bir kez okunur (cache)
  const user = await getCurrentUser();
  const fav = user ? (await myFavoriteIds(user.id)).has(course.id) : false;
  const prereq = (await prerequisiteMap()).get(course.id) ?? null;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <FavoriteButton courseId={course.id} initial={fav} />
      <Link href={`/program/${course.slug}`} className="relative block overflow-hidden bg-navy-50">
        {course.imageUrl ? (
          <Image src={course.imageUrl} alt={course.title} width={640} height={440} className="cover transition group-hover:scale-[1.02]" />
        ) : (
          <div className="cover flex items-center justify-center text-navy-300"><Icon name="book" className="size-12" /></div>
        )}
        <span className="absolute left-3 top-3 flex gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-navy-800 shadow">{GROUP_LABELS[course.group]}</span>
          {hasActiveSale(course) && <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow">İndirim</span>}
        </span>
      </Link>
      <div className={`flex flex-1 flex-col p-4 ${lg ? "lg:p-6" : ""}`}>
        <h3 className={`font-bold leading-snug text-navy-800 ${lg ? "lg:text-2xl" : ""}`}>
          <Link href={`/program/${course.slug}`} className="hover:text-sky-600">{course.title}</Link>
        </h3>
        {course.instructor && <p className={`mt-1 text-sm text-sky-600 ${lg ? "lg:text-base" : ""}`}>{course.instructor.name}</p>}
        {prereq && <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700" title={`Bu eğitim için önce "${prereq.requiredTitle}" ${prereq.condition === "completed" ? "tamamlanmalı" : "alınmalı"}`}><Icon name="lock" className="size-3" /> Ön koşul: {prereq.requiredTitle}</p>}
        <p className={`mt-2 flex-1 text-sm text-muted ${lg ? "lg:text-base lg:leading-relaxed" : ""}`}>{excerpt(course.shortDescription || course.description, lg ? 180 : 100)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Price course={course} className={lg ? "lg:text-xl" : ""} />
          <Link href={`/program/${course.slug}`} className={lg ? "btn-sky lg:px-6 lg:py-3 lg:text-base" : "btn-sky btn-sm"}>
            {course.closed ? "İncele" : course.isFree ? "Kayıt Ol" : "Sepete Ekle"}
          </Link>
        </div>
      </div>
    </article>
  );
}
