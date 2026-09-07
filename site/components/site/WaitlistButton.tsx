"use client";

import { useActionState } from "react";
import { waitlistAction, type WaitlistState } from "@/app/actions/waitlist";
import { Icon } from "@/components/site/Icon";

/**
 * Kontenjan dolu / kayıt açık dönem yokken "tekrar açılınca haber ver".
 * Giriş yapan tek tıkla listeye girer (ve vazgeçebilir); misafir e-posta bırakır.
 * Boş yer açılınca lib/waitlist.ts e-posta + bildirim gönderir.
 */
export function WaitlistButton({ courseId, periodId, loggedIn, waitlisted, userEmail, meeting = false }: { courseId: number; periodId?: number | null; loggedIn: boolean; waitlisted: boolean; userEmail?: string; meeting?: boolean }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(waitlistAction, {});
  const on = state.ok ?? waitlisted;
  const email = state.email ?? userEmail ?? "";
  const what = meeting ? "Yeni görüşme saati açılınca" : "Kontenjan açılınca";

  if (on) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <p className="flex items-center gap-2 font-semibold text-emerald-800"><Icon name="bell" className="size-4" /> Listedesin</p>
        <p className="mt-1 text-emerald-700">{what} <b>{email}</b> adresine e-posta göndereceğiz.</p>
        {loggedIn && (
          <form action={action} className="mt-2">
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="intent" value="leave" />
            <button disabled={pending} className="text-xs text-emerald-700 underline disabled:opacity-60">Vazgeç</button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="intent" value="join" />
      {periodId && <input type="hidden" name="periodId" value={periodId} />}
      <p className="text-sm text-amber-900">{meeting ? "Yeni görüşme saati" : "Yeni dönem ya da boş kontenjan"} açıldığında sana e-posta gönderelim.</p>
      {!loggedIn && (
        <div className="mt-2 grid gap-2">
          <input name="name" placeholder="Adın (isteğe bağlı)" className="input" autoComplete="name" />
          <input name="email" type="email" required placeholder="E-posta adresin" className="input" autoComplete="email" />
        </div>
      )}
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      <button disabled={pending} className="btn mt-2 w-full bg-amber-500 py-2.5 text-white hover:bg-amber-600 disabled:opacity-60">
        <Icon name="bell" className="size-4" /> {pending ? "Kaydediliyor…" : "Tekrar açılınca haber ver"}
      </button>
    </form>
  );
}
