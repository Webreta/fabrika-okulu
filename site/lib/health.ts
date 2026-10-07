import "server-only";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { getSetting } from "@/lib/settings";
import { iyzicoEnabled } from "@/lib/iyzico";
import { cronSecretState } from "@/lib/cron-secret";
import { cronStatus, DAILY_HOUR } from "@/lib/cron";
import { fmtDateTime, fmtDate, todayISO } from "@/lib/format";

// Sistem sağlığı / güvenlik kontrolü (Yönetim → Ayarlar → Sistem sağlığı).
// Canlıya taşınmış olabilecek, parolası kaynak kodda yazan örnek hesapları ve sunucu ayarlarını denetler.
// Parolalar hiçbir zaman ekrana yazılmaz; yalnızca "bilinen parola hâlâ geçerli mi" sonucu gösterilir.

export type HealthLevel = "ok" | "warn" | "info";
export type HealthGroup = "hesap" | "sunucu" | "zamanlayici" | "eposta";
export type HealthItem = {
  key: string;
  group: HealthGroup;
  level: HealthLevel;
  title: string;
  text: string;
  /** Ne yapılmalı (yalnızca uyarı/bilgi satırlarında) */
  todo?: string;
  /** Hesap satırıysa: "Pasif yap" düğmesi için */
  account?: { id: number; canDeactivate: boolean };
};

const ADMIN_DEFAULT_PASSWORD = "degistir-beni";
const TEACHER_SEED = { email: "egitmen@fabrikaokulu.com.tr", password: "egitmen123" };
const STUDENT_SEED_PASSWORD = "ogrenci123";
const STUDENT_SEEDS = ["ogrenci@test.com", "dolu1@test.com", "dolu2@test.com", "dolu3@test.com", "dolu4@test.com", "dolu5@test.com"];
/** Örnek/test hesabı sayılan e-posta alan adı */
const TEST_DOMAIN = "@test.com";
const MAX_CHECKED = 40;

const seedAdminEmail = () => (process.env.SEED_ADMIN_EMAIL || "admin@fabrikaokulu.com.tr").toLowerCase();

type Row = { id: number; email: string; role: "admin" | "teacher" | "student"; isSuperTeacher: boolean; active: boolean; passwordHash: string };

const ROLE_LABEL = { admin: "yönetici", teacher: "eğitmen", student: "öğrenci" } as const;

/** Hesabın kaynak kodda yazan parolası (denetlenecek aday); yoksa null */
function knownPassword(u: Pick<Row, "email" | "role">): string | null {
  const email = u.email.toLowerCase();
  if (email === TEACHER_SEED.email) return TEACHER_SEED.password;
  if (STUDENT_SEEDS.includes(email) || email.endsWith(TEST_DOMAIN)) return STUDENT_SEED_PASSWORD;
  if (u.role === "admin") return ADMIN_DEFAULT_PASSWORD;
  if (u.role === "teacher") return TEACHER_SEED.password;
  return null;
}

const isSeedEmail = (email: string) => {
  const e = email.toLowerCase();
  return e === TEACHER_SEED.email || STUDENT_SEEDS.includes(e) || e.endsWith(TEST_DOMAIN);
};

/** Tek hesabın riski: bilinen parolayla girilebiliyor mu, örnek/test hesabı mı */
export async function accountRisk(u: Row): Promise<{ known: boolean; seed: boolean }> {
  const candidate = knownPassword(u);
  const known = candidate ? await verifyPassword(candidate, u.passwordHash) : false;
  return { known, seed: isSeedEmail(u.email) };
}

