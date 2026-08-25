"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, coupons, orders, periods, periodEnrollments } from "@/db/schema";
import { getCart, setCart, clearCart } from "@/lib/cart";
import { getCurrentUser } from "@/lib/auth/session";
import { effectivePrice } from "@/lib/course-logic";
import { hasAccess } from "@/lib/data/student";
import { enrollUser, fulfillOrder } from "@/lib/enroll";
import { initCheckoutForm, iyzicoEnabled } from "@/lib/iyzico";
import { siteUrl } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import { cookies } from "next/headers";

export async function addToCart(formData: FormData) {
  const courseId = Number(formData.get("courseId"));
  const periodRaw = formData.get("periodId");
  const periodId = periodRaw ? Number(periodRaw) : null;
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c || c.status !== "published" || c.closed) redirect("/kesfet");

  // Dönemli kurs → dönem şart ve kapasite kontrolü
  if (c.group === "takvimli") {
    if (!periodId) redirect(`/program/${c.slug}?hata=donem`);
    const [p] = await db
      .select({
        id: periods.id,
        capacity: periods.capacity,
        enrolled: sql<number>`(select count(*) from ${periodEnrollments} pe where pe.period_id = ${periods.id})`.mapWith(Number),
      })
      .from(periods)
      .where(and(eq(periods.id, periodId), eq(periods.courseId, c.id)))
      .limit(1);
    if (!p || p.enrolled >= p.capacity) redirect(`/program/${c.slug}?hata=dolu`);
  }

  const user = await getCurrentUser();
  if (user && (await hasAccess(user.id, c.id))) redirect(`/kurs-izle/${c.id}`);

  // Ücretsiz kurs: giriş yapmışsa direkt kaydet, değilse girişe yönlendir
  if (c.isFree) {
    if (!user) redirect(`/panel/giris?r=${encodeURIComponent(`/program/${c.slug}?kayit=1${periodId ? `&donem=${periodId}` : ""}`)}`);
    const [o] = await db
      .insert(orders)
      .values({
        userId: user.id,
        status: "paid",
        items: [{ courseId: c.id, title: c.title, price: 0, periodId, periodName: null }],
        subtotal: "0",
        discount: "0",
        total: "0",
        provider: "free",
        paidAt: new Date(),
      })
      .returning({ id: orders.id });
    await enrollUser({ userId: user.id, courseId: c.id, orderId: o.id, periodId });
    redirect(`/kurs-izle/${c.id}`);
  }

  const cart = await getCart();
  const rest = cart.filter((i) => i.courseId !== c.id);
  await setCart([...rest, { courseId: c.id, periodId }]);
  redirect("/sepet");
}

export async function removeFromCart(formData: FormData) {
  const courseId = Number(formData.get("courseId"));
  const cart = await getCart();
  await setCart(cart.filter((i) => i.courseId !== courseId));
  redirect("/sepet");
}

