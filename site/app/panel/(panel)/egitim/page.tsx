import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { studentCourses } from "@/lib/data/student";
import { PageTitle, Progress, Empty, Chip } from "@/components/panel/ui";
import { SideNav } from "@/components/panel/SideNav";
import { MeetingCardActions } from "@/components/panel/MeetingCard";
import { MeetingDetailPopup } from "@/components/panel/MeetingDetailPopup";
import { Icon } from "@/components/site/Icon";

export default async function MyCoursesPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const user = (await getCurrentUser())!;
  const { sekme } = await searchParams;
  const all = await studentCourses(user.id);
  // Yeni: satın alınmış ama hiç başlanmamış · Devam eden: başlanmış, bitmemiş · Bitmiş: %100
  // Görüşme ürününde ilerleme = katılınan oturum sayısı (lib/data/student.ts)
  const fresh = all.filter((c) => c.completed === 0 && c.percent < 100);
  const ongoing = all.filter((c) => c.completed > 0 && c.percent < 100);
  const done = all.filter((c) => c.total > 0 && c.percent >= 100);
  const list = sekme === "bitmis" ? done : sekme === "devam" ? ongoing : sekme === "yeni" ? fresh : all;

  return (
    <>
      <PageTitle title={sekme === "devam" ? "Devam Eden Programlar" : sekme === "yeni" ? "Yeni Programlar" : "Kitaplığım"} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <SideNav label="Kitaplığım" items={[
          { href: "/panel/egitim", label: "Tüm Eğitimler", icon: "library", count: all.length, active: sekme !== "devam" && sekme !== "bitmis" },
          { href: "/panel/egitim?sekme=devam", label: "Devam Eden", icon: "play", count: ongoing.length, active: sekme === "devam" },
          { href: "/panel/egitim?sekme=bitmis", label: "Bitmiş", icon: "check", count: done.length, active: sekme === "bitmis" },
          { href: "/panel/egitim?sekme=yeni", label: "Yeni Program", icon: "star", count: fresh.length, active: sekme === "yeni" },
        ]} />
        <div className="min-w-0 flex-1">
      {list.length === 0 ? (
        <Empty text={sekme === "bitmis" ? "Henüz tamamlanmış eğitimin yok." : sekme === "devam" ? "Devam eden eğitimin yok." : sekme === "yeni" ? "Başlanmamış yeni programın yok." : "Henüz bir eğitime kayıtlı değilsin."} action={<Link href="/kesfet" className="btn-primary">Programları keşfet</Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className="card flex flex-col p-0 overflow-hidden">
              <div className="relative aspect-[5/2] bg-navy-50">
                {c.imageUrl && <Image src={c.imageUrl} alt="" width={500} height={200} className="aspect-[5/2] w-full object-cover" />}
                <span className="absolute left-3 top-3 flex gap-1.5"><Chip color={c.percent >= 100 ? "green" : c.percent > 0 ? "sky" : "gray"}>{c.percent >= 100 ? "Tamamlandı" : c.percent > 0 ? "Devam ediyor" : "Başlanmadı"}</Chip>{c.type === "meeting" && <Chip color="purple">Online görüşme</Chip>}</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-bold text-navy-800">{c.title}</h3>
                {c.type === "meeting" && c.meeting ? (
                  <>
                    <p className="mt-1 text-xs text-muted">{c.meeting.periodName}{c.meeting.minutes ? ` · ${c.meeting.minutes} dk` : ""}</p>
                    <div className="mt-auto pt-3">
                      <MeetingCardActions courseId={c.id} periodId={c.meeting.periodId} sessions={c.meeting.sessions} next={c.meeting.next} allDone={c.meeting.allDone} />
                      <MeetingDetailPopup courseId={c.id} periodId={c.meeting.periodId} title={c.title} periodName={c.meeting.periodName} minutes={c.meeting.minutes} sessions={c.meeting.sessions.map((s) => ({ index: s.index, title: s.title, start: s.start.toISOString(), end: s.end.toISOString(), link: s.link, attended: s.attended }))} />
                    </div>
                  </>
                ) : c.type === "meeting" ? (
                  <p className="mt-auto pt-3 text-sm text-muted">Görüşme saati seçilmemiş.</p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-muted">{c.completed}/{c.total} ders</p>
                    <div className="mt-auto pt-3">
                      <Progress percent={c.percent} />
                      <p className="mt-1 text-xs text-muted">%{c.percent} tamamlandı</p>
                      <Link href={`/kurs-izle/${c.id}`} className="btn-primary mt-4 w-full"><Icon name="play" className="size-4" /> {c.percent >= 100 ? "Tekrar izle" : c.completed === 0 ? "Başla" : "Devam et"}</Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>
    </>
  );
}
