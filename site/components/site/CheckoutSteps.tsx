import { Icon } from "@/components/site/Icon";

const STEPS = ["Sepet", "Ödeme", "Tamamlandı"];

/**
 * Sepet ve ödeme sayfalarının ortak başlığı: sayfa adı + alt metin + üç adımlı ilerleme (Sepet → Ödeme → Tamamlandı).
 * `step`: etkin adımın sırası (1 = sepet, 2 = ödeme). Önceki adımlar onay işaretiyle gösterilir.
 */
export function CheckoutHeader({ step, title, sub }: { step: 1 | 2; title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      <ol className="flex items-center gap-1.5 text-xs font-semibold sm:gap-2" aria-label="Satın alma adımları">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const on = n === step;
          return (
            <li key={s} className="flex items-center gap-1.5 sm:gap-2" aria-current={on ? "step" : undefined}>
              {i > 0 && <span className={`h-px w-4 sm:w-8 ${n <= step ? "bg-navy-800" : "bg-line"}`} aria-hidden />}
              <span className={`flex size-6 items-center justify-center rounded-full text-[11px] ${done ? "bg-emerald-500 text-white" : on ? "bg-navy-800 text-white" : "bg-surface text-muted ring-1 ring-line"}`}>
                {done ? <Icon name="check" className="size-3.5" /> : n}
              </span>
              <span className={on ? "text-navy-800" : done ? "text-emerald-700" : "text-muted"}>{s}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Özet kartının altındaki güven satırları (sepet ve ödeme sayfasında aynı) */
export function CheckoutTrust() {
  const rows: { icon: "lock" | "play" | "mail"; text: string }[] = [
    { icon: "lock", text: "Güvenli ödeme; kart bilgilerin sitemizde saklanmaz" },
    { icon: "play", text: "Ödeme onaylanınca eğitim Kitaplığına eklenir" },
    { icon: "mail", text: "Sipariş özeti e-posta adresine gönderilir" },
  ];
  return (
    <ul className="space-y-2 text-xs text-navy-700">
      {rows.map((r) => (
        <li key={r.text} className="flex items-start gap-2"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600"><Icon name={r.icon} className="size-3" /></span>{r.text}</li>
      ))}
    </ul>
  );
}
