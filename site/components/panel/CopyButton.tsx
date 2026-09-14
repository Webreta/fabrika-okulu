"use client";

import { useState } from "react";
import { Icon } from "@/components/site/Icon";

/** Metni panoya kopyalayan küçük düğme (kupon kodu vb.) */
export function CopyButton({ text, label = "Kopyala" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* pano erişimi yoksa sessiz geç */ }
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-navy-800 hover:bg-surface"
    >
      <Icon name={done ? "check" : "copy"} className="size-3.5" />
      {done ? "Kopyalandı" : label}
    </button>
  );
}
