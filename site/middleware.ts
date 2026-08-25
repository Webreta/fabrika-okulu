import { NextResponse, type NextRequest } from "next/server";

/**
 * İYİMSER kontrol: yalnızca cookie varlığına bakar (edge'de DB yok).
 * Gerçek doğrulama layout'larda ve server action'larda (requireUser/requireTeacher/requireAdmin).
 */
const PUBLIC_PANEL = ["/panel/giris", "/panel/kayit", "/panel/sifre", "/egitmen/giris", "/admin/giris"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (pathname.startsWith("/admin")) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/panel/:path*", "/egitmen/:path*", "/kurs-izle/:path*", "/odeme/:path*"],
};
