import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, pages } from "@/db/schema";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const [cs, ps] = await Promise.all([
    db.select({ slug: courses.slug, updatedAt: courses.updatedAt }).from(courses).where(eq(courses.status, "published")),
    db.select({ slug: pages.slug }).from(pages).where(eq(pages.published, true)),
  ]);
  const fixed = ["", "/kesfet", "/esnek-programlar", "/takvimli-programlar", "/ucretsiz-kaynaklar", "/hakkimizda", "/iletisim"];
  return [
    ...fixed.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.8 })),
    ...cs.map((c) => ({ url: `${base}/program/${c.slug}`, lastModified: c.updatedAt ?? undefined, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...ps.map((p) => ({ url: `${base}/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
