"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { pruneOwnedCartLines } from "@/app/actions/cart";

/**
 * Sepette "zaten kayıtlısın" satırı varsa (kart ödemesi sonuç sayfasına uğramadan tamamlanmış) o satırları sunucuda
 * sepet çerezinden düşürür ve sayfayı yeniler. Tek sefer çalışır; satır düşmediyse yenileme yapılmaz.
 */
export function CartAutoPrune({ active }: { active: boolean }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (!active || ran.current) return;
    ran.current = true;
    pruneOwnedCartLines()
      .then((r) => { if (r.removed > 0) router.refresh(); })
      .catch(() => {});
  }, [active, router]);
  return null;
}
