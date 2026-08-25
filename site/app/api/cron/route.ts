import { NextResponse } from "next/server";
import { runFrequent, runDaily } from "@/lib/cron";

// Easypanel/harici cron: her 15 dk  GET /api/cron?key=CRON_SECRET
// Günlük işler saat 07:00 civarında (sunucu saati) bir kez çalışır; diğer çağrılarda yalnızca sık işler.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }
  const frequent = await runFrequent();
  const hour = new Date().getHours();
  const force = url.searchParams.get("daily") === "1";
  const daily = force || hour === 7 ? await runDaily() : { skipped: true };
  return NextResponse.json({ ok: true, frequent, daily });
}
