import type { NextConfig } from "next";

// Güvenlik başlıkları (tüm yanıtlar).
// CSP bilinçli olarak asgari tutuldu: script-src / form-action / frame-src kısıtı YOK, çünkü iyzico ödeme formu
// sayfaya betik ekler ve bankanın 3-D Secure sayfasına form gönderir; dersler Vimeo oynatıcısını gömer.
const COMMON_HEADERS = [
  // Yalnızca https üzerinden anlam taşır; http'de (yerel geliştirme) tarayıcı yok sayar
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Mikrofon kendi sitemize açık kalmalı: öğrenci görev için ses kaydı alıyor
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];
const CSP_BASE = "base-uri 'self'; object-src 'none'";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: COMMON_HEADERS },
      // Yönetim paneli hiçbir çerçevede açılamaz
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: `frame-ancestors 'none'; ${CSP_BASE}` },
        ],
      },
      // Diğer sayfalar yalnızca kendi sitemizde çerçevelenebilir (korumalı PDF görüntüleyici aynı sitede iframe kullanır).
      // Yüklenen ve korumalı dosyalar kendi başlıklarını gönderir (lib/serve-file.ts "sandbox" CSP'si); ikinci bir CSP eklenmez.
      {
        source: "/((?!admin|uploads/|api/ozel-dosya/|api/dosya/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: `frame-ancestors 'self'; ${CSP_BASE}` },
        ],
      },
      // Sunucu açılışında diskte duran yüklemeleri Next doğrudan sunar (lib/serve-file.ts devreye girmez).
      // Eski SVG yüklemeleri tarayıcıda doğrudan açılırsa içindeki betik çalışmasın.
      { source: "/uploads/:path(.*\\.svg)", headers: [{ key: "Content-Security-Policy", value: "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:" }] },
      ...["/uploads/:path*", "/api/ozel-dosya/:path*", "/api/dosya/:path*"].map((source) => ({ source, headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] })),
    ];
  },
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["web-push", "postgres", "bcryptjs", "nodemailer", "qrcode"],
  images: { formats: ["image/avif", "image/webp"] },
  experimental: {
    serverActions: {
      // Kurs dosyaları / ödev yüklemeleri için
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
