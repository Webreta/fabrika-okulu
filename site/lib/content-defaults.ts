export const DEFAULT_ABOUT = {
  title: "Fabrika Okulu: Kariyer gelişiminde yol arkadaşın.",
  html: `<p>2023 yılında kurulan ÜRETMER çatısı altında yer alan Fabrika Okulu, çalışan adaylarına ve çalışanlara kariyer gelişimi ve kişisel dönüşüm ortamı sunmaktadır. Fabrika okulu, işyerinde gerekli teknik ve sosyal becerilere dönük programlar hazırlamaktadır.</p>
<p>Esnek zamanlı online erişim, gruplu / bire bir mentorluk desteği, kişisel aksiyon takibi gibi hizmetler sunan Fabrika Okulu, üretim ve hizmet sektörlerinden gelen operasyon, yönetim ve gelişim tecrübesini katılımcılara aktarmaktadır.</p>`,
};

export type ShowcaseContent = { title: string; sub: string; columns: 2 | 3; limit: number; courseIds: number[] };

/** Anasayfa vitrini; admin → Vitrin sekmesi (ayar anahtarı: showcase). courseIds boşsa öne çıkan/sıra numarasına göre `limit` kart. */
export const DEFAULT_SHOWCASE: ShowcaseContent = { title: "Gündemdeki Eğitimler", sub: "", columns: 3, limit: 3, courseIds: [] };

export type CatalogContent = { title: string; sub: string };

/** "Tüm Eğitimler" (/kesfet) sayfa başlığı ve alt metni; admin → Kategoriler'deki sabit "Tüm Eğitimler" satırından düzenlenir (ayar anahtarı: catalog) */
export const DEFAULT_CATALOG: CatalogContent = { title: "Gelişim Programlarını Keşfet", sub: "Kendi hızında ya da takvimli: hedefine uygun programı seç." };

export type FooterLink = { label: string; href: string };
/** categories: true → eğitim kategorileri (Kategoriler sayfasındaki sırayla) bağlantıların üstüne otomatik eklenir */
export type FooterColumn = { title: string; categories: boolean; links: FooterLink[] };
export type FooterContent = {
  logo: string;
  slogan: string;
  /** Boşsa eski "Footer metni" (general.footerText) kullanılır */
  text: string;
  /** auto: İletişim ayarındaki ilk telefon/WhatsApp/e-posta · custom: aşağıdaki alanlar · hidden: kutular yok */
  contactMode: "auto" | "custom" | "hidden";
  phone: string;
  whatsapp: string;
  email: string;
  showSocials: boolean;
  columns: FooterColumn[];
};
export const FOOTER_MAX_COLUMNS = 4;

/** Footer içeriği; admin → Site İçeriği → Footer sekmesinden düzenlenir (ayar anahtarı: footer). Telif şeridi sabittir. */
export const DEFAULT_FOOTER: FooterContent = {
  logo: "/img/site/footer-logo.png",
  slogan: "Kariyer gelişiminde yol arkadaşın.",
  text: "",
  contactMode: "auto",
  phone: "",
  whatsapp: "",
  email: "",
  showSocials: true,
  columns: [
    { title: "Site Haritası", categories: false, links: [{ href: "/", label: "Anasayfa" }, { href: "/hakkimizda", label: "Fabrika Okulu" }, { href: "/rotam", label: "Rotam" }, { href: "/sss", label: "S.S.S." }, { href: "/iletisim", label: "İletişim" }, { href: "/panel", label: "Hesabım" }] },
    { title: "Eğitimler", categories: true, links: [{ href: "/kesfet", label: "Tüm Eğitimler" }] },
    { title: "Yasal", categories: false, links: [{ href: "/kvkk-aydinlatma-metni", label: "KVKK Aydınlatma Metni" }, { href: "/cerez-politikasi", label: "Çerez Politikası" }, { href: "/mesafeli-satis-sozlesmesi", label: "Mesafeli Satış Sözleşmesi" }, { href: "/gizlilik-sozlesmesi", label: "Gizlilik Sözleşmesi" }, { href: "/teslimat-ve-iade-sartlari", label: "Teslimat ve İade Şartları" }] },
  ],
};

export type FaqItem = { q: string; a: string };
/** homeLimit: anasayfada ilk kaç soru görünsün (tamamı /sss sayfasında) */
export type FaqContent = { title: string; sub: string; homeLimit: number; items: FaqItem[] };

