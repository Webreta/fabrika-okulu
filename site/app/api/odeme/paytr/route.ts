import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { verifyNotification, orderIdFromMerchantOid, toKurus } from "@/lib/paytr";
import { fulfillOrder } from "@/lib/enroll";
import { releaseOrderCoupon } from "@/lib/orders";
import { siteUrl } from "@/lib/mailer";

// PayTR Bildirim URL'si (mağaza panelinde https://<site>/api/odeme/paytr olarak tanımlanır). Sunucudan sunucuya POST gelir,
// oturum/çerez yoktur; bakım modunda da açıktır (middleware MAINTENANCE_OPEN). Kurallar:
//  - imza (hash) doğrulanmadan hiçbir şey yapılmaz (400 döner, PayTR yeniden dener)
//  - sipariş PayTR siparişi olmalı ve merchant_oid, ödeme başlatılırken siparişe yazılan numarayla aynı olmalı
//  - ödendi sayılması için bildirimdeki tutar (kuruş) siparişin toplamıyla eşleşmeli
//  - yanıt her durumda düz metin "OK" (aksi hâlde PayTR bildirimi tekrar eder); zaten ödenmiş sipariş için de "OK"
export async function POST(request: Request) {
  const form = await request.formData();
  const n = verifyNotification(form);
  if (!n) return new NextResponse("PAYTR notification failed: bad hash", { status: 400 });

  const orderId = orderIdFromMerchantOid(n.merchantOid);
  const [o] = orderId ? await db.select().from(orders).where(eq(orders.id, orderId)).limit(1) : [];
  if (!o || o.provider !== "paytr" || o.providerToken !== n.merchantOid) return new NextResponse("OK");
  if (o.status === "paid") return new NextResponse("OK");
  if (o.status !== "pending" && o.status !== "failed") return new NextResponse("OK");

  const ok = n.status === "success" && n.totalAmount === toKurus(Number(o.total));
  if (!ok) {
    const reason = n.status === "success" ? `Ödeme tutarı siparişle eşleşmedi (${n.totalAmount} kuruş)` : n.failedReason || "Ödeme başarısız";
    await db.update(orders).set({ status: "failed", note: reason }).where(and(eq(orders.id, o.id), inArray(orders.status, ["pending", "failed"])));
    await releaseOrderCoupon(o.id);
    return new NextResponse("OK");
  }
  await fulfillOrder(o.id, { paymentId: n.merchantOid, token: n.merchantOid });
  return new NextResponse("OK");
}

/** Tarayıcı yanlışlıkla GET ile gelirse sipariş sayfasına yönlendir */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("siparis");
  return NextResponse.redirect(siteUrl(orderId ? `/odeme/tamam?siparis=${orderId}` : "/panel"), 303);
}
