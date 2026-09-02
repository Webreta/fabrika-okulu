import Link from "next/link";
import Image from "next/image";
import { fmtDateTime } from "@/lib/format";
import { canJoin, type MeetingSession } from "@/lib/meeting";
import type { StudentMeeting } from "@/lib/data/student";
import { MeetingCardActions } from "@/components/panel/MeetingCard";
import { Icon } from "@/components/site/Icon";

/**
 * Online görüşme ürününün "izleme" sayfası: video oynatıcı yerine görüşme bilgileri.
 * Koltuk, oturum listesi (tarih/saat, bağlantı, katılım), "katıldım" işaretleme.
 */
export function MeetingView({ course, meeting, preview }: { course: { id: number; title: string; imageUrl: string; shortDescription: string; meetingMinutes: number; meetingLink: string }; meeting: StudentMeeting | null; preview: boolean }) {
  const now = new Date();
  const SessionRow = ({ s }: { s: MeetingSession }) => (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${s.attended ? "bg-emerald-50 text-emerald-600" : s.end.getTime() < now.getTime() ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700"}`}>
        <Icon name={s.attended ? "check" : "video"} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy-800">{s.title}</p>
        <p className="text-xs text-muted"><span className="date-chip">{fmtDateTime(s.start)}</span>{course.meetingMinutes ? ` · ${course.meetingMinutes} dk` : ""}</p>
      </div>
      {s.attended ? (
        <span className="text-xs font-semibold text-emerald-700">Katıldım ✓</span>
      ) : canJoin(s, now) && s.link ? (
        <Link href={s.link} target="_blank" rel="noopener" className="btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700"><Icon name="video" className="size-4" /> Katıl</Link>
      ) : s.link && s.start.getTime() > now.getTime() ? (
        <span className="text-xs text-muted">Bağlantı görüşmeden 15 dk önce açılır</span>
      ) : null}
    </li>
  );

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/panel/egitim" className="flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline"><Icon name="arrowLeft" className="size-4" /> Kitaplığım</Link>
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">Online görüşme</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div className="card overflow-hidden p-0">
          {course.imageUrl && <Image src={course.imageUrl} alt="" width={900} height={360} className="aspect-[5/2] w-full object-cover" />}
          <div className="p-5">
            <h1 className="text-2xl font-bold text-navy-800">{course.title}</h1>
            {course.shortDescription && <p className="mt-1 text-sm text-muted">{course.shortDescription}</p>}
          </div>
        </div>

        {preview || !meeting ? (
          <div className="card text-sm text-muted">
            {preview ? "Önizleme: öğrenci burada seçtiği görüşme saatini, Zoom bağlantısını ve katılım durumunu görür." : "Bu görüşme için seçilmiş bir saat yok."}
            {course.meetingLink && <p className="mt-2">Varsayılan bağlantı: <a href={course.meetingLink} target="_blank" rel="noopener" className="text-sky-600 underline">{course.meetingLink}</a></p>}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="card">
              <h2 className="mb-1 font-bold text-navy-800">Görüşmelerim</h2>
              <p className="mb-2 text-xs text-muted">{meeting.periodName}</p>
              <ul className="divide-y divide-line">{meeting.sessions.map((s) => <SessionRow key={s.index} s={s} />)}</ul>
            </div>
            <div className="card h-fit">
              <h2 className="mb-3 font-bold text-navy-800">Sıradaki adım</h2>
              <MeetingCardActions courseId={course.id} periodId={meeting.periodId} sessions={meeting.sessions} next={meeting.next} allDone={meeting.allDone} />
              <p className="mt-3 text-xs text-muted">Görüşme saati geçince "katıldım" işaretleyebilirsin; işaretlenen görüşmeler Aksiyonlarım ve Gündemim'de tamamlanmış görünür.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
