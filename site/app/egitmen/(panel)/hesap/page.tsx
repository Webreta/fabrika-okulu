import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, instructors } from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { PageTitle } from "@/components/panel/ui";
import { AccountForm } from "@/components/panel/AccountForm";
import { InstructorProfileForm } from "@/components/teacher/InstructorProfileForm";
import { PushToggle } from "@/components/panel/PushToggle";

export default async function TeacherAccountPage() {
  const u = await requireTeacher();
  const [[row], [prof]] = await Promise.all([db.select().from(users).where(eq(users.id, u.id)).limit(1), db.select().from(instructors).where(eq(instructors.userId, u.id)).limit(1)]);
  return (
    <>
      <PageTitle title="Hesap" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card"><h2 className="mb-4 font-bold text-navy-800">Giriş bilgileri</h2><AccountForm user={{ firstName: row.firstName, lastName: row.lastName, email: row.email, phone: row.phone }} /></div>
        <div className="space-y-6">
          <div className="card"><h2 className="mb-1 font-bold text-navy-800">Eğitmen profili</h2><p className="mb-4 text-xs text-muted">Kurs sayfalarında görünür.</p>
            <InstructorProfileForm profile={prof ? { id: prof.id, name: prof.name, title: prof.title, email: prof.email, phone: prof.phone, bio: prof.bio, photoUrl: prof.photoUrl, socialLinks: prof.socialLinks } : null} />
          </div>
          <div className="card"><h2 className="mb-2 font-bold text-navy-800">Bildirimler</h2><PushToggle vapidKey={process.env.VAPID_PUBLIC_KEY ?? ""} /></div>
        </div>
      </div>
    </>
  );
}
