"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes, lessons } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export type NoteInput = { id?: number; courseId?: number | null; lessonId?: number | null; seconds?: number | null; text: string };

export async function saveNote(input: NoteInput) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Giriş gerekli." };
  const text = (input.text ?? "").trim();
  if (!text) return { ok: false as const, error: "Not boş olamaz." };
  if (text.length > 1000) return { ok: false as const, error: "Not en fazla 1000 karakter olabilir." };
  let lessonTitle = "";
  let courseId = input.courseId ?? null;
  if (input.lessonId) {
    const [l] = await db.select({ title: lessons.title, courseId: lessons.courseId }).from(lessons).where(eq(lessons.id, input.lessonId)).limit(1);
    if (l) { lessonTitle = l.title; courseId = l.courseId; }
  }
  const v = { userId: user.id, courseId, lessonId: input.lessonId ?? null, lessonTitle, seconds: input.seconds ?? null, text, updatedAt: new Date() };
  let id = input.id;
  if (!id && courseId) {
    // Bir eğitim için en fazla 100 not
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(notes).where(and(eq(notes.userId, user.id), eq(notes.courseId, courseId)));
    if (n >= 100) return { ok: false as const, error: "Bu eğitim için en fazla 100 not tutabilirsin. Yeni not için eskilerden birini sil." };
  }
  if (id) {
    await db.update(notes).set({ text, updatedAt: new Date() }).where(and(eq(notes.id, id), eq(notes.userId, user.id)));
  } else {
    const [c] = await db.insert(notes).values(v).returning({ id: notes.id });
    id = c.id;
  }
  revalidatePath("/panel/notlar");
  if (courseId) revalidatePath(`/kurs-izle/${courseId}`);
  return { ok: true as const, id };
}

export async function deleteNote(id: number) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };
  await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, user.id)));
  revalidatePath("/panel/notlar");
  return { ok: true as const };
}

export async function listCourseNotes(courseId: number) {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await db.select().from(notes).where(and(eq(notes.userId, user.id), eq(notes.courseId, courseId))).orderBy(desc(notes.createdAt));
  return rows.map((n) => ({ id: n.id, lessonId: n.lessonId, lessonTitle: n.lessonTitle, seconds: n.seconds, text: n.text, createdAt: n.createdAt.toISOString() }));
}
