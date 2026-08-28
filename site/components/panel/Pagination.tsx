import Link from "next/link";
import { Icon } from "@/components/site/Icon";

/** Sunucu tarafı sayfalama: ?p=N ile çalışır (20'şerli listeler). */
export function Pagination({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => (p <= 1 ? basePath : `${basePath}?p=${p}`);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Link
        href={href(page - 1)}
        aria-disabled={prevDisabled}
        className={`flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-800 hover:bg-surface ${prevDisabled ? "pointer-events-none opacity-40" : ""}`}
      >
        <Icon name="arrowLeft" className="size-4" /> Önceki
      </Link>
      <span className="text-sm text-muted">Sayfa {page} / {totalPages}</span>
      <Link
        href={href(page + 1)}
        aria-disabled={nextDisabled}
        className={`flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-800 hover:bg-surface ${nextDisabled ? "pointer-events-none opacity-40" : ""}`}
      >
        Sonraki <Icon name="arrowRight" className="size-4" />
      </Link>
    </div>
  );
}
