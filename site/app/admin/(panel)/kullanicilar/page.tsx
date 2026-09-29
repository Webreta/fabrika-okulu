import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, getCurrentUser } from "@/lib/auth/session";
import { PageTitle } from "@/components/panel/ui";
import { UserManager } from "@/components/admin/UserManager";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ s?: string; rol?: string }> }) {
  // Sayfa kendi yetkisini denetler: layout'taki yönlendirme, sayfa verisinin yanıt gövdesine yazılmasını engellemez
  await requireAdmin();
  const sp = await searchParams;
  // Adres çubuğundan gelen değerler: bilinmeyen rol yok sayılır, arama metni kısaltılır
  const rol = ["student", "teacher", "admin"].includes(sp.rol ?? "") ? sp.rol : undefined;
  const me = (await getCurrentUser())!;
  const q = (sp.s?.trim() ?? "").slice(0, 100);
  const list = await db
    .select()
    .from(users)
    .where(sql`(${q ? sql`${users.email} ilike ${"%" + q + "%"} or ${users.firstName} ilike ${"%" + q + "%"} or ${users.lastName} ilike ${"%" + q + "%"}` : sql`true`}) and (${rol ? sql`${users.role} = ${rol}` : sql`true`})`)
    .orderBy(desc(users.createdAt))
    .limit(300);
  return (
    <>
      <PageTitle title="Kullanıcılar" sub={`${list.length} kullanıcı`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Ad / e-posta" name="s" defaultValue={q} maxLength={100} placeholder="Ad / e-posta" className="input max-w-xs" />
        <select aria-label="Rol" name="rol" defaultValue={rol ?? ""} className="input w-auto"><option value="">Tüm roller</option><option value="student">Öğrenci</option><option value="teacher">Eğitmen</option><option value="admin">Yönetici</option></select>
        <button className="btn-secondary">Filtrele</button>
      </form>
      {list.length >= 300 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">En yeni 300 kullanıcı gösteriliyor. Daha eskileri için arama ya da filtre kullan.</p>}
      <UserManager meId={me.id} users={list.map((u) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, role: u.role, isSuperTeacher: u.isSuperTeacher, active: u.active, createdAt: u.createdAt.toISOString() }))} />
    </>
  );
}
