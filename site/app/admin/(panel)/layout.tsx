import Link from "next/link";
import Image from "next/image";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { questions, documents, contactMessages, orders, assignmentSubmissions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { Icon } from "@/components/site/Icon";
import { AdminNav, type AdminNavItem } from "@/components/admin/AdminNav";
import { SeenTracker } from "@/components/admin/SeenTracker";
import { newCounts } from "@/lib/admin-seen";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();
  const cnt = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const fresh = await newCounts(user.id);
  const [pq, pd, pm, po, ps] = await Promise.all([
    cnt(db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(questions).where(eq(questions.status, "pending"))),
    cnt(db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(documents).where(eq(documents.status, "pending"))),
    cnt(db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(contactMessages).where(eq(contactMessages.read, false))),
    cnt(db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(and(eq(orders.status, "pending"), eq(orders.provider, "manual")))),
    cnt(db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(assignmentSubmissions).where(eq(assignmentSubmissions.status, "pending"))),
  ]);

  const items: AdminNavItem[] = [
    { href: "/admin", label: "Gösterge Paneli", icon: "home", group: "Genel" },
    { href: "/admin/kurslar", label: "Kurslar", icon: "book", group: "Eğitim" },
    { href: "/admin/egitmenler", label: "Eğitmenler", icon: "users" },
    { href: "/admin/ogrenciler", label: "Kayıtlı Öğrenciler", icon: "user", badge: fresh.ogrenciler || undefined },
    { href: "/admin/gonderimler", label: "Görevler & Sınavlar", icon: "task", badge: ps || undefined },
    { href: "/admin/sorular", label: "Öğrenci Soruları", icon: "message", badge: pq || undefined },
    { href: "/admin/notlar", label: "Öğrenci Notları", icon: "edit", badge: fresh.notlar || undefined },
    { href: "/admin/sertifikalar", label: "Sertifikalar", icon: "award", badge: fresh.sertifikalar || undefined },
    { href: "/admin/siparisler", label: "Siparişler", icon: "cart", group: "Satış", badge: (po + fresh.siparisler) || undefined },
    { href: "/admin/kuponlar", label: "Kuponlar", icon: "tag" },
    { href: "/admin/belgeler", label: "Belgeler", icon: "doc", badge: pd || undefined },
    { href: "/admin/kullanicilar", label: "Kullanıcılar", icon: "users", group: "Kullanıcılar", badge: fresh.kullanicilar || undefined },
    { href: "/admin/anketler", label: "Anketler", icon: "survey", badge: fresh.anketler || undefined },
    { href: "/admin/bildirimler", label: "Bildirimler", icon: "bell" },
    { href: "/admin/mesajlar", label: "İletişim Mesajları", icon: "mail", badge: pm || undefined },
    { href: "/admin/icerik", label: "Site İçeriği", icon: "edit", group: "Site" },
    { href: "/admin/ayarlar", label: "Ayarlar", icon: "settings" },
  ];

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-white lg:flex">
        <div className="border-b border-line px-5 py-4">
          <Link href="/admin"><Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={120} height={137} className="h-12 w-auto" /></Link>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Yönetim Paneli</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          <AdminNav items={items} />
          <div className="mt-3 border-t border-line pt-3">
            <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-500 hover:bg-navy-50"><Icon name="external" className="size-4 text-navy-400" />Siteye dön</a>
          </div>
        </nav>
        <div className="border-t border-line p-3 text-sm">
          <a href="https://webreta.com.tr" target="_blank" rel="noopener noreferrer" className="mb-2 block text-center"><Image src="/img/site/webreta.webp" alt="Webreta" width={300} height={50} className="mx-auto h-3.5 w-auto" /><p className="mt-1 text-[10px] text-muted">tarafından geliştirilmiştir</p></a>
          <p className="truncate px-3 text-xs text-muted">{user.name}</p>
          <form action={logout}><input type="hidden" name="to" value="/admin/giris" /><button className="w-full rounded-lg px-3 py-2 text-left font-medium text-red-700 hover:bg-red-50">Çıkış yap</button></form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
          <Link href="/admin"><Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={100} height={114} className="h-10 w-auto" /></Link>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg p-2 hover:bg-surface"><Icon name="menu" className="size-6 text-navy-800" /></summary>
            <nav className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-xl"><AdminNav items={items} /></nav>
          </details>
        </header>
        <main className="admin-main flex-1 p-4 lg:p-8">{children}</main>
        <SeenTracker hasNew={fresh} />
      </div>
    </div>
  );
}
