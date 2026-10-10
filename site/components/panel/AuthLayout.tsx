import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/site/Icon";

/** Giriş / üye ol / şifre ekranlarının sol panelindeki varsayılan fotoğraf (Yönetim → Ayarlar → "Giriş ekranı arka planı" ile değişir) */
const DEFAULT_AUTH_BG = "/img/site/giris-dag.webp";

export function AuthLayout({
  title, subtitle, children, bullets, aside, bg, logo,
}: { title: string; subtitle?: string; children: React.ReactNode; bullets: string[]; aside: string; bg?: string; logo?: string }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <Image src={bg || DEFAULT_AUTH_BG} alt="" fill priority sizes="46vw" className="object-cover" />
        {/* Fotoğraf tam görünür; yazıların durduğu alt yarı ve logo köşesi koyulaştırılır ki metin okunsun */}
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950/30 via-navy-900/15 to-navy-950/85" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-navy-950/80 to-transparent" />
        <Link href="/" className="relative inline-block w-fit rounded-2xl bg-white px-4 py-3 shadow-lg">
          <Image src={logo || "/img/site/logo.webp"} alt="Fabrika Okulu" width={160} height={182} className="h-14 w-auto" />
        </Link>
        <div className="relative drop-shadow-[0_2px_6px_rgba(0,0,0,.55)]">
          <h2 className="text-3xl font-bold leading-tight">{aside}</h2>
          <ul className="mt-6 space-y-3 text-white/90">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-sky-400/40"><Icon name="check" className="size-3.5" /></span>{b}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,.6)]">© {new Date().getFullYear()} Fabrika Okulu</p>
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
