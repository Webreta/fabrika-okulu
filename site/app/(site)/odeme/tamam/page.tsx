import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtMoney } from "@/lib/format";
import { toId } from "@/lib/ids";
import { PENDING_ORDER_DAYS } from "@/lib/orders";
import { Icon } from "@/components/site/Icon";
import { OrderPendingRefresh } from "@/components/site/OrderPendingRefresh";

export const metadata: Metadata = { title: "Sipariş", robots: { index: false } };

// Sipariş sonucu: metin ve düğmeler siparişin GERÇEK durumuna göre gelir (ödenmemiş siparişte "kaydın tamamlandı" denmez).
// Siparişi yalnızca sahibi ve yönetici görebilir.
export default async function OrderDonePage({ searchParams }: { searchParams: Promise<{ siparis?: string }> }) {
  const { siparis } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris");
  const id = toId(siparis);
  if (!id) redirect("/panel/siparis");
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o || (o.userId !== user.id && user.role !== "admin")) redirect("/panel/siparis");

  const paid = o.status === "paid";
  const waiting = o.status === "pending";
  const head = paid
    ? { title: "Kaydın tamamlandı!", tone: "bg-emerald-100 text-emerald-600", icon: "check" as const }
    : waiting
      ? { title: o.provider === "manual" ? "Siparişin alındı, ödeme bekleniyor" : "Ödemen henüz tamamlanmadı", tone: "bg-amber-100 text-amber-600", icon: "clock" as const }
      : o.status === "refunded"
        ? { title: "Bu siparişin ücreti iade edildi", tone: "bg-surface text-muted", icon: "cart" as const }
        : o.status === "cancelled"
          ? { title: "Bu sipariş iptal edildi", tone: "bg-surface text-muted", icon: "x" as const }
          : { title: "Ödeme tamamlanamadı", tone: "bg-red-100 text-red-600", icon: "x" as const };
  const note = paid
    ? null
    : waiting
      ? o.provider === "manual"
        ? `Havale / EFT ödemen onaylandığında programa erişimin açılır ve e-posta ile bilgilendirilirsin. Sipariş ${PENDING_ORDER_DAYS} gün boyunca senin için ayrılır.`
        : "Kart ödemesinin onayı birkaç saniye içinde gelir; bu sayfa kendini yeniler. Onay gelmezse sepetine dönüp ödemeyi yeniden başlatabilirsin."
      : o.status === "refunded"
        ? "Bu siparişteki programlara erişim kapalıdır. Sorun varsa bizimle iletişime geçebilirsin."
        : o.status === "cancelled"
          ? "Bu sipariş geçerli değil. Dilersen programı yeniden sepetine ekleyebilirsin."
          : "Kartından ücret çekilmedi. Tekrar deneyebilir ya da bizimle iletişime geçebilirsin.";

  return (
    <section className="mx-auto max-w-2xl px-4 py-16 text-center">
      <OrderPendingRefresh pending={waiting && o.provider !== "manual"} paid={paid && (o.provider === "paytr" || o.provider === "iyzico")} />
      <div className={`mx-auto flex size-16 items-center justify-center rounded-full ${head.tone}`}><Icon name={head.icon} className="size-8" /></div>
      <h1 className="mt-4 text-3xl font-bold text-navy-800">{head.title}</h1>
      <p className="mt-2 text-muted">Sipariş #{o.id} · {fmtMoney(o.total)}</p>
      {note && <p className="mx-auto mt-3 max-w-xl text-sm text-muted">{note}</p>}
      <ul className="mt-6 space-y-2 text-left">
        {o.items.map((i) => (
          <li key={i.courseId} className="card flex items-center justify-between gap-3">
            <span className="min-w-0 break-words font-semibold text-navy-800">{i.title}{i.periodName ? <span className="block text-xs font-normal text-muted">{i.periodName}</span> : null}</span>
            {paid ? <Link href={`/kurs-izle/${i.courseId}`} className="btn-sky btn-sm shrink-0">Programa başla</Link> : <span className="shrink-0 text-xs font-semibold text-muted">{waiting ? "Ödeme bekleniyor" : "Erişim yok"}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {paid && <Link href="/panel" className="btn-primary">Çalışma Odam</Link>}
        {waiting && o.provider === "manual" && <Link href={`/odeme/havale?siparis=${o.id}`} className="btn-primary">Havale / EFT bilgileri</Link>}
        {waiting && o.provider !== "manual" && <Link href="/sepet" className="btn-primary">Sepete dön</Link>}
        {!paid && !waiting && <Link href="/kesfet" className="btn-primary">Programları keşfet</Link>}
        {!paid && <Link href="/panel/siparis" className="btn-secondary">Siparişlerim</Link>}
        {!paid && !waiting && <Link href="/iletisim" className="btn-secondary">İletişim</Link>}
      </div>
    </section>
  );
}
