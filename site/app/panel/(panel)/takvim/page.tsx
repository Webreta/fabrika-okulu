import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { studentActions } from "@/lib/data/student";
import { fmtTime } from "@/lib/format";
import { PageTitle, Empty, Chip } from "@/components/panel/ui";

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export default async function CalendarPage() {
  const user = (await getCurrentUser())!;
  const { calendar } = await studentActions(user.id);
  // Tamamlananlar (✓) tarihi ne olursa olsun en altta ayrı bölümde gösterilir
  const done = calendar.filter((e) => e.done);
  const pending = calendar.filter((e) => !e.done);
  const past = pending.filter((e) => e.date.getTime() < Date.now() - 86400000);
  const upcoming = pending.filter((e) => e.date.getTime() >= Date.now() - 86400000);

  const Card = ({ e }: { e: (typeof calendar)[number] }) => (
    <div className={`card flex gap-4 ${e.done ? "opacity-60" : ""}`}>
      <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-navy-800 text-white">
        <span className="text-lg font-bold leading-none">{e.date.getDate()}</span>
        <span className="text-[11px] uppercase">{MONTHS[e.date.getMonth()]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <Chip color={e.type === "session" ? "purple" : e.type === "quiz" ? "sky" : "amber"}>
          {e.type === "session" ? "Canlı ders" : e.type === "quiz" ? "Sınav" : "Görev"}{e.done && e.type !== "session" ? " ✓" : ""}
        </Chip>
        <p className="mt-1 truncate font-semibold text-navy-800">{e.title}</p>
        <p className="mt-1 text-xs text-muted"><span className="date-chip">{fmtTime(e.date)}</span> · {e.courseTitle}</p>
      </div>
      <Link href={e.link} target={e.external ? "_blank" : undefined} className="btn-secondary btn-sm self-center">{e.type === "session" ? "Katıl" : "Git"}</Link>
    </div>
  );

  return (
    <>
      <PageTitle title="Eğitim Takvimim" />
      {calendar.length === 0 ? (
        <Empty text="Takviminde henüz bir etkinlik yok." />
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="mb-3 font-bold text-navy-800">Yaklaşan</h2>
            {upcoming.length === 0 ? <p className="text-sm text-muted">Yaklaşan etkinlik yok.</p> : <div className="grid gap-3 md:grid-cols-2">{upcoming.map((e, i) => <Card key={i} e={e} />)}</div>}
          </div>
          {past.length > 0 && (
            <div>
              <h2 className="mb-3 font-bold text-muted">Geçmiş</h2>
              <div className="grid gap-3 md:grid-cols-2">{past.slice(-10).reverse().map((e, i) => <Card key={i} e={e} />)}</div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <h2 className="mb-3 font-bold text-muted">Tamamlanan</h2>
              <div className="grid gap-3 md:grid-cols-2">{done.slice(-10).reverse().map((e, i) => <Card key={i} e={e} />)}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
