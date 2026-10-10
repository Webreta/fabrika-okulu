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

export const metadata: Metadata = { title: "Sepet" };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  const { hata } = await searchParams;
  const user = await getCurrentUser();
  const t = await cartTotals(user?.id);

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-navy-800">Sepet</h1>
      {/* Satın alınmış (erişimi olan) eğitim sepette kalmaz: sonuç sayfasına uğramadan gelen öğrencide burada düşer */}
      <CartAutoPrune active={!!user && t.lines.some((l) => l.blockCode === "kayitli")} />
      {hata === "odeme" && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">Ödeme tamamlanamadı. Tekrar deneyebilirsin.</p>}
      {hata === "satir" && t.blocked && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">Sepetindeki bir eğitim şu an satın alınamıyor. Nedeni aşağıda yazıyor; o eğitimi sepetten çıkarınca ödemeye geçebilirsin.</p>}
      {t.lines.length === 0 ? (
        <div className="card mt-8 text-center">
          <p className="text-muted">Sepetinizde ürün bulunmuyor.</p>
          <Link href="/kesfet" className="btn-primary mt-4">Mağazaya geri dön</Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {t.lines.map((l) => (
              <div key={l.courseId} className="card flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Telefonda görsel küçülür; fiyat ve kaldır düğmesi alt satıra iner (satır ekrandan taşmaz) */}
                <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-navy-50 sm:w-40">
                  {l.imageUrl && <Image src={l.imageUrl} alt="" width={200} height={112} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-[55%] flex-1 break-words sm:min-w-0">
                  <Link href={`/program/${l.slug}`} className="font-semibold text-navy-800 hover:text-sky-600">{l.title}</Link>
                  {l.periodName && <p className="text-sm text-muted">Dönem: {l.periodName}</p>}
                  {l.opensAt && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-violet-700"><Icon name="clock" className="size-3.5" /> Erken kayıt · eğitim {fmtDay(l.opensAt, true)} tarihinde aktifleşecek</p>}
                  {l.blockError && <p className="mt-1 text-xs font-semibold text-red-600">{l.blockError} {l.blockCode === "kayitli" ? <Link href={`/kurs-izle/${l.courseId}`} className="underline underline-offset-2">Eğitime git →</Link> : l.blockCode === "yakinda" || l.blockCode === "kapali" ? null : <Link href={`/program/${l.slug}`} className="underline underline-offset-2">Program sayfasından yeniden seç →</Link>}</p>}
                  {l.prereqError && <p className="mt-1 text-xs font-semibold text-red-600">{l.prereqError}{l.surveyGate && <> <Link href={`/panel/anket/${l.surveyGate.id}?donus=${encodeURIComponent("/sepet")}`} className="underline underline-offset-2">Testi doldur →</Link></>}</p>}
                  {l.personalPercent > 0 && <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Sana özel %{l.personalPercent} indirim</span>}
                </div>
                <span className="ml-auto text-right">
                  {l.personalPercent > 0 && <span className="block text-xs text-muted line-through">{fmtMoney(l.listPrice)}</span>}
                  <span className="font-bold text-navy-800">{fmtMoney(l.price)}</span>
                </span>
                <form action={removeFromCart}>
                  <input type="hidden" name="courseId" value={l.courseId} />
                  <button className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Kaldır"><Icon name="trash" className="size-5" /></button>
                </form>
              </div>
            ))}
          </div>
          <aside className="card h-fit space-y-4">
            <form action={applyCoupon} className="flex gap-2">
              <input aria-label="Kupon kodu" name="code" placeholder="Kupon kodu" defaultValue={t.coupon?.code ?? ""} className="input uppercase" />
              <button className="btn-secondary">Uygula</button>
            </form>
            {t.couponError && <p className="text-sm text-red-600">{t.couponError}</p>}
            {t.coupon && <p className="text-sm text-emerald-600">{couponLabel(t.coupon)} uygulandı ({t.coupon.code})</p>}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Ara toplam</dt><dd>{fmtMoney(t.subtotal)}</dd></div>
              {t.discount > 0 && <div className="flex justify-between text-emerald-600"><dt>İndirim</dt><dd>-{fmtMoney(t.discount)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-navy-800"><dt>Toplam</dt><dd>{fmtMoney(t.total)}</dd></div>
            </dl>
            {t.blocked ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">Satın alınamayan eğitim var; ödemeye geçmeden önce sepetten çıkar.</p>
            ) : (
              <Link href={user ? "/odeme" : "/panel/giris?r=/odeme"} className="btn-primary w-full py-3">Ödemeye geç</Link>
            )}
            <Image src="/img/site/odeme.png" alt="Visa, Mastercard, iyzico" width={513} height={73} className="mx-auto h-6 w-auto opacity-80" />
          </aside>
        </div>
      )}
    </section>
  );
}
