import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { instructors, users, courses } from "@/db/schema";
import { PageTitle } from "@/components/panel/ui";
import { InstructorsManager } from "@/components/admin/InstructorsManager";

export default async function InstructorsPage() {
  const [list, us] = await Promise.all([
    db.select({ i: instructors, courseCount: sql<number>`(select count(*) from ${courses} c where c.instructor_id = "instructors"."id")`.mapWith(Number), userName: users.firstName, userLast: users.lastName }).from(instructors).leftJoin(users, eq(instructors.userId, users.id)).orderBy(asc(instructors.name)),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).orderBy(users.firstName).limit(500),
  ]);
  return (
    <>
      <PageTitle title="Eğitmenler" sub="Kurs sayfalarında görünen eğitmen profilleri. Bir kullanıcıya bağlanan profil eğitmen paneline giriş sağlar." />
      <InstructorsManager
        list={list.map((r) => ({ id: r.i.id, userId: r.i.userId, name: r.i.name, title: r.i.title, email: r.i.email, phone: r.i.phone, bio: r.i.bio, photoUrl: r.i.photoUrl, socialLinks: r.i.socialLinks, active: r.i.active, courseCount: r.courseCount, userLabel: r.userName ? `${r.userName} ${r.userLast}`.trim() : null }))}
        users={us.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() ? `${u.firstName} ${u.lastName} (${u.email})` : u.email }))}
      />
    </>
  );
}
