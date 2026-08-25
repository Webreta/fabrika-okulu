import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { periods, courses, teacherEvents } from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { teacherCourseIds } from "@/lib/data/teacher";
import { fmtDay, todayISO } from "@/lib/format";
import { PageTitle, Chip } from "@/components/panel/ui";
import { EventForm, DeleteEventButton } from "@/components/teacher/EventForm";

type Ev = { id?: number; date: string; time: string; title: string; sub: string; link?: string; type: "period" | "personal"; color: string };

export default async function TeacherCalendarPage() {
  const user = await requireTeacher();
  const ids = await teacherCourseIds(user);
  const events: Ev[] = [];
  if (ids.length) {
    const ps = await db.select({ p: periods, courseTitle: courses.title }).from(periods).innerJoin(courses, eq(periods.courseId, courses.id)).where(inArray(periods.courseId, ids));
    for (const { p, courseTitle } of ps) for (const s of p.schedule ?? []) if (s.date) events.push({ date: s.date, time: s.time, title: s.title || "Canlı oturum", sub: `${courseTitle} · ${p.name}`, link: s.link, type: "period", color: "#7c3aed" });
  }
  const mine = await db.select().from(teacherEvents).where(and(eq(teacherEvents.teacherId, user.id), gte(teacherEvents.eventDate, todayISO()))).orderBy(asc(teacherEvents.eventDate));
  for (const e of mine) events.push({ id: e.id, date: e.eventDate, time: e.startTime?.slice(0, 5) ?? "", title: e.title, sub: e.note, type: "personal", color: e.color });
  events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const today = todayISO();
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).slice(-10).reverse();

  const Card = ({ e }: { e: Ev }) => (
    <div className="card flex items-center gap-4">
      <div className="w-1.5 self-stretch rounded-full" style={{ background: e.color }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{fmtDay(e.date)}{e.time && ` · ${e.time}`}</p>
        <p className="truncate font-semibold text-navy-800">{e.title}</p>
        <p className="truncate text-xs text-muted">{e.sub}</p>
      </div>
      <Chip color={e.type === "period" ? "purple" : "navy"}>{e.type === "period" ? "Canlı ders" : "Kişisel"}</Chip>
      {e.link && <a href={e.link} target="_blank" className="btn-secondary btn-sm">Zoom&apos;u aç</a>}
      {e.id && <DeleteEventButton id={e.id} />}
    </div>
  );

  return (
    <>
      <PageTitle title="Takvim" sub="Dönem oturumları ve kişisel etkinliklerin" action={<EventForm />} />
      <p className="mb-4 rounded-lg bg-sky-50 px-4 py-2 text-xs text-navy-800">Dönem bilgileri yayından sonra kilitlidir; oturum bağlantılarını editörden güncelleyebilirsin.</p>
      <div className="space-y-3">{upcoming.length === 0 ? <p className="card text-sm text-muted">Yaklaşan etkinlik yok.</p> : upcoming.map((e, i) => <Card key={i} e={e} />)}</div>
      {past.length > 0 && <><h2 className="mb-2 mt-8 font-bold text-muted">Geçmiş</h2><div className="space-y-3 opacity-70">{past.map((e, i) => <Card key={i} e={e} />)}</div></>}
    </>
  );
}
