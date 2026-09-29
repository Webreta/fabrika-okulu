import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { maintenanceInfo } from "@/lib/maintenance";

// Bakım modu durumu. middleware.ts her istekte (kısa süreli önbellekle) buraya sorar:
//  enabled: bakım modu açık mı · admin: isteği yapan oturum yönetici mi
// Yalnızca iki evet/hayır bilgisi döner; herkese açıktır.
export const dynamic = "force-dynamic";

export async function GET() {
  const info = await maintenanceInfo();
  let admin = false;
  if (info.enabled) {
    const user = await getCurrentUser();
    admin = user?.role === "admin";
  }
  return NextResponse.json({ enabled: info.enabled, admin }, { headers: { "Cache-Control": "no-store" } });
}