async function accountItems(currentUserId: number): Promise<HealthItem[]> {
  const cols = { id: users.id, email: users.email, role: users.role, isSuperTeacher: users.isSuperTeacher, active: users.active, passwordHash: users.passwordHash };
  const rows: Row[] = await db
    .select(cols)
    .from(users)
    .where(or(
      inArray(users.email, [TEACHER_SEED.email, seedAdminEmail(), ...STUDENT_SEEDS]),
      ilike(users.email, `%${TEST_DOMAIN}`),
      eq(users.role, "admin"),
      eq(users.role, "teacher"),
    ))
    .orderBy(users.role, users.email)
    .limit(MAX_CHECKED);

  const items: HealthItem[] = [];
  let risky = 0;
  for (const u of rows) {
    const { known, seed } = await accountRisk(u);
    const self = u.id === currentUserId;
    const who = `${u.email} (${ROLE_LABEL[u.role]}${u.isSuperTeacher && u.role === "teacher" ? ", süper eğitmen yetkili" : ""})`;
    if (known && u.active) {
      risky++;
      items.push({
        key: `hesap-${u.id}`, group: "hesap", level: "warn",
        title: who,
        text: "Parolası kaynak kodda yazan varsayılan değerde; bu parolayı bilen herkes bu hesapla giriş yapabilir.",
        todo: self
          ? "Bu senin hesabın: Kullanıcılar sayfasında kendi hesabını düzenleyip şifreni hemen değiştir."
          : seed
            ? "Örnek hesap kullanılmıyorsa pasif yap; kullanılıyorsa Kullanıcılar sayfasından şifresini değiştir."
            : "Kullanıcılar sayfasından şifresini değiştir ya da hesabı pasif yap.",
        account: { id: u.id, canDeactivate: !self },
      });
    } else if (seed && u.active) {
      items.push({
        key: `hesap-${u.id}`, group: "hesap", level: "info",
        title: who,
        text: "Örnek/test hesabı duruyor; parolası varsayılan değerde değil.",
        todo: "Kullanılmıyorsa pasif yap.",
        account: { id: u.id, canDeactivate: !self },
      });
    } else if ((seed || known) && !u.active) {
      items.push({ key: `hesap-${u.id}`, group: "hesap", level: "ok", title: who, text: "Hesap pasif; giriş yapılamaz." });
    }
  }
  if (risky === 0) {
    items.unshift({ key: "hesap-temiz", group: "hesap", level: "ok", title: "Varsayılan parolalı hesap yok", text: "Yönetici, eğitmen ve örnek hesapların hiçbirine kaynak kodda yazan parolalarla girilemiyor." });
  }
  if (rows.length >= MAX_CHECKED) {
    items.push({ key: "hesap-sinir", group: "hesap", level: "info", title: "Denetim sınırı", text: `Yalnızca ilk ${MAX_CHECKED} yönetici/eğitmen/test hesabı denetlendi.` });
  }
  return items;
}

async function serverItems(): Promise<HealthItem[]> {
  const items: HealthItem[] = [];
  const prod = process.env.NODE_ENV === "production";
  items.push({ key: "ortam", group: "sunucu", level: "info", title: "Çalışma ortamı", text: prod ? "Canlı (production) modda çalışıyor." : "Geliştirme modunda çalışıyor (canlı sunucu değil)." });

  // Saat dilimi: tüm tarih/saat kuralları sunucunun yerel saatine göre çalışır
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (offset === 180) {
    items.push({ key: "saat", group: "sunucu", level: "ok", title: "Sunucu saati", text: `Türkiye saatinde çalışıyor (sunucuya göre şu an ${hhmm}).` });
  } else {
    items.push({
      key: "saat", group: "sunucu", level: "warn", title: "Sunucu saati Türkiye saatinde değil",
      text: `Sunucuya göre şu an ${hhmm} (${todayISO()}). Son teslim, indirim bitişi, erken kayıt açılışı, görüşme saatleri ve hatırlatmalar ${Math.abs(180 - offset) / 60} saat kayar.`,
      todo: "Sunucunun ortam değişkenlerine TZ=Europe/Istanbul ekleyip yeniden başlat.",
    });
  }
  try {
    const r = (await db.execute(sql`select current_setting('TimeZone') as tz, to_char(now(), 'HH24:MI') as t`)) as unknown as { tz: string; t: string }[];
    const row = r[0];
    if (row && row.t.slice(0, 2) !== hhmm.slice(0, 2) && Math.abs(Number(row.t.slice(3)) - now.getMinutes()) < 5) {
      items.push({ key: "vt-saat", group: "sunucu", level: "warn", title: "Veritabanı saati sunucuyla uyuşmuyor", text: `Veritabanı oturumu ${row.tz} diliminde (${row.t}), sunucu ${hhmm}. Günlük rapor sayıları yanlış güne düşebilir.`, todo: "TZ ortam değişkenini Europe/Istanbul yap." });
    } else if (row) {
      items.push({ key: "vt-saat", group: "sunucu", level: "ok", title: "Veritabanı saati", text: `Sunucuyla aynı (${row.tz}).` });
    }
  } catch {
    // saat sorgusu başarısızsa yalnızca bu satır atlanır
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!site || /localhost|127\.0\.0\.1/.test(site)) {
    items.push({
      key: "site-url", group: "sunucu", level: prod ? "warn" : "info", title: "Site adresi tanımlı değil",
      text: `NEXT_PUBLIC_SITE_URL ${site ? `"${site}"` : "boş"}; e-postalardaki düğmeler ve ödeme dönüş adresi bu değeri kullanır.`,
      todo: prod ? "Ortam değişkenlerine sitenin gerçek adresini yaz (https://…)." : undefined,
    });
  } else {
    items.push({ key: "site-url", group: "sunucu", level: "ok", title: "Site adresi", text: site });
  }

  // Yükleme klasörleri gerçekten yazılabilir mi (canlıda volume root sahipliğiyle bağlanınca tüm yüklemeler düşüyordu)
  for (const [key, rel, what] of [
    ["yukleme", path.join("public", "uploads"), "Kurs görselleri, logo, görev ve belge yüklemeleri"],
    ["korumali", path.join("private", "korumali"), "Korumalı ders dosyaları (PDF/resim)"],
  ] as const) {
    const dir = path.join(process.cwd(), rel);
    const probe = path.join(dir, `.saglik-${process.pid}-${Date.now().toString(36)}`);
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(probe, "ok");
      await unlink(probe);
      items.push({ key, group: "sunucu", level: "ok", title: `Yükleme klasörü yazılabilir (${rel})`, text: `${what} diske kaydedilebiliyor.` });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code ?? "hata";
      items.push({
        key, group: "sunucu", level: "warn", title: `Yükleme klasörüne yazılamıyor (${rel})`,
        text: `${what} kaydedilemez; kullanıcılar "Dosya sunucuya kaydedilemedi" hatası alır (${code}).`,
        todo: "Sunucuyu yeniden başlat (açılış betiği klasör sahipliğini düzeltir). Sürerse Easypanel'de volume'un bağlı olduğu klasörün izinlerini kontrol et.",
      });
    }
  }

  const payment = await getSetting("payment");
  if (payment.provider === "iyzico" && !iyzicoEnabled()) {
    items.push({ key: "odeme", group: "sunucu", level: "warn", title: "Kartlı ödeme anahtarları eksik", text: "Ödeme yöntemi iyzico seçili ama API anahtarları tanımlı değil; ödemeler havale/EFT'ye düşer.", todo: "IYZICO_API_KEY ve IYZICO_SECRET_KEY ortam değişkenlerini tanımla ya da ödeme yöntemini havale yap." });
  } else {
    items.push({ key: "odeme", group: "sunucu", level: "ok", title: "Ödeme", text: payment.provider === "iyzico" ? "iyzico anahtarları tanımlı." : "Havale / EFT (elle onay) modunda." });
  }
  return items;
}

