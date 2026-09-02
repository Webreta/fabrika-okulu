import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { studentActions } from "@/lib/data/student";
import { fmtDateTime } from "@/lib/format";
import { PageTitle, Empty, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function ActionsPage() {
  const user = (await getCurrentUser())!;
  const { items } = await studentActions(user.id);
  const pending = items.filter((i) => !i.done);
  const nearest = pending.find((i) => i.due);

  return (
    <>
      <PageTitle title="Aksiyonlarım" />
      {nearest && nearest.due && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Icon name="alert" className="size-5" /> En yakın son tarih: <b>{nearest.title}</b> — {fmtDateTime(nearest.due)}
        </div>
      )}
      {items.length === 0 ? (
        <Empty text="Henüz görev, sınav ya da görüşmen yok." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={`${i.kind}-${i.id}`} className="card flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className={`flex size-10 items-center justify-center rounded-xl ${i.done ? "bg-emerald-50 text-emerald-600" : i.kind === "quiz" ? "bg-sky-100 text-sky-700" : i.kind === "meeting" ? "bg-purple-50 text-purple-700" : "bg-amber-50 text-amber-700"}`}>
                  <Icon name={i.done ? "check" : i.kind === "quiz" ? "quiz" : i.kind === "meeting" ? "video" : "edit"} className="size-5" />
                </span>
                <span className="flex items-center gap-1.5">
                  <Chip color={i.kind === "quiz" ? "sky" : i.kind === "meeting" ? "purple" : "amber"}>{i.kind === "quiz" ? "Sınav" : i.kind === "meeting" ? "Görüşme" : "Görev"}</Chip>
                  {i.kind === "assignment" && i.status === "graded" ? (
                    <Chip color="green">Puan: {i.score}/100</Chip>
                  ) : i.kind === "quiz" && i.best !== null ? (
                    <Chip color="sky">%{Math.round(i.best)}</Chip>
                  ) : (
                    <Chip color={i.done ? "green" : "amber"}>{i.done ? (i.status === "submitted" ? "Teslim edildi" : i.status === "attended" ? "Katıldım" : "Tamamlandı") : "Bekliyor"}</Chip>
                  )}
                </span>
              </div>
              <h3 className="mt-3 font-bold text-navy-800">{i.title}</h3>
              <p className={`text-xs text-muted${i.due ? "" : " mb-4"}`}>{i.courseTitle}</p>
              {i.due && <p className="mt-2 mb-4"><span className={`date-chip ${!i.done && i.due.getTime() < Date.now() ? "bg-red-100 text-red-700" : ""}`}>{i.kind === "meeting" ? "Görüşme" : "Son tarih"}: {fmtDateTime(i.due)}</span></p>}
              <Link href={i.link} className="btn-secondary btn-sm mt-auto self-start">{i.kind === "quiz" ? (i.done ? "Sonucu gör" : "Sınava başla") : i.kind === "meeting" ? "Görüşmeye git" : "Göreve git"}</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
