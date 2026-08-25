"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { markSectionSeen } from "@/app/actions/admin";

const MAP: Record<string, string> = {
  "/admin/notlar": "notlar",
  "/admin/ogrenciler": "ogrenciler",
  "/admin/siparisler": "siparisler",
  "/admin/kullanicilar": "kullanicilar",
  "/admin/anketler": "anketler",
  "/admin/sertifikalar": "sertifikalar",
};

/** Bir bölüme girilince "yeni" rozetini sıfırlar */
export function SeenTracker({ hasNew }: { hasNew: Record<string, number> }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const key = Object.keys(MAP).find((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!key) return;
    const section = MAP[key];
    if (!hasNew[section]) return;
    markSectionSeen(section).then(() => router.refresh());
  }, [pathname, hasNew, router]);
  return null;
}
