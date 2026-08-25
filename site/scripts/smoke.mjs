// Geliştirme smoke testi: DB'de oturum yaratır, korumalı sayfaları cookie ile ister, 200 + hata metni kontrol eder.
// Kullanım: node scripts/smoke.mjs [baseUrl]
import "dotenv/config";
import postgres from "postgres";
import { createHash, randomBytes } from "crypto";

const base = process.argv[2] || "http://localhost:3005";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const hash = (t) => createHash("sha256").update(t).digest("hex");

async function session(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  if (!u) throw new Error("kullanıcı yok: " + email);
  const token = randomBytes(32).toString("base64url");
  await sql`insert into sessions (id, user_id, expires_at) values (${hash(token)}, ${u.id}, now() + interval '1 day')`;
  return { cookie: `fabo_session=${token}`, id: u.id };
}

// Öğrenci: yoksa oluştur ve ilk kursa kaydet
const [stu] = await sql`select id from users where email = 'ogrenci@test.com'`;
if (!stu) {
  const bcryptHash = "$2b$12$0FAQf0V5Sl5SeUQKdLTrt.yOZBjM/l.MaQiApy4JLEWdRuMzkmGca";
  await sql`insert into users (email, first_name, last_name, password_hash, role) values ('ogrenci@test.com','Test','Öğrenci',${bcryptHash},'student')`;
}
const [s] = await sql`select id from users where email = 'ogrenci@test.com'`;
const [c1] = await sql`select id, slug from courses order by id limit 1`;
await sql`insert into enrollments (user_id, course_id, order_id, status) values (${s.id}, ${c1.id}, 0, 'active') on conflict do nothing`;
const [p1] = await sql`select id from periods where course_id = ${c1.id} limit 1`;
if (p1) await sql`insert into period_enrollments (period_id, user_id) values (${p1.id}, ${s.id}) on conflict do nothing`;
const [q1] = await sql`select id from quizzes where course_id = ${c1.id} limit 1`;
const [a1] = await sql`select id from assignments where course_id = ${c1.id} limit 1`;
const [fileLesson] = await sql`select id from lessons where course_id = ${c1.id} and type='file' limit 1`;

const admin = await session(process.env.SEED_ADMIN_EMAIL || "admin@fabrikaokulu.com.tr");
const teacher = await session("egitmen@fabrikaokulu.com.tr");
const student = await session("ogrenci@test.com");

const [tpl] = await sql`select id from certificate_templates limit 1`;
const [ord] = await sql`select id from orders limit 1`;

const tests = [
  ["student", "/panel"], ["student", "/panel/egitim"], ["student", "/panel/takvim"], ["student", "/panel/aksiyon"], ["student", "/panel/siparis"],
  ["student", "/panel/hesap"], ["student", "/panel/belge"], ["student", "/panel/sertifika"], ["student", "/panel/bildirim"], ["student", "/panel/anket"],
  ["student", `/kurs-izle/${c1.id}`], q1 && ["student", `/kurs-izle/${c1.id}?quiz=${q1.id}`], a1 && ["student", `/kurs-izle/${c1.id}?gorev=${a1.id}`],
  fileLesson && ["student", `/api/dosya/${fileLesson.id}`],
  ["student", `/program/${c1.slug}`], ["student", "/sepet"], ["student", "/odeme"],
  ["teacher", "/egitmen"], ["teacher", "/egitmen/kurslarim"], ["teacher", "/egitmen/editor/yeni"], ["teacher", `/egitmen/editor/${c1.id}`], ["teacher", `/egitmen/detay/${c1.id}`],
  ["teacher", `/egitmen/detay/${c1.id}?sekme=gonderimler`], ["teacher", "/egitmen/ogrenciler"], ["teacher", "/egitmen/gonderim"], ["teacher", "/egitmen/sorular"],
  ["teacher", "/egitmen/bildirim"], ["teacher", "/egitmen/belgeler"], ["teacher", "/egitmen/anketler"], ["teacher", "/egitmen/sertifika"], ["teacher", "/egitmen/takvim"],
  ["teacher", "/egitmen/duyuru"], ["teacher", "/egitmen/hesap"], ["teacher", `/kurs-izle/${c1.id}`],
  ["admin", "/admin"], ["admin", "/admin/kurslar"], ["admin", `/admin/kurslar/editor/${c1.id}`], ["admin", "/admin/kurslar/editor/yeni"], ["admin", "/admin/egitmenler"],
  ["admin", "/admin/ogrenciler"], ["admin", `/admin/ogrenciler?detail=${s.id}`], ["admin", "/admin/kullanicilar"], ["admin", "/admin/siparisler"], ord && ["admin", `/admin/siparisler/${ord.id}`],
  ["admin", "/admin/gonderimler"], ["admin", "/admin/gonderimler?sekme=sinav"], ["admin", "/admin/sorular"], ["admin", "/admin/sertifikalar/ver"], ["admin", "/admin/kuponlar"], ["admin", "/admin/belgeler"], ["admin", "/admin/sertifikalar"], ["admin", "/admin/sertifikalar/yeni"], tpl && ["admin", `/admin/sertifikalar/${tpl.id}`],
  ["admin", "/admin/sertifikalar?sekme=verilenler"], ["admin", "/admin/anketler"], ["admin", "/admin/anketler?sekme=tanim"], ["admin", "/admin/bildirimler"],
  ["admin", "/admin/bildirimler?sekme=gecmis"], ["admin", "/admin/bildirimler?sekme=aboneler"], ["admin", "/admin/bildirimler?sekme=mail"], ["admin", "/admin/mesajlar"],
  ["admin", "/admin/icerik"], ["admin", "/admin/icerik?sekme=hakkimizda"], ["admin", "/admin/icerik?sekme=iletisim"], ["admin", "/admin/icerik?sekme=sayfalar"],
  ["admin", "/admin/ayarlar"], ["admin", "/admin/ayarlar?sekme=odeme"], ["admin", "/admin/ayarlar?sekme=panel"], ["admin", "/admin/ayarlar?sekme=seo"],
  ["admin", "/api/admin/anket-csv"], ["admin", `/api/cron?key=${process.env.CRON_SECRET}&daily=1`],
  ["none", "/egitmen"], ["none", "/admin"], ["student", "/admin"], ["student", "/egitmen"],
].filter(Boolean);

const who = { admin, teacher, student, none: { cookie: "" } };
let fail = 0;
for (const [role, path] of tests) {
  const res = await fetch(base + path, { headers: { cookie: who[role].cookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const bad = res.status >= 500 || /Application error|Unhandled Runtime Error|Internal Server Error/.test(body);
  const expectRedirect = role === "none" || (role === "student" && (path === "/admin" || path === "/egitmen" || path === "/odeme" || /[?&](quiz|gorev)=/.test(path)));
  const ok = expectRedirect ? res.status >= 300 && res.status < 400 : res.status === 200 && !bad;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${res.status} ${role.padEnd(7)} ${path}${expectRedirect ? " → " + res.headers.get("location") : ""}`);
}
console.log(fail ? `\n${fail} hata` : "\nHepsi geçti");
await sql.end();
process.exit(fail ? 1 : 0);
