import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, surveyAnswers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getSurveySchema } from "@/lib/survey";
import { fmtDate } from "@/lib/format";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("yetkisiz", { status: 401 });
  const schema = await getSurveySchema();
  const url = new URL(request.url);
  const durum = url.searchParams.get("durum") ?? "";
  const list = await db.select().from(users).where(eq(users.role, "student")).orderBy(users.createdAt);
  const filtered = list.filter((u) => (durum === "done" ? u.surveyVersion >= schema.version : durum === "never" ? u.surveyVersion === 0 : true));
  const ans = filtered.length ? await db.select().from(surveyAnswers).where(and(eq(surveyAnswers.surveyKey, schema.key), inArray(surveyAnswers.userId, filtered.map((u) => u.id)))) : [];
  const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Ad Soyad", "E-posta", "Kayıt tarihi", "Anket durumu", ...schema.questions.map((q) => q.label)].map(esc).join(";");
  const rows = filtered.map((u) => {
    const mine = ans.filter((a) => a.userId === u.id);
    const cells = schema.questions.map((q) => {
      const v = mine.find((a) => a.questionKey === q.key)?.value;
      if (!v) return "";
      const arr = Array.isArray(v) ? v : [v];
      return arr.map((x) => q.options?.find((o) => o.value === x)?.label ?? x).join(", ");
    });
    return [`${u.firstName} ${u.lastName}`.trim(), u.email, fmtDate(u.createdAt), u.surveyVersion >= schema.version ? "Tamamladı" : u.surveyVersion > 0 ? "Güncelleme bekliyor" : "Doldurmadı", ...cells].map(esc).join(";");
  });
  const csv = "﻿" + [head, ...rows].join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="anket-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