/** Anasayfa "Merak Edilenler" bölümü; admin Site İçeriği → Merak Edilenler sekmesinden düzenlenir (ayar anahtarı: faq) */
export const DEFAULT_FAQ: FaqContent = {
  title: "Merak Edilenler",
  sub: "Programlar, katılım ve ödeme hakkında en çok sorulanlar.",
  homeLimit: 6,
  items: [
    { q: "Esnek ve takvimli programlar arasındaki fark nedir?", a: "Esnek programlarda online içeriğe istediğin saatte ulaşır, kendi hızında ilerlersin. Takvimli programlarda içeriğe ek olarak mentor eğitmenle planlı canlı oturumlara katılırsın; program belirli bir başlangıç ve bitiş tarihine sahiptir." },
    { q: "Program içeriğine ne kadar süre erişebilirim?", a: "Satın aldığın programa panelinden dilediğin zaman girebilirsin. Takvimli programlarda oturum kayıtları ve materyaller program bitiminde de erişilebilir kalır." },
    { q: "Program sonunda sertifika alıyor muyum?", a: "Evet. Programı tamamladığında sertifikan otomatik olarak panelindeki Sertifikalarım bölümüne düşer ve doğrulama bağlantısıyla paylaşılabilir." },
    { q: "Öğrenci veya yeni mezun indirimi var mı?", a: "Var. Panelinden öğrenci belgeni ya da mezuniyet belgeni yüklediğinde inceleme sonrası hesabına özel indirim kuponu tanımlanır." },
    { q: "Ödemeyi nasıl yapabilirim?", a: "Kredi kartı ile güvenli ödeme altyapımız üzerinden tek seferde ödeme yapabilirsin. Ücretsiz programlara doğrudan kayıt olursun." },
    { q: "Eğitmene soru sorabilir miyim?", a: "Evet. Programı izlerken Sorular bölümünden eğitmenine yazabilir, takvimli programlarda canlı oturumlarda doğrudan görüşebilirsin." },
    { q: "Rotam nedir, nasıl kullanılır?", a: "Rotam, bir kariyer hedefine giden eğitimleri sırayla gösteren yol haritasıdır. Rotayı seçip adımları sırayla tamamlarsın; giriş yaptığında tamamladığın ve devam ettiğin adımlar dağ üzerinde işaretlenir." },
    { q: "Bazı eğitimleri neden satın alamıyorum?", a: "Bazı eğitimlerin ön koşulu vardır: önce belirtilen eğitimi almış ya da tamamlamış olman gerekir. Program sayfasında hangi eğitimin gerektiği yazar ve oraya bağlantı verilir." },
    { q: "Kupon kodumu nasıl kullanırım?", a: "Sepet sayfasında 'Kupon' alanına kodu yazıp uygula. Hesabına tanımlanan kuponları panelinde Tercihler → Kuponlarım bölümünde görebilirsin." },
    { q: "Ödeme sonrası eğitime ne zaman başlarım?", a: "Kart ile ödemede kayıt anında açılır; panelindeki Kitaplığım bölümünden hemen başlayabilirsin. Havale/EFT ile ödemede kayıt, ödeme onaylandıktan sonra açılır." },
    { q: "Takvimli programın dönemi doluysa ne yapabilirim?", a: "Program sayfasında 'Tekrar açılınca haber ver' seçeneğini kullan. Yeni dönem açıldığında ya da kontenjan boşaldığında e-posta ve bildirimle haber veririz." },
    { q: "Görevleri nasıl teslim ederim?", a: "Takvimli programlarda görevler program içinde yazı, dosya ya da ses kaydı olarak teslim edilir. Teslim ettiğin görevler panelindeki Aksiyonlarım bölümünde görünür; eğitmenine program içindeki yazışma alanından soru sorabilirsin." },
    { q: "Sınavda başarısız olursam tekrar girebilir miyim?", a: "Her sorunun doğru cevabı ve açıklaması, cevabını kontrol ettiğinde anında gösterilir. Geçme notu olan sınavlarda deneme hakkını eğitmen belirler; hakkın bittiyse eğitmenin yeni deneme hakkı tanımlayabilir." },
    { q: "Eğitimlere mobil cihazdan erişebilir miyim?", a: "Evet. Site ve öğrenci paneli tüm cihazlarda çalışır; ana ekrana ekleyerek uygulama gibi kullanabilir, bildirimleri açabilirsin." },
    { q: "Sertifikamı nasıl paylaşırım veya doğrularım?", a: "Sertifikalarım bölümünden PDF olarak indirebilirsin. Her sertifikanın herkese açık bir doğrulama bağlantısı ve seri numarası vardır; işverenin bu bağlantıyla doğrulayabilir." },
    { q: "İade ve iptal koşulları nelerdir?", a: "Mesafeli satış sözleşmesi ve Teslimat ve İade Şartları sayfalarındaki koşullar geçerlidir. Sorun için iletişim formundan bize yazabilirsin." },
    { q: "Kurumsal ya da grup eğitimi alabilir miyiz?", a: "Evet. Ekipler için toplu kayıt ve özel program planlaması yapıyoruz. İletişim sayfasından ya da WhatsApp üzerinden bize ulaşman yeterli." },
  ],
};
