import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notify";
import { Shell, type NavItem } from "@/components/panel/Shell";
import { studentActions } from "@/lib/data/student";
import { pendingSurveyFor, requiredSurveyFor, studentGoalFlags } from "@/lib/survey";
import { RequiredSurveyGate } from "@/components/panel/RequiredSurveyGate";
import { initials } from "@/lib/format";
import { PushBanner } from "@/components/panel/PushBanner";
import { SurveyPopup } from "@/components/panel/SurveyPopup";
import { getSetting } from "@/lib/settings";
import { themeByKey } from "@/lib/panel-themes";
import { goalColor } from "@/lib/survey-logic";

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris");
  if (user.role === "teacher" || user.role === "admin") {
    // Eğitmen/admin de öğrenci panelini görebilir ama varsayılan yönlendirme kendi paneli
  }
  // Zorunlu test: tamamlanana kadar panelde yalnızca test sayfası açılır (menüler gizli)
  const gate = await requiredSurveyFor(user);
  if (gate) {
    const h = await headers();
    const path = h.get("x-fabo-path") ?? "";
    // Yalnızca TAM SAYFA yüklemesinde (307) yönlendirilir. Panel içi geçişte (RSC isteği; girişten sonraki yönlendirme de
    // böyledir) layout paylaşılan segment olarak istemcide önbelleğe alınır: burada atılan redirect, hedef sayfa
    // /panel/anket/[id] aynı layout'un altında olduğu için her geçişte yeniden fırlatılıyor ve sayfa sonsuz döngüde
    // boş kalıyordu (2026-10-10). O durumda yönlendirmeyi RequiredSurveyGate (istemci) yapar.
    // Ayrım: tarayıcı gezinmede `sec-fetch-dest: document` gönderir; RSC/fetch isteklerinde `empty`. (`rsc` başlığını ve
    // `_rsc` parametresini Next, middleware'e ve uygulamaya vermeden siler.) Başlık yoksa Accept'e bakılır.
    const dest = h.get("sec-fetch-dest");
    const fullLoad = dest ? dest !== "empty" : (h.get("accept") ?? "").includes("text/html");
    if (path && path !== `/panel/anket/${gate.id}` && fullLoad) redirect(`/panel/anket/${gate.id}`);
  }
  const [unread, actions, pendingSurvey, panelSettings, goalFlags] = await Promise.all([unreadCount(user.id), studentActions(user.id), pendingSurveyFor(user), getSetting("panel"), studentGoalFlags(user.id)]);
  const theme = themeByKey(user.panelTheme, panelSettings.defaultTheme);
  const pending = actions.items.filter((i) => !i.done).length;

  // Kariyer Hedefim sekmesi hedef bayrağının ikonunu ve rengini taşır (ilk cevaplı bayrak); bayrak yoksa hedef ikonu
  const goal = gate ? null : (goalFlags.find((f) => f.answer && f.color) ?? null);
  const primary: NavItem[] = [
    { href: "/panel", label: "Çalışma Odam", icon: "home", exact: true },
    { href: "/panel/takvim", label: "Gündemim", icon: "calendar" },
    { href: "/panel/anket", label: "Kariyer Hedefim", icon: goal ? "flag" : "target", color: goal ? goalColor(goal.color).hex : undefined, badge: pendingSurvey ? 1 : undefined },
  ];
  const secondary: NavItem[] = [
    { href: "/panel/bildirim", label: "Gelen Kutusu", icon: "mail", badge: unread || undefined },
    { href: "/panel/egitim?sekme=devam", label: "Devam Ettiklerim", icon: "play" },
    { href: "/panel/egitim", label: "Kitaplığım", icon: "library" },
    { href: "/panel/notlar", label: "Notlarım", icon: "edit" },
    { href: "/panel/aksiyon", label: "Aksiyonlarım", icon: "bolt", badge: pending || undefined },
    { href: "/panel/sertifika", label: "Sertifikalarım", icon: "award" },
    { href: "/panel/hesap", label: "Tercihler & Ayarlar", icon: "settings", match: ["/panel/gorunum", "/panel/bildirim-ayar", "/panel/ozgecmis", "/panel/belge", "/panel/kupon", "/panel/adres", "/panel/siparis"], end: true },
  ];
  if (user.role !== "student") secondary.unshift({ href: "/egitmen", label: "Eğitmen Paneli", icon: "users" });
  if (user.role === "admin") secondary.unshift({ href: "/admin", label: "Yönetim Paneli", icon: "settings" });

  return (
    <Shell
      primary={gate ? [] : primary}
      secondary={gate ? [] : secondary}
      user={{ name: user.name, email: user.email, initial: initials(user.name), roleLabel: user.role === "student" ? "Öğrenci" : user.role === "teacher" ? "Eğitmen" : "Yönetici" }}
      unread={unread}
      homeHref="/panel"
      theme={theme.key}
      menuStyle={panelSettings.menuStyle === "icon" || panelSettings.menuStyle === "tooltip" ? panelSettings.menuStyle : "normal"}
      flags={gate ? [] : goalFlags}
    >
      {/* Kapı tüm öğrencilerde takılıdır: test, panel açıkken zorunlu yapılırsa sonraki sayfa geçişinde yakalar */}
      {user.role === "student" ? <RequiredSurveyGate gate={gate ? { id: gate.id, title: gate.title } : null}>{children}</RequiredSurveyGate> : children}
      <PushBanner vapidKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
      {pendingSurvey && !gate && <SurveyPopup survey={{ id: pendingSurvey.id, title: pendingSurvey.title, intro: pendingSurvey.intro }} />}
    </Shell>
  );
}
