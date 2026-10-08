import { NextResponse, type NextRequest } from "next/server";

/**
 * Üç iş yapar:
 *  1) Bakım modu (dışarıya gösterme): açıkken yönetici olmayan herkese bakım sayfası gösterilir.
 *  2) Kişisel yüklemeler (/uploads/belgeler|ozgecmis|gorev|ses) oturum + sahiplik denetimi yapan rotaya yönlendirilir.
 *  3) Panellerde İYİMSER oturum kontrolü: yalnızca cookie varlığına bakar (edge'de DB yok).
 *     Gerçek doğrulama layout'larda, sayfalarda ve server action'larda (requireUser/requireTeacher/requireAdmin).
 */
const PUBLIC_PANEL = ["/panel/giris", "/panel/kayit", "/panel/sifre", "/egitmen/giris", "/admin/giris"];
/** Oturum isteyen alanlar */
const PROTECTED = /^\/(admin|panel|egitmen|kurs-izle|odeme)(\/|$)/;
/** Öğrencinin yüklediği kişisel dosyalar; lib/serve-file.ts içindeki PRIVATE_UPLOAD_DIRS ile aynı olmalı */
const PRIVATE_UPLOADS = /^\/uploads\/(belgeler|ozgecmis|gorev|ses)\/(.+)$/i;
/**
 * Bakım modunda da herkese açık kalan yollar:
 *  - bakım sayfası ve durum ucu
 *  - yönetici girişi (yönetici siteyi açabilsin)
 *  - zamanlanmış işler ve kart ödemesi dönüşü (banka/iyzico dönüşünde oturum çerezi gelmez)
 *  - yüklenen dosyalar (/uploads): next/image optimize edici görseli sunucunun kendi içinden ÇEREZSİZ çeker;
 *    bakım modunda 503 alınca yönetici panelindeki ve katalogdaki tüm görseller kırılıyordu ("received null").
 *    Kişisel dosyalar (belgeler/ozgecmis/gorev/ses) yine aşağıdaki oturum + sahiplik denetiminden geçer.
 */
