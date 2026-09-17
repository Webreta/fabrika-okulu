"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, coupons, orders, periods, periodEnrollments, users, type BillingInfo } from "@/db/schema";
import { addressFromForm } from "@/lib/address";
import { getCart, setCart, clearCart } from "@/lib/cart";
import { getCurrentUser } from "@/lib/auth/session";
import { effectivePrice } from "@/lib/course-logic";
import { personalDiscountPercent } from "@/lib/recommendations";
import { hasAccess } from "@/lib/data/student";
import { enrollUser, fulfillOrder } from "@/lib/enroll";
import { initCheckoutForm, iyzicoEnabled } from "@/lib/iyzico";
import { siteUrl } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import { periodCapacity } from "@/lib/waitlist";
import { checkPrerequisite } from "@/lib/prerequisites";
import { checkSurveyGate } from "@/lib/survey-gate";
import { cookies } from "next/headers";

export async function addToCart(formData: FormData) {
  const courseId = Number(formData.get("courseId"));
  const periodRaw = formData.get("periodId");
  const periodId = periodRaw ? Number(periodRaw) : null;
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c || c.status !== "published" || c.closed) redirect("/kesfet");
  // Yakında: satış kapalı, yalnızca talep toplanır
  if (c.comingSoon) redirect(`/program/${c.slug}?hata=yakinda`);

  // Dönemli kurs → dönem şart ve kapasite kontrolü
  if (c.group === "takvimli") {
    if (!periodId) redirect(`/program/${c.slug}?hata=donem`);
    const [p] = await db
      .select({
        id: periods.id,
        capacity: periods.capacity,
        enrolled: sql<number>`(select count(*) from ${periodEnrollments} pe where pe.period_id = "periods"."id")`.mapWith(Number),
      })
      .from(periods)
      .where(and(eq(periods.id, periodId), eq(periods.courseId, c.id)))
      .limit(1);
    if (!p || p.enrolled >= p.capacity) redirect(`/program/${c.slug}?hata=dolu`);
  }

  const user = await getCurrentUser();
  if (user && (await hasAccess(user.id, c.id))) redirect(`/kurs-izle/${c.id}`);

  // Satın alım koşulu: üst basamak alınmamışsa (ya da tamamlanmamışsa) sepete giremez
  const cartNow = await getCart();
  const pre = await checkPrerequisite({ userId: user?.id ?? null, courseId: c.id, cartCourseIds: cartNow.map((i) => i.courseId) });
  if (!pre.ok) redirect(`/program/${c.slug}?hata=kosul`);

  // Bağlı anket: giriş yapmış öğrenci hedef testini doldurmadan alamaz (misafir önce girişe gider, sonra tekrar kontrol edilir)
  if (user && !(await checkSurveyGate({ userId: user.id, courseId: c.id })).ok) redirect(`/program/${c.slug}?hata=anket`);

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
    // Ücretsiz eğitim kitaplığa eklenir; oynatıcı yerine "Yeni Program" listesine gider
    redirect(`/panel/egitim?sekme=yeni`);
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
  lines: { courseId: number; slug: string; title: string; imageUrl: string; price: number; listPrice: number; personalPercent: number; periodId: number | null; periodName: string | null; periodFull: boolean; group: string; prereqError: string | null; surveyGate: { id: number; title: string } | null }[];
  subtotal: number;
  discount: number;
  total: number;
  coupon: { code: string; percent: number; amount: number } | null;
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
  const ps = pids.length
    ? await db
        .select({ id: periods.id, name: periods.name, capacity: periods.capacity, enrolled: sql<number>`(select count(*) from ${periodEnrollments} pe where pe.period_id = "periods"."id")`.mapWith(Number) })
        .from(periods)
        .where(inArray(periods.id, pids))
    : [];

  const lines = (
    await Promise.all(
      cart.map(async (i) => {
        const c = cs.find((x) => x.id === i.courseId);
        if (!c || c.status !== "published" || c.closed) return null;
        const p = i.periodId ? ps.find((x) => x.id === i.periodId) : null;
        const listPrice = effectivePrice(c);
        // Kişiye özel indirim (kurs ilişkilerinden): satır fiyatına doğrudan uygulanır
        const personalPercent = userId ? await personalDiscountPercent(userId, c.id) : 0;
        const price = Math.round(listPrice * (1 - Math.max(0, Math.min(100, personalPercent)) / 100) * 100) / 100;
        return {
          courseId: c.id,
          slug: c.slug,
          title: c.title,
          imageUrl: c.imageUrl,
          price,
          listPrice,
          personalPercent,
          periodId: p?.id ?? null,
          periodName: p?.name ?? null,
          periodFull: !!p && p.enrolled >= p.capacity, prereqError: null as string | null, surveyGate: null as { id: number; title: string } | null,
          group: c.group,
        };
      })
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  // Satın alım koşulu: aynı sepetteki üst basamak koşulu sağlar (enrolled), tamamlanma koşulu sağlamaz
  const cartIds = lines.map((l) => l.courseId);
  for (const l of lines) {
    const pre = await checkPrerequisite({ userId: userId ?? null, courseId: l.courseId, cartCourseIds: cartIds });
    l.prereqError = pre.ok ? null : pre.message;
    // Bağlı anket doldurulmamışsa satır kilitli (ödeme başlatılamaz); sepet sayfası teste bağlantı verir
    if (!l.prereqError) {
      const gate = await checkSurveyGate({ userId: userId ?? null, courseId: l.courseId });
      if (!gate.ok) { l.prereqError = gate.message; l.surveyGate = gate.survey; }
    }
  }

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
        const applicableTotal = applicable.reduce((s, l) => s + l.price, 0);
        const amount = Number(cp.amount ?? 0);
        // Sabit tutar: uygulanabilir satırların toplamını aşamaz; yüzde: satır bazında
        discount = amount > 0 ? Math.min(amount, applicableTotal) : Math.round(applicable.reduce((s, l) => s + (l.price * cp.percent) / 100, 0) * 100) / 100;
        coupon = { code: cp.code, percent: cp.percent, amount };
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
  const blocked = t.lines.find((l) => l.prereqError);
  if (blocked) return { error: `${blocked.title}: ${blocked.prereqError}` };
  // Ödeme öncesi son kontenjan kontrolü: sepete eklendikten sonra dolan dönem varsa ödeme başlatılmaz
  for (const l of t.lines) {
    if (!l.periodId) continue;
    const cap = await periodCapacity(l.periodId, l.courseId);
    if (!cap || cap.full) {
      await setCart((await getCart()).filter((i) => i.courseId !== l.courseId));
      return { error: `${l.title} — ${l.periodName ?? "seçilen dönem"} kontenjanı doldu; sepetten çıkarıldı. Program sayfasından başka bir dönem seçebilir ya da "tekrar açılınca haber ver" diyebilirsin.` };
    }
  }

  const billingAddr = addressFromForm(formData, "billing_");
  if (!billingAddr.name) billingAddr.name = user.name;
  const shippingSame = !!formData.get("shipping_same");
  const shippingAddr = shippingSame ? billingAddr : addressFromForm(formData, "shipping_");
  const billing: BillingInfo = {
    name: billingAddr.name, email: user.email, phone: billingAddr.phone, address: billingAddr.address, city: billingAddr.city,
    district: billingAddr.district, postalCode: billingAddr.postalCode, identityNumber: billingAddr.identityNumber,
    ...(shippingSame ? {} : { shipping: shippingAddr }),
  };
  if (!formData.get("sozlesme")) return { error: "Mesafeli satış sözleşmesini onaylamalısın." };
  // Adresler kullanıcıya kaydedilir: bir sonraki siparişte ön tanımlı gelir (Tercihler → Adreslerim'den de düzenlenir)
  await db.update(users).set({ addresses: { billing: billingAddr, shipping: shippingAddr } }).where(eq(users.id, user.id));

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
