import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { studentCourses } from "@/lib/data/student";
import { PageTitle, Progress, Empty, Chip } from "@/components/panel/ui";
import { SideNav } from "@/components/panel/SideNav";
import { MeetingCardActions } from "@/components/panel/MeetingCard";
import { MeetingDetailPopup } from "@/components/panel/MeetingDetailPopup";
import { Icon } from "@/components/site/Icon";
import { studentFavorites } from "@/lib/favorites";
import { FavoriteButton } from "@/components/site/FavoriteButton";
import { Price } from "@/components/site/CourseCard";
import { fmtDay } from "@/lib/format";

export default async function MyCoursesPage({ searchParams }: { searchParams: Promise<{ sekme?: string; acilis?: string }> }) {
  const user = (await getCurrentUser())!;
  const { sekme, acilis } = await searchParams;
  const [all, favs] = await Promise.all([studentCourses(user.id), studentFavorites(user.id)]);
  // Yeni: satın alınmış ama hiç başlanmamış · Devam eden: başlanmış, bitmemiş · Bitmiş: %100
  // Görüşme ürününde ilerleme = katılınan oturum sayısı (lib/data/student.ts)
  const fresh = all.filter((c) => c.completed === 0 && c.percent < 100);
  const ongoing = all.filter((c) => c.completed > 0 && c.percent < 100);
  const done = all.filter((c) => c.total > 0 && c.percent >= 100);
  const list = sekme === "bitmis" ? done : sekme === "devam" ? ongoing : sekme === "yeni" ? fresh : all;
  // Açılmamış (erken kayıt) eğitimi izlemeye çalışan öğrenci buraya yönlendirilir
  const notOpen = acilis ? all.find((c) => c.id === Number(acilis) && c.opensAt) : undefined;

  return (
    <>
      <PageTitle title={sekme === "devam" ? "Devam Ettiklerim" : sekme === "yeni" ? "Başlayacaklarım" : sekme === "bitmis" ? "Tamamladıklarım" : sekme === "favori" ? "İstediklerim" : "Tüm Eğitimlerim"} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Sıra ve adlar yönetici isteği (2026-10-10): başlayacaklarım → devam ettiklerim → tamamladıklarım → tüm eğitimlerim → istediklerim */}
        <SideNav label="Kitaplığım" items={[
          { href: "/panel/egitim?sekme=yeni", label: "Başlayacaklarım", icon: "star", count: fresh.length, active: sekme === "yeni" },
          { href: "/panel/egitim?sekme=devam", label: "Devam Ettiklerim", icon: "play", count: ongoing.length, active: sekme === "devam" },
          { href: "/panel/egitim?sekme=bitmis", label: "Tamamladıklarım", icon: "check", count: done.length, active: sekme === "bitmis" },
          { href: "/panel/egitim", label: "Tüm Eğitimlerim", icon: "library", count: all.length, active: sekme !== "devam" && sekme !== "bitmis" && sekme !== "yeni" && sekme !== "favori" },
          { href: "/panel/egitim?sekme=favori", label: "İstediklerim", icon: "heart", count: favs.length, active: sekme === "favori" },
        ]} />
        <div className="min-w-0 flex-1">
      {notOpen && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800"><Icon name="clock" className="mt-0.5 size-4 shrink-0" /> <span><b>{notOpen.title}</b> henüz açılmadı. Erken kaydın hazır; eğitim <b>{fmtDay(notOpen.opensAt, true)}</b> tarihinde aktifleşecek.</span></p>
      )}
      {sekme === "favori" ? (
        favs.length === 0 ? (
          <Empty text="Henüz istediğin bir eğitim yok. Programlardaki kalp simgesiyle ekleyebilirsin." action={<Link href="/kesfet" className="btn-primary">Programları keşfet</Link>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {favs.map((c) => (
              <div key={c.id} className="card relative flex flex-col p-0 overflow-hidden">
                <FavoriteButton courseId={c.id} initial />
                <Link href={`/program/${c.slug}`} className="relative block aspect-video bg-navy-50">
                  {c.imageUrl && <Image src={c.imageUrl} alt="" width={640} height={360} className="aspect-video w-full object-cover" />}
                  <span className="absolute left-3 top-3 flex gap-1.5">
                    {c.onSale && <Chip color="red">İndirimde</Chip>}
                    {c.enrolled && <Chip color="green">Kayıtlısın</Chip>}
                    {c.closed && <Chip color="gray">Yayında değil</Chip>}
                  </span>
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-bold text-navy-800"><Link href={`/program/${c.slug}`} className="hover:text-sky-600">{c.title}</Link></h3>
                  {c.instructor && <p className="mt-1 text-xs text-muted">{c.instructor.name}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <Price course={c} />
                    {c.enrolled ? (
                      <Link href={`/kurs-izle/${c.id}`} className="btn-primary btn-sm"><Icon name="play" className="size-4" /> İzle</Link>
                    ) : (
                      <Link href={`/program/${c.slug}`} className="btn-sky btn-sm">{c.closed ? "İncele" : c.isFree ? "Kayıt Ol" : "Sepete Ekle"}</Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : list.length === 0 ? (
        <Empty text={sekme === "bitmis" ? "Henüz tamamladığın eğitim yok." : sekme === "devam" ? "Devam ettiğin eğitim yok." : sekme === "yeni" ? "Başlayacağın yeni eğitim yok." : "Henüz bir eğitime kayıtlı değilsin."} action={<Link href="/kesfet" className="btn-primary">Programları keşfet</Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className="card flex flex-col p-0 overflow-hidden">
              <div className="relative aspect-video bg-navy-50">
                {c.imageUrl && <Image src={c.imageUrl} alt="" width={640} height={360} className="aspect-video w-full object-cover" />}
                {c.opensAt && <span className="absolute inset-0 bg-navy-900/45" />}
                <span className="absolute left-3 top-3 flex gap-1.5">{c.opensAt ? <Chip color="purple">Erken kayıt</Chip> : <Chip color={c.percent >= 100 ? "green" : c.percent > 0 ? "sky" : "gray"}>{c.percent >= 100 ? "Tamamlandı" : c.percent > 0 ? "Devam ediyor" : "Başlanmadı"}</Chip>}{c.type === "meeting" && <Chip color="purple">Online görüşme</Chip>}</span>
                {c.opensAt && <span className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-navy-800 shadow"><Icon name="clock" className="size-3.5 text-violet-600" /> {fmtDay(c.opensAt, true)} tarihinde aktifleşecek</span>}
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
                ) : c.opensAt ? (
                  <>
                    <p className="mt-1 text-xs text-muted">Erken kaydın alındı. Eğitim açıldığında sana haber vereceğiz.</p>
                    <div className="mt-auto pt-3">
                      <p className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-800"><Icon name="lock" className="size-4" /> {fmtDay(c.opensAt, true)} tarihinde aktifleşecek</p>
                      <Link href={`/program/${c.slug}`} className="mt-2 block text-center text-xs font-semibold text-sky-600 hover:underline">Eğitim sayfasını gör</Link>
                    </div>
                  </>
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
