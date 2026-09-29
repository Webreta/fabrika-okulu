import Link from "next/link";

// Olmayan ya da iptal edilmiş sertifika adresi (404)
export default function CertificateNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-navy-800">Sertifika bulunamadı</h1>
        <p className="mt-2 text-muted">Bağlantı geçersiz ya da sertifika iptal edilmiş.</p>
        <Link href="/" className="btn-primary mt-6">Anasayfa</Link>
      </div>
    </div>
  );
}
