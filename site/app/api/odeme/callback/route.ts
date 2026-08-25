import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { retrieveCheckoutForm } from "@/lib/iyzico";
import { fulfillOrder } from "@/lib/enroll";
import { siteUrl } from "@/lib/mailer";

// iyzico ödeme sonrası POST ile buraya döner (token). Sonucu sunucudan doğrularız.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const orderId = Number(url.searchParams.get("siparis"));
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (!orderId || !token) return NextResponse.redirect(siteUrl("/sepet?hata=odeme"), 303);

  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return NextResponse.redirect(siteUrl("/sepet?hata=odeme"), 303);
  if (o.status === "paid") return NextResponse.redirect(siteUrl(`/odeme/tamam?siparis=${o.id}`), 303);

  const result = await retrieveCheckoutForm(token);
  const ok = result.status === "success" && result.paymentStatus === "SUCCESS" && String(result.conversationId ?? o.id) === String(o.id);
  if (!ok) {
    await db
      .update(orders)
      .set({ status: "failed", note: result.errorMessage ?? "Ödeme başarısız", providerToken: token })
      .where(eq(orders.id, o.id));
    return NextResponse.redirect(siteUrl(`/odeme/hata?siparis=${o.id}`), 303);
  }
  await db
    .update(orders)
    .set({ status: "paid", paidAt: new Date(), providerPaymentId: result.paymentId ?? null, providerToken: token })
    .where(eq(orders.id, o.id));
  await fulfillOrder(o.id);
  const res = NextResponse.redirect(siteUrl(`/odeme/tamam?siparis=${o.id}`), 303);
  res.cookies.delete("fabo_cart");
  res.cookies.delete("fabo_coupon");
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("siparis");
  return NextResponse.redirect(siteUrl(orderId ? `/odeme/tamam?siparis=${orderId}` : "/panel"), 303);
}
