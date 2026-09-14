import { fmtMoney } from "@/lib/format";

/** Kupon indirim etiketi: sabit tutar varsa "500,00 ₺ indirim", yoksa "%20 indirim" (istemci + sunucu) */
export function couponLabel(c: { percent: number; amount?: number | string | null }) {
  const amt = Number(c.amount ?? 0);
  return amt > 0 ? `${fmtMoney(amt)} indirim` : `%${c.percent} indirim`;
}

/** Kısa biçim (tablolar): "500,00 ₺" ya da "%20" */
export function couponValue(c: { percent: number; amount?: number | string | null }) {
  const amt = Number(c.amount ?? 0);
  return amt > 0 ? fmtMoney(amt) : `%${c.percent}`;
}
