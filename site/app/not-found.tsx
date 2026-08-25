import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
      <p className="text-6xl font-bold text-navy-800">404</p>
      <h1 className="mt-2 text-xl font-semibold text-navy-800">Sayfa bulunamadı</h1>
      <p className="mt-1 text-muted">Aradığın sayfa taşınmış ya da kaldırılmış olabilir.</p>
      <Link href="/" className="btn-primary mt-6">Anasayfa</Link>
    </div>
  );
}
