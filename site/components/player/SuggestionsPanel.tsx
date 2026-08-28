"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSuggestion } from "@/app/actions/player";
import { SUGGESTION_MAX_LEN, SUGGESTION_MAX_COUNT, type SuggestionItem } from "@/lib/suggestions";
import { relTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

/**
 * Kurs önerileri: öğrenci serbest metin öneri bırakır (kurs başına en çok 5, her biri 1000 karakter).
 * Önerilere cevap yazılmaz; öğrenci yalnızca kendi önerilerini listelenmiş görür.
 */
export function SuggestionsPanel({
  courseId,
  items: initial,
  preview = false,
}: {
  courseId: number;
  items: SuggestionItem[];
  preview?: boolean;
}) {
  const [items, setItems] = useState<SuggestionItem[]>(initial);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [thanks, setThanks] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const reached = items.length >= SUGGESTION_MAX_COUNT;
  const remaining = SUGGESTION_MAX_COUNT - items.length;

  const send = () =>
    start(async () => {
      const r = await addSuggestion(courseId, text);
      if (!r.ok) { setErr(r.error); setThanks(false); return; }
      setItems(r.items);
      setText("");
      setErr("");
      setThanks(true);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {thanks && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <Icon name="check" className="size-4" /> Öneriniz için teşekkür ederiz!
        </div>
      )}

      {preview ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">Önizleme modunda öneri gönderilemez.</p>
      ) : reached ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
          Bu kurs için öneri hakkını doldurdun (en fazla {SUGGESTION_MAX_COUNT} öneri). Önerilerin aşağıda listeleniyor.
        </p>
      ) : (
        <div className="rounded-xl border border-line p-3">
          <textarea
            rows={4}
            value={text}
            maxLength={SUGGESTION_MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            placeholder="Bu kursla ilgili önerini yaz…"
            className="input resize-y"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {text.length}/{SUGGESTION_MAX_LEN} · {remaining} öneri hakkın kaldı
            </span>
            <button onClick={send} disabled={pending || text.trim().length < 3} className="btn-primary btn-sm">
              <Icon name="send" className="size-4" /> Gönder
            </button>
          </div>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-navy-800">
          Önerilerin{items.length ? ` (${items.length}/${SUGGESTION_MAX_COUNT})` : ""}
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Henüz öneri bırakmadın.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-surface p-3">
                <p className="whitespace-pre-line text-sm text-ink">{s.text}</p>
                <p className="mt-1 text-[11px] text-muted">{relTime(s.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
