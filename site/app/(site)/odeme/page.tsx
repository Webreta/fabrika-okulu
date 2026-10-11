import type { Metadata } from "next";
import { ScrollToTop } from "@/components/site/ScrollToTop";
import { CheckoutHeader, CheckoutTrust } from "@/components/site/CheckoutSteps";
import Link from "next/link";
import Image from "next/image";
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
  const mode = await resolvePaymentMode(payment, t.total);

  return (
    <section className="mx-auto max-w-5xl px-3 py-8 sm:px-4 sm:py-12">
      <ScrollToTop />
      <CheckoutHeader step={2} title="Ödeme" sub={mode === "free" ? "Ücretsiz kayıt; bilgilerini onayla" : mode === "manual" ? "Havale / EFT ile ödeme" : "Kart ile güvenli ödeme"} />
      <div className="mt-6 grid grid-cols-1 gap-5 sm:mt-8 lg:grid-cols-[1fr_360px] lg:gap-8">
        <CheckoutForm defaults={{ billing: normalizeAddress({ name: user.name, ...user.addresses.billing }), shipping: normalizeAddress(user.addresses.shipping), shippingSame: !isAddressFilled(user.addresses.shipping) || JSON.stringify(normalizeAddress(user.addresses.shipping)) === JSON.stringify(normalizeAddress(user.addresses.billing)) }} mode={mode} bankInfo={payment.bankInfo} />
        {/* Telefonda özet formun üstünde (ne ödediğini önce görsün); masaüstünde sağda yapışkan */}
        <aside className="order-first h-fit overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-30px_rgba(20,43,86,.55)] ring-1 ring-line lg:order-none lg:sticky lg:top-[132px]">
          <div className="flex items-center justify-between bg-gradient-to-r from-navy-900 to-navy-700 px-5 py-3 text-white">
            <h2 className="text-sm font-bold">Sipariş özeti</h2>
            <Link href="/sepet" className="text-xs font-semibold text-sky-200 hover:text-white">Sepeti düzenle</Link>
          </div>
          <div className="p-4 sm:p-5">
          <ul className="space-y-3 text-sm">
            {t.lines.map((l) => (
              <li key={l.courseId} className="flex items-start justify-between gap-3">
                {l.imageUrl && <Image src={l.imageUrl} alt="" width={96} height={54} className="aspect-video w-14 shrink-0 rounded-lg object-cover" />}
                <span className="min-w-0 flex-1 font-medium text-navy-800">{l.title}{l.periodName ? <span className="block text-xs text-muted">{l.periodName}</span> : null}{l.opensAt ? <span className="block text-xs font-semibold text-violet-700">Erken kayıt · {fmtDay(l.opensAt, true)} tarihinde aktifleşecek</span> : null}</span>
                <span className="shrink-0 font-semibold text-navy-800">{fmtMoney(l.price)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {t.discount > 0 && <div className="flex justify-between text-emerald-600"><dt>İndirim ({t.coupon?.code})</dt><dd>-{fmtMoney(t.discount)}</dd></div>}
            <div className="flex items-baseline justify-between font-bold text-navy-800"><dt>Toplam</dt><dd className="text-2xl">{fmtMoney(t.total)}</dd></div>
          </dl>
          <div className="mt-4 hidden border-t border-line pt-4 lg:block"><CheckoutTrust /></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
