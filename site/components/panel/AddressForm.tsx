"use client";

import { useActionState, useState } from "react";
import { saveAddresses } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/auth";
import { ADDRESS_FIELDS, type Address } from "@/lib/address";

/** Tek adres bloğu; alan adları `${prefix}alan` (billing_ / shipping_) */
export function AddressFields({ prefix, value, onChange, disabled = false, required = false }: { prefix: "billing_" | "shipping_"; value: Address; onChange?: (v: Address) => void; disabled?: boolean; required?: boolean }) {
  // onChange verilirse kontrollü (aynala için), verilmezse defaultValue ile serbest form
  const props = (k: keyof Address) => (onChange ? { value: value[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value }) } : { defaultValue: value[k] });
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      {ADDRESS_FIELDS.map((f) => (
        <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
          <label className="label">{f.label}{f.hint && <span className="text-muted"> ({f.hint})</span>}</label>
          {f.wide ? (
            <textarea name={`${prefix}${f.key}`} rows={2} {...props(f.key)} readOnly={disabled} required={required && f.key === "address"} className="input" />
          ) : (
            <input name={`${prefix}${f.key}`} {...props(f.key)} readOnly={disabled} maxLength={f.maxLength} required={required && f.key === "name"} className="input" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Tercihler → Adreslerim: fatura ve gönderim adresi yan yana, tek kaydet */
export function AddressesForm({ billing, shipping, shippingSame }: { billing: Address; shipping: Address; shippingSame: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAddresses, {});
  const [same, setSame] = useState(shippingSame);
  const [bill, setBill] = useState<Address>(billing);
  const [ship, setShip] = useState<Address>(shipping);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 font-bold text-navy-800">Fatura adresim</h3>
          <AddressFields prefix="billing_" value={bill} onChange={setBill} />
        </div>
        <div className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-navy-800">Gönderim adresim</h3>
            <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="shipping_same" checked={same} onChange={(e) => setSame(e.target.checked)} /> Fatura adresiyle aynı</label>
          </div>
          {/* "Aynı" seçiliyken fatura adresi anlık olarak buraya yansır */}
          <AddressFields prefix="shipping_" value={same ? bill : ship} onChange={same ? () => {} : setShip} disabled={same} />
        </div>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button disabled={pending} className="btn-primary">{pending ? "Kaydediliyor…" : "Adresleri kaydet"}</button>
    </form>
  );
}
