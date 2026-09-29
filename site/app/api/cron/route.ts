import { NextResponse } from "next/server";
import { runFrequent, runDailyIfDue, markCronTick } from "@/lib/cron";
import { cronSecretState } from "@/lib/cron-secret";

// Easypanel/harici cron: her 15 dk  GET /api/cron?key=CRON_SECRET
// Günlük işler saat 07:00'den sonraki ilk çağrıda, günde bir kez çalışır (sunucu 07:00'de kapalıysa açılınca telafi edilir);
// diğer çağrılarda yalnızca sık işler. `daily=1` saati beklemeden dener (aynı gün ikinci kez yine çalışmaz).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  // Canlıda anahtar tanımsız ya da herkesin bildiği örnek değerdeyse uç tümüyle kapalıdır (doğru anahtar gönderilse bile)
  const state = cronSecretState();
  if (state !== "ok" && process.env.NODE_ENV === "production") {
    console.error(`[cron] CRON_SECRET ${state === "yok" ? "tanımlı değil" : "örnek/zayıf değerde"}; zamanlanmış işler çalıştırılmadı. Ortam değişkenlerine en az 16 karakterlik rastgele bir CRON_SECRET tanımlayın.`);
    return NextResponse.json({ error: "cron kapalı: CRON_SECRET tanımlı değil ya da varsayılan değerde" }, { status: 503 });
  }
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }
  await markCronTick();
  const frequent = await runFrequent();
  const daily = await runDailyIfDue(url.searchParams.get("daily") === "1");
  return NextResponse.json({ ok: true, frequent, daily });
}
