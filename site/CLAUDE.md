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
- Göreli son teslim (`dueDays`/`extraDays`): dönemli kursta dönem `startDate+startTime`, esnek kursta `enrollments.startedAt` (öğrencinin kursu ilk açtığı an). Saat yoksa günün sonu 23:59:59. Panel, player, cron ve raporlar aynı `taskBase/taskDue` fonksiyonlarını kullanır.
- Kurs grubu otomatik: dönem varsa `takvimli`, ücretsizse `ucretsiz`, değilse `esnek`.
- Yayındaki kurs: eğitmen için müfredat + dönemler kilitli (yalnızca gelecek oturum linkleri). Admin her zaman düzenler.
- Sınav: `passScore=0` → otomatik geçer. Açık uçlu soru varsa `pending_review`, eğitmen puanlar. Doğru cevaplar istemciye gitmez.
- Sertifika: tasarım admin'de, verme eğitmen/admin'de ve **elle**. `holderName/courseName` verildiği anda dondurulur. Herkese açık doğrulama: `/sertifika/[token]`.
- Korumalı dosyalar `private/korumali/` (public dışı), `/api/dosya/[lessonId]` erişim kontrolüyle akıtır.
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
