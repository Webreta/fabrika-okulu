"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetUserSurvey } from "@/app/actions/admin";

export function ResetSurveyButton({ userId, surveyKey }: { userId: number; surveyKey: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button disabled={pending} onClick={() => { if (confirm("Kullanıcının bu anket cevapları silinsin mi? Yeniden doldurması istenir.")) start(async () => { await resetUserSurvey(userId, surveyKey); router.refresh(); }); }} className="btn-secondary btn-sm text-red-600">{pending ? "…" : "Anketi sıfırla"}</button>
  );
}
