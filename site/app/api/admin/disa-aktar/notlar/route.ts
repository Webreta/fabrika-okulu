import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes, courses, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { xlsxBuffer, xlsxHeaders, type Cell } from "@/lib/xlsx";

function fmtSecs(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("yetkisiz", { status: 401 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("s") ?? "").trim();
  const courseId = Number(url.searchParams.get("course")) || undefined;

  const rows = await db
    .select({ n: notes, courseTitle: courses.title, u: users })
    .from(notes)
    .innerJoin(users, eq(notes.userId, users.id))
    .leftJoin(courses, eq(notes.courseId, courses.id))
    .where(
      and(
        courseId ? eq(notes.courseId, courseId) : undefined,
        q
          ? sql`(${users.email} ilike ${"%" + q + "%"} or ${users.firstName} ilike ${"%" + q + "%"} or ${users.lastName} ilike ${"%" + q + "%"} or ${notes.text} ilike ${"%" + q + "%"})`
          : undefined,
      ),
    )
    .orderBy(desc(notes.createdAt))
    .limit(5000);

  const data: Cell[][] = rows.map(({ n, courseTitle, u }) => [
    `${u.firstName} ${u.lastName}`.trim(),
    u.email,
    courseTitle ?? "Genel not",
    n.lessonTitle ?? "",
    n.seconds != null ? fmtSecs(n.seconds) : "",
    n.text,
    fmtDateTime(n.createdAt),
  ]);

  const buf = xlsxBuffer([
    {
      name: "Öğrenci Notları",
      headers: ["Öğrenci", "E-posta", "Kurs", "Ders", "Video zamanı", "Not", "Tarih"],
      rows: data,
    },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`ogrenci-notlari-${today}.xlsx`) });
}
