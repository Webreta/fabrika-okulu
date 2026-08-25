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
    const parsed = JSON.parse(raw) as CartItem[];
    return Array.isArray(parsed) ? parsed.filter((i) => Number.isInteger(i.courseId)) : [];
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