async function cronItems(): Promise<HealthItem[]> {
  const items: HealthItem[] = [];
  const prod = process.env.NODE_ENV === "production";
  const state = cronSecretState();
  if (state === "ok") {
    items.push(process.env.CRON_SECRET_AUTO === "1"
      ? { key: "cron-anahtar", group: "zamanlayici", level: "info", title: "Zamanlayıcı anahtarı açılışta üretildi", text: "Ortamda geçerli bir CRON_SECRET yoktu; sunucu açılırken rastgele bir anahtar üretildi. İç zamanlayıcı çalışır, dışarıdan tetiklenemez.", todo: "Harici bir zamanlayıcı kullanacaksan ortam değişkenlerine kendi CRON_SECRET değerini tanımla." }
      : { key: "cron-anahtar", group: "zamanlayici", level: "ok", title: "Zamanlayıcı anahtarı", text: "CRON_SECRET tanımlı ve varsayılan değerde değil." });
  } else {
    const why = state === "yok" ? "tanımlı değil" : state === "varsayilan" ? "örnek dosyadaki varsayılan değerde" : "çok kısa (16 karakterden az)";
    items.push({
      key: "cron-anahtar", group: "zamanlayici", level: prod ? "warn" : "info", title: `Zamanlayıcı anahtarı ${why}`,
      text: prod
        ? "Canlıda bu durumda /api/cron kapalıdır: hatırlatmalar, günlük rapor ve süresi dolan siparişlerin iptali çalışmaz."
        : "Canlıda bu değerle /api/cron kapalı kalır (yerelde çalışmaya devam eder).",
      todo: "Ortam değişkenlerine en az 16 karakterlik rastgele bir CRON_SECRET tanımla.",
    });
  }

  const { tick, daily } = await cronStatus();
  const tickAt = tick?.at ? new Date(tick.at) : null;
  const minutes = tickAt ? Math.round((Date.now() - tickAt.getTime()) / 60000) : null;
  if (minutes !== null && minutes <= 45) {
    items.push({ key: "cron-son", group: "zamanlayici", level: "ok", title: "Zamanlayıcı çalışıyor", text: `Son çalışma: ${fmtDateTime(tickAt!)} (${minutes} dk önce). 15 dakikada bir çalışır.` });
  } else {
    items.push({
      key: "cron-son", group: "zamanlayici", level: prod ? "warn" : "info", title: "Zamanlayıcı son 45 dakikada çalışmadı",
      text: tickAt ? `Son çalışma: ${fmtDateTime(tickAt)}.` : "Henüz hiç çalışmadı (sunucu yeni açıldıysa ilk çalışma 90 saniye sonra olur).",
      todo: prod ? "Birkaç dakika sonra yeniden bak; değişmiyorsa sunucu kayıtlarında \"[cron]\" satırlarını kontrol et." : undefined,
    });
  }
  const today = todayISO();
  const due = new Date().getHours() >= DAILY_HOUR;
  if (daily?.day === today) {
    items.push({ key: "cron-gunluk", group: "zamanlayici", level: "ok", title: "Günlük işler bugün çalıştı", text: `Hatırlatmalar ve günlük rapor: ${fmtDateTime(new Date(daily.at))}.` });
  } else {
    items.push({
      key: "cron-gunluk", group: "zamanlayici", level: prod && due && minutes !== null && minutes <= 45 ? "warn" : "info", title: "Günlük işler bugün henüz çalışmadı",
      text: `${daily?.day ? `Son çalışma günü: ${fmtDate(daily.day)}. ` : ""}Günlük işler saat 0${DAILY_HOUR}:00'den sonraki ilk zamanlayıcı turunda çalışır; sunucu o saatte kapalıysa açılınca telafi edilir.`,
    });
  }
  return items;
}

