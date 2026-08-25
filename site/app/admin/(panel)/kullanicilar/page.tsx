import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { PageTitle } from "@/components/panel/ui";
import { UserManager } from "@/components/admin/UserManager";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ s?: string; rol?: string }> }) {
  const { s, rol } = await searchParams;
  const me = (await getCurrentUser())!;
  const q = s?.trim() ?? "";
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
        <input name="s" defaultValue={q} placeholder="Ad / e-posta" className="input max-w-xs" />
        <select name="rol" defaultValue={rol ?? ""} className="input w-auto"><option value="">Tüm roller</option><option value="student">Öğrenci</option><option value="teacher">Eğitmen</option><option value="admin">Yönetici</option></select>
        <button className="btn-secondary">Filtrele</button>
      </form>
      <UserManager meId={me.id} users={list.map((u) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, role: u.role, isSuperTeacher: u.isSuperTeacher, active: u.active, createdAt: u.createdAt.toISOString() }))} />
    </>
  );
}
