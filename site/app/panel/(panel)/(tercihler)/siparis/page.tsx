import { getCurrentUser } from "@/lib/auth/session";
import { studentOrders } from "@/lib/data/student";
import { fmtDate, fmtMoney, ORDER_STATUS } from "@/lib/format";
import { Empty, Chip } from "@/components/panel/ui";

export default async function OrdersPage() {
  const user = (await getCurrentUser())!;
  const list = await studentOrders(user.id);
  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-navy-800">Satınalma Geçmişim</h2>
      {list.length === 0 ? (
        <Empty text="Henüz siparişin yok." />
      ) : (
        <div className="space-y-3">
          {list.map((o) => (
            <div key={o.id} className="card flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-800">{o.items.map((i) => i.title).join(", ")}</p>
                <p className="text-xs text-muted">#{o.id} · <span className="date-chip">{fmtDate(o.createdAt)}</span>{o.items.some((i) => i.periodName) && ` · ${o.items.map((i) => i.periodName).filter(Boolean).join(", ")}`}</p>
              </div>
              {/* Ödenmiş sipariş zaten listede; yalnızca bekleyen/başarısız/iptal gibi durumlar etiketlenir */}
              {o.status !== "paid" && <Chip color={ORDER_STATUS[o.status]?.color ?? "gray"}>{ORDER_STATUS[o.status]?.label ?? o.status}</Chip>}
              <span className="font-bold text-navy-800">{fmtMoney(o.total)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
