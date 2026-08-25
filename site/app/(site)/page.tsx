import Link from "next/link";
import Image from "next/image";
import { getSetting } from "@/lib/settings";
import { catalogCourses } from "@/lib/data/courses";
import { CourseCard } from "@/components/site/CourseCard";
import { CtaBand, SectionTitle } from "@/components/site/Sections";

export default async function HomePage() {
  const [g, all] = await Promise.all([getSetting("general"), catalogCourses()]);
  const popular = all.slice(0, 6);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900">
        <Image src={g.heroImage || "/img/site/hero.jpg"} alt="" fill className="object-cover opacity-45" priority />
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:py-36">
          <div className="max-w-2xl text-white">
            <p className="font-script text-3xl text-sky-300 md:text-4xl">{g.siteName}</p>
            <h1 className="mt-2 text-4xl font-bold leading-tight md:text-6xl">{g.heroTitle}</h1>
            <p className="mt-5 text-lg text-white/85 md:text-xl">{g.heroText}</p>
            <Link href="/kesfet" className="btn-sky mt-8 px-7 py-3 text-base">Keşfet</Link>
          </div>
        </div>
      </section>

      {/* Tanıtım */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-navy-800 md:text-4xl">{g.introTitle}</h2>
            <p className="mt-4 text-muted leading-relaxed">{g.introText}</p>
          </div>
          <div className="space-y-5">
            <div className="card">
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Online hazır içerik ile</p>
              <h3 className="text-xl font-bold text-navy-800">ESNEK ZAMANLI PROGRAMLAR</h3>
              <p className="mt-2 text-muted">{g.esnekText}</p>
            </div>
            <div className="card">
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Online içerik + canlı mentorlukla</p>
              <h3 className="text-xl font-bold text-navy-800">TAKVİMLİ PROGRAMLAR</h3>
              <p className="mt-2 text-muted">{g.takvimliText}</p>
            </div>
          </div>
        </div>
      </section>

      {/* İki program tipi */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 md:grid-cols-2">
        {[
          { href: "/esnek-programlar", img: "/img/site/esnek.jpg", title: "Esnek Programlar", text: "Online içeriğe esnek erişim." },
          { href: "/takvimli-programlar", img: "/img/site/takvimli.jpg", title: "Takvimli Programlar", text: "Online içeriğe esnek erişim + mentor ile planlı oturumlar." },
        ].map((b) => (
          <Link key={b.href} href={b.href} className="group relative overflow-hidden rounded-2xl">
            <Image src={b.img} alt={b.title} width={1024} height={373} className="aspect-[2.2/1] w-full object-cover transition group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 to-navy-900/10" />
            <div className="absolute bottom-0 left-0 p-6 text-white">
              <h3 className="text-2xl font-bold">{b.title}</h3>
              <p className="text-white/85">{b.text}</p>
              <span className="mt-3 inline-block rounded-lg bg-sky-400 px-4 py-1.5 text-sm font-semibold">İncele</span>
            </div>
          </Link>
        ))}
      </section>

      {/* Popüler */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <SectionTitle>Popüler Programlar</SectionTitle>
        {popular.length === 0 ? (
          <p className="text-center text-muted">Henüz yayınlanmış program yok.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        )}
      </section>

      <CtaBand title={g.ctaTitle} text={g.ctaText} />
    </>
  );
}
