import { getSetting, settingForClient } from "@/lib/settings";
import { PANEL_THEMES } from "@/lib/panel-themes";
import { iyzicoEnabled } from "@/lib/iyzico";
import { paytrConfig } from "@/lib/paytr";
import { siteUrl } from "@/lib/mailer";
import { PageTitle, Tabs } from "@/components/panel/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { SmtpTest } from "@/components/admin/SmtpTest";
import { requireAdmin } from "@/lib/auth/session";
import { HealthCard } from "@/components/admin/HealthCard";
import { systemHealth } from "@/lib/health";
import { maintenanceInfo } from "@/lib/maintenance";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  // Sayfa kendi yetkisini denetler: layout'taki yönlendirme, sayfa verisinin yanıt gövdesine yazılmasını engellemez
  const admin = await requireAdmin();
  const { sekme = "eposta" } = await searchParams;
  const tabs = [["eposta", "E-posta"], ["odeme", "Ödeme"], ["panel", "Panel & PWA"], ["seo", "SEO / Kod"], ["bakim", "Bakım modu"], ["saglik", "Sistem sağlığı"]];
  const bakim = await maintenanceInfo();
  const [smtpFull, payment, panel, seo] = await Promise.all([getSetting("smtp"), getSetting("payment"), getSetting("panel"), getSetting("seo")]);
  // SMTP şifresi tarayıcıya gönderilmez (yalnızca "kayıtlı" bilgisi gider)
  const smtp = settingForClient("smtp", smtpFull);
  // PayTR key/salt gizli alan: tarayıcıya gitmez, boş kaydedilirse mevcut değer korunur
  const paymentForm = settingForClient("payment", payment);
  const paytr = await paytrConfig();
  // Güvenlik kontrolü yalnızca kendi sekmesinde çalışır (parola karşılaştırmaları birkaç saniye sürer)
  const health = sekme === "saglik" ? await systemHealth(admin.id) : [];
  return (
    <>
      <PageTitle title="Ayarlar" />
      <Tabs items={tabs.map(([k, l]) => ({ href: `/admin/ayarlar?sekme=${k}`, label: l, active: sekme === k }))} />
      {sekme === "eposta" && (
        <div className="space-y-4">
          <SettingsForm settingKey="smtp" title="SMTP & bildirim adresleri" values={smtp.values} saved={smtp.saved} fields={[
            { key: "host", label: "SMTP sunucu", type: "text", placeholder: "smtp.gmail.com" }, { key: "port", label: "Port", type: "number", hint: "465 = SSL, 587 = TLS" },
            { key: "user", label: "Kullanıcı", type: "text" }, { key: "pass", label: "Şifre", type: "password" },
            { key: "from", label: "Gönderen adres", type: "text", placeholder: "no-reply@fabrikaokulu.com.tr" },
            { key: "adminEmails", label: "Yönetici e-postaları", type: "text", hint: "Virgülle ayır. Yeni soru, teslim, sipariş bildirimleri buraya gider." },
            { key: "reportEmail", label: "Günlük rapor adresi", type: "text" }, { key: "documentsEmail", label: "Belge bildirim adresi", type: "text" },
            { key: "dailyReportEnabled", label: "Günlük raporu gönder (07:00)", type: "checkbox", hint: "Sunucu 07:00'de kapalıysa rapor ve hatırlatmalar aynı gün sunucu açılınca gönderilir." }, { key: "emailsMuted", label: "Tüm bildirim e-postalarını sustur (şifre/sipariş hariç)", type: "checkbox" },
          ]} />
          <SmtpTest />
        </div>
      )}
      {sekme === "odeme" && (
        <div className="space-y-4">
          <div className={`rounded-lg px-4 py-3 text-sm ${paytr.enabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            PayTR: {paytr.enabled ? `mağaza bilgileri tanımlı ✓ (${paytr.source === "panel" ? "panelden" : "ortam değişkeninden"})${paytr.testMode === "1" ? " · TEST MODU açık, gerçek çekim yapılmaz" : ""}` : "mağaza bilgileri girilmedi — PayTR seçilirse ödemeler havale/EFT moduna düşer."}
            <span className="block text-xs opacity-80">PayTR mağaza paneli → Ayarlar → Bildirim URL alanına şunu yaz: <b>{siteUrl("/api/odeme/paytr")}</b></span>
          </div>
          <div className={`rounded-lg px-4 py-3 text-sm ${iyzicoEnabled() ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            iyzico: {iyzicoEnabled() ? "API anahtarları tanımlı ✓" : "IYZICO_API_KEY / IYZICO_SECRET_KEY tanımlı değil — seçilirse havale/EFT moduna düşer."}
          </div>
          <SettingsForm settingKey="payment" title="Ödeme" values={paymentForm.values} saved={paymentForm.saved} fields={[
            { key: "provider", label: "Ödeme yöntemi", type: "select", options: [{ value: "paytr", label: "PayTR (kredi kartı)" }, { value: "iyzico", label: "iyzico (kredi kartı)" }, { value: "manual", label: "Havale / EFT (elle onay)" }] },
            { key: "paytrMerchantId", label: "PayTR Mağaza No (merchant_id)", type: "text", hint: "PayTR mağaza paneli → Bilgi sayfasında" },
            { key: "paytrKey", label: "PayTR Mağaza Parola (merchant_key)", type: "password" },
            { key: "paytrSalt", label: "PayTR Mağaza Gizli Anahtar (merchant_salt)", type: "password" },
            { key: "paytrTestMode", label: "PayTR test modu (gerçek çekim yapılmaz; canlıya geçerken kaldır)", type: "checkbox" },
            { key: "bankInfo", label: "Havale / EFT bilgileri", type: "textarea", rows: 4, placeholder: "Banka: …\nIBAN: TR…\nAlıcı: …" },
          ]} />
        </div>
      )}
      {sekme === "panel" && (
        <SettingsForm settingKey="panel" title="Öğrenci paneli & PWA" values={panel as unknown as Record<string, string | boolean>} fields={[
          { key: "appName", label: "Uygulama adı", type: "text" }, { key: "iconUrl", label: "Uygulama ikonu (512×512)", type: "image" },
          { key: "loginBg", label: "Giriş ekranı arka planı", type: "image" }, { key: "loginLogo", label: "Giriş ekranı logosu", type: "image" },
          { key: "defaultTheme", label: "Varsayılan panel teması", type: "select", options: PANEL_THEMES.map((t) => ({ value: t.key, label: t.label })) },
          { key: "menuStyle", label: "Öğrenci paneli menü stili", type: "select", options: [{ value: "normal", label: "Normal (ikon + metin)" }, { value: "icon", label: "İkon (büyük ikon, üzerine gelince metin yana açılır)" }, { value: "tooltip", label: "İkon + baloncuk (sabit ikon, üzerine gelince adı altında belirir)" }] },
          { key: "registrationOpen", label: "Üye kaydı açık", type: "checkbox" },
        ]} />
      )}
      {sekme === "seo" && (
        <SettingsForm settingKey="seo" title="SEO / özel kod" values={seo as unknown as Record<string, string>} fields={[
          { key: "metaDescription", label: "Site açıklaması (meta description)", type: "textarea", rows: 2, hint: "Arama sonuçlarında site sayfalarının altında görünen varsayılan açıklama (150-160 karakter önerilir). Kendi açıklaması olan sayfalar (eğitim, kategori) kendi metnini kullanır. Boşsa sabit açıklama geçerlidir." },
          { key: "headCode", label: "Özel kod (Analytics, Pixel vb.)", type: "textarea", rows: 6, hint: "Tüm site sayfalarının sonuna eklenir." },
        ]} />
      )}
      {sekme === "bakim" && (
        <div className="space-y-4">
          <div className={`rounded-lg px-4 py-3 text-sm ${bakim.enabled ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
            <p className="font-semibold">{bakim.enabled ? "Bakım modu AÇIK: site ziyaretçilere kapalı." : "Bakım modu kapalı: site herkese açık."}</p>
            <p className="mt-1 text-xs opacity-90">
              Açıkken ziyaretçiler, öğrenciler ve eğitmenler yalnızca bakım sayfasını görür; giriş yapmış yöneticiler siteyi ve panelleri normal kullanır.
              Yönetici girişi <b>/admin/giris</b> adresinden yapılır. Kart ödemesi dönüşü ve zamanlanmış işler çalışmaya devam eder. Değişiklik birkaç saniye içinde geçerli olur.
            </p>
            {bakim.source === "env" ? (
              <p className="mt-2 text-xs font-semibold">
                Şu an sunucudaki MAINTENANCE_MODE={bakim.envValue} ortam değişkeni geçerli (panelde henüz kayıt yok). Aşağıdaki kutuyu istediğin gibi işaretleyip Kaydet dediğin anda panel ayarı belirleyici olur.
              </p>
            ) : bakim.envValue ? (
              <p className="mt-2 text-xs opacity-90">Sunucuda MAINTENANCE_MODE={bakim.envValue} tanımlı ama panel ayarı önceliklidir; durumu aşağıdaki kutu belirler.</p>
            ) : null}
          </div>
          <SettingsForm settingKey="maintenance" title="Bakım modu (dışarıya gösterme)" values={bakim.setting as unknown as Record<string, string | boolean>} fields={[
            { key: "enabled", label: "Bakım modu açık (siteyi yalnızca yöneticiler görsün)", type: "checkbox" },
            { key: "title", label: "Bakım sayfası başlığı", type: "text" },
            { key: "message", label: "Bakım sayfası metni", type: "textarea", rows: 3 },
          ]} />
        </div>
      )}
      {sekme === "saglik" && <HealthCard items={health} />}
    </>
  );
}
