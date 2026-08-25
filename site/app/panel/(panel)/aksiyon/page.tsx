import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { studentActions } from "@/lib/data/student";
import { fmtDateTime } from "@/lib/format";
import { PageTitle, Empty, Chip, Kpi } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function ActionsPage() {
  const user = (await getCurrentUser())!;
  const { items } = await studentActions(user.id);
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const scores = items.filter((i) => i.kind === "quiz" && i.best !== null).map((i) => i.best as number);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const nearest = pending.find((i) => i.due);

  return (
    <>
      <PageTitle title="Aksiyonlarım" sub="Görevlerin ve sınavların" />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Kpi label="Bekleyen" value={pending.length} icon="task" color="amber" />
        <Kpi label="Tamamlanan" value={done.length} icon="check" color="green" />
        <Kpi label="Sınav ortalaması" value={avg} icon="quiz" color="sky" />
      </div>
      {nearest && nearest.due && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Icon name="alert" className="size-5" /> En yakın son tarih: <b>{nearest.title}</b> — {fmtDateTime(nearest.due)}
        </div>
      )}
      {items.length === 0 ? (
        <Empty text="Henüz görev ya da sınavın yok." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={`${i.kind}-${i.id}`} className="card flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className={`flex size-10 items-center justify-center rounded-xl ${i.done ? "bg-emerald-50 text-emerald-600" : i.kind === "quiz" ? "bg-sky-100 text-sky-700" : "bg-amber-50 text-amber-700"}`}>
                  <Icon name={i.done ? "check" : i.kind === "quiz" ? "quiz" : "edit"} className="size-5" />
                </span>
                {i.kind === "assignment" && i.status === "graded" ? (
                  <Chip color="green">Puan: {i.score}/100</Chip>
                ) : i.kind === "quiz" && i.best !== null ? (
                  <Chip color="sky">%{Math.round(i.best)}</Chip>
                ) : (
                  <Chip color={i.done ? "green" : "amber"}>{i.done ? (i.status === "submitted" ? "Teslim edildi" : "Tamamlandı") : "Bekliyor"}</Chip>
                )}
              </div>
              <h3 className="mt-3 font-bold text-navy-800">{i.title}</h3>
              <p className="text-xs text-muted"><Chip color={i.kind === "quiz" ? "sky" : "amber"}>{i.kind === "quiz" ? "Sınav" : "Görev"}</Chip> <span className="ml-1">{i.courseTitle}</span></p>
              {i.due && <p className={`mt-2 text-xs ${!i.done && i.due.getTime() < Date.now() ? "text-red-600" : "text-muted"}`}>Son tarih: {fmtDateTime(i.due)}</p>}
              <Link href={i.link} className="btn-secondary btn-sm mt-auto pt-2 self-start mt-4">{i.kind === "quiz" ? (i.done ? "Sonucu gör" : "Sınava başla") : "Göreve git"}</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
