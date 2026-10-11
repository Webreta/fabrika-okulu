import { couponLabel } from "@/lib/coupon-label";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { removeFromCart, applyCoupon } from "@/app/actions/cart";
import { cartTotals } from "@/lib/cart-totals";
import { fmtMoney, fmtDay } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { CartAutoPrune } from "@/components/site/CartAutoPrune";
import { ScrollToTop } from "@/components/site/ScrollToTop";
import { CheckoutHeader, CheckoutTrust } from "@/components/site/CheckoutSteps";

export const metadata: Metadata = { title: "Sepet" };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  const { hata } = await searchParams;
  const user = await getCurrentUser();
  const t = await cartTotals(user?.id);

  return (
    <section className="mx-auto max-w-5xl px-3 py-8 sm:px-4 sm:py-12">
      <ScrollToTop />
      <CheckoutHeader step={1} title="Sepetim" sub={t.lines.length > 0 ? `${t.lines.length} eğitim · ödemeye geçmeden önce kontrol et` : undefined} />
      {/* Satın alınmış (erişimi olan) eğitim sepette kalmaz: sonuç sayfasına uğramadan gelen öğrencide burada düşer */}
      <CartAutoPrune active={!!user && t.lines.some((l) => l.blockCode === "kayitli")} />
      {hata === "odeme" && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">Ödeme tamamlanamadı. Tekrar deneyebilirsin.</p>}
      {hata === "satir" && t.blocked && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">Sepetindeki bir eğitim şu an satın alınamıyor. Nedeni aşağıda yazıyor; o eğitimi sepetten çıkarınca ödemeye geçebilirsin.</p>}
      {t.lines.length === 0 ? (
        <div className="mt-8 rounded-3xl bg-gradient-to-br from-white via-sky-50 to-navy-50 px-6 py-12 text-center ring-1 ring-line">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-white text-sky-600 shadow ring-1 ring-line"><Icon name="cart" className="size-8" /></span>
          <p className="mt-4 text-lg font-bold text-navy-800">Sepetin boş</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Sana uygun programı seç, kariyer yolculuğuna hemen başla.</p>
          <Link href="/kesfet" className="btn-primary mt-5">Programları keşfet <Icon name="arrowRight" className="size-4" /></Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:mt-8 lg:grid-cols-[1fr_360px] lg:gap-8">
          <div className="space-y-3">
            {t.lines.map((l) => (
              <div key={l.courseId} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white p-3 shadow-[0_10px_30px_-22px_rgba(20,43,86,.5)] ring-1 sm:p-4 ${l.blockError || l.prereqError ? "ring-red-200" : "ring-line"}`}>
                {/* Telefonda görsel küçülür; fiyat ve kaldır düğmesi alt satıra iner (satır ekrandan taşmaz) */}
                <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-xl bg-navy-50 sm:w-40">
                  {l.imageUrl && <Image src={l.imageUrl} alt="" width={200} height={112} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-[55%] flex-1 break-words sm:min-w-0">
                  <Link href={`/program/${l.slug}`} className="font-semibold text-navy-800 hover:text-sky-600">{l.title}</Link>
                  {l.periodName && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Icon name="calendar" className="size-3.5" /> {l.periodName}</p>}
                  {l.opensAt && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-violet-700"><Icon name="clock" className="size-3.5" /> Erken kayıt · eğitim {fmtDay(l.opensAt, true)} tarihinde aktifleşecek</p>}
                  {l.blockError && <p className="mt-1 text-xs font-semibold text-red-600">{l.blockError} {l.blockCode === "kayitli" ? <Link href={`/kurs-izle/${l.courseId}`} className="underline underline-offset-2">Eğitime git →</Link> : l.blockCode === "yakinda" || l.blockCode === "kapali" ? null : <Link href={`/program/${l.slug}`} className="underline underline-offset-2">Program sayfasından yeniden seç →</Link>}</p>}
                  {l.prereqError && <p className="mt-1 text-xs font-semibold text-red-600">{l.prereqError}{l.surveyGate && <> <Link href={`/panel/anket/${l.surveyGate.id}?donus=${encodeURIComponent("/sepet")}`} className="underline underline-offset-2">Testi doldur →</Link></>}</p>}
                  {l.personalPercent > 0 && <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Sana özel %{l.personalPercent} indirim</span>}
                </div>
                <span className="ml-auto text-right">
                  {l.personalPercent > 0 && <span className="block text-xs text-muted line-through">{fmtMoney(l.listPrice)}</span>}
                  <span className="text-lg font-bold text-navy-800">{fmtMoney(l.price)}</span>
                </span>
                <form action={removeFromCart}>
                  <input type="hidden" name="courseId" value={l.courseId} />
                  <button className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Kaldır"><Icon name="trash" className="size-5" /></button>
                </form>
              </div>
            ))}
          </div>
          <aside className="h-fit overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-30px_rgba(20,43,86,.55)] ring-1 ring-line lg:sticky lg:top-[132px]">
            <h2 className="bg-gradient-to-r from-navy-900 to-navy-700 px-5 py-3 text-sm font-bold text-white">Sipariş özeti</h2>
            <div className="space-y-4 p-4 sm:p-5">
            <form action={applyCoupon} className="flex gap-2">
              <input aria-label="Kupon kodu" name="code" placeholder="Kupon kodu" defaultValue={t.coupon?.code ?? ""} className="input uppercase" />
              <button className="btn-secondary">Uygula</button>
            </form>
            {t.couponError && <p className="text-sm text-red-600">{t.couponError}</p>}
            {t.coupon && <p className="text-sm text-emerald-600">{couponLabel(t.coupon)} uygulandı ({t.coupon.code})</p>}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Ara toplam</dt><dd>{fmtMoney(t.subtotal)}</dd></div>
              {t.discount > 0 && <div className="flex justify-between text-emerald-600"><dt>İndirim</dt><dd>-{fmtMoney(t.discount)}</dd></div>}
              <div className="flex items-baseline justify-between border-t border-line pt-3 font-bold text-navy-800"><dt>Toplam</dt><dd className="text-2xl">{fmtMoney(t.total)}</dd></div>
            </dl>
            {t.blocked ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">Satın alınamayan eğitim var; ödemeye geçmeden önce sepetten çıkar.</p>
            ) : (
              <Link href={user ? "/odeme" : "/panel/giris?r=/odeme"} className="btn-primary w-full py-3 text-base">Ödemeye geç <Icon name="arrowRight" className="size-4" /></Link>
            )}
            <CheckoutTrust />
            <Image src="/img/site/odeme.png" alt="Visa, Mastercard" width={513} height={73} className="mx-auto h-6 w-auto opacity-80" />
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
