"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMeetingAttended } from "@/app/actions/panel";
import { Icon } from "@/components/site/Icon";

/** "Bu görüşmeye katıldım" — yalnızca görüşme saati geçince tıklanabilir (sunucu da kontrol eder) */
export function MeetingAttendButton({ courseId, periodId, sessionIndex, label = "Bu görüşmeye katıldım", className = "btn-primary w-full" }: { courseId: number; periodId: number; sessionIndex: number; label?: string; className?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { const r = await markMeetingAttended(courseId, periodId, sessionIndex); if (r.error) setErr(r.error); else router.refresh(); })}
        className={className}
      >
        <Icon name="check" className="size-4" /> {pending ? "Kaydediliyor…" : label}
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
