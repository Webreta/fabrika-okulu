import Link from "next/link";
import { MountainBackdrop } from "@/components/site/MountainBackdrop";
import { Icon } from "@/components/site/Icon";

export type Crumb = { label: string; href?: string };

/**
 * Tüm sayfaların ortak başlığı: lacivert zemin + dağ illüstrasyonu, ortalı ince başlık, altında tek cümle,
 * en altta cam efektli breadcrumb kapsülü (Anasayfa otomatik başa eklenir; son öğe vurgulu).
 */
export function PageHero({ title, subtitle, crumbs = [], flags = false }: { title: string; subtitle?: string; crumbs?: Crumb[]; flags?: boolean }) {
  const trail: Crumb[] = [{ label: "Anasayfa", href: "/" }, ...crumbs];
  return (
    <section className="relative overflow-hidden bg-navy-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(91,174,207,.3),transparent_60%)]" />
      <MountainBackdrop className="absolute inset-x-0 bottom-0 h-[78%]" flags={flags} />
      <div className="relative mx-auto max-w-7xl px-4 py-16 text-center text-white md:py-24">
        <h1 className="text-3xl font-medium tracking-tight md:text-5xl [text-shadow:0_2px_12px_rgba(10,21,48,.9)]">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-4xl truncate text-base text-white/85 md:text-lg [text-shadow:0_1px_8px_rgba(10,21,48,.9)]" title={subtitle}>{subtitle}</p>}
        <nav aria-label="Konum" className="mt-6 flex justify-center">
          <ol className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs font-semibold backdrop-blur-md sm:text-[13px]">
            {trail.map((c, i) => {
              const last = i === trail.length - 1;
              return (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <Icon name="chevronRight" className="size-3.5 shrink-0 text-white/40" />}
                  {last || !c.href ? (
                    <span aria-current={last ? "page" : undefined} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${last ? "bg-white text-navy-800 shadow" : "text-white/75"}`}>{i === 0 && <Icon name="home" className="size-3.5" />}{c.label}</span>
                  ) : (
                    <Link href={c.href} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white/75 transition hover:bg-white/10 hover:text-white">{i === 0 && <Icon name="home" className="size-3.5" />}{c.label}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
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
