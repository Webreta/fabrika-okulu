import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { fmtMoney } from "@/lib/format";
import { PENDING_ORDER_DAYS } from "@/lib/orders";
import { toId } from "@/lib/ids";

export default async function BankTransferPage({ searchParams }: { searchParams: Promise<{ siparis?: string }> }) {
  const { siparis } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris");
  const id = toId(siparis);
  if (!id) redirect("/panel/siparis");
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  // Siparişi yalnızca sahibi ve yönetici görebilir
  if (!o || (o.userId !== user.id && user.role !== "admin")) redirect("/panel/siparis");
  // Ödeme bilgisi yalnızca bekleyen havale siparişinde gösterilir; diğer durumlarda sipariş sonucu sayfası
  if (o.status !== "pending" || o.provider !== "manual") redirect(`/odeme/tamam?siparis=${o.id}`);
  const payment = await getSetting("payment");
  return (
    <section className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold text-navy-800">Siparişin alındı</h1>
      <p className="mt-2 text-muted">Sipariş #{o.id} · Tutar: <b className="text-navy-800">{fmtMoney(o.total)}</b></p>
      <div className="card mt-6">
        <h2 className="font-bold text-navy-800">Havale / EFT bilgileri</h2>
        <p className="mt-2 whitespace-pre-line text-sm">{payment.bankInfo || "Ödeme bilgileri için bizimle iletişime geçin."}</p>
        <p className="mt-3 text-sm text-muted">Açıklama kısmına <b>Sipariş #{o.id}</b> yazmayı unutma. Ödemen onaylandığında programa erişimin açılır ve e-posta ile bilgilendirilirsin.</p>
        <p className="mt-2 text-sm text-muted">Siparişin {PENDING_ORDER_DAYS} gün boyunca senin için ayrılır; bu sürede ödeme alınmazsa sipariş kendiliğinden iptal olur.</p>
      </div>
      <Link href="/panel/siparis" className="btn-primary mt-6">Siparişlerim</Link>
    </section>
  );
}
