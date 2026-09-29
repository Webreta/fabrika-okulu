"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { quizAttempts, quizzes } from "@/db/schema";
import { requireTeacher } from "@/lib/auth/session";
import { ownsCourse } from "@/lib/data/teacher";
import { quizStanding } from "@/lib/course-logic";
import { notifyUser } from "@/lib/notify";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Yeni deneme hakkı: öğrencinin o sınavdaki tamamlanmış denemeleri "geçersiz" sayılır (kayıt silinmez,
 * listede "Geçersiz" olarak durur) ve öğrenci sınavı baştan çözebilir. Kursun eğitmeni ya da yönetici verir.
 */
export async function grantQuizAttempt(attemptId: number): Promise<Result> {
  const user = await requireTeacher();
  if (!Number.isInteger(attemptId) || attemptId <= 0) return { ok: false, error: "Deneme bulunamadı." };
  const [row] = await db
    .select({ at: quizAttempts, q: quizzes })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(eq(quizAttempts.id, attemptId))
    .limit(1);
  if (!row || !(await ownsCourse(user, row.q.courseId))) return { ok: false, error: "Deneme bulunamadı." };
  if (row.at.voided) return { ok: false, error: "Bu deneme zaten geçersiz sayılmış." };

  const mine = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, row.q.id), eq(quizAttempts.userId, row.at.userId), eq(quizAttempts.voided, false)));
  const st = quizStanding(row.q, mine);
  if (st.passed) return { ok: false, error: "Öğrenci bu sınavı geçmiş; yeni hak gerekmiyor." };
  if (st.canAttempt) return { ok: false, error: "Öğrencinin deneme hakkı zaten var." };

  await db
    .update(quizAttempts)
    .set({ voided: true })
    .where(and(eq(quizAttempts.quizId, row.q.id), eq(quizAttempts.userId, row.at.userId), eq(quizAttempts.voided, false), ne(quizAttempts.status, "in_progress")));
  await notifyUser(row.at.userId, {
    title: "Yeni deneme hakkı",
    body: `"${row.q.title}" sınavını yeniden çözebilirsin.`,
    url: `/kurs-izle/${row.q.courseId}?quiz=${row.q.id}`,
    tag: `quiz-hak-${row.q.id}`,
  });
  revalidatePath("/egitmen/gonderim");
  revalidatePath("/admin/gonderimler");
  revalidatePath(`/egitmen/detay/${row.q.courseId}`);
  revalidatePath(`/kurs-izle/${row.q.courseId}`);
  return { ok: true, message: "Yeni deneme hakkı verildi; öğrenciye bildirildi." };
}
