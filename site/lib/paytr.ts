import "server-only";
import { createHmac } from "crypto";
import { getSetting } from "@/lib/settings";

/**
 * PayTR iFrame API — ham REST çağrısı (SDK yok).
 *  1) get-token: sipariş bilgileri + HMAC imzası → iframe token'ı (https://www.paytr.com/odeme/guvenli/<token>)
 *  2) Bildirim URL (PayTR mağaza panelinde tanımlanır): POST /api/odeme/paytr → imza doğrulanır, sipariş ödendi/başarısız olur,
 *     yanıt düz metin "OK" (aksi hâlde PayTR bildirimi yineler)
 * Mağaza bilgileri Yönetim → Ayarlar → Ödeme'den girilir (payment.paytrMerchantId / paytrKey / paytrSalt / paytrTestMode;
 * key ve salt gizli alandır, tarayıcıya gönderilmez). Panelde boşsa PAYTR_MERCHANT_ID / PAYTR_MERCHANT_KEY / PAYTR_MERCHANT_SALT /
 * PAYTR_TEST_MODE ortam değişkenleri kullanılır. Tutarlar PayTR'ye KURUŞ olarak gider (100,50 TL → 10050).
 */

const API_URL = "https://www.paytr.com/odeme/api/get-token";
export const PAYTR_IFRAME_BASE = "https://www.paytr.com/odeme/guvenli/";

export type PaytrConfig = { merchantId: string; key: string; salt: string; testMode: "0" | "1"; enabled: boolean; source: "panel" | "env" | "none" };

export async function paytrConfig(): Promise<PaytrConfig> {
  const s = await getSetting("payment");
  const fromPanel = { merchantId: (s.paytrMerchantId || "").trim(), key: (s.paytrKey || "").trim(), salt: (s.paytrSalt || "").trim() };
  if (fromPanel.merchantId && fromPanel.key && fromPanel.salt) return { ...fromPanel, testMode: s.paytrTestMode ? "1" : "0", enabled: true, source: "panel" };
  const merchantId = (process.env.PAYTR_MERCHANT_ID || "").trim();
  const key = (process.env.PAYTR_MERCHANT_KEY || "").trim();
  const salt = (process.env.PAYTR_MERCHANT_SALT || "").trim();
  const testMode = ["1", "true", "on"].includes((process.env.PAYTR_TEST_MODE || "").trim().toLowerCase()) ? "1" : "0";
  const enabled = !!(merchantId && key && salt);
  return { merchantId, key, salt, testMode, enabled, source: enabled ? "env" : "none" };
}

export async function paytrEnabled() {
  return (await paytrConfig()).enabled;
}

export async function paytrTestMode() {
  return (await paytrConfig()).testMode === "1";
}

/** TL → kuruş (tam sayı) */
export function toKurus(tl: number) {
  return Math.round(tl * 100);
}

/**
 * Sipariş numarası (merchant_oid): PayTR yalnızca harf/rakam kabul eder ve başarılı ödemede aynı numara ikinci kez kullanılamaz;
 * her ödeme denemesi için yeni üretilir ("FO<siparişId>T<zaman>"), siparişin providerToken alanında saklanır.
 */
export function newMerchantOid(orderId: number) {
  return `FO${orderId}T${Date.now().toString(36).toUpperCase()}`;
}

export function orderIdFromMerchantOid(oid: string): number | null {
  const m = /^FO(\d+)T[0-9A-Z]+$/.exec(oid);
  return m ? Number(m[1]) : null;
}

/** get-token imzası: HMAC-SHA256(key, merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode + salt) → base64 */
export function tokenHash(p: { merchantId: string; key: string; salt: string; userIp: string; merchantOid: string; email: string; amount: number; basket: string; noInstallment: string; maxInstallment: string; currency: string; testMode: string }) {
  const str = `${p.merchantId}${p.userIp}${p.merchantOid}${p.email}${p.amount}${p.basket}${p.noInstallment}${p.maxInstallment}${p.currency}${p.testMode}${p.salt}`;
  return createHmac("sha256", p.key).update(str).digest("base64");
}

