import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { canJoin, canMarkAttended, type MeetingSession } from "@/lib/meeting";
import { MeetingAttendButton } from "@/components/panel/MeetingAttendButton";
import { Icon } from "@/components/site/Icon";

/**
 * Görüşme ürününün kart alt bölümü (Kitaplığım + görüşme sayfası ortak):
 * - saat gelmeden: tıklanamayan tarih/saat düğmesi
 * - saat aralığında: "Görüşmeye katıl" (Zoom)
 * - saat geçince: "Bu görüşmeye katıldım"
 * - hepsi işaretlendi: tamamlandı
 */
export function MeetingCardActions({ courseId, periodId, sessions, next, allDone, compact = false }: { courseId: number; periodId: number; sessions: MeetingSession[]; next: MeetingSession | null; allDone: boolean; compact?: boolean }) {
  const now = new Date();
  if (allDone || !next) {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-700">
        <Icon name="check" className="mr-1 inline size-4" /> {sessions.length > 1 ? "Tüm görüşmeler tamamlandı" : "Görüşme tamamlandı"}
      </div>
    );
  }
  const multi = sessions.length > 1;
  const label = multi ? `${next.title}: ` : "";
  return (
    <div className="space-y-2">
      {canJoin(next, now) && next.link && (
        <Link href={next.link} target="_blank" rel="noopener" className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700"><Icon name="video" className="size-4" /> Görüşmeye katıl</Link>
      )}
      {canMarkAttended(next, now) ? (
        <MeetingAttendButton courseId={courseId} periodId={periodId} sessionIndex={next.index} label={multi ? `${next.title}ye katıldım` : "Bu görüşmeye katıldım"} />
      ) : (
        <button type="button" disabled className="btn-secondary w-full cursor-not-allowed opacity-80" title="Görüşme saati geçince katılımını işaretleyebilirsin">
          <Icon name="calendar" className="size-4" /> {label}{fmtDateTime(next.start)}
        </button>
      )}
      {!compact && multi && (
        <p className="text-center text-xs text-muted">{sessions.filter((s) => s.attended).length}/{sessions.length} görüşme tamamlandı</p>
      )}
    </div>
  );
}
