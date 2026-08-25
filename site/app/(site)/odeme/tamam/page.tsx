import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

export default async function OrderDonePage({ searchParams }: { searchParams: Promise<{ siparis?: string }> }) {
  const { siparis } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris");
  const [o] = await db.select().from(orders).where(and(eq(orders.id, Number(siparis)), eq(orders.userId, user.id))).limit(1);
  if (!o) redirect("/panel");
  return (
    <section className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" className="size-8" /></div>
      <h1 className="mt-4 text-3xl font-bold text-navy-800">Kaydın tamamlandı!</h1>
      <p className="mt-2 text-muted">Sipariş #{o.id} · {fmtMoney(o.total)}</p>
      <ul className="mt-6 space-y-2 text-left">
        {o.items.map((i) => (
          <li key={i.courseId} className="card flex items-center justify-between">
            <span className="font-semibold text-navy-800">{i.title}{i.periodName ? <span className="block text-xs text-muted">{i.periodName}</span> : null}</span>
            <Link href={`/kurs-izle/${i.courseId}`} className="btn-sky btn-sm">Programa başla</Link>
          </li>
        ))}
      </ul>
      <Link href="/panel" className="btn-primary mt-8">Çalışma Odam</Link>
    </section>
  );
}
