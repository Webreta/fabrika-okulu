import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { studentCourses } from "@/lib/data/student";
import { PageTitle, Progress, Tabs, Empty, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function MyCoursesPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const user = (await getCurrentUser())!;
  const { sekme } = await searchParams;
  const all = await studentCourses(user.id);
  const ongoing = all.filter((c) => c.total === 0 || c.percent < 100);
  const done = all.filter((c) => c.total > 0 && c.percent >= 100);
  const list = sekme === "bitmis" ? done : ongoing;

  return (
    <>
      <PageTitle title="Eğitimlerim" sub="Kayıtlı olduğun programlar" />
      <Tabs items={[
        { href: "/panel/egitim", label: "Devam Eden", count: ongoing.length, active: sekme !== "bitmis" },
        { href: "/panel/egitim?sekme=bitmis", label: "Bitmiş", count: done.length, active: sekme === "bitmis" },
        { href: "/kesfet", label: "Yeni Program", active: false },
      ]} />
      {list.length === 0 ? (
        <Empty text={sekme === "bitmis" ? "Henüz tamamlanmış eğitimin yok." : "Devam eden eğitimin yok."} action={<Link href="/kesfet" className="btn-primary">Programları keşfet</Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className="card flex flex-col p-0 overflow-hidden">
              <div className="relative h-36 bg-navy-50">
                {c.imageUrl && <Image src={c.imageUrl} alt="" width={480} height={300} className="h-full w-full object-cover" />}
                <span className="absolute left-3 top-3"><Chip color={c.percent >= 100 ? "green" : c.percent > 0 ? "sky" : "gray"}>{c.percent >= 100 ? "Tamamlandı" : c.percent > 0 ? "Devam ediyor" : "Başlanmadı"}</Chip></span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-bold text-navy-800">{c.title}</h3>
                <p className="mt-1 text-xs text-muted">{c.completed}/{c.total} ders</p>
                <Progress percent={c.percent} className="mt-3" />
                <p className="mt-1 text-xs text-muted">%{c.percent} tamamlandı</p>
                <Link href={`/kurs-izle/${c.id}`} className="btn-primary mt-4 w-full"><Icon name="play" className="size-4" /> {c.percent >= 100 ? "Tekrar izle" : "Devam et"}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
