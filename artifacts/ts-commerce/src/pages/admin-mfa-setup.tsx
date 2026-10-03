import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@/components/local-auth";

export default function AdminMfaSetup() {
  const { user, isLoaded } = useUser();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading"|"setup"|"enabled"|"error">("loading");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!user || user.role !== "master_admin") { navigate("/dashboard"); return; }
    void fetch("/api/auth/mfa/status", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error ?? "Could not read MFA status");
        if (data.enabled) { setStatus("enabled"); navigate("/admin"); return; }
        setStatus("setup");
      }).catch((e) => { setError(e instanceof Error ? e.message : "Could not read MFA status"); setStatus("error"); });
  }, [isLoaded, user, navigate]);

  const begin = async () => {
    setError("");
    const r = await fetch("/api/auth/mfa/setup", { method:"POST", credentials:"same-origin", headers:{Accept:"application/json"} });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setError(data?.error ?? "MFA setup failed"); return; }
    setSecret(String(data.secret ?? "")); setUri(String(data.otpauthUri ?? ""));
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    const r = await fetch("/api/auth/mfa/confirm", { method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json",Accept:"application/json"}, body:JSON.stringify({code:code.trim()}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setError(data?.error ?? "Invalid authenticator code"); return; }
    setStatus("enabled"); navigate("/admin");
  };

  if (status === "loading") return <main className="grid min-h-[100dvh] place-items-center bg-[#f7f4ed]"><p className="text-sm font-bold">Checking Master Admin security…</p></main>;
  if (status === "enabled") return null;
  return <main className="min-h-[100dvh] bg-[#f7f4ed] px-5 py-10 text-[#182333]"><section className="mx-auto max-w-2xl rounded-3xl border border-[#d9d2c4] bg-[#fcfbf7] p-7 shadow-[0_25px_70px_rgba(31,43,56,.10)] md:p-10">
    <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#a2772e]">Master Admin security</p>
    <h1 className="mt-3 text-4xl font-extrabold tracking-[-.07em]">Protect the control plane with MFA.</h1>
    <p className="mt-4 max-w-xl text-sm leading-6 text-[#697687]">Privileged money, provider, merchant, audit and AI-store operations stay locked until an authenticator is enrolled.</p>
    {!secret && <button onClick={begin} className="mt-7 rounded-xl bg-[#182333] px-5 py-3 text-sm font-extrabold text-[#f8f3e8]">Generate authenticator secret</button>}
    {secret && <div className="mt-7 space-y-5">
      <div className="rounded-2xl border border-[#e0d9cc] bg-[#f8f5ed] p-5"><p className="text-xs font-extrabold uppercase tracking-[.08em] text-[#697687]">Secret</p><code className="mt-2 block break-all font-mono text-sm font-bold">{secret}</code><p className="mt-3 text-xs leading-5 text-[#697687]">Add this secret to your authenticator app. The enrollment is time-limited.</p></div>
      <div className="rounded-2xl border border-[#e0d9cc] bg-white p-5"><p className="text-xs font-extrabold uppercase tracking-[.08em] text-[#697687]">otpauth URI</p><code className="mt-2 block break-all text-xs leading-5">{uri}</code></div>
      <form onSubmit={confirm} className="rounded-2xl border border-[#e0d9cc] bg-white p-5">
        <label className="block text-sm font-extrabold">Authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-center font-mono text-xl tracking-[.3em]" /></label>
        <button className="mt-4 w-full rounded-xl bg-[#182333] px-5 py-3 text-sm font-extrabold text-[#f8f3e8]">Enable MFA and enter admin</button>
      </form>
    </div>}
    {error && <p className="mt-5 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#943b35]" role="alert">{error}</p>}
    <Link href="/dashboard" className="mt-6 inline-block text-sm font-bold text-[#697687] underline">Return to dashboard</Link>
  </section></main>;
}
