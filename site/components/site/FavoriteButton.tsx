"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { toggleFavoriteAction, type FavoriteState } from "@/app/actions/favorites";
import { Icon } from "@/components/site/Icon";

/**
 * Favori kalbi. `variant="overlay"` kart görselinin köşesinde yuvarlak düğme; `variant="inline"` metinli düğme (program sayfası).
 * Giriş yoksa sunucu aksiyonu girişe yönlendirir. İndirim başlayınca favorileyene bildirim gider (lib/favorites.ts).
 */
export function FavoriteButton({ courseId, initial, variant = "overlay" }: { courseId: number; initial: boolean; variant?: "overlay" | "inline" }) {
  const [state, action, pending] = useActionState<FavoriteState, FormData>(toggleFavoriteAction, {});
  const fav = state.fav ?? initial;
  const path = usePathname();

  if (variant === "inline") {
    return (
      <form action={action}>
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="back" value={path} />
        <button
          disabled={pending}
          aria-pressed={fav}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${fav ? "border-rose-200 bg-rose-50 text-rose-600" : "border-line bg-white text-navy-800 hover:border-rose-200 hover:text-rose-600"}`}
        >
          <Icon name="heart" className={`size-4 ${fav ? "fill-current" : ""}`} /> {fav ? "Favorilerinde" : "Favorilere ekle"}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="absolute right-3 top-3 z-10">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="back" value={path} />
      <button
        disabled={pending}
        aria-pressed={fav}
        aria-label={fav ? "Favorilerden çıkar" : "Favorilere ekle"}
        title={fav ? "Favorilerden çıkar" : "Favorilere ekle"}
        className={`flex size-9 items-center justify-center rounded-full shadow transition disabled:opacity-60 ${fav ? "bg-rose-500 text-white" : "bg-white/95 text-navy-800 hover:text-rose-500"}`}
      >
        <Icon name="heart" className={`size-4 ${fav ? "fill-current" : ""}`} />
      </button>
    </form>
  );
}
