import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, users, periods } from "@/db/schema";
import { fmtDateTime, fmtMoney, ORDER_STATUS } from "@/lib/format";
import { PageTitle, Chip } from "@/components/panel/ui";
import { StatusButtons, PeriodSelect } from "@/components/admin/OrderActions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select({ o: orders, u: users }).from(orders).innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, Number(id))).limit(1);
  if (!row) notFound();
  const { o, u } = row;
  const courseIds = o.items.map((i) => i.courseId);
  const ps = courseIds.length ? await db.select().from(periods).where(inArray(periods.courseId, courseIds)) : [];
  return (
    <>
      <PageTitle title={`Sipariş #${o.id}`} sub={fmtDateTime(o.createdAt)} action={<Link href="/admin/siparisler" className="btn-secondary btn-sm">← Siparişler</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 font-bold text-navy-800">Kalemler</h2>
            <table className="table">
              <thead><tr><th>Eğitim</th><th>Dönem</th><th>Fiyat</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.courseId}>
                    <td className="font-semibold text-navy-800">{i.title}</td>
                    <td><PeriodSelect orderId={o.id} courseId={i.courseId} current={i.periodId ?? null} periods={ps.filter((p) => p.courseId === i.courseId).map((p) => ({ id: p.id, name: p.name }))} /></td>
                    <td>{fmtMoney(i.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt>Ara toplam</dt><dd>{fmtMoney(o.subtotal)}</dd></div>
              {Number(o.discount) > 0 && <div className="flex justify-between text-emerald-600"><dt>İndirim ({o.couponCode})</dt><dd>-{fmtMoney(o.discount)}</dd></div>}
              <div className="flex justify-between text-base font-bold text-navy-800"><dt>Toplam</dt><dd>{fmtMoney(o.total)}</dd></div>
            </dl>
          </div>
          <div className="card text-sm">
            <h2 className="mb-2 font-bold text-navy-800">Fatura bilgileri</h2>
            {o.billing ? <p className="whitespace-pre-line">{o.billing.name}{o.billing.phone && `\n${o.billing.phone}`}{o.billing.identityNumber && `\nTC: ${o.billing.identityNumber}`}{o.billing.address && `\n${o.billing.address}`}{o.billing.city && ` / ${o.billing.city}`}</p> : <p className="text-muted">—</p>}
            {o.note && <p className="mt-2 text-xs text-muted">Not: {o.note}</p>}
            {o.providerPaymentId && <p className="mt-2 text-xs text-muted">iyzico ödeme no: {o.providerPaymentId}</p>}
          </div>
        </div>
        <aside className="space-y-4">
          <div className="card">
            <p className="text-xs text-muted">Durum</p>
            <p className="mt-1"><Chip color={ORDER_STATUS[o.status]?.color ?? "gray"}>{ORDER_STATUS[o.status]?.label ?? o.status}</Chip> <span className="text-xs text-muted">· {o.provider}</span></p>
            {o.paidAt && <p className="mt-1 text-xs text-muted">Ödeme: <span className="date-chip">{fmtDateTime(o.paidAt)}</span></p>}
            <StatusButtons orderId={o.id} status={o.status} />
          </div>
          <div className="card text-sm">
            <p className="font-semibold text-navy-800">{u.firstName} {u.lastName}</p>
            <p className="text-muted">{u.email}{u.phone && ` · ${u.phone}`}</p>
            <Link href={`/admin/ogrenciler?detail=${u.id}`} className="btn-secondary btn-sm mt-3">Öğrenci kaydı</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
