import { getCurrentUser } from "@/lib/auth/session";
import { NotifyPrefsForm } from "@/components/panel/NotifyPrefsForm";
import { PushToggle } from "@/components/panel/PushToggle";

/** Tercihler → Bildirimler: tarayıcı bildirimi izni + konu bazlı aç/kapa */
export default async function NotificationPrefsPage() {
  const u = (await getCurrentUser())!;
  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-navy-800">Bildirimler</h2>
      <div className="card max-w-3xl">
        {/* Tarayıcı bildirimleri en üstte, konu listesinin hemen üzerinde */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
          <div>
            <h3 className="font-bold text-navy-800">Tarayıcı bildirimleri</h3>
            <p className="text-sm text-muted">Panel kapalıyken de haberdar olmak için tarayıcı bildirimlerini aç. Konu seçimlerin burada da geçerlidir.</p>
          </div>
          <PushToggle vapidKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
        </div>
        <NotifyPrefsForm initial={u.notifyPrefs} title="Bildirim e-postaları" />
      </div>
    </>
  );
}
