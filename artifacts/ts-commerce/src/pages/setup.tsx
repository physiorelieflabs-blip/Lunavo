import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/primitives';

const inputClass = 'mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15';

type SetupStatus = { connected: boolean; needsSetup: boolean; mode: string; updatedAt: string | null; provider: string };

export default function SetupPage() {
  const { getToken } = useAuth();
  const [, setLocation] = useLocation();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const request = async (method: string, body?: unknown) => {
    const token = await getToken();
    const response = await fetch('/api/admin/integrations/flutterwave', {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data as SetupStatus;
  };

  const load = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/setup/status', {
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load setup status');
      setStatus(data);
      setError(false);
      if (data.connected && !data.needsSetup) {
        setLocation('/dashboard');
      }
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Setup status could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [getToken, setLocation]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim()) {
      setError(true);
      setMessage('Enter your Flutterwave secret key before continuing.');
      return;
    }

    setSaving(true);
    setError(false);
    setMessage('');

    try {
      const result = await request('PUT', { apiKey: apiKey.trim() });
      setStatus(result);
      setApiKey('');
      setShowKey(false);
      setMessage(`Flutterwave is configured in ${result.mode} mode. You will be redirected to the dashboard.`);
      setTimeout(() => setLocation('/dashboard'), 900);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Flutterwave setup failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[880px]">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline underline-offset-4">
          <ArrowLeft className="h-4 w-4" />Back home
        </Link>

        <div className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#315e6c]">First-run setup</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Connect Flutterwave</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">
                Lunavo requires a valid Flutterwave secret key before real payment flows can be created. This key is encrypted at rest and never exposed in the browser.
              </p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#e9e1cd] text-[#8a6826]">
              <KeyRound className="h-5 w-5" />
            </span>
          </div>

          {message && (
            <div className="mt-6">
              <Notice tone={error ? 'danger' : 'success'} title={error ? 'Setup failed' : 'Setup complete'}>{message}</Notice>
            </div>
          )}

          <form onSubmit={submit} className="mt-7">
            <label className="text-sm font-bold">
              Flutterwave Secret API Key
              <div className="relative">
                <input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  type={showKey ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="FLWSECK-..."
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#697687] hover:bg-[#efe8d9]"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-[#182333] px-5 py-3 text-sm font-extrabold text-[#f8f3e8] disabled:opacity-60">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save and continue'}
              </button>
              <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#d9d2c4] bg-white px-4 py-3 text-sm font-extrabold text-[#182333] disabled:opacity-60">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh status
              </button>
            </div>
          </form>

          <div className="mt-7 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-[#f7f4ed] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Mode</p>
              <p className="mt-2 font-mono font-bold">{status?.mode || 'unknown'}</p>
            </div>
            <div className="rounded-xl bg-[#f7f4ed] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Provider</p>
              <p className="mt-2 font-mono font-bold">{status?.provider || 'flutterwave'}</p>
            </div>
            <div className="rounded-xl bg-[#f7f4ed] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Status</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#315e6c]">
                {status?.connected ? <CheckCircle2 className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                {status?.connected ? 'Connected' : 'Needs setup'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-4 text-sm leading-6 text-[#315e6c]">
            <strong>Security:</strong> the secret is validated server-side before saving, encrypted before storage, and never returned by the status endpoint.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
