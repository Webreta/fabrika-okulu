import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { maintenanceInfo } from "@/lib/maintenance";
import { getSetting } from "@/lib/settings";

// Bakım sayfası: bakım modu açıkken yönetici olmayan herkes (middleware.ts) bu sayfayı 503 durum koduyla görür.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bakım çalışması", robots: { index: false, follow: false } };

export default async function MaintenancePage() {
  const info = await maintenanceInfo();
  // Bakım modu kapalıyken bu adres anlamsızdır
  if (!info.enabled) redirect("/");
  const contact = await getSetting("contact");
  const title = info.setting.title.trim() || "Çok yakında buradayız";
  const message = info.setting.message.trim();
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#142b56] via-[#1d4a7a] to-[#3d97bd] px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-2xl md:p-10">
        <Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={120} height={137} priority className="mx-auto h-20 w-auto" />
        <h1 className="mt-6 text-2xl font-bold text-navy-800 md:text-3xl">{title}</h1>
        {message && <p className="mt-3 whitespace-pre-line text-muted">{message}</p>}
        {contact.email && (
          <p className="mt-6 text-sm text-muted">
            Bize ulaşmak için: <a href={`mailto:${contact.email}`} className="break-all font-semibold text-sky-600 hover:underline">{contact.email}</a>
          </p>
        )}
      </div>
    </main>
  );
}
