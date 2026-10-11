import Link from "next/link";
import { Icon, type IconName } from "@/components/site/Icon";

export function Progress({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-navy-100 ${className}`}>
      <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

const CHIP = {
  navy: "bg-navy-100 text-navy-800",
  sky: "bg-sky-100 text-sky-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-surface text-muted",
  purple: "bg-violet-50 text-violet-700",
} as const;

export function Chip({ color = "gray", children }: { color?: keyof typeof CHIP; children: React.ReactNode }) {
  return <span className={`badge ${CHIP[color]}`}>{children}</span>;
}

export function Kpi({ label, value, icon, color = "navy", href }: { label: string; value: React.ReactNode; icon: IconName; color?: keyof typeof CHIP; href?: string }) {
  const body = (
    // Telefonda iki sütunda kutu dar: iç boşluk ve ikon küçülür, etiket tek satırda kalır ("Bekleyen görev" iki satıra kırılıyordu)
    <div className="card flex min-w-0 items-center gap-2.5 p-3 sm:gap-4 sm:p-5">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11 ${CHIP[color]}`}><Icon name={icon} className="size-[18px] sm:size-5" /></span>
      <div className="min-w-0">
        <p className="break-words text-xl font-bold leading-tight text-navy-800 sm:text-2xl">{value}</p>
        <p className="whitespace-nowrap text-[11px] text-muted sm:text-xs">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="page-title mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-navy-800">{title}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="card py-10 text-center">
      <p className="text-muted">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs({ items }: { items: { href: string; label: string; icon?: IconName; count?: number; active: boolean }[] }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className={`flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-sm font-semibold ${t.active ? "border-navy-800 text-navy-800" : "border-line bg-white text-muted hover:border-navy-300"}`}>
          {t.icon && <Icon name={t.icon} className="size-4" />}{t.label}{t.count !== undefined && <span className="rounded-full bg-surface px-1.5 text-xs">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
