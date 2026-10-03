import { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, ArrowRight, CheckCircle2, Circle, Gauge, LockKeyhole, Pause, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { customFetch } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Notice, SectionHeading } from '@/components/primitives';

type AiSettings = {
  autonomyLevel: number;
  runMyBusiness: boolean;
  trainingOptIn: boolean;
  goal: string | null;
  goalTarget: number | null;
};

type AutomationPolicy = {
  merchant_id: number;
  enabled: boolean;
  daily_action_limit: number;
  daily_ad_limit: number;
  min_margin_percent: number;
  max_price_multiplier: number;
  require_approval_for_price_changes: boolean;
  require_approval_for_external_publish: boolean;
};

const modes = [
  { level: 0, name: 'Off', detail: 'Observe only. No automation reservations are allowed.' },
  { level: 1, name: 'Assist', detail: 'Surface recommendations and prepare guided next steps.' },
  { level: 2, name: 'Approval Required', detail: 'Prepare operational work, but require review before consequential execution.' },
  { level: 4, name: 'Full Autopilot', detail: 'Run permitted automation under your limits; external publishing and financial side effects remain guarded.' },
] as const;

export default function Autopilot() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [policy, setPolicy] = useState<AutomationPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [dailyActions, setDailyActions] = useState('');
  const [dailyAds, setDailyAds] = useState('');
  const [minMargin, setMinMargin] = useState('');
  const [maxMultiplier, setMaxMultiplier] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [nextSettings, nextPolicy] = await Promise.all([
        customFetch<AiSettings>('/api/ai/settings', { responseType: 'json' }),
        customFetch<AutomationPolicy>('/api/merchant/automation-policy', { responseType: 'json' }),
      ]);
      setSettings(nextSettings);
      setPolicy(nextPolicy);
      setDailyActions(String(nextPolicy.daily_action_limit));
      setDailyAds(String(nextPolicy.daily_ad_limit));
      setMinMargin(String(nextPolicy.min_margin_percent));
      setMaxMultiplier(String(nextPolicy.max_price_multiplier));
      setError(false);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'Autopilot settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeMode = useMemo(() => {
    if (!settings) return modes[0];
    if (settings.runMyBusiness && settings.autonomyLevel === 4) return modes[3];
    if (settings.autonomyLevel === 2 || settings.autonomyLevel === 3) return modes[2];
    if (settings.autonomyLevel === 1) return modes[1];
    return modes[0];
  }, [settings]);

  const updateMode = async (level: number) => {
    if (!settings) return;
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      if (level === 4 && !settings.trainingOptIn) {
        throw new Error('Enable local AI training consent in AI Control Room before enabling Full Autopilot.');
      }
      const saved = await customFetch<AiSettings>('/api/ai/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          autonomyLevel: level,
          runMyBusiness: level === 4,
          trainingOptIn: settings.trainingOptIn,
          goal: settings.goal,
          goalTarget: settings.goalTarget,
        }),
        responseType: 'json',
      });
      setSettings(saved);
      setMessage(level === 4 ? 'Full Autopilot enabled with the server guardrails below.' : `${modes.find((m) => m.level === level)?.name ?? 'Autopilot'} mode enabled.`);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'Autopilot mode could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    if (!policy) return;
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const body = {
        enabled: policy.enabled,
        dailyActionLimit: Number(dailyActions),
        dailyAdLimit: Number(dailyAds),
        minMarginPercent: Number(minMargin),
        maxPriceMultiplier: Number(maxMultiplier),
        requireApprovalForPriceChanges: policy.require_approval_for_price_changes,
        requireApprovalForExternalPublish: policy.require_approval_for_external_publish,
      };
      const saved = await customFetch<{ saved: boolean; policy?: AutomationPolicy }>('/api/merchant/automation-policy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        responseType: 'json',
      });
      if (saved.policy) setPolicy(saved.policy);
      else setPolicy((current) => current ? { ...current, ...body } as AutomationPolicy : current);
      setMessage('Autopilot guardrails saved on the server.');
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'Autopilot guardrails could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const emergencyStop = async () => {
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      await customFetch('/api/merchant/automation-policy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
          dailyActionLimit: Number(dailyActions) || 0,
          dailyAdLimit: Number(dailyAds) || 0,
          minMarginPercent: Number(minMargin) || 0,
          maxPriceMultiplier: Number(maxMultiplier) || 1,
          requireApprovalForPriceChanges: true,
          requireApprovalForExternalPublish: true,
        }),
        responseType: 'json',
      });
      setPolicy((current) => current ? { ...current, enabled: false, require_approval_for_price_changes: true, require_approval_for_external_publish: true } : current);
      setMessage('Emergency stop is active. Server-side automation reservations are disabled for this merchant.');
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'Emergency stop could not be activated.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <AppShell><main className="mx-auto max-w-[1180px] px-1 py-8 text-sm font-bold text-[#697687]">Loading Autopilot control centre…</main></AppShell>;
  if (error && (!settings || !policy)) return <AppShell><main className="mx-auto max-w-[1180px] px-1 py-8"><Notice tone="danger" title="Autopilot unavailable">{message || 'The control state could not be loaded.'}</Notice></main></AppShell>;

  return <AppShell>
    <main className="mx-auto max-w-[1180px]">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-[#a2772e]">Lunavo Autopilot</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-.07em] text-[#182333] md:text-5xl">Let the operating system do more.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#697687]">A server-controlled automation layer for store operations, marketing preparation, analytics and repetitive work. It cannot manufacture money, bypass payment verification, alter the ledger, approve a payout, or invent provider activity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={policy?.enabled ? 'success' : 'danger'}>{policy?.enabled ? 'Automation enabled' : 'Emergency stop active'}</Badge>
          <Badge tone="info">{activeMode.name}</Badge>
        </div>
      </div>

      {message && <div className="mt-6"><Notice tone={error ? 'danger' : 'success'} title={error ? 'Action not completed' : 'Autopilot updated'}>{message}</Notice></div>}

      <section className="mt-8 grid gap-4 lg:grid-cols-4">
        {modes.map((mode) => {
          const selected = activeMode.name === mode.name;
          return <button key={mode.level} type="button" onClick={() => void updateMode(mode.level)} disabled={busy} className={`rounded-2xl border p-5 text-left transition ${selected ? 'border-[#bca26a] bg-[#fff8e6] shadow-[0_12px_28px_rgba(31,43,56,.08)]' : 'border-[#d9d2c4] bg-[#fbfaf6] hover:border-[#bca26a]'} disabled:cursor-not-allowed disabled:opacity-60`}>
            <div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? 'bg-[#e7d59f] text-[#74581f]' : 'bg-[#f1eee6] text-[#718096]'}`}>{selected ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</span><span className="font-mono text-[10px] font-black text-[#8a98a8]">L{mode.level}</span></div>
            <h2 className="mt-4 text-lg font-black text-[#182333]">{mode.name}</h2>
            <p className="mt-2 text-xs leading-5 text-[#697687]">{mode.detail}</p>
          </button>;
        })}
      </section>

      <section className="mt-8 rounded-3xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_16px_36px_rgba(31,43,56,.05)] md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeading eyebrow="Guardrails" title="Control exactly how much Autopilot can do." description="Every reservation is checked against the merchant policy inside a database transaction. Lower limits are safer; zero disables that class of automation." />
          <button type="button" onClick={() => void emergencyStop()} disabled={busy || policy?.enabled === false} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#942f28] px-4 py-2 text-sm font-black text-white disabled:opacity-50"><AlertOctagon className="h-4 w-4" />Emergency stop</button>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold text-[#182333]">Daily automation actions<input className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3" type="number" min="0" max="10000" value={dailyActions} onChange={(e) => setDailyActions(e.target.value)} /></label>
          <label className="text-sm font-bold text-[#182333]">Daily ad actions<input className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3" type="number" min="0" max="10000" value={dailyAds} onChange={(e) => setDailyAds(e.target.value)} /></label>
          <label className="text-sm font-bold text-[#182333]">Minimum margin %<input className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3" type="number" min="0" max="100" step="0.01" value={minMargin} onChange={(e) => setMinMargin(e.target.value)} /></label>
          <label className="text-sm font-bold text-[#182333]">Maximum price × cost<input className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3" type="number" min="0.01" max="100" step="0.01" value={maxMultiplier} onChange={(e) => setMaxMultiplier(e.target.value)} /></label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#c9ded6] bg-[#eef8f3] p-5"><div className="flex items-center gap-2 text-[#176b55]"><Gauge className="h-4 w-4" /><b>Current operating limits</b></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><span className="text-xs text-[#5c796f]">Actions/day</span><p className="mt-1 font-mono font-black">{policy?.daily_action_limit ?? '—'}</p></div><div><span className="text-xs text-[#5c796f]">Ads/day</span><p className="mt-1 font-mono font-black">{policy?.daily_ad_limit ?? '—'}</p></div><div><span className="text-xs text-[#5c796f]">Min margin</span><p className="mt-1 font-mono font-black">{policy?.min_margin_percent ?? '—'}%</p></div><div><span className="text-xs text-[#5c796f]">Max multiplier</span><p className="mt-1 font-mono font-black">{policy?.max_price_multiplier ?? '—'}×</p></div></div></div>
          <div className="rounded-2xl border border-[#cad6ea] bg-[#f1f5fb] p-5"><div className="flex items-center gap-2 text-[#2f5c9f]"><LockKeyhole className="h-4 w-4" /><b>Protected operations</b></div><div className="mt-3 space-y-2 text-xs leading-5 text-[#536a8c]"><p>✓ Provider-confirmed payment remains the only source of paid financial truth.</p><p>✓ Ledger mutations are server-side and idempotent.</p><p>✓ External publishing can be forced through approval.</p><p>✓ Payout approval stays outside Autopilot.</p></div></div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3"><Button onClick={() => void savePolicy()} disabled={busy}><ShieldCheck className="h-4 w-4" />Save guardrails</Button><Link href="/ai"><Button variant="secondary"><Sparkles className="h-4 w-4" />Open AI Control Room</Button></Link><Link href="/activity"><Button variant="ghost"><ArrowRight className="h-4 w-4" />View activity</Button></Link></div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-[#d9d2c4] bg-white p-5"><div className="flex items-center gap-2"><Pause className="h-4 w-4 text-[#a2772e]" /><h2 className="font-black">Automatic stop</h2></div><p className="mt-3 text-sm leading-6 text-[#697687]">Use the emergency stop when you want all merchant automation reservations disabled immediately. Re-enable it by saving the policy again.</p></article>
        <article className="rounded-2xl border border-[#d9d2c4] bg-white p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#188b68]" /><h2 className="font-black">Approval centre</h2></div><p className="mt-3 text-sm leading-6 text-[#697687]">AI actions retain approval, execution and rollback state. Financial or destructive actions remain subject to server-side checks.</p><Link href="/ai" className="mt-4 inline-flex text-xs font-black text-[#8a6826] underline">Review actions</Link></article>
        <article className="rounded-2xl border border-[#d9d2c4] bg-white p-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#188b68]" /><h2 className="font-black">Real-data rule</h2></div><p className="mt-3 text-sm leading-6 text-[#697687]">Recommendations, reports and campaign decisions must be grounded in persisted merchant data or clearly identified provider evidence. No fake counters or pretend publications.</p></article>
      </section>
    </main>
  </AppShell>;
}
