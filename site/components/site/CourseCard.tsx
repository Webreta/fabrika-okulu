import Link from "next/link";
import Image from "next/image";
import type { CourseWithMeta } from "@/lib/data/courses";
import { effectivePrice, hasActiveSale, isPreorder, GROUP_LABELS } from "@/lib/course-logic";
import { fmtMoney, fmtDay, excerpt, initials } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { FavoriteButton } from "@/components/site/FavoriteButton";
import { getCurrentUser } from "@/lib/auth/session";
import { myFavoriteIds } from "@/lib/favorites";
import { prerequisiteMap } from "@/lib/prerequisites";
import { surveyGateMap } from "@/lib/survey-gate";
import { SoonRibbon } from "@/components/site/SoonRibbon";

type PriceCourse = Pick<CourseWithMeta, "isFree" | "price" | "salePrice" | "saleTo"> & Partial<Pick<CourseWithMeta, "comingSoon" | "soonShowPrice" | "preorder" | "opensAt" | "preorderPrice">>;

/** Metin fiyat (program sayfası, yapışkan çubuk vb.) */
export function Price({ course, className = "" }: { course: PriceCourse; className?: string }) {
  // Yakında modunda fiyat isteğe bağlı gizlenir
  if (course.comingSoon && !course.soonShowPrice) return <span className={`font-bold text-amber-600 ${className}`}>Yakında</span>;
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

/** Kart görselinin köşesindeki cam efektli fiyat kapsülü */
function PricePill({ course, lg }: { course: PriceCourse; lg: boolean }) {
  const base = `inline-flex items-baseline gap-1.5 rounded-2xl px-3 py-1.5 shadow-lg ring-1 ring-white/40 backdrop-blur-md ${lg ? "lg:px-4 lg:py-2" : ""}`;
  if (course.comingSoon && !course.soonShowPrice) return <span className={`${base} bg-amber-400/95 text-sm font-extrabold text-navy-900`}>Yakında</span>;
  if (course.isFree) return <span className={`${base} bg-emerald-500/95 text-sm font-extrabold uppercase tracking-wide text-white`}>Ücretsiz</span>;
  const eff = effectivePrice(course);
  if (hasActiveSale(course)) {
    return (
      <span className={`${base} bg-white/95 text-navy-900`}>
        <span className="text-[11px] font-semibold text-muted line-through">{fmtMoney(course.price)}</span>
        <span className={`text-base font-extrabold ${lg ? "lg:text-xl" : ""}`}>{fmtMoney(eff)}</span>
      </span>
    );
  }
  return <span className={`${base} bg-white/95 text-base font-extrabold text-navy-900 ${lg ? "lg:text-xl" : ""}`}>{fmtMoney(eff)}</span>;
}

/**
 * Katalog kartı: görsel üstünde koyu gradyan + cam fiyat kapsülü + grup çipi, altta başlık, eğitmen avatarı,
 * modül ve canlı oturum sayısı (yalnızca bu ikisi; sıfır olan gösterilmez) ve ok düğmeli aksiyon. size="lg": geniş kartlar (2'li vitrin) için büyük yazı.
 */
export async function CourseCard({ course, size = "md" }: { course: CourseWithMeta; size?: "md" | "lg" }) {
  const lg = size === "lg";
  // Kalp: giriş yapan kullanıcının favorileri istek başına bir kez okunur (cache)
  const user = await getCurrentUser();
  const fav = user ? (await myFavoriteIds(user.id)).has(course.id) : false;
  const prereq = (await prerequisiteMap()).get(course.id) ?? null;
  const gate = (await surveyGateMap()).get(course.id)?.[0] ?? null;
  const href = `/program/${course.slug}`;
  const sale = hasActiveSale(course) && !course.comingSoon;
  const salePercent = sale ? Math.round((1 - effectivePrice(course) / Number(course.price)) * 100) : 0;
  // Erken kayıt: açılış tarihi gelecekte; satın alınır, içerik açılışta aktifleşir
  const early = isPreorder(course) && !course.comingSoon && !course.closed;
  const cta = course.comingSoon ? "Haber ver" : course.closed ? "İncele" : early ? "Erken kayıt ol" : course.isFree ? "Kayıt ol" : "Sepete ekle";
  const meta: { icon: "layers" | "video"; text: string }[] = [
    ...(course.moduleCount > 0 ? [{ icon: "layers" as const, text: `${course.moduleCount} modül` }] : []),
    ...(course.sessionCount > 0 ? [{ icon: "video" as const, text: `${course.sessionCount} canlı oturum` }] : []),
  ];

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_-18px_rgba(20,43,86,.35)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(20,43,86,.45)]">
      <FavoriteButton courseId={course.id} initial={fav} position={course.comingSoon ? "left" : "right"} />
      {/* Görsel */}
      <Link href={href} className="relative block overflow-hidden bg-navy-50">
        {course.imageUrl ? (
          <Image src={course.imageUrl} alt={course.title} width={640} height={360} className="cover transition duration-500 ease-out group-hover:scale-105" />
        ) : (
          <div className="cover flex items-center justify-center bg-gradient-to-br from-navy-100 to-sky-100 text-navy-300"><Icon name="book" className="size-12" /></div>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-navy-950/85 via-navy-950/30 to-transparent" />
        {(sale || early) && (
          <span className="absolute left-3 top-3 flex flex-col items-start gap-1">
            {early && <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-extrabold text-white shadow">Erken kayıt · {fmtDay(course.opensAt)}</span>}
            {sale && <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow">%{salePercent} indirim</span>}
          </span>
        )}
        {course.comingSoon && <SoonRibbon />}
        <span className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-2">
          <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">{GROUP_LABELS[course.group]}</span>
          <PricePill course={course} lg={lg} />
        </span>
      </Link>

      {/* Metin */}
      <div className={`flex flex-1 flex-col p-5 ${lg ? "lg:p-7" : ""}`}>
        <h3 className={`line-clamp-2 font-bold leading-snug text-navy-800 ${lg ? "text-lg lg:text-2xl" : "text-[17px]"}`}>
          <Link href={href} className="transition hover:text-sky-600">{course.title}</Link>
        </h3>
        {course.instructor && (
          <p className={`mt-2 flex items-center gap-2 text-sm text-navy-700 ${lg ? "lg:text-base" : ""}`}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-navy-700 to-sky-500 text-[10px] font-bold text-white">{initials(course.instructor.name)}</span>
            <span className="truncate">{course.instructor.name}</span>
          </p>
        )}
        <p className={`mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-navy-700 ${lg ? "lg:text-base" : ""}`}>{excerpt(course.shortDescription || course.description, lg ? 180 : 120)}</p>
        {prereq && <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-700" title={`Bu eğitim için önce "${prereq.requiredTitle}" ${prereq.condition === "completed" ? "tamamlanmalı" : "alınmalı"}`}><Icon name="lock" className="size-3" /> Ön koşul: {prereq.requiredTitle}</p>}
        {gate && <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700" title={`Bu eğitimi almadan önce "${gate.title}" hedef testi doldurulur`}><Icon name="survey" className="size-3" /> Önce hedef testi: {gate.title}</p>}

        {meta.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-navy-700">
            {meta.map((m) => <li key={m.text} className="flex items-center gap-1.5"><Icon name={m.icon} className="size-3.5 text-sky-500" /> {m.text}</li>)}
          </ul>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <Link href={href} className={`flex items-center justify-between font-semibold text-navy-800 transition group-hover:text-sky-600 ${lg ? "lg:text-lg" : "text-sm"}`}>
            {cta}
            <span className={`flex size-9 items-center justify-center rounded-full transition duration-300 group-hover:translate-x-1 ${course.comingSoon ? "bg-amber-400 text-navy-900" : "bg-navy-800 text-white group-hover:bg-sky-500"}`}><Icon name={course.comingSoon ? "bell" : "arrowRight"} className="size-4" /></span>
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * Yatay eğitim kartı: solda görsel (kırpılmadan, 16:9 küçük resim), sağda başlık + kısa açıklama + modül/canlı oturum + fiyat ve düğme.
 * Program sayfasındaki içerik panelinde "öne çıkan eğitim" için kullanılır (panelin madde stiliyle uyumlu, gölgesiz).
 */
export function PromoCourseCard({ course }: { course: CourseWithMeta }) {
  const href = `/program/${course.slug}`;
  const early = isPreorder(course) && !course.comingSoon;
  const meta = [
    course.type === "meeting" && course.meetingMinutes > 0 ? { icon: "clock" as const, text: `${course.meetingMinutes} dk birebir görüşme` } : null,
    course.moduleCount > 0 ? { icon: "layers" as const, text: `${course.moduleCount} modül` } : null,
    course.sessionCount > 0 ? { icon: "video" as const, text: `${course.sessionCount} canlı oturum` } : null,
  ].filter((m): m is { icon: "clock" | "layers" | "video"; text: string } => !!m);
  const cta = course.comingSoon ? "Haber ver" : early ? "Erken kayıt ol" : course.type === "meeting" ? "Görüşme saati seç" : "Eğitimi incele";
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-2xl bg-surface/70 ring-1 ring-line/70 transition hover:bg-white hover:ring-sky-200 hover:shadow-[0_14px_30px_-22px_rgba(20,43,86,.5)] sm:flex-row">
      <span className="relative m-3 block shrink-0 overflow-hidden rounded-xl bg-navy-50 sm:mr-0 sm:w-60 sm:self-center">
        {course.imageUrl ? (
          <Image src={course.imageUrl} alt={course.title} width={640} height={360} sizes="(min-width: 640px) 240px, 100vw" className="aspect-video w-full object-cover transition duration-500 ease-out group-hover:scale-105" />
        ) : (
          <span className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-navy-100 to-sky-100 text-navy-300"><Icon name="book" className="size-10" /></span>
        )}
        {course.comingSoon && <SoonRibbon />}
        {early && <span className="absolute left-3 top-3 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-extrabold text-white shadow">Erken kayıt · {fmtDay(course.opensAt)}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">{GROUP_LABELS[course.group]}</span>
        <span className="mt-1 line-clamp-2 text-base font-bold leading-snug text-navy-800 transition group-hover:text-sky-600">{course.title}</span>
        <span className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-navy-700">{excerpt(course.shortDescription || course.description, 150)}</span>
        {meta.length > 0 && (
          <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-navy-700">
            {meta.map((m) => <span key={m.text} className="flex items-center gap-1.5"><Icon name={m.icon} className="size-3.5 text-sky-500" /> {m.text}</span>)}
          </span>
        )}
        <span className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
          <span className="text-lg"><Price course={course} /></span>
          <span className="inline-flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-sky-500">{cta} <Icon name="arrowRight" className="size-4 transition group-hover:translate-x-0.5" /></span>
        </span>
      </span>
    </Link>
  );
}
