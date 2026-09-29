import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { retrieveCheckoutForm } from "@/lib/iyzico";
import { fulfillOrder } from "@/lib/enroll";
import { releaseOrderCoupon } from "@/lib/orders";
import { siteUrl } from "@/lib/mailer";

// iyzico ödeme sonrası POST ile buraya döner (token). Sonucu sunucudan doğrularız.
// Bu adres oturumsuz ve herkese açık olduğu için yalnızca şu koşulların HEPSİ sağlanırsa siparişe dokunulur:
//  - sipariş kartlı ödeme siparişidir (havale siparişi bu yolla değiştirilemez) ve bekliyor/başarısız durumdadır
//  - gelen token, ödeme başlatılırken siparişe kaydedilen token ile aynıdır
// Ödendi sayılması için ayrıca iyzico yanıtındaki sipariş numarası ve ödenen tutar siparişle eşleşmelidir.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const orderId = Number(url.searchParams.get("siparis"));
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (!Number.isInteger(orderId) || orderId <= 0 || !token) return NextResponse.redirect(siteUrl("/sepet?hata=odeme"), 303);

  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return NextResponse.redirect(siteUrl("/sepet?hata=odeme"), 303);
  if (o.status === "paid") return NextResponse.redirect(siteUrl(`/odeme/tamam?siparis=${o.id}`), 303);
  // Başkasının/başka türden siparişi ya da eşleşmeyen token: siparişe dokunmadan reddet
  if (o.provider !== "iyzico" || (o.status !== "pending" && o.status !== "failed") || !o.providerToken || o.providerToken !== token) {
    return NextResponse.redirect(siteUrl("/sepet?hata=odeme"), 303);
  }

  const result = await retrieveCheckoutForm(token);
  const paid = Number(result.paidPrice);
  const ok =
    result.status === "success" &&
    result.paymentStatus === "SUCCESS" &&
    String(result.conversationId ?? "") === String(o.id) &&
    (result.basketId === undefined || String(result.basketId) === String(o.id)) &&
    Number.isFinite(paid) && Math.abs(paid - Number(o.total)) < 0.01;
  if (!ok) {
    const reason = result.errorMessage ?? (result.paymentStatus === "SUCCESS" ? "Ödeme bilgisi siparişle eşleşmedi" : "Ödeme başarısız");
    await db.update(orders).set({ status: "failed", note: reason }).where(and(eq(orders.id, o.id), inArray(orders.status, ["pending", "failed"])));
    await releaseOrderCoupon(o.id);
    return NextResponse.redirect(siteUrl(`/odeme/hata?siparis=${o.id}`), 303);
  }
  await fulfillOrder(o.id, { paymentId: result.paymentId ?? null, token });
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
