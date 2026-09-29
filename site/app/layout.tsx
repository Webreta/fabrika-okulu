import type { Metadata } from "next";
import { Inter, Dancing_Script } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
const dancing = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
  weight: ["400", "700"],
});

const DESCRIPTION = "Kariyer gelişiminde yol arkadaşın. Esnek ve takvimli online gelişim programları.";
// Paylaşım etiketlerindeki göreli adresler (görseller) site adresine göre tamamlanır
const SITE_URL = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
})();

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: { default: "Fabrika Okulu", template: "%s – Fabrika Okulu" },
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  // Varsayılan paylaşım önizlemesi; site sayfaları kendi başlık/açıklama/görselini lib/seo.ts pageMeta ile üretir
  openGraph: { type: "website", siteName: "Fabrika Okulu", locale: "tr_TR", title: "Fabrika Okulu", description: DESCRIPTION, images: [{ url: "/img/site/og.jpg", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "Fabrika Okulu", description: DESCRIPTION, images: ["/img/site/og.jpg"] },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={`${inter.variable} ${dancing.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
