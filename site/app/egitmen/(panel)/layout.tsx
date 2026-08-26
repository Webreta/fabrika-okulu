import { requireTeacher } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notify";
import { teacherOverview } from "@/lib/data/teacher";
import { Shell, type NavItem } from "@/components/panel/Shell";
import { initials } from "@/lib/format";
import { db } from "@/db";
import { certificateTemplates } from "@/db/schema";

export default async function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireTeacher();
  const [unread, ov, certs] = await Promise.all([unreadCount(user.id), teacherOverview(user), db.select({ id: certificateTemplates.id }).from(certificateTemplates).limit(1)]);
  const primary: NavItem[] = [
    { href: "/egitmen", label: "Panelim", icon: "home", exact: true },
    { href: "/egitmen/kurslarim", label: "Eğitimlerim", icon: "book" },
    { href: "/egitmen/ogrenciler", label: "Öğrencilerim", icon: "users" },
    { href: "/egitmen/gonderim", label: "Görevler & Sınavlar", icon: "task", badge: ov.pendingSubs + ov.pendingQuizzes || undefined },
    { href: "/egitmen/sorular", label: "Sorular", icon: "message", badge: ov.pendingQuestions || undefined },
  ];
  const secondary: NavItem[] = [
    { href: "/egitmen/editor/yeni", label: "Yeni Eğitim", icon: "plus" },
    { href: "/egitmen/takvim", label: "Takvim", icon: "calendar" },
    { href: "/egitmen/bildirim", label: "Mesajlarım", icon: "mail", badge: unread || undefined },
  ];
  if (certs.length) secondary.push({ href: "/egitmen/sertifika", label: "Sertifikalar", icon: "award" });
  if (user.isSuperTeacher) {
    secondary.push({ href: "/egitmen/belgeler", label: "Belgeler & Kuponlar", icon: "doc" });
    secondary.push({ href: "/egitmen/anketler", label: "Anketler", icon: "survey" });
    secondary.push({ href: "/egitmen/duyuru", label: "Duyuru Gönder", icon: "megaphone" });
  }
  secondary.push({ href: "/egitmen/hesap", label: "Hesap", icon: "settings" });
  secondary.push({ href: "/panel", label: "Öğrenci Görünümü", icon: "user" });
  if (user.role === "admin") secondary.unshift({ href: "/admin", label: "Yönetim Paneli", icon: "settings" });

  return (
    <Shell primary={primary} secondary={secondary} unread={unread} homeHref="/egitmen" accent="teacher"
      user={{ name: user.name, email: user.email, initial: initials(user.name), roleLabel: user.role === "admin" ? "Yönetici" : user.isSuperTeacher ? "Süper eğitmen" : "Eğitmen" }}>
      {children}
    </Shell>
  );
}