/** Bildirim imzası: HMAC-SHA256(key, merchant_oid + salt + status + total_amount) → base64 */
export function callbackHash(p: { key: string; salt: string; merchantOid: string; status: string; totalAmount: string }) {
  return createHmac("sha256", p.key).update(`${p.merchantOid}${p.salt}${p.status}${p.totalAmount}`).digest("base64");
}

export type PaytrInit = { status: "success"; token: string; iframeUrl: string } | { status: "failure"; reason: string };

export async function initPaytr(opts: {
  merchantOid: string;
  amountTl: number;
  email: string;
  userName: string;
  userAddress: string;
  userPhone: string;
  userIp: string;
  items: { name: string; price: number }[];
  okUrl: string;
  failUrl: string;
  maxInstallment?: number;
}): Promise<PaytrInit> {
  const c = await paytrConfig();
  if (!c.enabled) return { status: "failure", reason: "PayTR mağaza bilgileri tanımlı değil (Yönetim → Ayarlar → Ödeme)" };
  const amount = toKurus(opts.amountTl);
  // Sepet: [[ad, birim fiyat (TL, metin), adet], …] → JSON → base64; kalem toplamı ödenecek tutara eşit olmalı
  const basket = Buffer.from(JSON.stringify(opts.items.map((i) => [i.name.slice(0, 100), i.price.toFixed(2), 1]))).toString("base64");
  const noInstallment = "0";
  const maxInstallment = String(opts.maxInstallment ?? 0); // 0 = PayTR panelindeki azami taksit
  const currency = "TL";
  const paytrToken = tokenHash({ merchantId: c.merchantId, key: c.key, salt: c.salt, userIp: opts.userIp, merchantOid: opts.merchantOid, email: opts.email, amount, basket, noInstallment, maxInstallment, currency, testMode: c.testMode });
  const form = new URLSearchParams({
    merchant_id: c.merchantId,
    user_ip: opts.userIp,
    merchant_oid: opts.merchantOid,
    email: opts.email,
    payment_amount: String(amount),
    paytr_token: paytrToken,
    user_basket: basket,
    debug_on: c.testMode,
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: opts.userName.slice(0, 60) || "Müşteri",
    user_address: opts.userAddress.slice(0, 400) || "Türkiye",
    user_phone: opts.userPhone.replace(/\D/g, "").slice(0, 20) || "0000000000",
    merchant_ok_url: opts.okUrl,
    merchant_fail_url: opts.failUrl,
    timeout_limit: "30",
    currency,
    test_mode: c.testMode,
    lang: "tr",
  });
  try {
    const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), cache: "no-store" });
    const data = (await res.json()) as { status?: string; token?: string; reason?: string };
    if (data.status === "success" && data.token) return { status: "success", token: data.token, iframeUrl: PAYTR_IFRAME_BASE + data.token };
    return { status: "failure", reason: data.reason || "PayTR token alınamadı" };
  } catch (e) {
    return { status: "failure", reason: `PayTR'ye ulaşılamadı: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export type PaytrNotification = {
  merchantOid: string;
  status: "success" | "failed";
  /** kuruş */
  totalAmount: number;
  failedReason: string;
  testMode: boolean;
  paymentType: string;
};

/** Bildirim gövdesini doğrular; imza tutmuyorsa null */
export async function verifyNotification(form: FormData): Promise<PaytrNotification | null> {
  const c = await paytrConfig();
  if (!c.enabled) return null;
  const merchantOid = String(form.get("merchant_oid") ?? "");
  const status = String(form.get("status") ?? "");
  const totalAmount = String(form.get("total_amount") ?? "");
  const hash = String(form.get("hash") ?? "");
  if (!merchantOid || !status || !totalAmount || !hash) return null;
  const expected = callbackHash({ key: c.key, salt: c.salt, merchantOid, status, totalAmount });
  if (expected.length !== hash.length || !timingSafeEqualStr(expected, hash)) return null;
  return {
    merchantOid,
    status: status === "success" ? "success" : "failed",
    totalAmount: Number(totalAmount),
    failedReason: [form.get("failed_reason_code"), form.get("failed_reason_msg")].filter(Boolean).join(" · "),
    testMode: String(form.get("test_mode") ?? "") === "1",
    paymentType: String(form.get("payment_type") ?? ""),
  };
}

function timingSafeEqualStr(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
