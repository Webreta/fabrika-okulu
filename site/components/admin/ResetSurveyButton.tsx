"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetUserSurvey } from "@/app/actions/admin";

export function ResetSurveyButton({ userId }: { userId: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button disabled={pending} onClick={() => { if (confirm("Kullanıcının anketi sıfırlansın mı? Yeniden doldurması istenir.")) start(async () => { await resetUserSurvey(userId); router.refresh(); }); }} className="btn-secondary btn-sm text-red-600">{pending ? "…" : "Anketi sıfırla"}</button>
  );
}
