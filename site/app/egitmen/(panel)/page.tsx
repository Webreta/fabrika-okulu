import Link from "next/link";
import Image from "next/image";
import { requireTeacher } from "@/lib/auth/session";
import { teacherOverview } from "@/lib/data/teacher";
import { Kpi, Chip, PageTitle } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function TeacherHome() {
  const user = await requireTeacher();
  const ov = await teacherOverview(user);
  return (
    <>
      <PageTitle title={`Merhaba, ${user.firstName || user.name} 👋`} sub="Eğitmen paneline hoş geldin." action={<Link href="/egitmen/editor/yeni" className="btn-primary"><Icon name="plus" className="size-4" /> Yeni eğitim</Link>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Eğitim" value={ov.courses.length} icon="book" href="/egitmen/kurslarim" />
        <Kpi label="Toplam öğrenci" value={ov.studentCount} icon="users" color="sky" href="/egitmen/ogrenciler" />
        <Kpi label="Görev gönderimi" value={ov.pendingSubs} icon="task" color="amber" href="/egitmen/gonderim#gorev" />
        <Kpi label="Bekleyen soru" value={ov.pendingQuestions} icon="message" color={ov.pendingQuestions ? "red" : "green"} href="/egitmen/sorular" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-3 font-bold text-navy-800">Eğitimlerim</h2>
          {ov.courses.length === 0 ? (
            <div className="card text-center"><p className="text-muted">Henüz eğitimin yok.</p><Link href="/egitmen/editor/yeni" className="btn-primary mt-3">İlk eğitimini oluştur</Link></div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ov.courses.slice(0, 6).map((c) => (
                <div key={c.id} className="card p-0 overflow-hidden">
                  <div className="relative h-28 bg-navy-50">{c.imageUrl && <Image src={c.imageUrl} alt="" width={400} height={200} className="h-full w-full object-cover" />}
                    <span className="absolute left-2 top-2"><Chip color={c.closed ? "gray" : c.status === "published" ? "green" : "amber"}>{c.closed ? "Kapalı" : c.status === "published" ? "Yayında" : "Taslak"}</Chip></span>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 font-semibold text-navy-800">{c.title}</p>
                    <p className="text-xs text-muted">{c.students} öğrenci · {c.lessonCount} ders</p>
                    <div className="mt-2 flex gap-2">
                      <Link href={`/egitmen/editor/${c.id}`} className="btn-secondary btn-sm">Düzenle</Link>
                      <Link href={`/egitmen/detay/${c.id}`} className="btn-secondary btn-sm">Detay</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <div className="card">
            <h3 className="font-bold text-navy-800">Hızlı erişim</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {[["/egitmen/editor/yeni", "Yeni eğitim", "plus"], ["/egitmen/gonderim", "Gönderimler", "task"], ["/egitmen/sorular", "Sorular", "message"], ["/egitmen/takvim", "Takvim", "calendar"]].map(([h, l, i]) => (
                <li key={h}><Link href={h} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface"><Icon name={i as "plus"} className="size-4 text-sky-500" />{l}</Link></li>
              ))}
            </ul>
          </div>
          <div className="card text-sm">
            <p className="flex justify-between"><span className="text-muted">Toplam eğitim</span><b>{ov.courses.length}</b></p>
            <p className="flex justify-between"><span className="text-muted">Yayında</span><b>{ov.courses.filter((c) => c.status === "published").length}</b></p>
            <p className="flex justify-between"><span className="text-muted">Öğrenci</span><b>{ov.studentCount}</b></p>
            <p className="flex justify-between"><span className="text-muted">Değerlendirme bekleyen sınav</span><b>{ov.pendingQuizzes}</b></p>
          </div>
        </aside>
      </div>
    </>
  );
}
