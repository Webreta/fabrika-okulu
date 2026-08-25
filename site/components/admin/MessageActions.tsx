"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMessageRead, deleteMessage } from "@/app/actions/admin";

export function MessageActions({ id, read }: { id: number; read: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2 text-xs">
      <button disabled={pending} onClick={() => start(async () => { await markMessageRead(id, !read); router.refresh(); })} className="btn-secondary btn-sm">{read ? "Okunmadı yap" : "Okundu"}</button>
      <button disabled={pending} onClick={() => { if (confirm("Silinsin mi?")) start(async () => { await deleteMessage(id); router.refresh(); }); }} className="btn-secondary btn-sm text-red-600">Sil</button>
    </div>
  );
}
