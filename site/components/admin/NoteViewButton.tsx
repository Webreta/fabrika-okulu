"use client";

import { useState } from "react";
import { Icon } from "@/components/site/Icon";

export function NoteViewButton({ text, student, meta }: { text: string; student: string; meta: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary btn-sm"><Icon name="eye" className="size-3.5" /> Notu gör</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-bold text-navy-800">{student}</p><p className="text-xs text-muted">{meta}</p></div>
              <button onClick={() => setOpen(false)} aria-label="Kapat"><Icon name="x" className="size-5" /></button>
            </div>
            <p className="mt-4 whitespace-pre-line rounded-xl bg-surface p-4 text-sm">{text}</p>
          </div>
        </div>
      )}
    </>
  );
}
