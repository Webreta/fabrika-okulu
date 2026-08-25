import type { Metadata } from "next";
import { Inter, Dancing_Script } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
const dancing = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: { default: "Fabrika Okulu", template: "%s – Fabrika Okulu" },
  description:
    "Kariyer gelişiminde yol arkadaşın. Esnek ve takvimli online gelişim programları.",
  manifest: "/manifest.webmanifest",
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
