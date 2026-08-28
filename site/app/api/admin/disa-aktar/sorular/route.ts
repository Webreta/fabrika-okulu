import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { teacherThreads } from "@/lib/data/teacher";
import { fmtDateTime } from "@/lib/format";
import { xlsxBuffer, xlsxHeaders, type Cell } from "@/lib/xlsx";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("yetkisiz", { status: 401 });

  const url = new URL(request.url);
  const durum = url.searchParams.get("durum") ?? "";

  const all = await teacherThreads(user);
  const threads =
    durum === "pending" ? all.filter((t) => t.pending > 0) : durum === "answered" ? all.filter((t) => t.pending === 0) : all;

  // Her mesaj bir satır; sohbetler kronolojik.
  const rows: Cell[][] = [];
  for (const t of threads) {
    for (const m of t.messages) {
      rows.push([
        t.name,
        t.email,
        t.courseTitle,
        m.who === "teacher" ? "Eğitmen" : "Öğrenci",
        m.lesson || "",
        m.text,
        fmtDateTime(m.at),
      ]);
    }
  }

  const buf = xlsxBuffer([
    {
      name: "Öğrenci Soruları",
      headers: ["Öğrenci", "E-posta", "Kurs", "Gönderen", "Ders", "Mesaj", "Tarih"],
      rows,
    },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`ogrenci-sorulari-${today}.xlsx`) });
}
