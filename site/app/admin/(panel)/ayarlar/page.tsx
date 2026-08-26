import { getSetting } from "@/lib/settings";
import { PANEL_THEMES } from "@/lib/panel-themes";
import { iyzicoEnabled } from "@/lib/iyzico";
import { PageTitle, Tabs } from "@/components/panel/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { SmtpTest } from "@/components/admin/SmtpTest";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const { sekme = "eposta" } = await searchParams;
  const tabs = [["eposta", "E-posta"], ["odeme", "Ödeme"], ["panel", "Panel & PWA"], ["seo", "SEO / Kod"]];
  const [smtp, payment, panel, seo] = await Promise.all([getSetting("smtp"), getSetting("payment"), getSetting("panel"), getSetting("seo")]);
  return (
    <>
      <PageTitle title="Ayarlar" />
      <Tabs items={tabs.map(([k, l]) => ({ href: `/admin/ayarlar?sekme=${k}`, label: l, active: sekme === k }))} />
      {sekme === "eposta" && (
        <div className="space-y-4">
          <SettingsForm settingKey="smtp" title="SMTP & bildirim adresleri" values={smtp as unknown as Record<string, string | number | boolean>} fields={[
            { key: "host", label: "SMTP sunucu", type: "text", placeholder: "smtp.gmail.com" }, { key: "port", label: "Port", type: "number", hint: "465 = SSL, 587 = TLS" },
            { key: "user", label: "Kullanıcı", type: "text" }, { key: "pass", label: "Şifre", type: "password" },
            { key: "from", label: "Gönderen adres", type: "text", placeholder: "no-reply@fabrikaokulu.com.tr" },
            { key: "adminEmails", label: "Yönetici e-postaları", type: "text", hint: "Virgülle ayır. Yeni soru, teslim, sipariş bildirimleri buraya gider." },
            { key: "reportEmail", label: "Günlük rapor adresi", type: "text" }, { key: "documentsEmail", label: "Belge bildirim adresi", type: "text" },
            { key: "dailyReportEnabled", label: "Günlük raporu gönder (07:00)", type: "checkbox" }, { key: "emailsMuted", label: "Tüm bildirim e-postalarını sustur (şifre/sipariş hariç)", type: "checkbox" },
          ]} />
          <SmtpTest />
        </div>
      )}
      {sekme === "odeme" && (
        <div className="space-y-4">
          <div className={`rounded-lg px-4 py-3 text-sm ${iyzicoEnabled() ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            iyzico: {iyzicoEnabled() ? "API anahtarları tanımlı ✓" : "IYZICO_API_KEY / IYZICO_SECRET_KEY .env'de tanımlı değil — havale/EFT moduna düşer."} <span className="block text-xs opacity-80">Anahtarlar güvenlik için ortam değişkeninde tutulur (Easypanel → Environment).</span>
          </div>
          <SettingsForm settingKey="payment" title="Ödeme" values={payment as unknown as Record<string, string>} fields={[
            { key: "provider", label: "Ödeme yöntemi", type: "select", options: [{ value: "iyzico", label: "iyzico (kredi kartı)" }, { value: "manual", label: "Havale / EFT (elle onay)" }] },
            { key: "bankInfo", label: "Havale / EFT bilgileri", type: "textarea", rows: 4, placeholder: "Banka: …\nIBAN: TR…\nAlıcı: …" },
          ]} />
        </div>
      )}
      {sekme === "panel" && (
        <SettingsForm settingKey="panel" title="Öğrenci paneli & PWA" values={panel as unknown as Record<string, string | boolean>} fields={[
          { key: "appName", label: "Uygulama adı", type: "text" }, { key: "iconUrl", label: "Uygulama ikonu (512×512)", type: "image" },
          { key: "loginBg", label: "Giriş ekranı arka planı", type: "image" }, { key: "loginLogo", label: "Giriş ekranı logosu", type: "image" },
          { key: "defaultTheme", label: "Varsayılan panel teması", type: "select", options: PANEL_THEMES.map((t) => ({ value: t.key, label: t.label })) },
          { key: "registrationOpen", label: "Üye kaydı açık", type: "checkbox" },
        ]} />
      )}
      {sekme === "seo" && (
        <SettingsForm settingKey="seo" title="SEO / özel kod" values={seo as unknown as Record<string, string>} fields={[
          { key: "metaDescription", label: "Site açıklaması (meta description)", type: "textarea", rows: 2 },
          { key: "headCode", label: "Özel kod (Analytics, Pixel vb.)", type: "textarea", rows: 6, hint: "Tüm site sayfalarının sonuna eklenir." },
        ]} />
      )}
    </>
  );
}
