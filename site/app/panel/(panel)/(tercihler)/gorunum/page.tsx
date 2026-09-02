import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { themeByKey } from "@/lib/panel-themes";
import { ThemeGrid } from "@/components/panel/ThemePicker";

/** Tercihler → Çalışma Odam: panel teması (renk) seçimi */
export default async function AppearancePage() {
  const u = (await getCurrentUser())!;
  const panel = await getSetting("panel");
  const theme = themeByKey(u.panelTheme, panel.defaultTheme);
  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-navy-800">Çalışma Odam</h2>
      <div className="card">
        <ThemeGrid current={theme.key} />
      </div>
    </>
  );
}
