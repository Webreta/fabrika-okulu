import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { fmtMoney } from "@/lib/format";

export default async function BankTransferPage({ searchParams }: { searchParams: Promise<{ siparis?: string }> }) {
  const { siparis } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris");
  const [o] = await db.select().from(orders).where(and(eq(orders.id, Number(siparis)), eq(orders.userId, user.id))).limit(1);
  if (!o) redirect("/panel");
  const payment = await getSetting("payment");
  return (
    <section className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold text-navy-800">Siparişin alındı</h1>
      <p className="mt-2 text-muted">Sipariş #{o.id} · Tutar: <b className="text-navy-800">{fmtMoney(o.total)}</b></p>
      <div className="card mt-6">
        <h2 className="font-bold text-navy-800">Havale / EFT bilgileri</h2>
        <p className="mt-2 whitespace-pre-line text-sm">{payment.bankInfo || "Ödeme bilgileri için bizimle iletişime geçin."}</p>
        <p className="mt-3 text-sm text-muted">Açıklama kısmına <b>Sipariş #{o.id}</b> yazmayı unutma. Ödemen onaylandığında programa erişimin açılır ve e-posta ile bilgilendirilirsin.</p>
      </div>
      <Link href="/panel/siparis" className="btn-primary mt-6">Siparişlerim</Link>
    </section>
  );
}
