// Edge headless + DevTools protokolü ile ekran görüntüsü (kaydırılmış durum dahil).
// Kullanım: node shot.mjs <url> <genişlik> <yükseklik> <scrollY> <çıktı.png> [scrollY2 çıktı2.png ...]
// scrollY = -1 sayfanın en altına kaydırır. Oturumlu sayfa için SHOT_COOKIE="fabo_session=<token>" ortam değişkeni.
import { spawn } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const [url, w, h, ...rest] = process.argv.slice(2);
const shots = [];
for (let i = 0; i < rest.length; i += 2) shots.push({ y: Number(rest[i]), out: rest[i + 1] });
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "edge-shot-"));
const edge = spawn("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`, "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
  }
  if (!target) throw new Error("Edge başlatılamadı");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: Number(w) < 600 });
  await send("Page.enable");
  // Oturum gereken sayfalar için: SHOT_COOKIE="fabo_session=..." (scrollY = -1 → sayfanın en altı)
  if (process.env.SHOT_COOKIE) {
    await send("Network.enable");
    for (const pair of process.env.SHOT_COOKIE.split(";")) {
      const [name, ...v] = pair.trim().split("=");
      if (name) await send("Network.setCookie", { name, value: v.join("="), url });
    }
  }
  await send("Page.navigate", { url });
  await sleep(4000);
  for (const s of shots) {
    await send("Runtime.evaluate", { expression: `window.scrollTo({ top: ${s.y < 0 ? "document.documentElement.scrollHeight" : s.y}, behavior: "instant" })` });
    await sleep(700);
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(s.out, Buffer.from(r.data, "base64"));
    console.log("kaydedildi:", s.out, "scrollY=" + s.y);
  }
  ws.close();
} finally {
  edge.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
