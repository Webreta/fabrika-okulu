"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/site/Icon";

export type RecoCard = {
  courseId: number;
  slug: string;
  title: string;
  imageUrl: string;
  sourceTitle: string;
  trigger: "completed" | "purchased";
  discountPercent: number;
  note: string;
  price: number;
  finalPrice: number;
};

const fmt = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);

/**
 * Panel tanıtım alanı: tetiklenen kurs önerileri (slider).
 * Bitirme kaynaklı öneriler tebrik mesajıyla, satın alma kaynaklılar tavsiye diliyle gösterilir.
 */
export function RecoSlider({ items }: { items: RecoCard[] }) {
  const [idx, setIdx] = useState(0);
  const many = items.length > 1;

  // Otomatik geçiş (7 sn) — tek kartta çalışmaz
  useEffect(() => {
    if (!many) return;
    const t = setInterval(() => setIdx((x) => (x + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [many, items.length]);

  if (!items[idx]) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      {/* Tüm kartlar aynı grid hücresinde üst üste durur: kutu yüksekliği en uzun karta
          göre sabitlenir, slider geçişlerinde daralıp büyümez. */}
      <div className="grid">
        {items.map((r, i) => {
          const headline = r.trigger === "completed"
            ? `🎉 ${r.sourceTitle} programını bitirmeni tebrik ederiz!`
            : `${r.sourceTitle} ile birlikte iyi gider`;
          const sub = r.note || (r.trigger === "completed"
            ? (r.discountPercent > 0 ? `Sana özel %${r.discountPercent} indirimle bu programla devam edebilirsin!` : "Yolculuğuna bu programla devam edebilirsin.")
            : (r.discountPercent > 0 ? `Sana özel %${r.discountPercent} indirim seni bekliyor.` : "Bu program da ilgini çekebilir."));
          return (
            <div key={r.courseId} aria-hidden={i !== idx} className={`col-start-1 row-start-1 flex flex-col transition-opacity duration-300 ${i === idx ? "opacity-100" : "invisible opacity-0"}`}>
              <div className="relative aspect-[5/2] shrink-0 bg-navy-50">
                {r.imageUrl ? (
                  <Image src={r.imageUrl} alt="" width={500} height={200} className="aspect-[5/2] w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-sky-400 to-navy-700" />
                )}
                {r.discountPercent > 0 && (
                  <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow">%{r.discountPercent} İNDİRİM</span>
                )}
                {r.trigger === "completed" && (
                  <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shadow">SANA ÖZEL</span>
                )}
              </div>
              <div className={`flex flex-1 flex-col p-4 ${many ? "pb-0" : ""}`}>
                <p className="text-xs font-semibold text-sky-600">{headline}</p>
                <h3 className="mt-1 font-bold leading-snug text-navy-800">{r.title}</h3>
                <p className="mt-1 text-sm text-muted">{sub}</p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <div>
                    {r.price > 0 ? (
                      r.discountPercent > 0 ? (
                        <><span className="text-xs text-muted line-through">{fmt(r.price)}</span> <span className="font-bold text-navy-800">{fmt(r.finalPrice)}</span></>
                      ) : (
                        <span className="font-bold text-navy-800">{fmt(r.price)}</span>
                      )
                    ) : (
                      <span className="font-bold text-emerald-600">Ücretsiz</span>
                    )}
                  </div>
                  <Link href={`/program/${r.slug}`} className="btn-primary btn-sm" tabIndex={i === idx ? undefined : -1}>İncele</Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {many && (
        <div className="p-4 pt-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setIdx((idx - 1 + items.length) % items.length)} className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label="Önceki"><Icon name="chevronUp" className="size-4 -rotate-90" /></button>
            <div className="flex gap-1.5">
              {items.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} className={`size-2 rounded-full transition ${i === idx ? "bg-navy-800" : "bg-navy-100"}`} aria-label={`Öneri ${i + 1}`} />
              ))}
            </div>
            <button onClick={() => setIdx((idx + 1) % items.length)} className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label="Sonraki"><Icon name="chevronDown" className="size-4 -rotate-90" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
