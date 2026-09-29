import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { RegisterForm } from "@/components/panel/AuthForms";

export const metadata = { title: "Üye Ol" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/panel");
  const panel = await getSetting("panel");
  const panelSettings = panel;
  return (
    <AuthLayout
      bg={panelSettings.loginBg || undefined}
      logo={panelSettings.loginLogo || undefined}
      title={panel.registrationOpen ? "Üye ol" : "Üyelik kayıtları kapalı"}
      subtitle={panel.registrationOpen ? "Ücretsiz hesap oluştur, programlara hemen başla." : "Şu anda yeni üyelik alınmıyor."}
      aside="Kariyer gelişiminde yol arkadaşın."
      bullets={["Esnek ve takvimli programlar", "Mentor eğitmenle canlı oturumlar", "Görev, sınav ve sertifika takibi"]}
    >
      {panel.registrationOpen ? <Suspense><RegisterForm /></Suspense> : (
        <div className="space-y-4">
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Üyelik kayıtları şu anda kapalı. Hesabın varsa giriş yapabilirsin; yeni üyelik için bizimle iletişime geçebilirsin.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/panel/giris" className="btn-primary">Giriş yap</Link>
            <Link href="/iletisim" className="btn-secondary">İletişim</Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
