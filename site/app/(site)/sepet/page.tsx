import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { cartTotals, removeFromCart, applyCoupon } from "@/app/actions/cart";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

export const metadata: Metadata = { title: "Sepet" };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  const { hata } = await searchParams;
  const user = await getCurrentUser();
  const t = await cartTotals(user?.id);

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-navy-800">Sepet</h1>
      {hata === "odeme" && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">Ödeme tamamlanamadı. Tekrar deneyebilirsin.</p>}
      {t.lines.length === 0 ? (
        <div className="card mt-8 text-center">
          <p className="text-muted">Sepetinizde ürün bulunmuyor.</p>
          <Link href="/kesfet" className="btn-primary mt-4">Mağazaya geri dön</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {t.lines.map((l) => (
              <div key={l.courseId} className="card flex items-center gap-4">
                <div className="h-16 w-40 shrink-0 overflow-hidden rounded-lg bg-navy-50">
                  {l.imageUrl && <Image src={l.imageUrl} alt="" width={200} height={80} className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1">
                  <Link href={`/program/${l.slug}`} className="font-semibold text-navy-800 hover:text-sky-600">{l.title}</Link>
                  {l.periodName && <p className="text-sm text-muted">Dönem: {l.periodName}</p>}
                  {l.personalPercent > 0 && <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Sana özel %{l.personalPercent} indirim</span>}
                </div>
                <span className="text-right">
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
              <input name="code" placeholder="Kupon kodu" defaultValue={t.coupon?.code ?? ""} className="input uppercase" />
              <button className="btn-secondary">Uygula</button>
            </form>
            {t.couponError && <p className="text-sm text-red-600">{t.couponError}</p>}
            {t.coupon && <p className="text-sm text-emerald-600">%{t.coupon.percent} indirim uygulandı ({t.coupon.code})</p>}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Ara toplam</dt><dd>{fmtMoney(t.subtotal)}</dd></div>
              {t.discount > 0 && <div className="flex justify-between text-emerald-600"><dt>İndirim</dt><dd>-{fmtMoney(t.discount)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-navy-800"><dt>Toplam</dt><dd>{fmtMoney(t.total)}</dd></div>
            </dl>
            <Link href={user ? "/odeme" : "/panel/giris?r=/odeme"} className="btn-primary w-full py-3">Ödemeye geç</Link>
            <Image src="/img/site/odeme.png" alt="Visa, Mastercard, iyzico" width={513} height={73} className="mx-auto h-6 w-auto opacity-80" />
          </aside>
        </div>
      )}
    </section>
  );
}
