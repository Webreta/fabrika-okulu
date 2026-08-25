import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { themeByKey } from "@/lib/panel-themes";
import { PageTitle } from "@/components/panel/ui";
import { AccountForm } from "@/components/panel/AccountForm";
import { ThemeGrid } from "@/components/panel/ThemePicker";
import { PushToggle } from "@/components/panel/PushToggle";

export default async function AccountPage() {
  const u = (await getCurrentUser())!;
  const [[row], panel] = await Promise.all([db.select().from(users).where(eq(users.id, u.id)).limit(1), getSetting("panel")]);
  const theme = themeByKey(u.panelTheme, panel.defaultTheme);
  return (
    <>
      <PageTitle title="Tercihler & Ayarlar" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-bold text-navy-800">Hesap bilgileri</h2>
          <AccountForm user={{ firstName: row.firstName, lastName: row.lastName, email: row.email, phone: row.phone }} />
          <p className="mt-4 text-xs text-muted">Ad ve soyadın sertifikalarda görünür; doğru yazdığından emin ol.</p>
        </div>
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-4 font-bold text-navy-800">Panel görünümü</h2>
            <ThemeGrid current={theme.key} />
          </div>
          <div className="card">
            <h2 className="mb-2 font-bold text-navy-800">Bildirimler</h2>
            <p className="mb-3 text-sm text-muted">Görev hatırlatmaları, canlı oturum ve cevaplar için tarayıcı bildirimlerini aç.</p>
            <PushToggle vapidKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
          </div>
        </div>
      </div>
    </>
  );
}
