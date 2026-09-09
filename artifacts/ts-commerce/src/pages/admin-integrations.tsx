import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/primitives';

const inputClass = 'mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15';

type IntegrationState = { connected: boolean; mode: string; updatedAt: string | null; provider: string };

export default function AdminIntegrations() {
  const { getToken } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [state, setState] = useState<IntegrationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const request = async (method: string, body?: unknown) => {
    const token = await getToken();
    const response = await fetch('/api/admin/integrations/flutterwave', {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      setState(await request('GET'));
      setError(false);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Integration status could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim()) {
      setError(true);
      setMessage('Enter your Flutterwave secret API key.');
      return;
    }
    setSaving(true);
    setMessage('');
    setError(false);
    try {
      const result = await request('PUT', { apiKey: apiKey.trim() });
      setState(result);
      setApiKey('');
      setShowKey(false);
      setMessage(`Flutterwave is connected in ${result.mode} mode. The credential was encrypted before storage.`);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Flutterwave connection failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell admin>
      <div className="mx-auto max-w-[900px]">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline underline-offset-4"><ArrowLeft className="h-4 w-4" />Back to admin</Link>
        <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Master admin</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Integrations</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Connect the real payment provider used by Lunavo. Your secret key never appears in the browser after it is saved.</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#e9e1cd] text-[#8a6826]"><KeyRound className="h-5 w-5" /></span>
        </div>

        <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#315e6c]">Payment provider</p>
              <h2 className="mt-2 text-2xl font-extrabold">Flutterwave</h2>
              <p className="mt-2 text-sm leading-6 text-[#697687]">Use your Flutterwave Secret Key for real checkout initialization, transaction verification, refunds, and provider reconciliation.</p>
            </div>
            {state?.connected ? <span className="inline-flex items-center gap-2 rounded-full bg-[#dfeee8] px-3 py-2 text-xs font-extrabold text-[#2f6958]"><CheckCircle2 className="h-4 w-4" />Connected · {state.mode}</span> : <span className="rounded-full bg-[#f7edd2] px-3 py-2 text-xs font-extrabold text-[#765817]">Not connected</span>}
          </div>

          {message && <div className="mt-6"><Notice tone={error ? 'danger' : 'success'} title={error ? 'Integration update failed' : 'Integration updated'}>{message}</Notice></div>}

          <form onSubmit={save} className="mt-7">
            <label className="text-sm font-bold">Flutterwave Secret API Key
              <div className="relative">
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type={showKey ? 'text' : 'password'} autoComplete="new-password" placeholder="FLWSECK-…" className={`${inputClass} pr-12`} />
                <button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#697687] hover:bg-[#e9e1cd]" aria-label={showKey ? 'Hide secret key' : 'Show secret key'}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-[#182333] px-5 py-3 text-sm font-extrabold text-[#f8f3e8] disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{saving ? 'Verifying & saving…' : 'Connect Flutterwave'}</button>
              <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#d9d2c4] bg-white px-4 py-3 text-sm font-extrabold text-[#182333] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh status</button>
            </div>
          </form>

          <div className="mt-7 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-[#f7f4ed] p-4"><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Mode</p><p className="mt-2 font-mono font-bold">{state?.mode ?? '—'}</p></div>
            <div className="rounded-xl bg-[#f7f4ed] p-4"><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Provider</p><p className="mt-2 font-mono font-bold">Flutterwave</p></div>
            <div className="rounded-xl bg-[#f7f4ed] p-4"><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Last saved</p><p className="mt-2 text-sm font-bold">{state?.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'Not saved'}</p></div>
          </div>

          <div className="mt-6 rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-4 text-sm leading-6 text-[#315e6c]">
            <strong>Security:</strong> only the master admin can change this integration. The key is encrypted at rest using the server security secret and is never returned by the status endpoint. Test/live mode is detected from the key prefix.
          </div>
        </section>
      </div>
    </AppShell>
  );
}
