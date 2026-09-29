# Fabrika Okulu — Kapsamlı Sistem Testi Raporu

**Tarih:** 29 Eylül 2026 · **Kapsam:** yerel kopya (canlı siteye yalnızca üç zararsız okuma isteği atıldı: `/panel` yönlendirmesi, `sitemap.xml`, `robots.txt`)

## Nasıl test edildi

- Yerel verinin altı ayrı kopyası ve altı ayrı sunucu (üretim derlemesi) kuruldu. Asıl yerel veritabanına yazılmadı; test kopyalarında e-posta gönderimi kapalıydı, hiçbir gerçek e-posta gitmedi.
- Altı alan paralel test edildi: site ve satın alma, öğrenci paneli ve oynatıcı, eğitmen paneli, yönetim paneli, güvenlik, iş mantığı. Testler gerçek tarayıcıyla (Edge) form doldurup düğmeye basarak yapıldı; sonuçlar veritabanından doğrulandı.
- Ek olarak: dört rolle ~660 sayfalık bağlantı taraması, erişilebilirlik/SEO/mobil taraması, hafif yük testi.
- Her bulguda **Doğrulama** satırı var: "tekrarlandı" = çalıştırılıp görüldü; "kod okumasıyla" = koddan çıkarıldı, çalıştırılmadı.

## Özet

| Önem | Adet | Anlamı | Durum (29 Eylül, gece) |
|---|---|---|---|
| Kritik | 3 | Hemen ele alınmalı (veri sızıntısı, mali kayıt bozulması) | 3'ü de yerel kodda düzeltildi |
| Yüksek | 12 | Yayına çıkmadan / kısa sürede düzeltilmeli | 12'si de yerel kodda düzeltildi |
| Orta | 23 | Planlanmalı | 23'ü de yerel kodda düzeltildi |
| Düşük | 40 civarı | Fırsat oldukça | Biri dışında hepsi yerel kodda düzeltildi (biri bilinçli olarak bırakıldı) |

