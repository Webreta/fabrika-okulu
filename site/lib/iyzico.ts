import "server-only";
import { createHmac, randomBytes } from "crypto";

// iyzico Checkout Form (hosted ödeme sayfası) — HMAC-SHA256 v2 imzası ile ham REST çağrısı.
// Sandbox: https://sandbox-api.iyzipay.com  Prod: https://api.iyzipay.com

function cfg() {
  const apiKey = process.env.IYZICO_API_KEY || "";
  const secret = process.env.IYZICO_SECRET_KEY || "";
  const baseUrl = (process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com").replace(/\/$/, "");
  return { apiKey, secret, baseUrl, enabled: !!(apiKey && secret) };
}

export function iyzicoEnabled() {
  return cfg().enabled;
}

function authHeader(uri: string, body: string) {
  const { apiKey, secret } = cfg();
  const rnd = randomBytes(8).toString("hex");
  const signature = createHmac("sha256", secret).update(rnd + uri + body).digest("hex");
  const auth = `apiKey:${apiKey}&randomKey:${rnd}&signature:${signature}`;
  return {
    Authorization: `IYZWSv2 ${Buffer.from(auth).toString("base64")}`,
    "x-iyzi-rnd": rnd,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function call<T>(uri: string, payload: object): Promise<T> {
  const { baseUrl } = cfg();
  const body = JSON.stringify(payload);
  const res = await fetch(baseUrl + uri, { method: "POST", headers: authHeader(uri, body), body, cache: "no-store" });
  return (await res.json()) as T;
}

export type CheckoutInit = {
  status: "success" | "failure";
  errorMessage?: string;
  token?: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
};

export async function initCheckoutForm(opts: {
  conversationId: string;
  price: number;
  buyer: { id: string; name: string; surname: string; email: string; phone?: string; identityNumber?: string; address?: string; city?: string; ip: string };
  items: { id: string; name: string; price: number }[];
  callbackUrl: string;
}) {
  const money = (n: number) => n.toFixed(2);
  return call<CheckoutInit>("/payment/iyzipos/checkoutform/initialize/auth/ecom", {
    locale: "tr",
    conversationId: opts.conversationId,
    price: money(opts.price),
    paidPrice: money(opts.price),
    currency: "TRY",
    basketId: opts.conversationId,
    paymentGroup: "PRODUCT",
    callbackUrl: opts.callbackUrl,
    enabledInstallments: [1, 2, 3, 6],
    buyer: {
      id: opts.buyer.id,
      name: opts.buyer.name || "Ad",
      surname: opts.buyer.surname || "Soyad",
      gsmNumber: opts.buyer.phone || undefined,
      email: opts.buyer.email,
      identityNumber: opts.buyer.identityNumber || "11111111111",
      registrationAddress: opts.buyer.address || "Türkiye",
      ip: opts.buyer.ip,
      city: opts.buyer.city || "İzmir",
      country: "Turkey",
    },
    billingAddress: {
      contactName: `${opts.buyer.name} ${opts.buyer.surname}`.trim() || "Müşteri",
      city: opts.buyer.city || "İzmir",
      country: "Turkey",
      address: opts.buyer.address || "Türkiye",
    },
    basketItems: opts.items.map((i) => ({
      id: i.id,
      name: i.name.slice(0, 100),
      category1: "Eğitim",
      itemType: "VIRTUAL",
      price: money(i.price),
    })),
  });
}

export type CheckoutResult = {
  status: "success" | "failure";
  paymentStatus?: string; // SUCCESS
  paymentId?: string;
  conversationId?: string;
  basketId?: string;
  paidPrice?: string;
  errorMessage?: string;
};

export async function retrieveCheckoutForm(token: string) {
  return call<CheckoutResult>("/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", token });
}
