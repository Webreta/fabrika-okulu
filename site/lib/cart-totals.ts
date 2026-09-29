import "server-only";
import { cookies } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courses, coupons } from "@/db/schema";
import { getCart } from "@/lib/cart";
import { effectivePrice, isPreorder } from "@/lib/course-logic";
import { personalDiscountPercent } from "@/lib/recommendations";
import { checkPrerequisite } from "@/lib/prerequisites";
import { checkSurveyGate } from "@/lib/survey-gate";
import { checkCartLine, type LineCode } from "@/lib/cart-rules";
import { ownPendingReservations } from "@/lib/orders";

// Sepet hesabı. Sunucu işlevi (server action) DEĞİL: kullanıcı kimliği istemciden alınmaz, çağıran sayfa/işlev oturumdan verir.

export type CartLine = {
  courseId: number; slug: string; title: string; imageUrl: string; price: number; listPrice: number; personalPercent: number;
  periodId: number | null; periodName: string | null; periodFull: boolean; group: string;
  prereqError: string | null; surveyGate: { id: number; title: string } | null;
  /** Erken kayıt: açılış tarihi (eğitim henüz açılmadıysa) */
  opensAt: string | null;
  /** Bu satır şu an satın alınamıyorsa nedeni (Yakında, zaten kayıtlı, dönem kapandı/doldu…); doluysa ödeme başlatılamaz */
  blockError: string | null;
  blockCode: LineCode | null;
};

export type CartTotals = {
  lines: CartLine[];
  subtotal: number;
  discount: number;
  total: number;
  coupon: { code: string; percent: number; amount: number } | null;
  couponError: string | null;
  /** Ödemeye geçilemeyen satır var mı (sepet sayfası düğmeyi kapatır, sipariş oluşturma reddeder) */
  blocked: boolean;
};

export async function cartTotals(userId?: number): Promise<CartTotals> {
  // Aynı eğitim sepette bir kez yer alır (elle düzenlenmiş çerez dahil)
  const seen = new Set<number>();
  const cart = (await getCart()).filter((i) => (seen.has(i.courseId) ? false : (seen.add(i.courseId), true)));
  const jar = await cookies();
  const code = jar.get("fabo_coupon")?.value?.toUpperCase() ?? "";
  if (cart.length === 0) return { lines: [], subtotal: 0, discount: 0, total: 0, coupon: null, couponError: null, blocked: false };

  const cs = await db.select().from(courses).where(inArray(courses.id, cart.map((i) => i.courseId)));
  const lines = (
    await Promise.all(
      cart.map(async (i): Promise<CartLine | null> => {
        const c = cs.find((x) => x.id === i.courseId);
        // Silinmiş eğitim sepette gösterilmez; satıştan kalkan (taslak/kapalı) eğitim nedeniyle birlikte görünür
        // (öğrenci açıklamasız boş sepet görmesin), ödeme engellenir
        if (!c) return null;
        const chk = await checkCartLine(c, i.periodId ?? null, userId ?? null);
        const listPrice = effectivePrice(c);
        // Kişiye özel indirim (kurs ilişkilerinden): satır fiyatına doğrudan uygulanır
        const personalPercent = userId ? await personalDiscountPercent(userId, c.id) : 0;
        const price = Math.round(listPrice * (1 - Math.max(0, Math.min(100, personalPercent)) / 100) * 100) / 100;
        return {
          courseId: c.id, slug: c.slug, title: c.title, imageUrl: c.imageUrl, price, listPrice, personalPercent,
          periodId: chk.periodId, periodName: chk.periodName,
          periodFull: !chk.ok && chk.code === "dolu",
          blockError: chk.ok ? null : chk.message, blockCode: chk.ok ? null : chk.code,
          prereqError: null, surveyGate: null, group: c.group,
          opensAt: isPreorder(c) ? c.opensAt : null,
        };
      })
    )
  ).filter((x): x is CartLine => x !== null);

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
    // Öğrencinin aynı eğitim için bekleyen siparişinde ayırdığı kullanım, yeni sipariş onun yerine geçeceği için sayılmaz
    const own = cp && userId && cp.usageLimit > 0 ? await ownPendingReservations(userId, cp.code, cartIds) : 0;
    if (!cp) couponError = "Kupon bulunamadı.";
    else if (cp.expiresAt && cp.expiresAt.getTime() < Date.now()) couponError = "Kuponun süresi dolmuş.";
    else if (cp.usageLimit > 0 && cp.usedCount - own >= cp.usageLimit) couponError = "Kupon kullanılmış.";
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
  const blocked = lines.some((l) => l.blockError || l.prereqError);
  return { lines, subtotal, discount, total: Math.max(0, subtotal - discount), coupon, couponError, blocked };
}
