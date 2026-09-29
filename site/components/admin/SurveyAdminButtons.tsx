"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishSurvey, deleteSurvey } from "@/app/actions/admin";

export function PublishSurveyButton({ id, published }: { id: number; published: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!published && !confirm("Anket yayınlansın mı? Testi tamamlamamış ve daha önce bildirim almamış öğrencilere bildirim gider; girişte pencere gösterilir.")) return;
        start(async () => {
          const r = await publishSurvey(id, !published);
          if (!r.ok) alert(r.error);
          else if (r.message) alert(r.message);
          router.refresh();
        });
      }}
      className={published ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
    >
      {pending ? "…" : published ? "Yayından kaldır" : "Yayınla"}
    </button>
  );
}

export function DeleteSurveyButton({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() => { if (prompt(`Silmek için anket adını yaz: "${title}"\nTüm cevaplar da silinir!`) === title) start(async () => { await deleteSurvey(id); router.refresh(); }); }}
      className="btn-secondary btn-sm text-red-600"
    >
      Sil
    </button>
  );
}
