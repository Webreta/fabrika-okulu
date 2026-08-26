import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, surveyAnswers, surveyCompletions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getSurveyById, listSurveys } from "@/lib/survey";
import { fmtDate } from "@/lib/format";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("yetkisiz", { status: 401 });
  const url = new URL(request.url);
  const survey = (Number(url.searchParams.get("anket")) ? await getSurveyById(Number(url.searchParams.get("anket"))) : null) ?? (await listSurveys())[0];
  if (!survey) return new NextResponse("anket yok", { status: 404 });
  const durum = url.searchParams.get("durum") ?? "";
  const [list, done] = await Promise.all([
    db.select().from(users).where(eq(users.role, "student")).orderBy(users.createdAt),
    db.select({ userId: surveyCompletions.userId }).from(surveyCompletions).where(eq(surveyCompletions.surveyKey, survey.key)).then((r) => new Set(r.map((x) => x.userId))),
  ]);
  const filtered = list.filter((u) => (durum === "done" ? done.has(u.id) : durum === "never" ? !done.has(u.id) : true));
  const ans = filtered.length ? await db.select().from(surveyAnswers).where(and(eq(surveyAnswers.surveyKey, survey.key), inArray(surveyAnswers.userId, filtered.map((u) => u.id)))) : [];
  const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Ad Soyad", "E-posta", "Kayıt tarihi", "Anket durumu", ...survey.questions.map((q) => q.label)].map(esc).join(";");
  const rows = filtered.map((u) => {
    const mine = ans.filter((a) => a.userId === u.id);
    const cells = survey.questions.map((q) => {
      const v = mine.find((a) => a.questionKey === q.key)?.value;
      if (!v) return "";
      const arr = Array.isArray(v) ? v : [v];
      return arr.map((x) => q.options?.find((o) => o.value === x)?.label ?? x).join(", ");
    });
    return [`${u.firstName} ${u.lastName}`.trim(), u.email, fmtDate(u.createdAt), done.has(u.id) ? "Tamamladı" : "Doldurmadı", ...cells].map(esc).join(";");
  });
  const csv = "﻿" + [head, ...rows].join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="anket-${survey.key}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
