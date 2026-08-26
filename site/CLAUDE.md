# Fabrika Okulu

Online eğitim platformu (LMS) — eski WordPress "Fabrika Okulu" eklentisinin Next.js yeniden yazımı.
Türkçe içerik, Türkçe URL'ler (`/panel`, `/egitmen`, `/admin`, `/kurs-izle/[id]`, `/program/[slug]`).

## Stack

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4 (`@theme` token'ları `app/globals.css`), Drizzle ORM + PostgreSQL (postgres.js), bcryptjs, nodemailer, web-push, iyzico (ham REST, `lib/iyzico.ts`).

Referans proje: `C:\Projeler\ege yatçılık` — auth/session, uploads, Docker/Easypanel kalıpları oradan alındı.

## Üç panel

- `/panel` — öğrenci ("Çalışma Odam"): eğitimlerim, takvim, aksiyonlar (görev+sınav), siparişler, belge/kupon, sertifika, anket, bildirim, tema.
- `/egitmen` — eğitmen: kurs editörü (müfredat + dönemler + inline sınav soruları), gönderimler (görev puanlama, açık uçlu sınav puanlama), sorular (sohbet), sertifika verme, takvim, duyuru (süper eğitmen), belgeler/kuponlar (süper eğitmen).
- `/admin` — yönetici: her şey + kullanıcılar, siparişler, eğitmen profilleri, sertifika tasarımcısı, anket tanımı, site içeriği, ayarlar (SMTP, ödeme, PWA).

Roller: `admin | teacher | student` (+ `isSuperTeacher`). Yetki kontrolü `lib/auth/session.ts` (`requireUser/requireTeacher/requireAdmin`); middleware yalnızca cookie varlığına bakar.

## Kurallar / iş mantığı (lib/course-logic.ts — tek kaynak)

- Ders tipleri: `video | quiz | assign | file`. **`file` dersleri ilerlemeye dahil değildir** ama sıralı kilitte yer alır (açılınca tamamlanmış sayılır).
- Sıralı kilit: ilk tamamlanmamış dersten sonrası kilitli (`computeFrontier`). Önizlemede (eğitmen) kilit yok.
- Son teslim: **takvimli kursta mutlak tarih** (editörde tarih+saat girilir → `assignments.dueDate`/`quizzes.endDate`; saat boşsa 23:59:59). **Esnek kursta göreli gün** (`dueDays`/`extraDays`), taban `enrollments.startedAt` (öğrencinin kursu ilk açtığı an). Eski takvimli kayıtlarda tarih yoksa göreli gün hâlâ geçerli (taban: dönem `startDate+startTime`); editör bunları tarihe çevirip gösterir, kaydedince mutlaklaşır. Panel, player, cron ve raporlar aynı önceliği uygular: `extraDays > 0 ? taskDue(taskBase…) : deadlineOf(mutlak tarih)`.
- Kurs grubu otomatik: dönem varsa `takvimli`, ücretsizse `ucretsiz`, değilse `esnek`.
- Yayındaki kurs: eğitmen için müfredat + dönemler kilitli (yalnızca gelecek oturum linkleri). Admin her zaman düzenler.
- Kurs tipine göre sınav/görev modeli: **Esnek/ücretsiz** kursta görev olmaz, açık uçlu soru olmaz (yalnızca test + D/Y); öğrenci sınavı soru soru çözer, her cevaptan sonra doğruluk + açıklama anında gösterilir (`answerQuizQuestion`), eğitmene gönderim yoktur; kurs %100 tamamlanınca player'da sınav istatistikleri (kendi puanı + katılımcı ortalaması) görünür. **Takvimli** kursta test/D-Y otomatik değerlendirilir; açık uçlu sorular ayrı bir sınavda toplanır (karma sınav kaydedilmez, `courseInputSchema.superRefine`), eğitmen değerlendirir.
- Sınav: `passScore=0` → otomatik geçer. Açık uçlu soru varsa `pending_review`, eğitmen puanlar. Doğru cevaplar istemciye toplu gitmez (anlık modda tek sorunun cevabı, cevaplandıktan sonra döner).
- Geç teslim: son tarih geçse de gönderim engellenmez; eğitmen/yönetici bildirimi ve e-postası "geç teslim" olarak işaretlenir.
- Sertifika: tasarım admin'de (alanlar sürükle-bırak, önizleme, çoğaltma). Verme iki yolla: **elle** (eğitmen/admin, her zaman mümkün) ve **otomatik** (`rule.auto=true` + koşul `completed` → kurs %100 olduğu anda `autoIssueCertificates`, tüm tamamlanma noktalarından tetiklenir, idempotent). Ortak verme `lib/cert-issue.ts` (`grantCertificate`). `holderName/courseName` verildiği anda dondurulur. Herkese açık doğrulama: `/sertifika/[token]` — seri no `certSerial()` (FO-yıl-id, ayrı kolon yok).
- Korumalı dosyalar `private/korumali/` (public dışı), `/api/dosya/[lessonId]` erişim kontrolüyle akıtır.
- Anketler: çoklu anket `surveys` tablosunda (taslak/yayın), cevaplar `surveyAnswers`, tamamlama `surveyCompletions`; eski settings `survey_schema` ilk erişimde `ensureSurveysSeeded` ile taşınır (users.surveyVersion legacy). Öğrenci `/panel/anket` listesi + `/panel/anket/[id]`; doldurunca kapalı uçlu soruların katılımcı dağılımı (%) gösterilir. Yayınlanınca push + panelde `SurveyPopup` (kapatma localStorage `anket-gizle-{id}`). Admin `/admin/anketler` CRUD + sonuçlar, süper eğitmen sekmeli sonuçlar.
- Sınav değerlendirme cevabı: açık uçlu sınav puanlanırken soru bazlı geri bildirim + genel cevap (`quizAttempts.feedback`); öğrenci sınav giriş ekranında değerlendirmeyi görür.
- Kurs önerileri: `courseRelations` (kaynak kurs + tetik `completed|purchased` + hedef kurs + kişisel indirim %). Admin kurs editöründeki "Kurs Önerileri" bölümünden tanımlar. Panelde eski Hızlı Erişim yerine `RecoSlider` (bitirme önerileri tebrik mesajıyla öncelikli; öneri yoksa alan görünmez; hedefe kayıt olunca düşer). Kişisel indirim `lib/recommendations.ts` → `personalDiscountPercent`, sepette `cartTotals` satır fiyatına otomatik uygulanır (kupondan bağımsız).
- Bildirim: `lib/notify.ts` önce uygulama içi kaydı yazar, VAPID varsa push gönderir.
- E-posta: `lib/mailer.ts` — SMTP ayarları DB'de (admin → Ayarlar). `emailsMuted` işlemsel olmayanları susturur; şablon aç/kapa `mailTemplates` ayarında.
- Cron: `GET /api/cron?key=CRON_SECRET` (15 dk'da bir; 07:00'de günlük işler). Prod'da `scripts/start.sh` bunu kendisi çağırır.

## Komutlar

`docker compose -p fabrikaokulu up -d` (Postgres, port 5436) → `npm run db:generate` → `npm run db:migrate` (veya `node scripts/migrate.mjs`) → `npm run db:seed` → `npm run dev`.

Seed: admin (`.env` SEED_*), örnek eğitmen `egitmen@fabrikaokulu.com.tr / egitmen123`, 2 örnek kurs, yasal sayfalar.

## Notlar

- Yorumlar ve kullanıcıya görünen tüm metinler Türkçe.
- Şema değişikliğinde `npm run db:generate` ile migration üret; `drizzle/` klasörü commit'lenir.
- Client component modüllerinden yalnızca fonksiyon export et (obje/sabit export etme).
- Tailwind v4: `@apply` ile özel sınıf (`btn` gibi) uygulanamaz; utility'leri açıkça yaz.
