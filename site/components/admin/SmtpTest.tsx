"use client";

import { useState, useTransition } from "react";
import { testSmtp } from "@/app/actions/admin";

export function SmtpTest() {
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card flex flex-wrap items-end gap-3">
      <div className="flex-1"><label className="label">SMTP testi — test maili gönderilecek adres</label><input type="email" value={to} onChange={(e) => setTo(e.target.value)} className="input" /></div>
      <button disabled={pending || !to} onClick={() => start(async () => { const r = await testSmtp(to); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Gönderildi" : r.error }); })} className="btn-secondary">{pending ? "…" : "Test gönder"}</button>
      {msg && <p className={`w-full text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
