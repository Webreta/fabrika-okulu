import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, users, courses } from "@/db/schema";

export async function listDocuments() {
  const rows = await db
    .select({ d: documents, u: users })
    .from(documents)
    .innerJoin(users, eq(documents.userId, users.id))
    .orderBy(desc(documents.createdAt))
    .limit(300);
  return rows.map(({ d, u }) => ({
    id: d.id, user: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email, fileUrl: d.fileUrl, fileName: d.fileName,
    note: d.note, status: d.status, couponCode: d.couponCode, createdAt: d.createdAt.toISOString(),
  }));
}

export async function courseOptions() {
  return db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.status, "published")).orderBy(courses.title);
}
