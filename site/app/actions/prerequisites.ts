"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { coursePrerequisites } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "@/app/actions/teacher";

export type PrereqInput = { courseId: number; requiredCourseId: number; condition: "enrolled" | "completed" };

/**
 * Satın alım koşulları ağacını baştan yazar: her kursun en fazla bir üst basamağı olur (ağaç/orman).
 * Kendine bağ ve döngü reddedilir.
 */
export async function savePrerequisites(input: PrereqInput[]): Promise<ActionResult> {
  await requireAdmin();
  const parent = new Map<number, number>();
  const links: PrereqInput[] = [];
  for (const l of input) {
    if (!l.courseId || !l.requiredCourseId) continue;
    if (l.courseId === l.requiredCourseId) return { ok: false, error: "Bir eğitim kendi ön koşulu olamaz." };
    if (parent.has(l.courseId)) return { ok: false, error: "Bir eğitimin yalnızca bir üst basamağı olabilir." };
    parent.set(l.courseId, l.requiredCourseId);
    links.push({ courseId: l.courseId, requiredCourseId: l.requiredCourseId, condition: l.condition === "completed" ? "completed" : "enrolled" });
  }
  // Döngü: üst basamakları takip ederken başa dönüyorsa
  for (const start of parent.keys()) {
    const seen = new Set<number>([start]);
    let cur = parent.get(start);
    while (cur !== undefined) {
      if (seen.has(cur)) return { ok: false, error: "Döngü oluştu: bir eğitim dolaylı olarak kendi ön koşulu olamaz." };
      seen.add(cur);
      cur = parent.get(cur);
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(coursePrerequisites);
    if (links.length) await tx.insert(coursePrerequisites).values(links);
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Koşullar kaydedildi." };
}
