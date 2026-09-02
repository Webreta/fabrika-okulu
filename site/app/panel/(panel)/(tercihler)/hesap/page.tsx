import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { AccountForm } from "@/components/panel/AccountForm";

export default async function AccountPage() {
  const u = (await getCurrentUser())!;
  const [row] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-navy-800">Hesap Bilgileri</h2>
      <div className="max-w-2xl">
        <div className="card">
          <p className="mb-4 text-sm text-muted">Ad ve soyadın sertifikalarda görünür; doğru yazdığından emin ol.</p>
          <AccountForm user={{ firstName: row.firstName, lastName: row.lastName, email: row.email, phone: row.phone }} />
        </div>
      </div>
    </>
  );
}
