import { getCurrentUser } from "@/lib/auth/session";
import { studentOrders } from "@/lib/data/student";
import { fmtDate, fmtMoney, ORDER_STATUS } from "@/lib/format";
import { PageTitle, Empty, Chip, Kpi } from "@/components/panel/ui";

export default async function OrdersPage() {
  const user = (await getCurrentUser())!;
  const list = await studentOrders(user.id);
  const paid = list.filter((o) => o.status === "paid");
  return (
    <>
      <PageTitle title="Satınalma Geçmişim" />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Kpi label="Sipariş" value={list.length} icon="cart" />
        <Kpi label="Tamamlanan" value={paid.length} icon="check" color="green" />
        <Kpi label="Eğitim" value={paid.reduce((s, o) => s + o.items.length, 0)} icon="book" color="sky" />
      </div>
      {list.length === 0 ? (
        <Empty text="Henüz siparişin yok." />
      ) : (
        <div className="space-y-3">
          {list.map((o) => (
            <div key={o.id} className="card flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-800">{o.items.map((i) => i.title).join(", ")}</p>
                <p className="text-xs text-muted">#{o.id} · {fmtDate(o.createdAt)}{o.items.some((i) => i.periodName) && ` · ${o.items.map((i) => i.periodName).filter(Boolean).join(", ")}`}</p>
              </div>
              <Chip color={ORDER_STATUS[o.status]?.color ?? "gray"}>{ORDER_STATUS[o.status]?.label ?? o.status}</Chip>
              <span className="font-bold text-navy-800">{fmtMoney(o.total)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
