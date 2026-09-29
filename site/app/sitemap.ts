import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, pages } from "@/db/schema";
import { listCategories } from "@/lib/data/categories";
import { publicRoutes } from "@/lib/data/routes";

// Yalnızca ziyaretçinin açabildiği sayfalar: yayında ve kapalı olmayan eğitimler, kategoriler, aktif rotalar, yayınlanmış serbest sayfalar.
// Menüde olmayan eski grup sayfaları (esnek/takvimli/ücretsiz) listelenmez.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const [cs, ps, cats, routes] = await Promise.all([
    db.select({ slug: courses.slug, updatedAt: courses.updatedAt }).from(courses).where(and(eq(courses.status, "published"), eq(courses.closed, false))),
    db.select({ slug: pages.slug }).from(pages).where(eq(pages.published, true)),
    listCategories(),
    publicRoutes(),
  ]);
  const fixed = ["", "/kesfet", "/rotam", "/sss", "/hakkimizda", "/iletisim"];
  return [
    ...fixed.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.8 })),
    ...cats.map((k) => ({ url: `${base}/kategori/${k.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...routes.map((r) => ({ url: `${base}/rotam?rota=${encodeURIComponent(r.slug)}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...cs.map((c) => ({ url: `${base}/program/${c.slug}`, lastModified: c.updatedAt ?? undefined, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...ps.map((p) => ({ url: `${base}/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
