import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notify";
import { Shell, type NavItem } from "@/components/panel/Shell";
import { studentActions } from "@/lib/data/student";
import { getSurveyState } from "@/lib/survey";
import { initials } from "@/lib/format";
import { PushBanner } from "@/components/panel/PushBanner";
import { getSetting } from "@/lib/settings";
import { themeByKey } from "@/lib/panel-themes";

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/panel/giris");
  if (user.role === "teacher" || user.role === "admin") {
    // Eğitmen/admin de öğrenci panelini görebilir ama varsayılan yönlendirme kendi paneli
  }
  const [unread, actions, survey, panelSettings] = await Promise.all([unreadCount(user.id), studentActions(user.id), getSurveyState(user), getSetting("panel")]);
  const theme = themeByKey(user.panelTheme, panelSettings.defaultTheme);
  const pending = actions.items.filter((i) => !i.done).length;

  const primary: NavItem[] = [
    { href: "/panel", label: "Panelim", icon: "home", exact: true },
    { href: "/panel/egitim", label: "Eğitimlerim", icon: "book" },
    { href: "/panel/takvim", label: "Takvim", icon: "calendar" },
    { href: "/panel/aksiyon", label: "Aksiyonlarım", icon: "task", badge: pending || undefined },
  ];
  const secondary: NavItem[] = [
    { href: "/panel/bildirim", label: "Mesajlarım", icon: "mail", badge: unread || undefined },
    { href: "/panel/notlar", label: "Notlarım", icon: "edit" },
    { href: "/panel/sertifika", label: "Sertifikalarım", icon: "award" },
    { href: "/panel/belge", label: "Belge Yükle", icon: "upload" },
    { href: "/panel/anket", label: survey.title, icon: "survey" },
    { href: "/panel/siparis", label: "Satınalma Geçmişim", icon: "cart" },
    { href: "/panel/hesap", label: "Tercihler & Ayarlar", icon: "settings" },
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
    >
      {children}
      <PushBanner vapidKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
    </Shell>
  );
}
