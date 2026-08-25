import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";
import { PageHero, CtaBand } from "@/components/site/Sections";
import { Icon } from "@/components/site/Icon";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "İletişim" };

export default async function ContactPage() {
  const [c, g] = await Promise.all([getSetting("contact"), getSetting("general")]);
  return (
    <>
      <PageHero title="Fabrika Okuluna ulaşın." />
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-14 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-navy-800 md:text-3xl">Neye ihtiyacın var?</h2>
          <p className="mt-3 text-muted">
            Her türlü bilgi ihtiyacın, sorun, önerin, geri bildirimin için bize ulaşabilirsin.
          </p>
          <h3 className="mt-10 text-xl font-bold text-navy-800">İletişim Bilgileri</h3>
          <dl className="mt-4 space-y-5 text-sm">
            <div className="flex gap-3">
              <Icon name="phone" className="mt-0.5 size-5 shrink-0 text-sky-500" />
              <div>
                <dt className="font-semibold text-navy-800">Telefon</dt>
                {c.phones.map((p) => (
                  <dd key={p}><a href={`tel:${p.replace(/\s/g, "")}`} className="text-muted hover:text-sky-600">{p}</a></dd>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Icon name="whatsapp" className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              <div>
                <dt className="font-semibold text-navy-800">WhatsApp</dt>
                {c.whatsapps.map((p) => (
                  <dd key={p}><a href={`https://wa.me/90${p.replace(/\D/g, "").replace(/^0/, "")}`} className="text-muted hover:text-sky-600">{p}</a></dd>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Icon name="mail" className="mt-0.5 size-5 shrink-0 text-sky-500" />
              <div>
                <dt className="font-semibold text-navy-800">E-posta</dt>
                <dd><a href={`mailto:${c.email}`} className="text-muted hover:text-sky-600">{c.email}</a></dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Icon name="mapPin" className="mt-0.5 size-5 shrink-0 text-sky-500" />
              <div>
                <dt className="font-semibold text-navy-800">Adres</dt>
                <dd className="whitespace-pre-line text-muted">{c.address}</dd>
              </div>
            </div>
          </dl>
          {c.mapEmbed && <div className="mt-8 overflow-hidden rounded-xl" dangerouslySetInnerHTML={{ __html: c.mapEmbed }} />}
        </div>
        <div className="card self-start">
          <h2 className="text-xl font-bold text-navy-800">İletişim Formu</h2>
          <ContactForm />
        </div>
      </section>
      <CtaBand title={g.ctaTitle} text={g.ctaText} />
    </>
  );
}
