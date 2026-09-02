import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notify";
import { Shell, type NavItem } from "@/components/panel/Shell";
import { studentActions } from "@/lib/data/student";
import { pendingSurveyFor } from "@/lib/survey";
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
  const [unread, actions, pendingSurvey, panelSettings] = await Promise.all([unreadCount(user.id), studentActions(user.id), pendingSurveyFor(user), getSetting("panel")]);
  const theme = themeByKey(user.panelTheme, panelSettings.defaultTheme);
  const pending = actions.items.filter((i) => !i.done).length;

  const primary: NavItem[] = [
    { href: "/panel", label: "Çalışma Odam", icon: "home", exact: true },
    { href: "/panel/takvim", label: "Gündemim", icon: "calendar" },
    { href: "/kesfet", label: "Keşfet", icon: "compass", newTab: true },
  ];
  const secondary: NavItem[] = [
    { href: "/panel/bildirim", label: "Gelen Kutusu", icon: "mail", badge: unread || undefined },
    { href: "/panel/egitim?sekme=devam", label: "Devam Eden Programlar", icon: "play" },
    { href: "/panel/egitim", label: "Kitaplığım", icon: "library" },
    { href: "/panel/notlar", label: "Notlarım", icon: "edit" },
    { href: "/panel/aksiyon", label: "Aksiyonlarım", icon: "bolt", badge: pending || undefined },
    { href: "/panel/sertifika", label: "Sertifikalarım", icon: "award" },
    { href: "/panel/anket", label: "Kariyer Hedefim", icon: "target", badge: pendingSurvey ? 1 : undefined },
    { href: "/panel/hesap", label: "Tercihler & Ayarlar", icon: "settings", match: ["/panel/gorunum", "/panel/bildirim-ayar", "/panel/ozgecmis", "/panel/belge", "/panel/adres", "/panel/siparis"], end: true },
  ];
  if (user.role !== "student") secondary.unshift({ href: "/egitmen", label: "Eğitmen Paneli", icon: "users" });
  if (user.role === "admin") secondary.unshift({ href: "/admin", label: "Yönetim Paneli", icon: "settings" });

  return (
    <Shell
      primary={primary}
      secondary={secondary}
      user={{ name: user.name, email: user.email, initial: initials(user.name), roleLabel: user.role === "student" ? "Öğrenci" : user.role === "teacher" ? "Eğitmen" : "Yönetici" }}
      unread={unread}
      homeHref="/panel"
      theme={theme.key}
      menuStyle={panelSettings.menuStyle === "icon" ? "icon" : "normal"}
    >
      {children}
      <PushBanner vapidKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
      {pendingSurvey && <SurveyPopup survey={{ id: pendingSurvey.id, title: pendingSurvey.title, intro: pendingSurvey.intro }} />}
    </Shell>
  );
}
