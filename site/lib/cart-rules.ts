import "server-only";
import type { Course } from "@/db/schema";
import { hasAccess } from "@/lib/data/student";
import { periodCapacity } from "@/lib/waitlist";
import { todayISO } from "@/lib/format";

// Bir eğitimin (ve seçilen dönemin) ŞU AN satın alınabilir olup olmadığı. Tek kaynak:
// sepete ekleme, sepet/ödeme sayfası ve sipariş oluşturma aynı kuralı uygular. Sepet çerezi 7 gün yaşadığı için
// eğitim sepetteyken durum değişebilir (Yakında işaretlendi, dönem kapandı, öğrenci başka yoldan kaydoldu).

export type LineCode = "kapali" | "yakinda" | "kayitli" | "donem" | "dolu" | "gecmis";
export type LineCheck =
  | { ok: true; periodId: number | null; periodName: string | null }
  | { ok: false; code: LineCode; message: string; periodId: number | null; periodName: string | null };

export async function checkCartLine(c: Course | undefined | null, periodIdRaw: unknown, userId: number | null): Promise<LineCheck> {
  const pid = typeof periodIdRaw === "number" && Number.isInteger(periodIdRaw) && periodIdRaw > 0 ? periodIdRaw : null;
  const fail = (code: LineCode, message: string, periodName: string | null = null): LineCheck => ({ ok: false, code, message, periodId: pid, periodName });
  if (!c || c.status !== "published" || c.closed) return fail("kapali", "Bu eğitim artık satışta değil.");
  if (c.comingSoon) return fail("yakinda", "Bu eğitim henüz satışa açılmadı.");
  if (userId && (await hasAccess(userId, c.id))) return fail("kayitli", "Bu eğitime zaten kayıtlısın.");

  const meeting = c.type === "meeting";
  if (c.group !== "takvimli" && !meeting) return { ok: true, periodId: null, periodName: null }; // dönemsiz eğitimde dönem yok sayılır
  if (!pid) return fail("donem", meeting ? "Görüşme saati seçilmedi." : "Dönem seçilmedi.");
  const p = await periodCapacity(pid, c.id, userId);
  if (!p) return fail("donem", meeting ? "Seçilen görüşme saati bulunamadı." : "Seçilen dönem bulunamadı.");
  const today = todayISO();
  const deadline = p.enrollmentDeadline ?? p.startDate;
  if (deadline < today || p.endDate < today) return fail("gecmis", meeting ? "Seçilen görüşme saati geçti." : "Seçilen dönemin kaydı kapandı.", p.name);
  if (meeting) {
    // Görüşme koltuğu: aynı gün içinde saati geçmiş koltuk da satılmaz
    const first = p.schedule?.[0];
    const start = new Date(`${first?.date || p.startDate}T${(first?.time || p.startTime || "00:00").slice(0, 5)}:00`);
    if (!isNaN(start.getTime()) && start.getTime() <= Date.now()) return fail("gecmis", "Seçilen görüşme saati geçti.", p.name);
  }
  if (p.full) return fail("dolu", meeting ? "Seçilen görüşme saati doldu." : "Seçilen dönemin kontenjanı doldu.", p.name);
  return { ok: true, periodId: p.id, periodName: p.name };
}