**Önemli:** Düzeltmelerin hiçbiri commit edilmedi ve canlıya çıkmadı. Canlı site, deploy edilene kadar bu raporun ilk hâlindeki durumdadır. Ayrıntı: [Yüksek ve orta bulguların düzeltilmesi](#yüksek-ve-orta-bulguların-düzeltilmesi-29-eylül-gece).

Genel izlenim: günlük kullanım akışları (gezinme, kayıt, satın alma, eğitim izleme, panel sayfaları) çalışıyor; taramada kırık bağlantı ya da çöken sayfa çıkmadı. Sorunlar üç yerde toplanıyor: **(1) yetki ve gizlilik**, **(2) para/sipariş tutarlılığı**, **(3) girdi doğrulama** (hatalı değerin uyarısız kabul edilmesi ya da sessizce değiştirilmesi).

---

## KRİTİK

### K1. Yönetici sayfalarındaki veriler, giriş yapmış her kullanıcıya gidiyor
- **Ne oluyor:** Sıradan bir öğrenci `/admin/kullanicilar` gibi bir adrese istek atınca tarayıcı `/panel`'e yönlendiriliyor, ama sunucunun yanıtının içinde sayfanın verisi de bulunuyor. Yönlendirmeyi izlemeyen basit bir istekle okunabiliyor.
- **Sızan veriler (tekrarlandı, yetkisiz yeni öğrenciyle):** tüm kullanıcıların e-posta/ad/telefon/rolü (`/admin/kullanicilar`, `/admin/kuponlar`, `/admin/ogrenciler`), siparişler (`/admin/siparisler`), **SMTP parolası** (`/admin/ayarlar`, `/admin/belgeler`).
- **Neden:** Yetki denetimi yalnızca `app/admin/(panel)/layout.tsx` içindeydi; Next.js sayfayı layout ile aynı anda işlediği için 27 sayfanın 23'ü veriyi yanıta yazıyordu.
- **Durum:** **Yerel kodda düzeltildi** (23 sayfaya `requireAdmin()` eklendi) ve yeniden test edildi. **Canlı site deploy edilene kadar açık.**
- **Öneri:** Deploy'dan sonra SMTP parolasını değiştirin; canlıda daha önce okunmuş olabilir. Eğitmen sayfaları kendi denetimini yaptığı için etkilenmiyor.

### K2. Ödenmiş siparişte dönem değiştirmek siparişi "İptal" yapıyor — DÜZELTİLDİ (yerelde)
- **Durum:** Dönem değişimi artık yalnızca dönem kaydını taşıyor; sipariş ödenmiş kalıyor, kurs kaydı ve başlangıç tarihi korunuyor. Siparişteki dönem adı da güncelleniyor. Dolu döneme taşınırsa yöneticiye kontenjan uyarısı çıkıyor. `scripts/order-test.mts` ile doğrulandı.
- **Nerede:** Yönetim → Siparişler → sipariş detayı → dönem seçimi (`app/actions/admin.ts` `updateOrderPeriod` → `lib/enroll.ts` `unenrollUser`)
- **Ne oluyor:** Sipariş durumu `paid` → `cancelled` oluyor, "Toplam ciro" düşüyor (testte ₺5.585 → ₺585). Öğrencinin kaydı silinip yeniden açıldığı için başlangıç tarihi sıfırlanıyor; esnek kursta süreler baştan başlıyor.
- **Doğrulama:** tekrarlandı (iki ayrı siparişte).

### K3. Öğrenciyi tek bir eğitimden çıkarmak, çok kalemli siparişin tamamını "İptal" yapıyor — DÜZELTİLDİ (yerelde)
- **Durum:** Sipariş artık yalnızca içindeki tüm eğitimlerin kaydı kalktığında "İptal" oluyor. Siparişte başka eğitim sürüyorsa sipariş ödenmiş kalıyor ve sipariş notuna yazılıyor. Onay penceresi ve işlem sonrası mesaj, siparişe ne olacağını/olduğunu açıkça söylüyor. `scripts/order-test.mts` ile doğrulandı.
- **Not:** Bu hatalar yüzünden canlıda daha önce yanlışlıkla "İptal" olmuş siparişler olabilir; öğrencisi hâlâ kayıtlı olan iptal siparişler elle gözden geçirilmeli.
- **Nerede:** Yönetim → Kayıtlı Öğrenciler → öğrenci detayı → "Çıkar"
- **Ne oluyor:** İki eğitimli ₺1.640'lık siparişte tek eğitim çıkarılınca sipariş tümüyle iptal görünüyor, öğrenci diğer eğitime kayıtlı kalıyor. Onay penceresi siparişin iptal olacağını söylemiyor.
- **Doğrulama:** tekrarlandı.

---

## YÜKSEK

### Y1. Öğrencilerin yüklediği belgeler, özgeçmişler ve ödevler adresi bilen herkese açık — DÜZELTİLDİ (yerelde)
- Misafir olarak `/uploads/belgeler/20/kimlik-fotokopisi-….pdf` istendi, dosya geldi. Adres; kullanıcı numarası + dosya adı + zaman damgasından oluşuyor, rastgele bir parça yok.
- Kimlik, öğrenci belgesi, diploma, CV gibi kişisel veriler (KVKK). **Doğrulama:** tekrarlandı.
- Öneri: bu dosyaları `private/` altına alıp oturum ve sahiplik kontrollü bir adresten sunmak (ders dosyalarındaki `/api/dosya` gibi).

### Y2. Eğitmenin yazdığı kurs açıklaması sayfada komut dosyası çalıştırıyor — DÜZELTİLDİ (yerelde)
- Kurs açıklamasına yazılan HTML olduğu gibi basılıyor; içindeki betik, sayfayı açan ziyaretçinin ve **yöneticinin** tarayıcısında çalışıyor. Bir eğitmen hesabı yönetici oturumuyla işlem yaptırabilir.
- Aynı risk: görsel yüklemede `.svg` kabul edilmesi (kod okumasıyla).
- **Doğrulama:** tekrarlandı (iki ayrı testte). Öneri: kaydederken izinli etiket listesiyle temizlemek, SVG'yi kapatmak.

### Y3. Sepet ve ödeme adımı, "sepete ekle" kontrollerini tekrarlamıyor — DÜZELTİLDİ (yerelde)
Satın alınmaması gereken şeyler satın alınabiliyor:
- "Yakında" eğitim, öğrencinin **zaten kayıtlı olduğu** eğitim, dönemi seçilmemiş dolu takvimli eğitim (tekrarlandı; sipariş #14, ₺3.350).
- **Kaydı kapanmış / bitmiş dönem** ve **geçmiş tarihli görüşme koltuğu** (tekrarlandı).
- Testte sepet çerezi/form alanı elle değiştirildi, ama normal kullanımda da olur: sepet 7 gün yaşıyor; eğitim sepetteyken yönetici "Yakında" işaretlerse ya da dönem o arada kapanırsa öğrenci yine ödeme yapabilir.
- Nerede: `app/actions/cart.ts` (`cartTotals`, `startCheckout`).

### Y4. Tek kullanımlık kupon defalarca kullanılabiliyor — DÜZELTİLDİ (yerelde)
- Kupon sayacı sipariş oluşurken değil ödeme onaylanınca artıyor; havale siparişinde kupon çerezi de silinmiyor. Limit 1 olan kuponla art arda üç indirimli sipariş oluştu (üç ayrı testte tekrarlandı).
- Yönetici bir siparişte "Ödendi işaretle"ye her bastığında sayaç yeniden artıyor (limit 1, sayaç 4 oldu) ve öğrenciye/yöneticiye e-postalar yeniden tetikleniyor. İptal/iade edilen sipariş tek tıkla tekrar "ödendi" yapılabiliyor; iptalde kupon geri alınmıyor.
- Nerede: `app/actions/cart.ts`, `lib/enroll.ts` `fulfillOrder`, `app/actions/admin.ts` `setOrderStatus`.

### Y5. Tek kişilik görüşme koltuğu iki kişiye satılabiliyor — DÜZELTİLDİ (yerelde)
- İki öğrenci aynı anda kaydolunca ikisi de aynı koltuğa yazıldı (tekrarlandı). Havale ile ödemede risk daha büyük: onay bekleyen sipariş koltuğu tutmuyor, günlerce başkası da alabiliyor.

### Y6. Kartlı ödeme dönüşü yeterince doğrulanmıyor (kod okumasıyla) — DÜZELTİLDİ (yerelde)
- Dönüş isteğindeki ödeme kanıtı, siparişte saklananla ve sipariş tutarıyla karşılaştırılmıyor. Ayrıca oturumsuz biri bekleyen herhangi bir siparişi "başarısız" durumuna düşürebilir (havale siparişleri dahil).
- Ayrı bir olası sorun: kuponlu kartlı ödemede iyzico'ya gönderilen kalem toplamı ile tutar uyuşmuyor; iyzico bunu reddedebilir. **Doğrulanamadı** (iyzico anahtarı yok); kartlı ödeme açılmadan önce sandbox'ta denenmeli.
- Nerede: `app/api/odeme/callback/route.ts`, `lib/iyzico.ts`.

### Y7. Sunucu saati Türkiye saati değilse tüm tarih kuralları 3 saat kayıyor — DÜZELTİLDİ (yerelde)
- Docker imajında saat dilimi ayarı yok. Sunucu UTC'de çalışıyorsa: indirim/erken kayıt/son kayıt tarihleri gece 03:00'e sarkar, "Görüşmeye katıl" düğmesi 3 saat geç açılır, "birazdan canlı oturumun var" bildirimi oturum **başladıktan sonra** gider, günlük hatırlatmalar 10:00'da çalışır.
- **Doğrulama:** hesaplar iki saat diliminde çalıştırılıp farkı görüldü. Canlıdaki ayar bilinmiyor; Easypanel'de `TZ=Europe/Istanbul` tanımlı mı kontrol edilmeli.
- İlgili ayrı bir hata: **dönem son kayıt tarihi 1–2 gün erken yazılıyor** (5 Ekim başlangıçlı dönemin son kaydı 3 Ekim; `lib/course-save.ts` ~381). Tekrarlandı (mevcut veride).

### Y8. Sınavların ve sertifikanın güvenilirliği yok — DÜZELTİLDİ (yerelde)
Üç ayrı yol, üçü de tekrarlandı:
- **Cevabı gör, baştan çöz:** Öğrenci soruda yanlış şıkkı seçip "Cevabı kontrol et"e basınca doğru cevabı görüyor; sayfayı yenileyip baştan çözünce %100 alıyor. Özel bir araç gerekmiyor. Cevaplar yalnızca en sonda kaydediliyor (`components/player/QuizStage.tsx`, `answerQuizQuestion`).
- **Geçme notu etkisiz:** Geçme notu %70 iken iki sınavdan %0 alan öğrencinin kursu %100 oldu ve sertifikası verildi; tekrar çözme düğmesi de yok. Süre sınırı ve deneme sayısı ayarları hiçbir yerde kullanılmıyor.
- **Sıralı kilit yalnızca ekranda:** Kilit sayfa açılırken uygulanıyor, sunucu işlemlerinde denetlenmiyor. Tarayıcı araçlarını bilen öğrenci hiçbir şey izlemeden tüm dersleri (sınav dersleri dahil) "tamamlandı" işaretleyip sertifika alabildi (`app/actions/player.ts` `markLessonComplete`, `submitQuiz`, `submitAssignment`).

### Y12. Hedef testinde bölümlerin sırası değişiyor; zorunlu testte öğrenci görmediği soru yüzünden takılabiliyor — DÜZELTİLDİ (yerelde)
- Veritabanı bölüm adlarını kendi sırasına göre yeniden diziyor. Örnek ankette "Bugünkü durumum → Planım" sırası "Planım → Bugünkü durumum" oldu; koşullu soru bağlı olduğu sorudan önce geldi.
- Sonuç: öğrenci testi bitirmek isteyince hiç görmediği bir soru için "zorunlu" hatası alıyor; kurtulmak için üç kez geri gidip soruyu bulması gerekiyor. Test zorunluysa panel bu sırada tümüyle kilitli.
- Ayrıca adım adım modda sondan bir önceki soruda "Devam" düğmesi formu gönderiyor; tek seferlik testte öğrenci "Testi tamamla"ya basmadan test kilitlenebilir.
- **Doğrulama:** tekrarlandı (üç koşu). Bölüm anahtarları `b1, b2…` olan (editörde oluşturulmuş) anketler etkilenmiyor; içe aktarılan ya da eski anketler etkileniyor.
- **Durum:** Bölüm sırası **yerel kodda düzeltildi** (bölümler artık soruların sırasına göre diziliyor; örnek anketle denendi). "Devam" düğmesinin formu göndermesi de **düzeltildi**: form yalnızca "Testi tamamla" tıklanınca gönderiliyor.
- **Öneri:** "Zorunlu" seçeneğini açmadan önce anketi bir test öğrencisiyle baştan sona doldurup deneyin.
- Nerede: `lib/survey-logic.ts` `groupBySection`, `components/panel/SurveyForm.tsx`.

### Y9. Gösterge panelindeki "Popüler eğitimler" yanlış — DÜZELTİLDİ (yerelde)
- Beş eğitim de "1" kayıtla görünüyor; en çok kayıtlı eğitim listede yok, hiç kaydı olmayan eğitim listede (tekrarlandı). Diğer sayılar (ciro, aktif kayıt, bekleyen sipariş) doğru.
- Nerede: `app/admin/(panel)/page.tsx` ~21.

### Y10. Bazı formlar hatalı girdide çöküyor ya da sessizce başarısız oluyor — DÜZELTİLDİ (yerelde)
- Yasal sayfada var olan adres girilince ekran "Application error" oluyor, yazılan metin kayboluyor (tekrarlandı).
- Kuponda ondalık yüzde (`12.5`) ya da çok büyük tutar: ekranda mesaj yok, kupon oluşmuyor. Negatif limit ve negatif geçerlilik süresi kabul ediliyor, doğuştan geçersiz kupon oluşuyor (tekrarlandı).

### Y11. Bilinen parolalı test hesapları canlıda olabilir (kontrol edilmeli) — KONTROL ARACI EKLENDİ (yerelde); canlıda bakılmalı
- Kaynak kodda parolası yazan hesaplar: `egitmen@fabrikaokulu.com.tr` (**süper eğitmen** yetkili), `ogrenci@test.com`, `dolu1…5@test.com`; yönetici için varsayılan parola `degistir-beni`.
- Bugünkü imajda bu hesapları açan betikler çalışamıyor (aşağıda D1), ama `db:seed` bir kez elle çalıştırıldıysa hesaplar canlı veritabanında vardır. **Canlıda bu hesapları kontrol edip silin ya da parolalarını değiştirin.** Canlı veritabanına bakmadım.

---

## ORTA

Tümü yerel kodda düzeltildi; her maddenin nasıl doğrulandığı "Yüksek ve orta bulguların düzeltilmesi" bölümünde.

| # | Bulgu | Nerede | Doğrulama |
|---|---|---|---|
| O1 | Eğitmen, yayındaki kursun kilidini elle istek göndererek aşabiliyor (kursu taslağa çekme, türünü "görüşme"ye çevirme, sepet düğmesini kaldırma) | `app/actions/teacher.ts`, `lib/course-save.ts` | tekrarlandı |
| O2 | Kurs editöründe hatalı değerler uyarısız değiştirilip "Kaydedildi" deniyor: fiyat −100 → 0 TL; kontenjan 0 → 20; indirimli fiyat > fiyat → indirim siliniyor; öneri indirimi %150 → 0 | `lib/course-save.ts` (`.catch(...)`) | tekrarlandı |
| O3 | Dönem tarihleri doğrulanmıyor: bitişi başlangıcından önce olan ya da tamamen geçmişte kalan dönem kaydediliyor | `lib/course-save.ts` | tekrarlandı |
| O4 | Görevli takvimli kursun kopyası ve "Dönemli/Atölye" şablonları kaydedilemiyor ("görev yalnızca takvimli eğitimlerde olabilir"); eğitmen önce dönem eklemesi gerektiğini anlayamıyor | `lib/course-save.ts`, `CourseEditor.tsx` | tekrarlandı |
| O5 | Metin alanlarında uzunluk sınırı yok: 5.000 karakterlik başlık/ad kabul ediliyor, listeler ve filtre sayfaları bozuluyor | kurs, kayıt, kullanıcı, kategori formları | tekrarlandı |
| O6 | Ödeme anında dönem dolarsa öğrenci açıklamasız boş sepete düşüyor | `app/actions/cart.ts`, `/odeme` | tekrarlandı |
| O7 | Şifre değiştirince diğer cihazlardaki oturumlar açık kalıyor (şifre sıfırlamada kapanıyor) | `app/actions/auth.ts` `updateAccount` | tekrarlandı |
| O8 | "Beni hatırla" kutusu kaldırılsa da oturum 30 gün açık kalıyor | `app/actions/auth.ts` | tekrarlandı |
| O9 | Oturum açıkken `/panel/giris?r=//baska-site` dış siteye yönlendiriyor (oltalama bağlantısı yapılabilir) | `app/panel/(auth)/giris/page.tsx` | tekrarlandı |
| O10 | SMTP parolası Ayarlar sayfasında tarayıcıya açık metin gidiyor | `components/admin/SettingsForm.tsx` | tekrarlandı |
| O11 | SEO sekmesindeki "Site açıklaması" hiçbir yerde kullanılmıyor | `/admin/ayarlar?sekme=seo` | tekrarlandı |
| O12 | Belgede ikinci kez "Kupon ver" yeni kupon üretiyor, eskisi de geçerli kalıyor; ret öğrenciye bildirilmiyor; "Reddet" ve "Sil" onay sormuyor | `/admin/belgeler` | tekrarlandı |
| O13 | Yayındaki kursta "Taslak kaydet" onay sormadan kursu yayından kaldırıyor; öğrencili kursta "Sil" sonrası sunucunun mesajı ekranda gösterilmiyor | kurs editörü, `CourseActions.tsx` | tekrarlandı |
| O14 | Kullanıcı silinince siparişleri de siliniyor (mali kayıt kaybı); onay metni bunu söylemiyor | `/admin/kullanicilar` | tekrarlandı |
| O15 | Bekleyen havale siparişi fiyatı süresiz donduruyor: indirimli/erken kayıt fiyatıyla sipariş açıp haftalar sonra ödenebilir; aynı eğitim için birden çok bekleyen sipariş açılabiliyor | `app/actions/cart.ts` | kısmen tekrarlandı |
| O16 | Günlük işler yalnızca saat 7'de çalışıyor; sunucu o saatte yeniden başlarsa o günün hatırlatmaları ve raporu hiç gitmiyor. `CRON_SECRET` yerelde varsayılan değerde; canlıda da öyleyse herkes tetikleyebilir | `app/api/cron/route.ts`, `lib/cron.ts` | kod okumasıyla / tekrarlandı (yerel) |
| O17 | Telefonda yatay kayma: `/panel/takvim`, `/panel/belge`, `/admin`, `/admin/kosullar`, `/admin/vitrin`. (Eğitim sayfalarındaki kayma bu testte düzeltildi.) | ilgili sayfalar | tekrarlandı |
| O18 | Hesap formu kaydettikten sonra eski değerleri gösteriyor; öğrenci bir sonraki kayıtta (örneğin yalnızca şifre değiştirirken) adını ve telefonunu farkında olmadan eski hâline döndürüyor. Sonraki sertifika eski adla basılır | `/panel/hesap`, `components/panel/AccountForm.tsx` | tekrarlandı |
| O19 | Çok oturumlu danışmanlıkta kart yalnızca ilk işaretlenmemiş görüşmeye bakıyor: ilk görüşmeyi kaçıran öğrenci, saati gelen ikinci görüşmenin "Katıl" düğmesini kartta bulamıyor | `components/panel/MeetingCard.tsx`, `lib/meeting.ts` | tekrarlandı |
| O20 | Öğrenci, görevine verilen puanı ve eğitmen geri bildirimini oynatıcıda göremiyor; kurs bitince sınav istatistikleri de çıkmıyor. Kodda görevi puanlayan bir işlem bulunamadı (eğitmen tarafında da ekranı yok) | oynatıcı, gönderimler | tekrarlandı / kod okumasıyla |
| O21 | Silinmiş görev eski bağlantıdan açılıp teslim edilebiliyor; eğitmene bildirim gidiyor | `/kurs-izle/[id]?gorev=` | tekrarlandı |
| O22 | "Sonraki ders" geri sayımı YouTube derslerinde çalışmıyor. "Derse devam et" ile giren öğrenci sınavı bitirince sonuç ekranını göremeden sonraki derse atlıyor | `components/player/VideoStage.tsx` | tekrarlandı |
| O23 | Yönetici bir testi zorunlu yaptığında, o an paneli açık olan öğrenci menüden gezmeye devam edebiliyor; kilit sayfa yenilenince ya da eğitim açılınca devreye giriyor | zorunlu test kapısı | tekrarlandı |

---

## DÜŞÜK

Bu bölümdeki maddeler de sonradan istek üzerine düzeltildi; ayrıntı "Düşük bulguların düzeltilmesi, bakım modu ve canlıya hazırlık" bölümünde. Aşağıdaki liste ilk hâliyle duruyor.

**Satın alma ve site**
- Ödenmemiş (havale bekleyen) siparişte `/odeme/tamam` "Kaydın tamamlandı!" diyor ve "Programa başla" düğmesi gösteriyor.
- Ödeme formunda adres, şehir, telefon sunucuda zorunlu değil; boş adresle sipariş oluşuyor.
- Tüm dönemleri dolu eğitimde mobil alt çubuk "Dönem Seçiniz" diyor.
- Kişiye özel indirim eğitim sayfasında görünmüyor, yalnızca sepette görünüyor.
- Ücretsiz eğitimde misafir → giriş sonrası kayıt kendiliğinden tamamlanmıyor; görüşmede seçilen koltuk unutuluyor.
- `/rotam?rota=olmayan` 404 yerine tüm rotaları gösteriyor.
- `sitemap.xml`'de kategori sayfaları, `/rotam`, `/sss` yok; menüde olmayan eski grup sayfaları var.
- `/favicon.ico` yok; her sayfada tarayıcı konsolunda 404.
- Paylaşım önizlemesi etiketleri (`og:title`, `og:image`) hiçbir sayfada yok; WhatsApp/LinkedIn paylaşımlarında görsel ve başlık çıkmaz.
- İletişim formunda uzun konu için hata metni İngilizce ("Invalid input").
- Yalnız boşluktan oluşan şifre kabul ediliyor; en kısa şifre 6 karakter.
- Giriş deneme sınırı e-posta başına sayıldığı için biri başkasının girişini 15'er dakika kilitleyebilir.
- Sayı olmayan `courseId` gibi elle oynanmış isteklerde sunucu hatası (500).

**Öğrenci paneli**
- Çalışma Odam "Yaklaşan" kutusunda görüşmeler "Görev" etiketiyle çıkıyor; tamamlanmış sınavlar ve saatler önce bitmiş görüşmeler yer kaplıyor.
- "Yaklaşan sınav" sayacı tarihi geçmiş ve tarihsiz sınavları da sayıyor; Aksiyonlarım'daki "En yakın son tarih" geçmiş bir tarihi gösteriyor.
- "3 eğitimden 2'i tamamlandı" yazıyor (doğrusu: 2'si).
- Bağlantısı olmayan canlı derste "Katıl" düğmesi aynı sayfaya gidiyor.
- Aksiyonlarım'da puan "85/100" diye sabit yazılıyor; görevin en yüksek puanı kullanılmıyor.
- Adres formunda telefon, kimlik no ve posta kodu biçimi denetlenmiyor ("abc" kabul ediliyor).
- Hedef bayrağı, koşullu soruyu gizleyen bir seçeneğe çevrilince eski cevap veritabanında kalıyor.
- Takvimli kursta dönem başlamadan tüm içerik bitirilebiliyor (bilinçli tercih olabilir).
- Kilitli dosya dersinde `/api/dosya` sıralı kilidi uygulamıyor; sayı olmayan id sunucu hatası veriyor.

**Eğitmen ve yönetim**
- Görev puanlama ekranı yok ama izleri duruyor: filtrede "puanlandı", editörde "Puanlı / Maks puan", panelde hep 0 gösteren sayaç.
- Eğitmen, koşulu "kursu bitirince" olan sertifikayı elle veremiyor.
- Süre alanına "abc" yazılınca `abc:00` olarak kaydedilip sitede görünüyor.
- Duyuru bağlantısı denetlenmiyor (`javascript:` ve dış adres yazılabiliyor).
- Eğitmen profili silinince kullanıcı eğitmen rolünde kalıyor; profile bağlamak öğrenciyi uyarısız eğitmen yapıyor.
- Kategori ve rota adı değişince adresi de değişiyor, eski bağlantı 404 oluyor.
- Anket her yeniden yayınlandığında tüm öğrencilere yeniden bildirim gidiyor.
- Kayıt kapalıyken "Üye ol" bağlantıları görünmeye devam ediyor.
- Olmayan ya da geri alınmış sertifika adresi 404 yerine 200 dönüyor.
- Kurs editöründeki WhatsApp numarası hiç doğrulanmıyor.
- "Eğitimi kapat" tek tıkla, onaysız çalışıyor.
- Yönetici kurs detayı eğitmen paneline yönlendiriyor, yönetici menüsü kayboluyor.
- Telefonda kurs editörünün üst çubuğu ekranın beşte birini kaplıyor.
- Yeni kullanıcı formu hata verince tüm alanlar boşalıyor.

**Teknik**
- Güvenlik başlıkları eksik (CSP, HSTS, `X-Content-Type-Options`); `X-Frame-Options` yalnızca `/admin`'de.
- Kullanıcının yazdığı metinler e-posta şablonlarına olduğu gibi giriyor (kod okumasıyla).
- Form etiketleri alanlara bağlı değil (35 etiket); ekran okuyucu kullananlar için sorun. Oynatıcıdaki zil bağlantısının adı yok.
- Telefonda 28 pikselden küçük çok sayıda dokunma hedefi var (üst menü ve footer bağlantıları).
- Kullanılmayan ayar ve alanlar: `panel.surveyRequired`, `users.surveySkipped`, `courses.lifetime`, `courses.requirements`, `lessons.preview`.
- `site/CLAUDE.md` ile kod arasındaki çelişkiler: "karma sınav kaydedilmez" (kod izin veriyor), "eğitmen açık uçlu sınavı puanlar" (ekranı yok), "start.sh her açılışta çağırır" (dört betik çalışmıyor).

---

## Dağıtım ve performans

### D1. Açılışta çalışması beklenen altı örnek veri betiğinden dördü canlı imajda çalışamıyor
- `Dockerfile` imaja `lib/` klasörünün tamamını kopyalamıyor; `seed-gorusme`, `seed-dolu`, `seed-yakinda`, `seed-erken-kayit` "modül bulunamadı" hatasıyla sessizce atlanıyor. `seed-kategoriler`, `seed-rotalar` ve migration çalışıyor.
- **Doğrulama:** imajın dosya düzeni Windows'ta kurularak denendi; gerçek Docker imajı kurulmadı.
- Sonuç: bugün eklediğim örnek "erken kayıt" eğitimleri de canlıda kendiliğinden oluşmayacak. **Öneri:** örnek veri betiklerini `start.sh`'ten tümüyle çıkarmak; canlıda otomatik örnek veri ve test hesabı üretilmemeli.
- Yeni üç migration (`0021`–`0023`) mevcut veriyi bozmuyor; yalnızca varsayılanı olan kolonlar ekliyor.

### D2. Performans
- Bugünkü veriyle sorun yok: tek kullanıcıda sayfalar 25–60 ms; 20 eşzamanlı kullanıcıda 0,4–0,9 sn, hata yok.
- Veri büyüdükçe yavaşlayacak yerler (kod okumasıyla): oynatıcı her açılışta tüm soru-cevap tablosunu çekiyor (`lib/player.ts` ~132); panelde her sayfada görev/sınav listesi iki kez hesaplanıyor; 15 dakikalık zamanlanmış iş tüm kayıtları geziyor; yönetim listelerinde sayfalama yok (300 kayıttan eskisi görünmüyor, siparişlerde arama yok).

---

## Test sırasında düzelttiklerim (yerel kodda, commit edilmedi)

| Düzeltme | Neden |
|---|---|
| 23 yönetici sayfasına kendi yetki denetimi eklendi | K1 (kritik veri sızıntısı) |
| Eğitim sayfasında telefonda yatay kayma giderildi | Bugün yeniden tasarladığım sayfada çıktı |
| Footer: `//dış-adres` artık site içi sayılmıyor; başlığı boş sütun ve yarım bağlantı sessizce silinmek yerine uyarı veriyor | Bugün yazdığım footer düzenleyicisinin eksiği |
| WhatsApp bağlantısı `+90…` ile yazılan numarada bozulmuyor (footer ve iletişim sayfası) | `wa.me/9090…` üretiyordu |
| Erken kayıt fiyatı indirimli fiyattan yüksek olamıyor; kurs çoğaltılınca erken kayıt ayarı kopyalanmıyor | Bugün yazdığım özelliğin eksiği |
| Hedef testinde bölümler soruların sırasına göre diziliyor | Y12; bugün eklediğim "zorunlu test" ile birlikte öğrenciyi kilitleyebiliyordu |
| Dönem değişimi siparişi iptal etmiyor; tek eğitimden çıkarma çok kalemli siparişi iptal etmiyor | K2, K3 (sonradan, istek üzerine) |

Düzeltmeler yeniden derlenmiş test sunucusunda doğrulandı: 27 yönetici sayfası öğrenci ve eğitmen oturumuyla denendi, veri sızmıyor; yönetici için hepsi açılıyor; 13 eğitim sayfasında telefonda kayma yok; bağlantı taraması yine temiz. Bunların dışındaki hiçbir bulguya dokunmadım.

---

## Düzeltmeler sonrası yeniden kontrol (29 Eylül, akşam)

Kritiklerin kapatılmasından sonra kod taze bir veritabanı kopyasıyla yeniden derlenip kontrol edildi:

| Kontrol | Sonuç |
|---|---|
| K2 ve K3, yönetim ekranında tıklayarak (sipariş onayı → dönem değiştir → tek eğitimden çıkar → son eğitimden çıkar) | 13/13 geçti |
| Sipariş–kayıt kuralları (`scripts/order-test.mts`) | 17/17 geçti |
| Erken kayıt kuralları (`scripts/preorder-test.mts`) | 28/28 geçti |
| Yönetici verisi sızıntısı (öğrenci oturumuyla 9 sayfa × 3 istek türü) | Sızıntı yok |
| Bağlantı taraması (dört rol, ~660 sayfa) | Kırık bağlantı, çöken sayfa, kırık görsel yok |
| Bugünkü özellikler tarayıcıda (footer, katalog başlığı, zorunlu test, editör, erken kayıtla satın alma) | Geçti |
| Telefonda yatay kayma | Eğitim sayfaları temiz; `/panel/takvim` ve `/panel/belge` hâlâ kayıyor (O17; sonradan düzeltildi, aşağıdaki bölüme bakın) |

Bu kontrol düzeltmelerin bir şeyi bozmadığını gösterir; ilk turdaki gibi altı alanlı keşif testi yeniden yapılmadı.

---

## Yüksek ve orta bulguların düzeltilmesi (29 Eylül, gece)

İstek: "yüksek ve orta hepsini halledelim, düşükler kalsın". 12 yüksek ve 23 orta bulgunun tamamı yerel kodda düzeltildi. Düzeltmeler üç ayrı test sunucusunda (üretim derlemesi, ayrı veritabanı kopyaları, e-posta kapalı) gerçek tarayıcıyla denendi; test turlarında çıkan yeni hatalar da giderilip testler yeniden koşuldu.

### Yüksek

| # | Ne yapıldı | Doğrulama |
|---|---|---|
| Y1 | Kişisel dosyalar (belge, özgeçmiş, görev, ses) yalnızca sahibine ve yetkili personele açılıyor. Test turunda bir açık daha çıktı: adres özel kodlamayla yazılınca (`belgeler%2F3%2F…`) dosya girişsiz iniyordu; o da kapatıldı | 40/40; kodlanmış adres denemelerinde sızan yol 0/19 |
| Y2 | Kurs ve ders açıklamaları kaydedilirken ve gösterilirken temizleniyor; SVG görsel olarak yüklenemiyor | 12/12 |
| Y3 | Sepete ekleme kuralları sepette ve ödeme adımında yeniden uygulanıyor; satın alınamayan satırın altında nedeni yazıyor | 78 kontrollük sipariş testinin parçası, geçti |
| Y4 | Kupon, sipariş oluşurken tek işlemle ayrılıyor; iptal/başarısız/süresi dolan sipariş kuponu geri bırakıyor | Aynı test; iki öğrencinin aynı anda denemesi dahil |
| Y5 | Bekleyen sipariş koltuğu tutuyor (havale 7 gün, kart 30 dakika); doluluk = kayıtlı + tutulan | Aynı test; aynı anda iki ödeme denemesi dahil |
| Y6 | Kart ödemesi dönüşü yalnızca siparişe kayıtlı anahtar, sipariş numarası ve tutar eşleşirse işleniyor | Yalnızca olumsuz yollar denendi (11 sahte istek, hiçbir sipariş değişmedi). **Başarılı ödeme yolu denenemedi** (iyzico anahtarı yok) |
| Y7 | Sunucu ve veritabanı oturumu Türkiye saatinde; gün hesapları yerel güne göre | Yerelde 15/15. **Gerçek Docker imajı denenmedi** |
| Y8 | Kontrol edilen cevap kilitleniyor (yenileyip baştan çözülemiyor); geçme notunun altında kalan sınav tamamlanmış sayılmıyor; sıralı kilit ve ders tamamlama sunucuda denetleniyor; eğitmen/yönetici "Yeni deneme hakkı ver" diyebiliyor | 37/37 |
| Y9 | "Popüler eğitimler" aktif kayıt sayısına göre | Ekran, veritabanı sorgusuyla birebir |
| Y10 | Sayfa adresi çakışması ve kupon alanları Türkçe ileti veriyor; çökme yok | 75 kontrollük yönetim testinin parçası, geçti |
| Y11 | Yönetim → Ayarlar → **Sistem sağlığı** sekmesi: bilinen parolalı örnek hesapları, zamanlayıcı anahtarını, saat dilimini ve e-posta ayarını denetliyor; riskli hesap "Pasif yap" ile kapatılıyor | 56/56 (test kopyasında). **Canlıda sekmeyi açıp bakmak size kalıyor** |
| Y12 | Bölüm sırası (önceden) + "Devam" düğmesi formu göndermiyor; Enter göndermiyor. Test turunda çıkan ek hata: son soru isteğe bağlı ve boşsa test tamamlanamıyordu, düzeltildi | 28/28 |

### Orta

| # | Ne yapıldı | Doğrulama |
|---|---|---|
| O1 | Eğitmen kilidi sunucuda: eğitim yayındaysa ya da kayıtlı öğrencisi varsa müfredat, dönemler ve tür kayıttan alınıyor; yayındaki eğitim taslağa çekilemiyor; düğme tipini yalnızca yönetici değiştiriyor | 56/56 + 3/3 (elle gönderilen isteklerle) |
| O2 | Hatalı değer sessizce değiştirilmiyor; `Form hatası (Alan): …` iletisi çıkıyor, hiçbir şey kaydedilmiyor | 43/43 (editör testi) |
| O3 | Dönem tarihleri doğrulanıyor; geçmişte kalan dönem yalnızca yeni eklenirken reddediliyor | Aynı test |
| O4 | Görev var ama dönem yoksa editör sarı uyarı ve "Dönem ekle" gösteriyor; Dönemli/Atölye şablonları başlangıç dönemiyle geliyor | Aynı test |
| O5 | Kurs, kayıt, hesap ve yönetim formlarında uzunluk sınırları | Üç testte de denendi |
| O6 | Ödeme anında dolan dönem açık ileti veriyor, sepet boşalmıyor | Sipariş testi |
| O7 | Şifre değişince diğer cihazlardaki oturumlar kapanıyor | 53 kontrollük oturum testinin parçası, geçti |
| O8 | "Beni hatırla" işaretli değilse oturum 12 saat, tarayıcı kapanınca siliniyor | Aynı test (öğrenci, eğitmen, yönetici girişleri) |
| O9 | Yönlendirme adresleri tek bir denetimden geçiyor; dış adrese gidilemiyor | Aynı test (7 farklı biçim) |
| O10 | SMTP şifresi tarayıcıya gönderilmiyor; boş bırakılırsa kayıtlı şifre korunuyor | 56/56; yanıtlarda şifre yok |
| O11 | SEO "Site açıklaması" site sayfalarının varsayılan açıklaması | Aynı test |
| O12 | Belgede ikinci kupon "Kuponu yenile" (onaylı, eskisi iptal); ret öğrenciye bildiriliyor; Reddet ve Sil onay soruyor | Yönetim testi (ilk koşu 75/75) |
| O13 | Yayındaki eğitimde düğme "Taslağa al" ve onay soruyor; "Sil" sonrası sunucunun iletisi gösteriliyor | Editör testi |
| O14 | Siparişi ya da sertifikası olan kullanıcı silinemiyor (pasif yapılıyor) | Yönetim testi |
| O15 | Bekleyen havale siparişi 7 gün sonra kendiliğinden iptal; aynı eğitim için yeni sipariş eskisinin yerine geçiyor | Sipariş testi + zamanlayıcı ucu üzerinden |
| O16 | Günlük işler 07:00'den sonraki ilk turda, günde bir kez; canlıda zayıf anahtarla zamanlayıcı ucu çalışmıyor | Test sunucusunda uçtan uca: çalıştı, aynı gün ikinci çağrıda atlandı |
| O17 | Beş sayfadaki yatay kayma giderildi; test turunda çıkan diğer sayfalar da (sepet, ödeme, oynatıcı, gönderimler, siparişler) düzeltildi | 375 ve 320 piksel genişlikte ölçüldü |
| O18 | Hesap formu kayıttan sonra kaydedilen değerleri gösteriyor | Oturum testi |
| O19 | Görüşme kartı önce şu an katılınabilen görüşmeyi gösteriyor; kaçırılanlar altta ikincil düğme | 12/12 |
| O20 | Eğitim bitince oynatıcıda "Sınav sonuçların" kartı (kendi puanı + katılımcı ortalaması); görevde puan/geri bildirim varsa öğrenci görüyor | Sınav testi. **Görev puanlama ekranı hâlâ yok** (aşağıda "Karar bekleyenler") |
| O21 | Silinmiş görev ve sınav eski bağlantıdan açılamıyor, teslim edilemiyor | Sınav testi |
| O22 | Elle tamamlanan YouTube dersinde geri sayım çalışıyor; sınav sonucu ekranı yerinde kalıyor | Sınav testi. **YouTube videosu kendiliğinden bitince dersin tamamlanması denenmedi** (gerçek oynatma gerekir) |
| O23 | Panel açıkken zorunlu yapılan test, sonraki tıklamada kilitliyor ve menüleri gizliyor | 28/28 + menü ölçümü |

### Test turlarında çıkan ve ayrıca düzeltilenler

| Bulgu | Durum |
|---|---|
| Kodlanmış adresle kişisel dosyaya girişsiz erişim (Y1'in atlatılması) | Düzeltildi, yeniden test edildi |
| Satıştan kalkan eğitim sepetten açıklamasız düşüyordu | Artık nedeni yazılı olarak sepette kalıyor |
| Yarım bırakılan kartlı ödeme kuponu süresiz tutuyordu | 24 saat sonra sipariş iptal ediliyor, kupon geri bırakılıyor |
| Editörde yeni döneme geçmiş tarih yazılınca alanlar kilitleniyordu | Düzeltildi |
| Eğitim adresi her kayıtta başlıktan yeniden üretiliyordu (eski bağlantılar kırılabiliyordu) | Adres yalnızca başlık değişince değişiyor |
| Görüşme koltuğu kaydedilince aynı gün satılamaz hâle geliyordu | Koltuklarda son kayıt günü uygulanmıyor |
| Boş şık silinince doğru şık kayıyordu; yenilemeden ikinci kayıtta dersler yeniden oluşuyordu | Düzeltildi |
| Kategori düzenlenince sırası başa dönüyordu; `/admin/kullanicilar?rol=xyz` sunucu hatası veriyordu | Düzeltildi |
| Ödeme ve kayıt formu hata verince yazılanları ve onay kutusunu siliyordu | Düzeltildi |
| `/admin/belgeler` sayfası da SMTP şifresini tarayıcıya gönderiyordu | Düzeltildi |

### Testlerle ilgili notlar

- Ana akış testinde (kayıt → ücretsiz eğitim → sepet → havale → onay → oynatıcı) bir koşuda oynatıcı sayfasında iki kez "A network error occurred" tarayıcı hatası görüldü; aynı test iki kez daha koşulduğunda ve ayrı denemede çıkmadı. Sayfadan hemen çıkılırken yarıda kesilen bir istekten kaynaklandığını düşünüyorum; nedeni doğrulanmadı.
- İkinci koşularda kalan üç kontrol test betiğinin kendi beklentisinden kaynaklanıyordu (betik ilk koşuda değiştirdiği kupon koduna sabitti; öğrencinin sipariş listesinde ödenmiş siparişte durum etiketi bilinçli olarak gösterilmiyor). İşlevler doğru çalışıyor.
- Test betikleri ve çıktıları oturumun geçici klasöründe; depoya yalnızca `scripts/course-validate-test.mts` eklendi.

### Davranış değişiklikleri (bilmeniz gerekenler)

- **Geçme notu artık gerçekten uygulanıyor.** Geçme notu olan bir sınavdan daha önce kalmış öğrencinin ilerlemesi %100'ün altına düşer. Daha önce verilmiş sertifikalar geri alınmaz.
- **Bekleyen havale siparişi 7 gün sonra kendiliğinden iptal olur** ve öğrenciye bildirilir; bu süre boyunca koltuğu tutar.
- **Eğitmen kilidi genişledi:** kayıtlı öğrencisi olan taslak eğitim de kilitli.
- **Yeni doğrulama kuralları eski veriyi de bağlar:** oturumu dönem aralığının dışında olan, tek şıklı sorusu olan ya da başlığı 150 karakteri aşan eski bir eğitim, düzeltilene kadar kaydedilemez; ileti sorunun yerini söyler. Test kopyasındaki eğitimlerin hepsi sorunsuz kaydedildi; **canlıdaki eğitimlere bakılamadı.**
- **Kupon kodunda boşluk kabul edilmiyor.**
- **"Beni hatırla" işaretlenmezse oturum 12 saatte biter.**
- **Editörde sınava "Deneme hakkı" alanı eklendi** (0 = sınırsız; mevcut sınavlarda 1).

### Karar bekleyenler

1. **Eğitmen, yayındaki eğitimin fiyatını değiştirebiliyor.** Kilit müfredatı ve dönemleri kapsıyor, fiyatı kapsamıyor. İstenirse fiyat da yalnızca yöneticiye bırakılabilir.
2. **Görev puanlama ekranı yok.** Eğitmen teslimleri görüyor ama puan ve geri bildirim yazamıyor. İsteniyorsa ayrı bir iş olarak yapılmalı.
3. **Sınav süre sınırı** veritabanında var ama editörde ve oynatıcıda yok; uygulanmıyor.

### Deploy sonrası yapılacaklar

1. Açılışta altı yeni veritabanı değişikliği (`0021`–`0026`) kendiliğinden uygulanır; mevcut veriyi silmez.
2. **SMTP şifresini değiştirin** (K1 nedeniyle canlıda daha önce okunmuş olabilir).
3. Yönetim → Ayarlar → **Sistem sağlığı** sekmesini açın; uyarı veren örnek hesapları "Pasif yap" ile kapatın, saat dilimi ve zamanlayıcı anahtarı satırlarına bakın.
4. Easypanel'de `TZ` adlı bir ortam değişkeni tanımlıysa değeri `Europe/Istanbul` olmalı (yoksa eklemeye gerek yok).
5. Kart ödemesi açılmadan önce iyzico deneme ortamında uçtan uca test yapılmalı.

---

## Düşük bulguların düzeltilmesi, bakım modu ve canlıya hazırlık (29 Eylül, gece geç saat)

### Kararlar (sizden gelen)

| Konu | Karar |
|---|---|
| Eğitmen yayındaki eğitimin fiyatını değiştirebilsin mi | Evet, değiştirebilir (değişiklik yapılmadı) |
| Görev puanlama ekranı | Olmayacak; ekranlardaki puanlama izleri temizlendi |
| Sınav süre sınırı | Olmayacak |
| Video kaynağı | Yalnızca Vimeo |
| Kartla ödeme, gerçek ortam, canlıdaki eğitimler | Canlıya çıktıktan sonra bakılacak |

### Düşük bulgular

| Grup | Durum | Doğrulama |
|---|---|---|
| Satın alma ve site (13 madde) | Hepsi düzeltildi | Tarayıcı testleri geçti; testte çıkan iki çökme (elle değiştirilmiş sepet ve kayıt niyeti çerezi) de düzeltildi |
| Öğrenci paneli (9 madde) | 8'i düzeltildi, 1'i bilinçli bırakıldı | Tarayıcı testleri geçti |
| Eğitmen ve yönetim (14 madde) | Hepsi düzeltildi | Tarayıcı testleri geçti; testte çıkan iki hata (eğitmen panelinde yanlış öğrenci/ders sayısı, `0532…` yazılan numarada bozuk WhatsApp bağlantısı) da düzeltildi |
| Teknik (6 madde) | Hepsi ele alındı | Güvenlik başlıkları 76/76, e-posta kaçışlama 23/23; form etiketleri 135 → 0 bağsız etiket |

**Bilinçli bırakılan:** takvimli eğitimde dönem başlamadan içeriğin açık olması. Davranış değiştirilmedi; istenirse dönem başlangıcına kadar içerik kapatılabilir.

**Kısmen kalan:** telefonda 40 pikselden küçük dokunma hedefleri 235'ten 146'ya indi. Kalanlar (kart başlığı bağlantıları, gezinti izi, dağ kartlarındaki adım noktaları) görünüm değişmeden büyütülemiyor.

**Silinmeyen alanlar:** kullanılmayan veritabanı kolonları canlıya çıkmadan silinmedi (geri dönüşü yok, faydası az); koddaki kullanılmayan ayarlar temizlendi.

**Güvenlik başlıklarında bilinçli sınır:** içerik güvenlik politikası asgari tutuldu, çünkü iyzico ödeme formu sayfaya betik ekliyor ve bankanın 3-D Secure sayfasına gönderim yapıyor. `includeSubDomains` eklenmedi (alt alan adlarında https'siz site varsa bir yıl erişilemez olurdu).

### Yeni: bakım modu (dışarıya gösterme)

- Yönetim → Ayarlar → **Bakım modu** sekmesinden açılıp kapanır; değişiklik birkaç saniyede geçerli olur.
- Açıkken ziyaretçi, öğrenci ve eğitmen her adreste bakım sayfasını görür (arama motorlarına "geçici olarak kapalı" bilgisiyle); giriş yapmış yönetici siteyi ve panelleri normal kullanır, üstte sarı uyarı şeridi görür.
- Yönetici girişi `/admin/giris` adresinden yapılır.
- Kart ödemesi dönüşü ve zamanlanmış işler bakımdan etkilenmez; sanal POS canlıda test edilebilir.
- Sunucudaki `MAINTENANCE_MODE=on` satırı paneldeki ayarın önüne geçer (canlıya ilk çıkışta siteyi kapalı başlatmak için).
- **Doğrulama:** 43/43 (ziyaretçi, öğrenci, eğitmen, yönetici, giriş formu, sunucu işlemleri, ödeme dönüşü).

### Yeni: canlı yönetici hesabı ve açılış

- Sunucu her açılışta: veritabanı güncellemeleri → yönetici hesabı (yoksa oluşturur, varsa şifresine dokunmaz) → eksik yasal sayfalar → boşsa başlangıç kategorileri.
- Canlıda örnek veri ve bilinen parolalı test hesabı **üretilmez** (rapordaki D1 bulgusu böylece kapandı).
- Yönetici şifresi depoya yazılmadı; yalnızca sunucunun ortam değişkenlerinde durur.

### Canlı imajının yerelde denenmesi

Canlıda kullanılacak imaj yerelde kuruldu ve **boş bir veritabanıyla** çalıştırıldı:

| Kontrol | Sonuç |
|---|---|
| Veritabanı güncellemeleri sıfırdan | 27 adım uygulandı |
| Yönetici hesabı | Oluştu; giriş formundan girilebildi |
| Sunucu saati | Türkiye saati |
| Bakım modu (`MAINTENANCE_MODE=on`) | Ziyaretçi bakım sayfasını, yönetici siteyi görüyor |
| Sistem sağlığı sekmesi | Çalışıyor; eksik ayarları (SMTP, iyzico anahtarları) doğru uyarıyor |

Bu, raporun önceki bölümlerinde "denenemedi" denen saat dilimi ve imaj kontrolünü kapatır. Easypanel'deki gerçek ortam (alan adı, sertifika, kalıcı depolama, vekil sunucu başlıkları) yine de canlıda görülmeli.

### Hâlâ doğrulanamayanlar

- Kartla başarılı ödeme (iyzico anahtarı yok).
- Vimeo videosunun oynaması ve bitince dersin tamamlanması: çerçeve yüklendi, ama otomatik tarayıcıda Vimeo güvenlik doğrulaması gösterdiği için oynatma görülemedi.
- Gerçek e-postaların içeriği (test ortamında e-posta kapalıydı).
- Giriş deneme sınırının canlıdaki vekil sunucuyla davranışı (ziyaretçinin gerçek IP adresinin gelip gelmediği).
- Canlıdaki eğitimlerin yeni doğrulama kurallarına uyumu.

---

## Sorunsuz bulunanlar (özet)

- **Bağlantılar:** dört rolle ~660 sayfa gezildi; kırık bağlantı, çöken sayfa ya da kırık görsel yok.
- **Yetki sınırları:** eğitmen başka eğitmenin kursunu, gönderimini, öğrencisini göremiyor ve değiştiremiyor; öğrenci ve eğitmen yönetici işlemlerini çağıramıyor; 102 sunucu işlevinin rol denetimleri yerinde (yukarıdaki istisnalar dışında); eğitmen yalnızca yöneticiye ait alanları istekle de değiştiremiyor.
- **Üyelik:** kayıt ve giriş doğrulamaları, şifre sıfırlama (tek kullanımlık, süreli, diğer oturumları kapatıyor), çıkış.
- **Sepet ve kuponlar (normal kullanım):** ekle/çıkar, misafir sepetinin girişten sonra korunması, yüzde/sabit/kişiye özel/kursa özel/süresi dolmuş kuponlar, tutarların sipariş kaydıyla birebir tutması, 0 TL sipariş.
- **Satın alma engelleri (form üzerinden):** ön koşul, anket kilidi, Yakında, dönemsiz takvimli, dolu koltuk.
- **Bugünkü yeni özellikler:** erken kayıt (satın alma → havale → onay → kitaplık → açılış), zorunlu test (form gönderilince menüler sayfa yenilenmeden açılıyor), footer düzenleyici, "Tüm Eğitimler" başlığı, öne çıkan eğitim, kurs editöründen kayıt.
- **Kurs oluşturma:** esnek, takvimli, ücretsiz ve görüşme ürünü tarayıcıda sıfırdan oluşturuldu; tüm alanlar kaydedilip yeniden açılınca aynen geldi; koltuk üretici doğru.
- **Diğer:** dosya yolu dışına çıkma denemeleri (12 biçim) engelleniyor; kayıt formunda rol yükseltme olmuyor; veritabanı sorguları parametreli; çerez ayarları doğru; öğrenci metinleri (ad, mesaj) sayfalarda ham HTML olarak çalışmıyor.

---

## Bakılamayanlar ve bir sonraki tur için öneriler

1. **Kartlı ödeme (iyzico):** anahtar olmadığı için hiç denenemedi. Açılmadan önce sandbox'ta uçtan uca test, özellikle kuponlu ödeme (Y6).
2. **Gerçek e-postalar:** içerik, bağlantılar ve Türkçe karakterler görülmedi. Bir test posta kutusuyla denenmeli.
3. **Canlı ortam ayarları:** saat dilimi (Y7), `CRON_SECRET`, test hesapları (Y11). Bunlara ben bakamam; Easypanel'den kontrol edilmeli.
4. **Gerçek Docker imajı:** imaj kurulup açılış betikleri gerçek ortamda izlenmedi.
5. **Büyük veriyle yük testi:** birkaç bin öğrenci ve siparişle performans.
6. **Anket editörünün ayrıntıları** (koşullu sorular, içe/dışa aktarma), **sertifika tasarımcısının görsel çıktısı**, **bildirim (push)**.
7. **Gözle tasarım incelemesi:** testler çoğunlukla ölçümle yapıldı; ince hizalama kusurları gözden kaçmış olabilir.

---

## Test ortamı hakkında

- Dışarıya giden istekler: canlı siteye yukarıda sayılan üç okuma isteği; ayrıca oynatıcı sayfaları tarayıcıda açılırken video sağlayıcılarına (Vimeo, YouTube ve derslerde adresi tanımlı video dosyaları) yalnızca okuma amaçlı istekler gitti. Hiçbir yere veri gönderilmedi, e-posta atılmadı.
- Test veritabanları: `fabo_test_0` … `fabo_test_5` (yerel Docker içinde). İçlerinde test sırasında oluşturulan kullanıcılar, kurslar ve siparişler duruyor; asıl yerel veritabanı `fabrika_okulu` değişmedi.
- Ayrıntılı kanıtlar (betikler, ekran görüntüleri, günlükler) oturumun geçici klasöründe, alan başına ayrı klasörde.
