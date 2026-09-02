import { PageTitle } from "@/components/panel/ui";
import { PrefsSidebar } from "@/components/panel/PrefsSidebar";

/** Tercihler: hesap/görünüm, belge yükleme ve satınalma geçmişi tek çatı altında, soldaki menüyle gezilir */
export default function PreferencesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageTitle title="Tercihler & Ayarlar" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <PrefsSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
