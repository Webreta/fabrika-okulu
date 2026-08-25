import { getCurrentUser } from "@/lib/auth/session";
import { getSurveyState, getSurveyAnswers } from "@/lib/survey";
import { PageTitle } from "@/components/panel/ui";
import { SurveyForm } from "@/components/panel/SurveyForm";

export default async function SurveyPage() {
  const user = (await getCurrentUser())!;
  const s = await getSurveyState(user);
  const answers = await getSurveyAnswers(user.id, s.schema.key);
  return (
    <>
      <PageTitle title={s.title} sub={s.completed ? "Cevaplarını istediğin zaman güncelleyebilirsin." : "Sana uygun programları önerebilmemiz için."} />
      <div className="card max-w-2xl">
        <SurveyForm schema={s.schema} answers={answers} />
      </div>
    </>
  );
}
