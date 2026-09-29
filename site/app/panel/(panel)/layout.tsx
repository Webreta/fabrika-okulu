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

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris");
  if (user.role === "teacher" || user.role === "admin") {
    // Eğitmen/admin de öğrenci panelini görebilir ama varsayılan yönlendirme kendi paneli
  }
  // Zorunlu test: tamamlanana kadar panelde yalnızca test sayfası açılır (menüler gizli)
  const gate = await requiredSurveyFor(user);
  if (gate) {
    const path = (await headers()).get("x-fabo-path") ?? "";
    if (path && path !== `/panel/anket/${gate.id}`) redirect(`/panel/anket/${gate.id}`);
  }
  const [unread, actions, pendingSurvey, panelSettings, goalFlags] = await Promise.all([unreadCount(user.id), studentActions(user.id), pendingSurveyFor(user), getSetting("panel"), studentGoalFlags(user.id)]);
  const theme = themeByKey(user.panelTheme, panelSettings.defaultTheme);
  const pending = actions.items.filter((i) => !i.done).length;

  const primary: NavItem[] = [
    { href: "/panel", label: "Çalışma Odam", icon: "home", exact: true },
    { href: "/panel/takvim", label: "Gündemim", icon: "calendar" },
    { href: "/panel/anket", label: "Kariyer Hedefim", icon: "target", badge: pendingSurvey ? 1 : undefined },
  ];
  const secondary: NavItem[] = [
    { href: "/panel/bildirim", label: "Gelen Kutusu", icon: "mail", badge: unread || undefined },
    { href: "/panel/egitim?sekme=devam", label: "Devam Eden Programlar", icon: "play" },
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
