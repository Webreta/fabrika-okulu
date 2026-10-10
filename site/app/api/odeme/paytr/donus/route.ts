import { NextResponse } from "next/server";
import { toId } from "@/lib/ids";

/**
 * PayTR iframe dönüşü (merchant_ok_url / merchant_fail_url). PayTR müşteriyi bu adrese ödeme iframe'inin İÇİNDE
 * yönlendirir; paytr.com'dan gelen çerçeve isteğine oturum çerezi (SameSite=Lax) gitmediği için sonuç sayfası doğrudan
 * hedef gösterilirse çerçevede giriş formu çıkıyor, öğrenci sonuç sayfasını hiç görmüyor ve sepet çerezi temizlenmiyordu.
 * Bu uç oturum istemez: üst pencereyi (tam sayfa, çerezli) sipariş sonucuna taşır. Sipariş durumu burada değişmez;
 * sonuç yalnızca PayTR bildirimiyle (/api/odeme/paytr) işlenir.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = toId(u.searchParams.get("siparis"));
  const ok = u.searchParams.get("sonuc") !== "hata";
  // Yalnızca sayısal sipariş kimliği adrese yazılır; sipariş sahibi denetimi hedef sayfada yapılır
  const target = id ? (ok ? `/odeme/tamam?siparis=${id}` : `/odeme/hata?siparis=${id}`) : "/panel/siparis";
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Yönlendiriliyorsun…</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:60vh;margin:0;color:#1f2a44;text-align:center;padding:24px}a{color:#0369a1}</style></head>
<body><p>${ok ? "Ödeme sayfasından dönülüyor" : "Ödeme tamamlanamadı"}, sipariş sonucuna yönlendiriliyorsun…<br><a href="${target}" target="_top">Devam etmek için tıkla</a></p>
<script>(function(){var t=${JSON.stringify(target)};try{if(window.top&&window.top!==window.self){window.top.location.replace(t);return;}}catch(e){}window.location.replace(t);})();</script></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