const MAINTENANCE_OPEN = [/^\/bakim\/?$/, /^\/api\/bakim\/?$/, /^\/admin\/giris(\/|$)/, /^\/api\/cron\/?$/, /^\/api\/odeme\/callback\/?$/, /^\/api\/odeme\/paytr\/?$/, /^\/uploads\//];

const MODE_TTL = 5_000; // bakım modu açık mı: en çok 5 sn eski bilgi
const ADMIN_TTL = 30_000; // oturum yönetici mi: en çok 30 sn eski bilgi
let mode: { enabled: boolean; at: number } | null = null;
const admins = new Map<string, { admin: boolean; at: number }>();
let statusBase: string | null = null;
let pageCache: { html: string; at: number } | null = null;

/**
 * Bakım sayfasının HTML'i. Yönlendirme (rewrite) durum kodunu 200 bırakır; arama motorlarına "geçici olarak kapalı"
 * diyebilmek için sayfa sunucunun kendi içinden alınıp 503 durum koduyla döndürülür.
 */
async function maintenancePage(): Promise<string | null> {
  const now = Date.now();
  if (pageCache && now - pageCache.at < MODE_TTL) return pageCache.html;
  if (!statusBase) return null;
  try {
    const r = await fetch(`${statusBase}/bakim`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    pageCache = { html: await r.text(), at: now };
    return pageCache.html;
  } catch {
    return null;
  }
}

/** Durum ucuna sunucunun kendi içinden ulaşılır; çalışan adres hatırlanır */
function statusBases(request: NextRequest) {
  if (statusBase) return [statusBase];
  const own = request.nextUrl.origin;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(request.nextUrl.hostname);
  const port = process.env.PORT;
  const list = port ? [`http://127.0.0.1:${port}`, own] : local ? [own] : ["http://127.0.0.1:3000", own];
  return [...new Set(list)];
}

async function maintenance(request: NextRequest): Promise<{ enabled: boolean; admin: boolean }> {
  const now = Date.now();
  const token = request.cookies.get("fabo_session")?.value ?? "";
  if (mode && now - mode.at < MODE_TTL) {
    if (!mode.enabled) return { enabled: false, admin: false };
    if (!token) return { enabled: true, admin: false };
    const known = admins.get(token);
    if (known && now - known.at < ADMIN_TTL) return { enabled: true, admin: known.admin };
  }
  for (const base of statusBases(request)) {
    try {
      const r = await fetch(`${base}/api/bakim`, {
        headers: token ? { cookie: `fabo_session=${token}` } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { enabled?: boolean; admin?: boolean };
      if (typeof j.enabled !== "boolean") continue;
      statusBase = base;
      mode = { enabled: j.enabled, at: now };
      if (admins.size > 500) admins.clear();
      if (token && j.enabled) admins.set(token, { admin: !!j.admin, at: now });
      return { enabled: j.enabled, admin: !!j.admin };
    } catch {
      // sıradaki adres denenir
    }
  }
  // Durum öğrenilemedi: son bilinen durum geçerli; hiç bilinmiyorsa site açık sayılır (denetim arızası siteyi kapatmasın)
  console.error("[bakim] bakım modu durumu okunamadı");
  return { enabled: mode?.enabled ?? false, admin: false };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Bakım modu
  if (!MAINTENANCE_OPEN.some((p) => p.test(pathname))) {
    const m = await maintenance(request);
    if (m.enabled && !m.admin) {
      const headers = { "Retry-After": "3600", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
      const wantsPage = (request.method === "GET" || request.method === "HEAD") && !request.headers.has("rsc") && !request.headers.has("next-action") && !pathname.startsWith("/api/") && !pathname.startsWith("/uploads/");
      if (!wantsPage) return new NextResponse("Bakım çalışması", { status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
      const html = await maintenancePage();
      if (html) return new NextResponse(html, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
      // Sayfa alınamadıysa yönlendirme ile gösterilir (durum kodu 200 kalır)
      const url = request.nextUrl.clone();
      url.pathname = "/bakim";
      url.search = "";
      return NextResponse.rewrite(url, { headers });
    }
  }

  // 2) Yüklemeler
  if (pathname.startsWith("/uploads/")) {
    // Kişisel dosyalar statik sunumdan değil, oturum + sahiplik denetimi yapan rotadan verilir
    // (sunucu açılışında diskte duran dosyaları Next doğrudan sunardı; yönlendirme bunu engeller).
    // Kodlanmış ayraç/nokta/yüzde içeren adres (belgeler%2F3%2F…, %252F, %2e%2e) denetimi atlatmak içindir: yok say
    if (/%(2f|5c|25|2e|00)/i.test(pathname)) return new NextResponse(null, { status: 404 });
    // Eşleşme çözülmüş yol üzerinde yapılır (%62elgeler = belgeler)
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return new NextResponse(null, { status: 404 }); }
    if (decoded.includes("\\") || decoded.includes("\0")) return new NextResponse(null, { status: 404 });
    const m = PRIVATE_UPLOADS.exec(decoded);
    if (!m) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/api/ozel-dosya/${m[1].toLowerCase()}/${m[2].split("/").map(encodeURIComponent).join("/")}`;
    return NextResponse.rewrite(url);
  }

  // 3) Paneller
  if (!PROTECTED.test(pathname)) return NextResponse.next();
  const hasSession = request.cookies.has("fabo_session");
  const isPublic = PUBLIC_PANEL.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isPublic && !hasSession) {
    const login = pathname.startsWith("/admin")
      ? "/admin/giris"
      : pathname.startsWith("/egitmen")
        ? "/egitmen/giris"
        : "/panel/giris";
    const url = new URL(login, request.url);
    url.searchParams.set("r", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Panel layout'u istenen yolu bilsin (zorunlu test kapısı ilk yüklemede sunucuda yönlendirir); istemciden gelen aynı adlı başlık ezilir
  const headers = new Headers(request.headers);
  headers.set("x-fabo-path", pathname);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (pathname.startsWith("/admin")) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  // Statik dosyalar (derleme çıktısı, görseller, yazı tipleri) dışındaki her istek; yüklemeler uzantısı ne olursa olsun dahil
  matcher: [
    "/uploads/:path*",
    "/((?!_next/static|_next/image|img/|fonts/|.*\\.(?:png|jpg|jpeg|webp|avif|svg|gif|ico|css|js|map|woff|woff2|ttf|otf|webmanifest)$).*)",
  ],
};
