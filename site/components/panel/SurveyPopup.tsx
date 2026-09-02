"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/site/Icon";

/**
 * Yeni yayınlanan (ve kullanıcının doldurmadığı) hedef testi için popup.
 * Girişten hemen sonra da, panel içinde gezinirken de görünür.
 * "Daha sonra" bu tarayıcıda o anket için popup'ı kapatır; anket listede kalır.
 */
export function SurveyPopup({ survey }: { survey: { id: number; title: string; intro: string } }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const storageKey = `anket-gizle-${survey.id}`;

  useEffect(() => {
    if (pathname.startsWith("/panel/anket")) return; // zaten anket sayfasında
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {}
    setOpen(true);
  }, [pathname, storageKey]);

  if (!open) return null;
  const dismiss = () => {
    try { localStorage.setItem(storageKey, "1"); } catch {}
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-sky-100 text-sky-700"><Icon name="survey" className="size-7" /></span>
        <h2 className="mt-4 text-xl font-bold text-navy-800">Yeni hedef testi: {survey.title}</h2>
        {survey.intro && <p className="mt-2 text-sm text-muted">{survey.intro}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={dismiss} className="btn-secondary">Daha sonra</button>
          <button onClick={() => { setOpen(false); router.push(`/panel/anket/${survey.id}`); }} className="btn-primary">Teste git</button>
        </div>
      </div>
    </div>
  );
}
