"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Address } from "@/lib/address";
import { AddressFields } from "@/components/panel/AddressForm";
import Link from "next/link";
import { startCheckout, type CheckoutState } from "@/app/actions/cart";

export function CheckoutForm({ defaults, mode, bankInfo }: { defaults: { billing: Address; shipping: Address; shippingSame: boolean }; mode: "free" | "manual" | "iyzico"; bankInfo: string }) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [same, setSame] = useState(defaults.shippingSame);
  const holder = useRef<HTMLDivElement>(null);

  // iyzico checkoutFormContent bir <script> içerir; innerHTML ile eklenen script çalışmaz — elle çalıştırıyoruz.
  useEffect(() => {
    if (!state.formHtml || !holder.current) return;
    holder.current.innerHTML = state.formHtml;
    const scripts = holder.current.querySelectorAll("script");
    scripts.forEach((s) => {
      const n = document.createElement("script");
      if (s.src) n.src = s.src;
      else n.textContent = s.textContent;
      document.body.appendChild(n);
    });
  }, [state.formHtml]);

  if (state.formHtml) {
    return (
      <div className="card">
        <h2 className="mb-3 font-bold text-navy-800">Kart bilgileri</h2>
        <div id="iyzipay-checkout-form" className="responsive" ref={holder} />
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-navy-800">Fatura bilgileri</h2>
        <span className="text-xs text-muted">Kayıtlı adresin ön tanımlı geldi; değişiklikler hesabına kaydedilir.</span>
      </div>
      <AddressFields prefix="billing_" value={defaults.billing} required />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <h2 className="font-bold text-navy-800">Gönderim adresi</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="shipping_same" checked={same} onChange={(e) => setSame(e.target.checked)} /> Fatura adresiyle aynı</label>
      </div>
      {!same && <AddressFields prefix="shipping_" value={defaults.shipping} />}
      {mode === "manual" && (
        <div className="rounded-lg bg-sky-50 p-4 text-sm text-navy-800">
          <p className="font-semibold">Havale / EFT ile ödeme</p>
          <p className="mt-1 whitespace-pre-line text-muted">{bankInfo || "Sipariş oluşturduktan sonra ödeme bilgileri gösterilecek. Ödemeniz onaylanınca programa erişiminiz açılır."}</p>
        </div>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="sozlesme" className="mt-1" />
        <span>
          <Link href="/mesafeli-satis-sozlesmesi" target="_blank" className="text-sky-600 underline">Mesafeli Satış Sözleşmesi</Link>&apos;ni ve{" "}
          <Link href="/teslimat-ve-iade-sartlari" target="_blank" className="text-sky-600 underline">Teslimat ve İade Şartları</Link>&apos;nı okudum, onaylıyorum.
        </span>
      </label>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full py-3">
        {pending ? "İşleniyor…" : mode === "free" ? "Ücretsiz kaydı tamamla" : mode === "manual" ? "Siparişi oluştur" : "Kart ile öde"}
      </button>
    </form>
  );
}
