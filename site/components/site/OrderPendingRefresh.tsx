"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { finishCardOrder } from "@/app/actions/cart";

/**
 * Sipariş sonucu sayfası (kart ödemesi):
 *  - pending: sağlayıcının bildirimi tarayıcı yönlendirmesinden geç gelebilir; sayfa birkaç saniye arayla kendini yeniler
 *  - paid: sepet ve kupon çerezleri temizlenir (PayTR bildirimi sunucudan sunucuya geldiği için çerezler orada silinemez)
 */
export function OrderPendingRefresh({ pending, paid }: { pending: boolean; paid: boolean }) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => {
      tries.current += 1;
      if (tries.current > 10) { clearInterval(t); return; }
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [pending, router]);
  useEffect(() => {
    if (paid) void finishCardOrder();
  }, [paid]);
  return null;
}
