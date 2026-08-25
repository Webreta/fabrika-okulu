import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/site/Icon";

export function AuthLayout({
  title, subtitle, children, bullets, aside, bg, logo,
}: { title: string; subtitle?: string; children: React.ReactNode; bullets: string[]; aside: string; bg?: string; logo?: string }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-600 via-navy-800 to-navy-950 p-12 text-white lg:flex">
        {bg && <Image src={bg} alt="" fill className="object-cover opacity-30" />}
        <div className="absolute -left-20 -top-20 size-80 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 size-96 rounded-full bg-sky-300/10 blur-3xl" />
        <Link href="/" className="relative inline-block w-fit rounded-2xl bg-white px-4 py-3">
          <Image src={logo || "/img/site/logo.webp"} alt="Fabrika Okulu" width={160} height={182} className="h-14 w-auto" />
        </Link>
        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight">{aside}</h2>
          <ul className="mt-6 space-y-3 text-white/85">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-sky-400/30"><Icon name="check" className="size-3.5" /></span>{b}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">© {new Date().getFullYear()} Fabrika Okulu</p>
      </aside>
      <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-surface to-white p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_22px_54px_rgba(20,43,86,.10)]">
          <Link href="/" className="mb-6 block lg:hidden"><Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={120} height={137} className="mx-auto h-14 w-auto" /></Link>
          <h1 className="text-2xl font-bold text-navy-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
