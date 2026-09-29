"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, orders, periods, periodEnrollments, users, type BillingInfo } from "@/db/schema";
import { addressFromForm, addressFormatError } from "@/lib/address";
import { getCart, setCart, clearCart } from "@/lib/cart";
import { getCurrentUser } from "@/lib/auth/session";
import { enrollUser, fulfillOrder } from "@/lib/enroll";
import { initCheckoutForm, iyzicoEnabled } from "@/lib/iyzico";
import { siteUrl } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import { checkPrerequisite } from "@/lib/prerequisites";
import { checkSurveyGate } from "@/lib/survey-gate";
import { checkCartLine } from "@/lib/cart-rules";
import { cartTotals } from "@/lib/cart-totals";
import { heldSeatsSql, releaseOrderCoupon, reserveCoupon, supersedePendingOrders, unreserveCoupon } from "@/lib/orders";
import { toId } from "@/lib/ids";

/** Misafirken başlatılan kayıt niyeti (ücretsiz eğitim / görüşme koltuğu); girişten sonra program sayfası sürdürür */
const INTENT_COOKIE = "fabo_intent";

export async function addToCart(formData: FormData) {
  // Elle oynanmış (sayı olmayan) kimlik sorguya gitmez
  const courseId = toId(formData.get("courseId"));
  const periodNum = toId(formData.get("periodId")) ?? NaN;
  if (!courseId) redirect("/kesfet");
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) redirect("/kesfet");
  const user = await getCurrentUser();
  const jar = await cookies();
  // Önceki yarım kalmış kayıt niyeti bu işlemle kapanır (başarısız olursa program sayfası yeniden denemez)
  if (user) jar.delete(INTENT_COOKIE);

  // Satın alınabilirlik: sepet, ödeme ve sipariş aşamalarıyla aynı kural (lib/cart-rules.ts)
  const chk = await checkCartLine(c, Number.isInteger(periodNum) ? periodNum : null, user?.id ?? null);
  if (!chk.ok) {
    if (chk.code === "kapali") redirect("/kesfet");
    if (chk.code === "kayitli") redirect(`/kurs-izle/${c.id}`);
    // yakinda | donem | dolu | gecmis → program sayfası ilgili uyarıyı gösterir
    redirect(`/program/${c.slug}?hata=${chk.code === "gecmis" ? "kapali" : chk.code}`);
  }
  const periodId = chk.periodId;

  // Satın alım koşulu: üst basamak alınmamışsa (ya da tamamlanmamışsa) sepete giremez
  const cartNow = await getCart();
  const pre = await checkPrerequisite({ userId: user?.id ?? null, courseId: c.id, cartCourseIds: cartNow.map((i) => i.courseId) });
  if (!pre.ok) redirect(`/program/${c.slug}?hata=kosul`);

  // Bağlı anket: giriş yapmış öğrenci hedef testini doldurmadan alamaz (misafir önce girişe gider, sonra tekrar kontrol edilir)
  if (user && !(await checkSurveyGate({ userId: user.id, courseId: c.id })).ok) redirect(`/program/${c.slug}?hata=anket`);

  // Ücretsiz kurs: giriş yapmışsa direkt kaydet, değilse girişe yönlendir
  if (c.isFree) {
    if (!user) {
      // Niyet çerezde saklanır; girişten (ya da üye olduktan) sonra program sayfası seçili dönemle kaydı tamamlar
      jar.set(INTENT_COOKIE, JSON.stringify({ courseId: c.id, periodId }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 30 });
      redirect(`/panel/giris?r=${encodeURIComponent(`/program/${c.slug}?kayit=1${periodId ? `&donem=${periodId}` : ""}`)}`);
    }
    const [o] = await db
      .insert(orders)
      .values({
        userId: user.id,
        status: "paid",
        items: [{ courseId: c.id, title: c.title, price: 0, periodId, periodName: chk.periodName }],
        subtotal: "0",
        discount: "0",
        total: "0",
        provider: "free",
        paidAt: new Date(),
        fulfilledAt: new Date(),
      })
      .returning({ id: orders.id });
    // Koltuk kilitli alınır: aynı anda gelen iki kayıttan yalnızca biri son koltuğu alır
    const r = await enrollUser({ userId: user.id, courseId: c.id, orderId: o.id, periodId, strictCapacity: true });
    if (!r.ok) {
      await db.delete(orders).where(eq(orders.id, o.id));
      redirect(`/program/${c.slug}?hata=dolu`);
    }
    // Ücretsiz eğitim kitaplığa eklenir; oynatıcı yerine "Yeni Program" listesine gider
    redirect(`/panel/egitim?sekme=yeni`);
  }

  const rest = cartNow.filter((i) => i.courseId !== c.id);
  await setCart([...rest, { courseId: c.id, periodId }]);
  redirect("/sepet");
}

