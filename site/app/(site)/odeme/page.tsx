import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { cartTotals } from "@/lib/cart-totals";
import { getSetting } from "@/lib/settings";
import { resolvePaymentMode } from "@/lib/payment";
import { fmtMoney, fmtDay } from "@/lib/format";
import { CheckoutForm } from "./CheckoutForm";
import { normalizeAddress, isAddressFilled } from "@/lib/address";

export const metadata: Metadata = { title: "Ödeme" };

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris?r=/odeme");
  const t = await cartTotals(user.id);
  if (t.lines.length === 0) redirect("/sepet");
  // Satın alınamayan satır varsa (dönem doldu/kapandı, eğitim satıştan kalktı…) neden sepette satırın altında yazar
  if (t.blocked) redirect("/sepet?hata=satir");
  const payment = await getSetting("payment");
  const mode = resolvePaymentMode(payment, t.total);

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-navy-800">Ödeme</h1>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        <CheckoutForm defaults={{ billing: normalizeAddress({ name: user.name, ...user.addresses.billing }), shipping: normalizeAddress(user.addresses.shipping), shippingSame: !isAddressFilled(user.addresses.shipping) || JSON.stringify(normalizeAddress(user.addresses.shipping)) === JSON.stringify(normalizeAddress(user.addresses.billing)) }} mode={mode} bankInfo={payment.bankInfo} />
        <aside className="card h-fit">
          <h2 className="font-bold text-navy-800">Sipariş özeti</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {t.lines.map((l) => (
              <li key={l.courseId} className="flex justify-between gap-3">
                <span>{l.title}{l.periodName ? <span className="block text-xs text-muted">{l.periodName}</span> : null}{l.opensAt ? <span className="block text-xs font-semibold text-violet-700">Erken kayıt · {fmtDay(l.opensAt, true)} tarihinde aktifleşecek</span> : null}</span>
                <span className="shrink-0 font-semibold">{fmtMoney(l.price)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {t.discount > 0 && <div className="flex justify-between text-emerald-600"><dt>İndirim ({t.coupon?.code})</dt><dd>-{fmtMoney(t.discount)}</dd></div>}
            <div className="flex justify-between text-base font-bold text-navy-800"><dt>Toplam</dt><dd>{fmtMoney(t.total)}</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
