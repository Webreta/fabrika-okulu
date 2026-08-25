"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/site/Icon";

/** Sağ üstte kısa süre görünen bildirim */
export function Toast({ message, ok = true, onDone }: { message: string; ok?: boolean; onDone?: () => void }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => { setShow(false); onDone?.(); }, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!show) return null;
  return (
    <div className={`fixed right-4 top-24 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${ok ? "bg-emerald-600" : "bg-red-600"}`} role="status">
      <Icon name={ok ? "check" : "alert"} className="size-4" /> {message}
    </div>
  );
}