export async function removeFromCart(formData: FormData) {
  const courseId = toId(formData.get("courseId"));
  const cart = await getCart();
  if (courseId) await setCart(cart.filter((i) => i.courseId !== courseId));
  redirect("/sepet");
}

export async function applyCoupon(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase().slice(0, 64);
  const jar = await cookies();
  if (!code) {
    jar.delete("fabo_coupon");
    redirect("/sepet");
  }
  jar.set("fabo_coupon", code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  redirect("/sepet");
}

export type CheckoutState = { error?: string; formHtml?: string };

/** Ödeme başlat: sipariş oluştur, 0 TL ise direkt kaydet; değilse iyzico formu */
export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris?r=/odeme");
  const t = await cartTotals(user.id);
  if (t.lines.length === 0) redirect("/sepet");
  if (t.couponError) return { error: t.couponError };
  // Sepete eklendikten sonra durumu değişen satır (Yakında oldu, dönem kapandı/doldu, öğrenci kaydoldu, koşul sağlanmıyor)
  const blocked = t.lines.find((l) => l.blockError || l.prereqError);
  if (blocked) return { error: `${blocked.title}: ${blocked.blockError ?? blocked.prereqError} Sepete dönüp bu eğitimi çıkarabilir ya da program sayfasından yeniden seçebilirsin.` };

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
  // Fatura bilgileri sunucuda da zorunlu (tarayıcıdaki "required" elle gönderilen istekte atlanabilir)
  if (billingAddr.name.trim().length < 3) return { error: "Fatura bilgilerinde ad soyad zorunlu." };
  if (billingAddr.phone.replace(/\D/g, "").length < 10) return { error: "Fatura bilgilerinde telefon zorunlu (alan koduyla, en az 10 rakam)." };
  if (!billingAddr.city.trim()) return { error: "Fatura bilgilerinde şehir zorunlu." };
  if (billingAddr.address.trim().length < 5) return { error: "Fatura bilgilerinde adres zorunlu." };
  if (!shippingSame && (shippingAddr.name || shippingAddr.address || shippingAddr.city) && (!shippingAddr.address.trim() || !shippingAddr.city.trim())) {
    return { error: "Gönderim adresinde şehir ve adres zorunlu (ya da \"Fatura adresiyle aynı\" kutusunu işaretle)." };
  }
  // Biçim denetimi (telefon, kimlik/vergi no, posta kodu): Adreslerim formuyla aynı kurallar
  const formatError = addressFormatError(formData, "billing_", "Fatura adresi") ?? (shippingSame ? null : addressFormatError(formData, "shipping_", "Gönderim adresi"));
  if (formatError) return { error: formatError };
  // Adresler kullanıcıya kaydedilir: bir sonraki siparişte ön tanımlı gelir (Tercihler → Adreslerim'den de düzenlenir)
  await db.update(users).set({ addresses: { billing: billingAddr, shipping: shippingAddr } }).where(eq(users.id, user.id));

  const payment = await getSetting("payment");
  const provider = t.total === 0 ? "free" : payment.provider === "manual" || !iyzicoEnabled() ? "manual" : "iyzico";

  // Aynı eğitim için eski bekleyen sipariş varsa yenisi onun yerine geçer (mükerrer sipariş ve çift kupon kullanımı olmasın)
  await supersedePendingOrders(user.id, t.lines.map((l) => l.courseId));

  // Kupon sipariş oluşurken ayrılır: tek kullanımlık kupon onay bekleyen birden çok siparişte kullanılamaz
  if (t.coupon && !(await reserveCoupon(t.coupon.code))) return { error: "Kuponun kullanım hakkı doldu." };

  // Koltuk denetimi ve sipariş kaydı tek işlemde: dönem satırı kilitlenir, son koltuk için yarışan iki siparişten yalnızca biri oluşur
  const created: { id: number } | { full: { title: string; periodName: string | null } } = await db.transaction(async (tx) => {
    for (const l of [...t.lines].filter((x) => x.periodId).sort((a, b) => a.periodId! - b.periodId!)) {
      await tx.execute(sql`select id from periods where id = ${l.periodId} for update`);
      const [p] = await tx
        .select({
          capacity: periods.capacity,
          enrolled: sql<number>`(select count(*) from ${periodEnrollments} pe where pe.period_id = "periods"."id")`.mapWith(Number),
          held: heldSeatsSql(user.id).mapWith(Number),
        })
        .from(periods)
        .where(eq(periods.id, l.periodId!))
        .limit(1);
      if (!p || p.enrolled + p.held >= p.capacity) return { full: l };
    }
    const [o] = await tx
      .insert(orders)
      .values({
        userId: user.id,
        status: provider === "free" ? "paid" : "pending",
        items: t.lines.map((l) => ({ courseId: l.courseId, title: l.title, price: l.price, periodId: l.periodId, periodName: l.periodName })),
        subtotal: t.subtotal.toFixed(2),
        discount: t.discount.toFixed(2),
        total: t.total.toFixed(2),
        couponCode: t.coupon?.code ?? null,
        couponReserved: !!t.coupon,
        provider,
        billing,
        paidAt: provider === "free" ? new Date() : null,
      })
      .returning({ id: orders.id });
    return { id: o.id };
  });
  if ("full" in created) {
    if (t.coupon) await unreserveCoupon(t.coupon.code);
    return { error: `${created.full.title} — ${created.full.periodName ?? "seçilen dönem"} az önce doldu. Sepete dönüp bu eğitimi çıkarabilir, program sayfasından başka bir dönem seçebilir ya da "tekrar açılınca haber ver" diyebilirsin.` };
  }
  const orderId = created.id;
  const jar = await cookies();

  if (provider === "free") {
    await fulfillOrder(orderId);
    await clearCart();
    jar.delete("fabo_coupon");
    redirect(`/odeme/tamam?siparis=${orderId}`);
  }

  if (provider === "manual") {
    await clearCart();
    jar.delete("fabo_coupon");
    redirect(`/odeme/havale?siparis=${orderId}`);
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "85.34.78.112";
  const [first, ...rest] = billing.name.split(" ");
  const init = await initCheckoutForm({
    conversationId: String(orderId),
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
    items: basketItems(t.lines.map((l) => ({ id: String(l.courseId), name: l.title, price: l.price })), t.total),
    callbackUrl: siteUrl(`/api/odeme/callback?siparis=${orderId}`),
  });
  if (init.status !== "success" || !init.checkoutFormContent) {
    await db.update(orders).set({ status: "failed", note: init.errorMessage ?? "iyzico başlatılamadı" }).where(eq(orders.id, orderId));
    await releaseOrderCoupon(orderId);
    return { error: `Ödeme başlatılamadı: ${init.errorMessage ?? "bilinmeyen hata"}` };
  }
  await db.update(orders).set({ providerToken: init.token ?? null }).where(eq(orders.id, orderId));
  return { formHtml: init.checkoutFormContent };
}

/**
 * iyzico sepet kalemleri: kalem fiyatlarının toplamı ödenecek tutara EŞİT olmalı (kuponlu siparişte aksi hâlde ödeme başlatılamaz).
 * İndirim kalemlere oranla dağıtılır, kuruş farkı son kaleme eklenir; 0 TL'ye düşen kalem sepete yazılmaz.
 */
function basketItems(lines: { id: string; name: string; price: number }[], total: number) {
  const sum = lines.reduce((s, l) => s + l.price, 0);
  const factor = sum > 0 ? total / sum : 1;
  const items = lines.map((l) => ({ ...l, price: Math.round(l.price * factor * 100) / 100 })).filter((l) => l.price > 0);
  if (items.length === 0) return lines.slice(0, 1).map((l) => ({ ...l, price: total }));
  const diff = Math.round((total - items.reduce((s, l) => s + l.price, 0)) * 100) / 100;
  items[items.length - 1].price = Math.round((items[items.length - 1].price + diff) * 100) / 100;
  return items;
}
