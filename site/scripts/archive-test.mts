// Genel arşiv testi: geçici rota, anket ve kullanıcıyı arşive taşır, geri alır ve verinin birebir döndüğünü denetler.
// Geçici veri oluşturur ve sonunda siler; e-posta tetiklemez.
// Çalıştır: npx tsx --conditions=react-server scripts/archive-test.mts
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { archiveAndDelete, restoreArchive, purgeArchive, listArchive } from "../lib/archive";
const q = async (s: any) => (await db.execute(s)) as unknown as any[];
const snap = async () => JSON.stringify({
  r: await q(sql`select to_jsonb(t) r from routes t where slug like 'arsiv-test-%' order by id`),
  s: await q(sql`select to_jsonb(t) r from route_steps t where route_id in (select id from routes where slug like 'arsiv-test-%') order by id`),
  sv: await q(sql`select to_jsonb(t) r from surveys t where key = 'arsiv_test' order by id`),
  a: await q(sql`select to_jsonb(t) r from survey_answers t where survey_key = 'arsiv_test' order by id`),
  c: await q(sql`select to_jsonb(t) r from survey_completions t where survey_key = 'arsiv_test' order by id`),
  u: await q(sql`select to_jsonb(t) r from users t where email = 'arsiv-test@example.invalid'`),
  e: await q(sql`select to_jsonb(t) r from enrollments t where user_id in (select id from users where email = 'arsiv-test@example.invalid') order by id`),
  n: await q(sql`select to_jsonb(t) r from notes t where user_id in (select id from users where email = 'arsiv-test@example.invalid') order by id`),
});
let fail = 0; const ok = (name: string, c: boolean, extra = "") => { console.log(c ? "OK  " : "FAIL", name, extra); if (!c) fail++; };
// hazırlık
const [u] = await q(sql`insert into users (email, first_name, last_name, password_hash, role) values ('arsiv-test@example.invalid','Arşiv','Test','x','student') returning id`);
const [course] = await q(sql`select id from courses order by id limit 1`);
await q(sql`insert into enrollments (user_id, course_id) values (${u.id}, ${course.id})`);
await q(sql`insert into notes (user_id, course_id, text) values (${u.id}, ${course.id}, 'deneme notu')`);
const [r] = await q(sql`insert into routes (name, slug) values ('Arşiv Test Rota','arsiv-test-rota') returning id`);
await q(sql`insert into route_steps (route_id, course_id, sort_order) values (${r.id}, ${course.id}, 0)`);
const [sv] = await q(sql`insert into surveys (key, title, status, questions) values ('arsiv_test','Arşiv Test Anketi','published','[{"key":"s1","type":"text","label":"Soru"}]'::jsonb) returning id`);
await q(sql`insert into survey_answers (user_id, survey_key, question_key, value) values (${u.id}, 'arsiv_test', 's1', '"cevap"'::jsonb)`);
await q(sql`insert into survey_completions (user_id, survey_key) values (${u.id}, 'arsiv_test')`);
const before = await snap();
// 1) rota (zincirleme adımlar)
const a1 = await archiveAndDelete({ kind: "route", label: "Arşiv Test Rota", by: null, targets: [{ table: "routes", where: sql`id = ${r.id}` }] });
ok("rota silindi", (await q(sql`select 1 from routes where id = ${r.id}`)).length === 0 && (await q(sql`select 1 from route_steps where route_id = ${r.id}`)).length === 0);
// 2) anket (+ cevaplar)
const a2 = await archiveAndDelete({ kind: "survey", label: "Arşiv Test Anketi", by: null, targets: [{ table: "surveys", where: sql`id = ${sv.id}` }, { table: "survey_answers", where: sql`survey_key = 'arsiv_test'`, walk: false }, { table: "survey_completions", where: sql`survey_key = 'arsiv_test'`, walk: false }] });
ok("anket ve cevaplar silindi", (await q(sql`select 1 from survey_answers where survey_key = 'arsiv_test'`)).length === 0 && (await q(sql`select 1 from surveys where id = ${sv.id}`)).length === 0);
const list = await listArchive();
ok("arşivde iki kayıt", list.filter((x) => x.id === a1 || x.id === a2).length === 2, JSON.stringify(list.filter((x) => x.id === a1 || x.id === a2).map((x) => [x.kind, x.rowCount])));
ok("anket geri alındı", (await restoreArchive(a2!)).ok);
ok("rota geri alındı", (await restoreArchive(a1!)).ok);
// 3) kullanıcı (zincirleme: kayıt, not, anket cevapları)
const a3 = await archiveAndDelete({ kind: "user", label: "Arşiv Test", by: null, targets: [{ table: "users", where: sql`id = ${u.id}` }] });
ok("kullanıcı ve bağlı kayıtlar silindi", (await q(sql`select 1 from users where id = ${u.id}`)).length === 0 && (await q(sql`select 1 from enrollments where user_id = ${u.id}`)).length === 0);
const r3 = await restoreArchive(a3!);
ok("kullanıcı geri alındı", r3.ok, r3.ok ? "" : r3.error);
ok("geri alınan veri öncekiyle birebir aynı", (await snap()) === before);
// 4) çakışma: aynı anahtarla yeni anket varken geri alma reddedilir, arşiv kaydı durur
const a4 = await archiveAndDelete({ kind: "survey", label: "Arşiv Test Anketi", by: null, targets: [{ table: "surveys", where: sql`id = ${sv.id}` }] });
await q(sql`insert into surveys (key, title, status, questions) values ('arsiv_test','Yeni','draft','[]'::jsonb)`);
const r4 = await restoreArchive(a4!);
ok("çakışmada geri alma reddedildi", !r4.ok, r4.ok ? "" : r4.error);
ok("arşiv kaydı yerinde", (await listArchive()).some((x) => x.id === a4));
// temizlik
await purgeArchive(a4!);
await q(sql`delete from surveys where key = 'arsiv_test'`); await q(sql`delete from survey_answers where survey_key = 'arsiv_test'`); await q(sql`delete from survey_completions where survey_key = 'arsiv_test'`);
await q(sql`delete from routes where slug like 'arsiv-test-%'`); await q(sql`delete from users where email = 'arsiv-test@example.invalid'`);
console.log(fail ? `${fail} kontrol başarısız` : "Tüm kontroller geçti");
process.exit(fail ? 1 : 0);
