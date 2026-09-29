import "server-only";
import { cookies } from "next/headers";

// Sepet: cookie'de tutulur (kurslar tek adet satılır)
export type CartItem = { courseId: number; periodId?: number | null };

const COOKIE = "fabo_cart";

export async function getCart(): Promise<CartItem[]> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return [];
  try {
    // Çerez kullanıcının elindedir: yalnızca veritabanı kimliği olabilecek tam sayılar kabul edilir
    const ok = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 2147483647;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as (Partial<CartItem> | null)[])
      .filter((i): i is CartItem => !!i && typeof i === "object" && ok(i.courseId))
      .slice(0, 50)
      .map((i) => ({ courseId: i.courseId, periodId: ok(i.periodId) ? i.periodId : null }));
  } catch {
    return [];
  }
}

export async function setCart(items: CartItem[]) {
  const jar = await cookies();
  jar.set(COOKIE, JSON.stringify(items), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearCart() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
