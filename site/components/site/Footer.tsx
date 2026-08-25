import Link from "next/link";
import Image from "next/image";

export function Footer({ text }: { text: string }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <Image src="/img/site/footer-logo.png" alt="Fabrika Okulu" width={800} height={293} className="h-auto w-56" />
          <p className="mt-3 font-script text-2xl text-navy-800">Kariyer gelişiminde yol arkadaşın.</p>
          <p className="mt-3 text-sm text-muted leading-relaxed">{text}</p>
        </div>
        <div>
          <h3 className="mb-3 font-bold text-navy-800">Site Haritası</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/" className="hover:text-sky-600">Anasayfa</Link></li>
            <li><Link href="/hakkimizda" className="hover:text-sky-600">Fabrika Okulu</Link></li>
            <li><Link href="/iletisim" className="hover:text-sky-600">İletişim</Link></li>
            <li><Link href="/panel" className="hover:text-sky-600">Hesabım</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-bold text-navy-800">Programlar</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/takvimli-programlar" className="hover:text-sky-600">Takvimli Programlar</Link></li>
            <li><Link href="/esnek-programlar" className="hover:text-sky-600">Esnek Programlar</Link></li>
            <li><Link href="/ucretsiz-kaynaklar" className="hover:text-sky-600">Ücretsiz Kaynaklar</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-bold text-navy-800">Yasal İçerikler</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/kvkk-aydinlatma-metni" className="hover:text-sky-600">KVKK Aydınlatma Metni</Link></li>
            <li><Link href="/cerez-politikasi" className="hover:text-sky-600">Çerez Politikası</Link></li>
            <li><Link href="/mesafeli-satis-sozlesmesi" className="hover:text-sky-600">Mesafeli Satış Sözleşmesi</Link></li>
            <li><Link href="/gizlilik-sozlesmesi" className="hover:text-sky-600">Gizlilik Sözleşmesi</Link></li>
            <li><Link href="/teslimat-ve-iade-sartlari" className="hover:text-sky-600">Teslimat ve İade Şartları</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Fabrika Okulu · Tüm Hakları Saklıdır</span>
          <Image src="/img/site/odeme.png" alt="Visa, Mastercard, iyzico" width={513} height={73} className="h-6 w-auto" />
          <a href="https://webreta.com.tr" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            Design By <Image src="/img/site/webreta.webp" alt="Webreta" width={300} height={50} className="h-4 w-auto" />
          </a>
        </div>
      </div>
    </footer>
  );
}
