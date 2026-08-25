import Link from "next/link";
import Image from "next/image";

export function PageHero({ title, subtitle, image = "/img/site/page-hero.jpg" }: { title: string; subtitle?: string; image?: string }) {
  return (
    <section className="relative overflow-hidden bg-navy-900">
      <Image src={image} alt="" fill className="object-cover opacity-50" priority />
      <div className="relative mx-auto max-w-7xl px-4 py-20 text-center text-white md:py-28">
        <h1 className="text-3xl font-bold md:text-5xl">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-2xl text-lg text-white/85">{subtitle}</p>}
      </div>
    </section>
  );
}

export function CtaBand({ title, text }: { title: string; text: string }) {
  return (
    <section className="relative mt-16 overflow-hidden">
      <Image src="/img/site/cta.jpg" alt="" fill className="object-cover" />
      <div className="absolute inset-0 bg-navy-900/70" />
      <div className="relative mx-auto max-w-7xl px-4 py-20 text-center text-white">
        <h2 className="text-3xl font-bold md:text-4xl">{title}</h2>
        <p className="mt-2 text-lg text-white/85">{text}</p>
        <Link href="/kesfet" className="btn-sky mt-6 px-7 py-3 text-base">Keşfet</Link>
      </div>
    </section>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-8 text-center">
      <h2 className="text-2xl font-bold text-navy-800 md:text-4xl">{children}</h2>
      {sub && <p className="mx-auto mt-2 max-w-2xl text-muted">{sub}</p>}
    </div>
  );
}