async function mailItems(): Promise<HealthItem[]> {
  const smtp = await getSetting("smtp");
  const items: HealthItem[] = [];
  if (!smtp.host || !smtp.user) {
    items.push({ key: "smtp", group: "eposta", level: "warn", title: "E-posta sunucusu tanımlı değil", text: "Şifre sıfırlama, sipariş onayı, karşılama ve hatırlatma e-postaları gönderilemez.", todo: "Ayarlar → E-posta sekmesinde SMTP bilgilerini gir ve test gönder." });
  } else if (!smtp.pass) {
    items.push({ key: "smtp", group: "eposta", level: "warn", title: "SMTP şifresi kayıtlı değil", text: `Sunucu ${smtp.host} tanımlı ama şifre boş; çoğu sunucu gönderimi reddeder.`, todo: "Ayarlar → E-posta sekmesinde şifreyi gir ve test gönder." });
  } else {
    items.push({ key: "smtp", group: "eposta", level: "ok", title: "E-posta sunucusu", text: `${smtp.host}:${smtp.port} tanımlı. Çalıştığını E-posta sekmesindeki testle doğrulayabilirsin.` });
  }
  if (smtp.emailsMuted) {
    items.push({ key: "smtp-sessiz", group: "eposta", level: "info", title: "Bildirim e-postaları susturulmuş", text: "Şifre, sipariş ve karşılama dışındaki e-postalar gönderilmiyor.", todo: "Bilinçli değilse E-posta sekmesinden kutuyu kaldır." });
  }
  if (!(smtp.adminEmails || "").trim()) {
    items.push({ key: "smtp-yonetici", group: "eposta", level: "info", title: "Yönetici e-postası yazılmamış", text: "Yeni sipariş, soru ve teslim bildirimleri hiçbir adrese gitmiyor.", todo: "E-posta sekmesinde \"Yönetici e-postaları\" alanını doldur." });
  }
  return items;
}

/** Tüm denetimler (parola karşılaştırmaları birkaç saniye sürebilir; yalnızca Sistem sağlığı sekmesi açılınca çalışır) */
export async function systemHealth(currentUserId: number): Promise<HealthItem[]> {
  const [a, s, c, m] = await Promise.all([accountItems(currentUserId), serverItems(), cronItems(), mailItems()]);
  return [...a, ...s, ...c, ...m];
}

/** "Pasif yap" için: hesap gerçekten riskli/örnek hesap mı (düğme başka hesaplarda kullanılamaz) */
export async function riskyAccount(userId: number): Promise<{ id: number; email: string; active: boolean } | null> {
  const [u] = await db
    .select({ id: users.id, email: users.email, role: users.role, isSuperTeacher: users.isSuperTeacher, active: users.active, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;
  const { known, seed } = await accountRisk(u);
  return known || seed ? { id: u.id, email: u.email, active: u.active } : null;
}
