import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { teacherSubmissions, teacherQuizAttempts } from "@/lib/data/teacher";
import { fmtDateTime } from "@/lib/format";
import { xlsxBuffer, xlsxHeaders, type Cell, type Sheet } from "@/lib/xlsx";

const SUB_STATUS: Record<string, string> = { pending: "Değerlendirilmedi", graded: "Değerlendirildi" };
const ATTEMPT_STATUS: Record<string, string> = {
  in_progress: "Devam ediyor",
  completed: "Tamamlandı",
  pending_review: "Değerlendirme bekliyor",
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("yetkisiz", { status: 401 });

  const url = new URL(request.url);
  const courseId = Number(url.searchParams.get("course")) || undefined;
  // tur: "gorev" → yalnız görevler, "sinav" → yalnız sınavlar, boş → ikisi birden
  const tur = url.searchParams.get("tur");
  const wantGorev = tur !== "sinav";
  const wantSinav = tur !== "gorev";

  const [subs, attempts] = await Promise.all([
    wantGorev ? teacherSubmissions(user, courseId, 5000) : Promise.resolve([]),
    wantSinav ? teacherQuizAttempts(user, courseId, 5000) : Promise.resolve([]),
  ]);

  // Ses dökümlerini tek metne birleştir (ekli dosyalar dahil edilmez).
  const transcriptText = (t: Record<string, string> | null | undefined) =>
    t ? Object.values(t).filter(Boolean).join("\n") : "";

  const subRows: Cell[][] = subs.map((r) => [
    `${r.u.firstName} ${r.u.lastName}`.trim(),
    r.u.email,
    r.courseTitle,
    r.a.title,
    SUB_STATUS[r.s.status] ?? r.s.status,
    r.a.isGraded ? (r.s.score ?? "") : "Puansız",
    r.a.isGraded ? r.a.maxScore : "",
    r.s.text ?? "",
    transcriptText(r.s.voiceTranscript),
    r.s.feedback ?? "",
    fmtDateTime(r.s.submittedAt),
  ]);

  const quizRows: Cell[][] = attempts.map((r) => [
    `${r.u.firstName} ${r.u.lastName}`.trim(),
    r.u.email,
    r.courseTitle,
    r.q.title,
    ATTEMPT_STATUS[r.at.status] ?? r.at.status,
    Number(r.at.earnedPoints),
    r.at.totalPoints,
    r.at.score != null ? Number(r.at.score) : "",
    fmtDateTime(r.at.completedAt ?? r.at.startedAt),
  ]);

  const gorevSheet: Sheet = {
    name: "Görev Teslimleri",
    headers: ["Öğrenci", "E-posta", "Kurs", "Görev", "Durum", "Puan", "Maks. Puan", "Metin", "Ses dökümü", "Geri bildirim", "Tarih"],
    rows: subRows,
  };
  const sinavSheet: Sheet = {
    name: "Sınav Sonuçları",
    headers: ["Öğrenci", "E-posta", "Kurs", "Sınav", "Durum", "Alınan puan", "Toplam puan", "Yüzde", "Tarih"],
    rows: quizRows,
  };

  const sheets: Sheet[] = [];
  if (wantGorev) sheets.push(gorevSheet);
  if (wantSinav) sheets.push(sinavSheet);

  const buf = xlsxBuffer(sheets);
  const today = new Date().toISOString().slice(0, 10);
  const base = tur === "gorev" ? "gorev-teslimleri" : tur === "sinav" ? "sinav-sonuclari" : "gorevler-sinavlar";
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`${base}-${today}.xlsx`) });
}