export async function applyCoupon(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const jar = await cookies();
  if (!code) {
    jar.delete("fabo_coupon");
    redirect("/sepet");
  }
  jar.set("fabo_coupon", code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  redirect("/sepet");
}

export type CartTotals = {
  lines: { courseId: number; slug: string; title: string; imageUrl: string; price: number; periodId: number | null; periodName: string | null; group: string }[];
  subtotal: number;
  discount: number;
  total: number;
  coupon: { code: string; percent: number } | null;
  couponError: string | null;
};

export async function cartTotals(userId?: number): Promise<CartTotals> {
  const cart = await getCart();
  const jar = await cookies();
  const code = jar.get("fabo_coupon")?.value?.toUpperCase() ?? "";
  if (cart.length === 0) return { lines: [], subtotal: 0, discount: 0, total: 0, coupon: null, couponError: null };

  const ids = cart.map((i) => i.courseId);
  const cs = await db.select().from(courses).where(inArray(courses.id, ids));
  const pids = cart.map((i) => i.periodId).filter((x): x is number => !!x);
  const ps = pids.length ? await db.select().from(periods).where(inArray(periods.id, pids)) : [];

  const lines = cart
    .map((i) => {
      const c = cs.find((x) => x.id === i.courseId);
      if (!c || c.status !== "published" || c.closed) return null;
      const p = i.periodId ? ps.find((x) => x.id === i.periodId) : null;
      return {
        courseId: c.id,
        slug: c.slug,
        title: c.title,
        imageUrl: c.imageUrl,
        price: effectivePrice(c),
        periodId: p?.id ?? null,
        periodName: p?.name ?? null,
        group: c.group,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotal = lines.reduce((s, l) => s + l.price, 0);
  let discount = 0;
  let coupon: CartTotals["coupon"] = null;
  let couponError: string | null = null;
  if (code) {
    const [cp] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    if (!cp) couponError = "Kupon bulunamadı.";
    else if (cp.expiresAt && cp.expiresAt.getTime() < Date.now()) couponError = "Kuponun süresi dolmuş.";
    else if (cp.usageLimit > 0 && cp.usedCount >= cp.usageLimit) couponError = "Kupon kullanılmış.";
    else if (cp.userId && cp.userId !== userId) couponError = userId ? "Bu kupon hesabınıza ait değil." : "Kuponu kullanmak için giriş yapın.";
    else {
      const applicable = lines.filter((l) => !cp.courseId || cp.courseId === l.courseId);
      if (applicable.length === 0) couponError = "Kupon sepetteki programlar için geçerli değil.";
      else {
        discount = Math.round(applicable.reduce((s, l) => s + (l.price * cp.percent) / 100, 0) * 100) / 100;
        coupon = { code: cp.code, percent: cp.percent };
      }
    }
  }
  return { lines, subtotal, discount, total: Math.max(0, subtotal - discount), coupon, couponError };
}

export type CheckoutState = { error?: string; formHtml?: string };

/** Ödeme başlat: sipariş oluştur, 0 TL ise direkt kaydet; değilse iyzico formu */
export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris?r=/odeme");
  const t = await cartTotals(user.id);
  if (t.lines.length === 0) redirect("/sepet");
  if (t.couponError) return { error: t.couponError };

  const billing = {
    name: String(formData.get("name") ?? user.name),
    email: user.email,
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    city: String(formData.get("city") ?? ""),
    identityNumber: String(formData.get("identityNumber") ?? ""),
  };
  if (!formData.get("sozlesme")) return { error: "Mesafeli satış sözleşmesini onaylamalısın." };

  const payment = await getSetting("payment");
  const provider = t.total === 0 ? "free" : payment.provider === "manual" || !iyzicoEnabled() ? "manual" : "iyzico";

  const [o] = await db
    .insert(orders)
    .values({
      userId: user.id,
      status: provider === "free" ? "paid" : "pending",
      items: t.lines.map((l) => ({ courseId: l.courseId, title: l.title, price: l.price, periodId: l.periodId, periodName: l.periodName })),
      subtotal: t.subtotal.toFixed(2),
      discount: t.discount.toFixed(2),
      total: t.total.toFixed(2),
      couponCode: t.coupon?.code ?? null,
      provider,
      billing,
      paidAt: provider === "free" ? new Date() : null,
    })
    .returning({ id: orders.id });

  if (provider === "free") {
    await fulfillOrder(o.id);
    await clearCart();
    const jar = await cookies();
    jar.delete("fabo_coupon");
    redirect(`/odeme/tamam?siparis=${o.id}`);
  }

  if (provider === "manual") {
    await clearCart();
    redirect(`/odeme/havale?siparis=${o.id}`);
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "85.34.78.112";
  const [first, ...rest] = billing.name.split(" ");
  const init = await initCheckoutForm({
    conversationId: String(o.id),
    price: t.total,
    buyer: {
      id: String(user.id),
      name: first || user.firstName,
      surname: rest.join(" ") || user.lastName || first,
      email: user.email,
      phone: billing.phone,
      identityNumber: billing.identityNumber,
      address: billing.address,
      city: billing.city,
      ip,
    },
    items: t.lines.map((l) => ({ id: String(l.courseId), name: l.title, price: l.price })),
    callbackUrl: siteUrl(`/api/odeme/callback?siparis=${o.id}`),
  });
  if (init.status !== "success" || !init.checkoutFormContent) {
    await db.update(orders).set({ status: "failed", note: init.errorMessage ?? "iyzico başlatılamadı" }).where(eq(orders.id, o.id));
    return { error: `Ödeme başlatılamadı: ${init.errorMessage ?? "bilinmeyen hata"}` };
  }
  await db.update(orders).set({ providerToken: init.token ?? null }).where(eq(orders.id, o.id));
  return { formHtml: init.checkoutFormContent };
}
