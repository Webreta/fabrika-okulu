"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { startCheckout, type CheckoutState } from "@/app/actions/cart";

export function CheckoutForm({ defaults, mode, bankInfo }: { defaults: { name: string; phone: string }; mode: "free" | "manual" | "iyzico"; bankInfo: string }) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
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
      <h2 className="font-bold text-navy-800">Fatura bilgileri</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Ad Soyad</label><input name="name" required defaultValue={defaults.name} className="input" /></div>
        <div><label className="label">Telefon</label><input name="phone" defaultValue={defaults.phone} className="input" placeholder="05xx xxx xx xx" /></div>
        <div><label className="label">Şehir</label><input name="city" className="input" /></div>
        <div><label className="label">TC Kimlik No <span className="text-muted">(fatura için)</span></label><input name="identityNumber" className="input" maxLength={11} /></div>
        <div className="sm:col-span-2"><label className="label">Adres</label><textarea name="address" rows={2} className="input" /></div>
      </div>
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
