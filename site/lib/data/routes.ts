import "server-only";
import { cache } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { routes, routeSteps, courses, instructors } from "@/db/schema";
import { effectivePrice, hasActiveSale } from "@/lib/course-logic";

export type RouteStepView = {
  id: number;
  courseId: number;
  note: string;
  title: string;
  slug: string;
  imageUrl: string;
  shortDescription: string;
  group: string;
  isFree: boolean;
  price: number;
  listPrice: number;
  onSale: boolean;
  published: boolean;
  closed: boolean;
  instructor: string;
  durationText: string;
};

export type RouteView = {
  id: number;
  name: string;
  slug: string;
  description: string;
  goal: string;
  active: boolean;
  sortOrder: number;
  steps: RouteStepView[];
};

/** Tüm rotalar (admin: pasifler dahil) adımlarıyla; sitede yalnızca aktif olanlar filtrelenir */
export const listRoutes = cache(async (opts: { includeInactive?: boolean } = {}): Promise<RouteView[]> => {
  const rs = await db.select().from(routes).orderBy(asc(routes.sortOrder), asc(routes.name));
  const filtered = opts.includeInactive ? rs : rs.filter((r) => r.active);
  if (filtered.length === 0) return [];
  const steps = await db
    .select({ s: routeSteps, c: courses, instructorName: instructors.name })
    .from(routeSteps)
    .innerJoin(courses, eq(routeSteps.courseId, courses.id))
    .leftJoin(instructors, eq(courses.instructorId, instructors.id))
    .where(inArray(routeSteps.routeId, filtered.map((r) => r.id)))
    .orderBy(asc(routeSteps.sortOrder), asc(routeSteps.id));
  return filtered.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    goal: r.goal,
    active: r.active,
    sortOrder: r.sortOrder,
    steps: steps
      .filter((x) => x.s.routeId === r.id)
      .map((x) => ({
        id: x.s.id,
        courseId: x.c.id,
        note: x.s.note,
        title: x.c.title,
        slug: x.c.slug,
        imageUrl: x.c.imageUrl,
        shortDescription: x.c.shortDescription,
        group: x.c.group,
        isFree: x.c.isFree,
        price: effectivePrice(x.c),
        listPrice: Number(x.c.price) || 0,
        onSale: hasActiveSale(x.c),
        published: x.c.status === "published",
        closed: x.c.closed,
        instructor: x.instructorName ?? "",
        durationText: x.c.durationText,
      })),
  }));
});

/** Sitede gösterilecek rotalar: aktif ve yayındaki adımları olanlar (taslak/kapalı eğitim adımdan düşer) */
export async function publicRoutes(): Promise<RouteView[]> {
  const all = await listRoutes();
  return all.map((r) => ({ ...r, steps: r.steps.filter((s) => s.published && !s.closed) })).filter((r) => r.steps.length > 0);
}
