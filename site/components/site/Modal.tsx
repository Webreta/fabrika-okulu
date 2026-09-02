"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Popup kabuğu: body'ye portal ile basılır (sayfadaki z-index/transform kapsamlarından bağımsız),
 * açıkken sayfa kaydırması kilitlenir, dışına tıklayınca kapanır.
 */
export function Modal({ open, onClose, children, className = "max-w-md" }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ${className}`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body
  );
}
