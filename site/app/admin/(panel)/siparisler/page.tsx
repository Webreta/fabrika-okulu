import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { fmtDateTime, fmtMoney, ORDER_STATUS } from "@/lib/format";
import { PageTitle, Chip, Tabs, Kpi } from "@/components/panel/ui";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { durum } = await searchParams;
  const list = await db
    .select({ o: orders, u: users })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(durum ? eq(orders.status, durum as "paid") : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(300);
  const [sum] = await db.select({ t: sql<string>`coalesce(sum(${orders.total}),0)`, n: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(eq(orders.status, "paid"));
  return (
    <>
      <PageTitle title="Siparişler" />
      <div className="mb-5 grid grid-cols-3 gap-4"><Kpi label="Ödenen sipariş" value={sum.n} icon="cart" color="green" /><Kpi label="Toplam ciro" value={fmtMoney(sum.t)} icon="chart" color="sky" /><Kpi label="Bu listede" value={list.length} icon="list" /></div>
      <Tabs items={[{ href: "/admin/siparisler", label: "Tümü", active: !durum }, ...Object.entries(ORDER_STATUS).map(([k, v]) => ({ href: `/admin/siparisler?durum=${k}`, label: v.label, active: durum === k }))]} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>#</th><th>Müşteri</th><th>Ürünler</th><th>Tutar</th><th>Ödeme</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted">Sipariş yok.</td></tr>}
            {list.map(({ o, u }) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">#{o.id}</td>
                <td><p className="font-semibold text-navy-800">{u.firstName} {u.lastName}</p><p className="text-xs text-muted">{u.email}</p></td>
                <td className="text-sm">{o.items.map((i) => <span key={i.courseId} className="block">{i.title}{i.periodName && <span className="text-xs text-muted"> · {i.periodName}</span>}</span>)}</td>
                <td className="font-semibold">{fmtMoney(o.total)}{Number(o.discount) > 0 && <span className="block text-xs text-emerald-600">-{fmtMoney(o.discount)} {o.couponCode}</span>}</td>
                <td className="text-xs">{o.provider}</td>
                <td><Chip color={ORDER_STATUS[o.status]?.color ?? "gray"}>{ORDER_STATUS[o.status]?.label ?? o.status}</Chip></td>
                <td className="text-xs">{fmtDateTime(o.createdAt)}</td>
                <td><Link href={`/admin/siparisler/${o.id}`} className="btn-secondary btn-sm">Detay</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
