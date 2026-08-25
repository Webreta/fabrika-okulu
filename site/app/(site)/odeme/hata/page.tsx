import Link from "next/link";

export default function PaymentErrorPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-red-600">Ödeme tamamlanamadı</h1>
      <p className="mt-2 text-muted">Kartından ücret çekilmedi. Tekrar deneyebilir ya da bizimle iletişime geçebilirsin.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/sepet" className="btn-primary">Sepete dön</Link>
        <Link href="/iletisim" className="btn-secondary">İletişim</Link>
      </div>
    </section>
  );
}
