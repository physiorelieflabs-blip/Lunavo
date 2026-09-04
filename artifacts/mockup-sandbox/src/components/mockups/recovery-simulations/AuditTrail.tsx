import './_group.css';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  Copy,
  FileDiff,
  Fingerprint,
  History,
  Info,
  Layers3,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Split,
  WalletCards,
  X,
} from 'lucide-react';

type CaseId = 'settings' | 'payment' | 'activity';
type CaseState = 'partial' | 'unverified' | 'retry' | 'replaying' | 'resolved';

type EventRecord = {
  label: string;
  time: string;
  detail: string;
  tone: 'neutral' | 'safe' | 'warning' | 'danger';
  marker: 'fact' | 'unknown' | 'action' | 'projection';
};

const cases: Array<{
  id: CaseId;
  eyebrow: string;
  title: string;
  subject: string;
  state: CaseState;
  stamp: string;
  icon: typeof WalletCards;
}> = [
  {
    id: 'settings',
    eyebrow: 'Account settings',
    title: 'Profile save',
    subject: 'Mara Ellison · username',
    state: 'partial',
    stamp: '09:42:16 UTC',
    icon: Fingerprint,
  },
  {
    id: 'payment',
    eyebrow: 'Public return',
    title: 'Payment verification',
    subject: 'Order TS-18427 · $248.00 USD',
    state: 'unverified',
    stamp: '09:39:02 UTC',
    icon: WalletCards,
  },
  {
    id: 'activity',
    eyebrow: 'Merchant activity',
    title: 'Projection replay',
    subject: 'order.payment_captured · #evt_7F19',
    state: 'retry',
    stamp: '09:31:48 UTC',
    icon: Layers3,
  },
];

const stateLabel: Record<CaseState, string> = {
  partial: 'Partially saved',
  unverified: 'Not verified',
  retry: 'Needs replay',
  replaying: 'Replaying',
  resolved: 'Resolved',
};

const toneClass: Record<EventRecord['tone'], string> = {
  neutral: 'border-[#d9d2c4] bg-[#f8f5ee] text-[#536174]',
  safe: 'border-[#b7d6c8] bg-[#eff7f2] text-[#2e6654]',
  warning: 'border-[#e3c98f] bg-[#fff8e5] text-[#87631c]',
  danger: 'border-[#e6b9b2] bg-[#fff1ee] text-[#9b413a]',
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function AuditTrail() {
  const [selected, setSelected] = useState<CaseId>('settings');
  const [statuses, setStatuses] = useState<Record<CaseId, CaseState>>({
    settings: 'partial',
    payment: 'unverified',
    activity: 'retry',
  });
  const [settingsChoice, setSettingsChoice] = useState<'review' | 'retry' | null>(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [activityMessage, setActivityMessage] = useState('');
  const [busy, setBusy] = useState<CaseId | null>(null);
  const [copied, setCopied] = useState(false);

  const activeCase = cases.find((item) => item.id === selected) ?? cases[0];
  const activeStatus = statuses[selected];

  const timeline = useMemo<EventRecord[]>(() => {
    if (selected === 'settings') {
      return [
        {
          label: 'Profile details accepted',
          time: '09:42:11 UTC',
          detail: 'First name and last name were written to the account profile.',
          tone: 'safe',
          marker: 'fact',
        },
        {
          label: 'Username write rejected',
          time: '09:42:16 UTC',
          detail: 'The workspace does not permit username changes. Existing username remains “mara-ellison”.',
          tone: 'danger',
          marker: 'unknown',
        },
        {
          label: 'Current safe boundary',
          time: 'now',
          detail: 'Do not retry the profile write. A username-only retry will not touch the saved name.',
          tone: 'warning',
          marker: 'action',
        },
      ];
    }
    if (selected === 'payment') {
      return [
        {
          label: 'Customer returned from payment page',
          time: '09:39:02 UTC',
          detail: 'Return payload references order TS-18427 and total $248.00 USD.',
          tone: 'safe',
          marker: 'fact',
        },
        {
          label: 'Verification token unavailable',
          time: '09:39:03 UTC',
          detail: 'No secure token was received. The payment cannot be marked paid from this return.',
          tone: 'danger',
          marker: 'unknown',
        },
        {
          label: activeStatus === 'resolved' ? 'Verification remains the source of truth' : 'Current safe boundary',
          time: activeStatus === 'resolved' ? 'now' : 'now',
          detail:
            activeStatus === 'resolved'
              ? 'Verification did not produce a paid result. A payment session can be reopened separately.'
              : 'Retry verification only checks evidence already attached to this return; it does not create payment evidence.',
          tone: 'warning',
          marker: 'action',
        },
      ];
    }
    return [
      {
        label: 'Ledger event committed',
        time: '09:31:47 UTC',
        detail: 'order.payment_captured is authoritative in the commerce event ledger.',
        tone: 'safe',
        marker: 'fact',
      },
      {
        label: 'Notification projection failed',
        time: '09:31:48 UTC',
        detail: 'The merchant activity read model is behind. No ledger event or balance is changed by a replay.',
        tone: 'danger',
        marker: 'projection',
      },
      {
        label: activeStatus === 'resolved' ? 'Projection caught up' : 'Current safe boundary',
        time: activeStatus === 'resolved' ? '09:33:06 UTC' : 'now',
        detail:
          activeStatus === 'resolved'
            ? 'The replay rebuilt the activity entry from the original event; no duplicate money movement was created.'
            : 'Replay the projection only. Do not re-run the payment or mutate the order ledger.',
        tone: activeStatus === 'resolved' ? 'safe' : 'warning',
        marker: activeStatus === 'resolved' ? 'projection' : 'action',
      },
    ];
  }, [activeStatus, selected]);

  const setCaseStatus = (id: CaseId, status: CaseState) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  };

  const retryUsername = async () => {
    setSettingsChoice('retry');
    setBusy('settings');
    await sleep(650);
    setBusy(null);
    setCaseStatus('settings', 'resolved');
  };

  const retryVerification = async () => {
    setPaymentMessage('No verification token is attached. The payment is still not verified.');
    setBusy('payment');
    setCaseStatus('payment', 'unverified');
    await sleep(650);
    setBusy(null);
    setPaymentMessage('Verification checked again: no token found. Nothing was marked paid.');
  };

  const reopenPayment = async () => {
    setPaymentMessage('Opening a new payment session does not confirm the original attempt.');
    setBusy('payment');
    await sleep(650);
    setBusy(null);
    setCaseStatus('payment', 'resolved');
    setPaymentMessage('Payment session reopened. Ask the customer to submit a new payment reference.');
  };

  const replayProjection = async () => {
    setActivityMessage('');
    setBusy('activity');
    setCaseStatus('activity', 'replaying');
    await sleep(900);
    setBusy(null);
    setCaseStatus('activity', 'resolved');
    setActivityMessage('Projection replayed from evt_7F19. No payment or stock operation was repeated.');
  };

  const copyIncidentId = () => {
    void navigator.clipboard?.writeText('recovery / TS-18427 / 2025-03-08');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="min-h-[100dvh] bg-[#f2eee5] px-4 py-4 text-[#182333] sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1360px]">
        <header className="border-b border-[#d6cfc1] pb-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#182333] text-[#f6f0e3] shadow-[0_8px_20px_rgba(24,35,51,.12)]">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8a6826]">TS Commerce Plattform</p>
                <p className="mt-1 text-sm font-semibold text-[#536174]">Recovery workspace / evidence first</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 rounded-full border border-[#b7d6c8] bg-[#eff7f2] px-3 py-1.5 text-xs font-bold text-[#2e6654] sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3c856c]" />
                Ledger available
              </span>
              <button
                type="button"
                onClick={copyIncidentId}
                className="inline-flex items-center gap-2 rounded-lg border border-[#d2c9ba] bg-[#fbfaf6] px-3 py-2 text-xs font-bold text-[#536174] transition hover:border-[#a2772e] hover:text-[#8a6826]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#2e6654]" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy incident ID'}
              </button>
            </div>
          </div>
          <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Audit trail</p>
              <h1 className="mt-2 max-w-[780px] text-[clamp(2rem,4vw,3.8rem)] font-black leading-[.96] tracking-[-.075em]">
                Know what happened.
                <br />
                <span className="text-[#7e8791]">Then choose what is safe.</span>
              </h1>
              <p className="mt-4 max-w-[700px] text-sm leading-6 text-[#5f6c7b]">
                Three recovery cases are open. This view keeps authoritative facts, unknowns, and reversible next operations separate so a support handoff never has to guess.
              </p>
            </div>
            <div className="rounded-xl border border-[#d6cfc1] bg-[#fbfaf6] p-4 lg:min-w-[265px]">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#7f8b98]">Review window</p>
              <p className="mt-2 font-mono text-lg font-bold tracking-[-.04em]">08 Mar 2025</p>
              <div className="mt-3 flex items-center justify-between text-xs text-[#697687]">
                <span>Last evidence received</span>
                <span className="font-mono font-bold text-[#182333]">09:42:16 UTC</span>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-px overflow-hidden rounded-xl border border-[#d6cfc1] bg-[#d6cfc1] sm:grid-cols-3">
          <SummaryBand icon={FileDiff} label="Settings" value={statuses.settings === 'resolved' ? 'Complete' : '1 write partial'} tone={statuses.settings === 'resolved' ? 'safe' : 'warning'} />
          <SummaryBand icon={WalletCards} label="Payment return" value={statuses.payment === 'resolved' ? 'Session reopened' : 'Not verified'} tone="danger" />
          <SummaryBand icon={RotateCcw} label="Activity projection" value={statuses.activity === 'resolved' ? 'Caught up' : statuses.activity === 'replaying' ? 'Replaying now' : 'Replay available'} tone={statuses.activity === 'resolved' ? 'safe' : 'warning'} />
        </section>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[290px_minmax(0,1fr)_280px]">
          <nav aria-label="Recovery cases" className="rounded-xl border border-[#d6cfc1] bg-[#fbfaf6] p-3">
            <div className="flex items-center justify-between px-2 pb-3 pt-1">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#7f8b98]">Open cases</p>
              <span className="rounded-full bg-[#eee6d7] px-2 py-1 font-mono text-[10px] font-bold text-[#8a6826]">03</span>
            </div>
            <div className="space-y-2">
              {cases.map((item) => {
                const Icon = item.icon;
                const current = selected === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      current ? 'border-[#bca26a] bg-[#f5eddc] shadow-[inset_3px_0_0_#a2772e]' : 'border-transparent hover:border-[#d6cfc1] hover:bg-[#f7f3eb]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${current ? 'bg-[#182333] text-[#f7f1e5]' : 'bg-[#eee8dc] text-[#8a6826]'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold">{item.title}</span>
                          <span className={`h-2 w-2 rounded-full ${statuses[item.id] === 'resolved' ? 'bg-[#3c856c]' : item.id === 'payment' ? 'bg-[#c4574f]' : 'bg-[#bd8a27]'}`} />
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-[#697687]">{item.subject}</span>
                        <span className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[.08em] text-[#8994a2]">
                          <span>{stateLabel[statuses[item.id]]}</span>
                          <span className="font-mono normal-case tracking-normal">{item.stamp}</span>
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 border-t border-[#e1dbd0] px-2 pt-4">
              <p className="flex items-start gap-2 text-[11px] leading-5 text-[#697687]">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a6826]" />
                Read-only evidence is preserved while recovery actions run.
              </p>
            </div>
          </nav>

          <section className="min-w-0 rounded-xl border border-[#d6cfc1] bg-[#fbfaf6]">
            <div className="border-b border-[#e0d9cd] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">{activeCase.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-.06em]">{activeCase.title}</h2>
                  <p className="mt-1 font-mono text-xs text-[#697687]">{activeCase.subject}</p>
                </div>
                <StatusPill status={activeStatus} />
              </div>
              {selected === 'payment' && (
                <div className="mt-5 grid gap-3 rounded-lg border border-[#e6b9b2] bg-[#fff1ee] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b54c45]" />
                    <div>
                      <p className="text-xs font-extrabold text-[#8f3d37]">This return does not prove payment</p>
                      <p className="mt-1 text-xs leading-5 text-[#a0524c]">Order total is shown as context only. No verified payment status is being asserted.</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#8f3d37]">token: missing</span>
                </div>
              )}
              {selected === 'activity' && (
                <div className="mt-5 flex gap-3 rounded-lg border border-[#b7d6c8] bg-[#eff7f2] p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2e6654]" />
                  <div>
                    <p className="text-xs font-extrabold text-[#2e6654]">Authoritative ledger fact is intact</p>
                    <p className="mt-1 text-xs leading-5 text-[#477363]">Only the merchant-facing projection needs repair. Replay is isolated from balances and order state.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#7f8b98]">Evidence timeline</p>
                  <p className="mt-1 text-xs text-[#697687]">Ordered by receipt time · source labels are intentional</p>
                </div>
                <History className="h-5 w-5 text-[#a2772e]" />
              </div>
              <div className="relative mt-5 space-y-3 before:absolute before:bottom-5 before:left-[15px] before:top-5 before:w-px before:bg-[#d9d2c4]">
                {timeline.map((event, index) => (
                  <TimelineEvent key={`${event.label}-${index}`} event={event} />
                ))}
              </div>
              {selected === 'settings' && (
                <div className="mt-6 border-t border-[#e0d9cd] pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold">Saved field diff</p>
                      <p className="mt-1 text-xs text-[#697687]">One field changed; one field stayed untouched.</p>
                    </div>
                    <button type="button" onClick={() => setSettingsChoice('review')} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#8a6826] underline underline-offset-4">
                      Review diff <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {settingsChoice === 'review' && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <DiffRow label="First name" before="Mara" after="Mara" changed={false} />
                      <DiffRow label="Last name" before="Ellison" after="Ellison" changed={false} />
                      <DiffRow label="Username" before="mara-ellison" after="mara.e" changed />
                      <DiffRow label="Email" before="mara@northstar.tools" after="mara@northstar.tools" changed={false} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border border-[#d6cfc1] bg-[#182333] p-5 text-[#f7f1e5] shadow-[0_12px_24px_rgba(24,35,51,.1)]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#d7b86d]">Safe next operation</p>
                <CircleDashed className="h-4 w-4 text-[#d7b86d]" />
              </div>
              <h3 className="mt-4 text-xl font-black leading-tight tracking-[-.05em]">{nextActionTitle(selected, activeStatus)}</h3>
              <p className="mt-2 text-xs leading-5 text-[#b6c0cc]">{nextActionCopy(selected, activeStatus)}</p>
              <div className="mt-5 space-y-2">
                {selected === 'settings' && (
                  <>
                    <ActionButton icon={RefreshCw} busy={busy === 'settings'} onClick={retryUsername} disabled={activeStatus === 'resolved'}>
                      {activeStatus === 'resolved' ? 'Username decision recorded' : 'Retry username only'}
                    </ActionButton>
                    <ActionButton icon={X} variant="quiet" onClick={() => { setSettingsChoice('review'); setCaseStatus('settings', 'resolved'); }} disabled={activeStatus === 'resolved'}>
                      Keep current username
                    </ActionButton>
                  </>
                )}
                {selected === 'payment' && (
                  <>
                    <ActionButton icon={RefreshCw} busy={busy === 'payment'} onClick={retryVerification}>
                      Retry verification
                    </ActionButton>
                    <ActionButton icon={WalletCards} variant="quiet" busy={busy === 'payment'} onClick={reopenPayment}>
                      Reopen payment session
                    </ActionButton>
                  </>
                )}
                {selected === 'activity' && (
                  <ActionButton icon={RotateCcw} busy={busy === 'activity'} onClick={replayProjection} disabled={activeStatus === 'resolved'}>
                    {activeStatus === 'resolved' ? 'Projection is current' : 'Replay projection'}
                  </ActionButton>
                )}
              </div>
              {selected === 'payment' && paymentMessage && <p className="mt-4 border-t border-[#354354] pt-3 text-[11px] leading-5 text-[#e7cf9b]">{paymentMessage}</p>}
              {selected === 'activity' && activityMessage && <p className="mt-4 border-t border-[#354354] pt-3 text-[11px] leading-5 text-[#b9dacd]">{activityMessage}</p>}
            </section>

            <section className="rounded-xl border border-[#d6cfc1] bg-[#fbfaf6] p-5">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-[#a2772e]" />
                <p className="text-xs font-extrabold">Provenance rules</p>
              </div>
              <ul className="mt-4 space-y-3 text-[11px] leading-5 text-[#697687]">
                <Rule icon={CheckCircle2} text="Ledger facts are immutable evidence." />
                <Rule icon={Split} text="Projections can be replayed without replaying money." />
                <Rule icon={AlertTriangle} text="An order total is not a payment confirmation." />
              </ul>
            </section>

            <section className="rounded-xl border border-[#d6cfc1] bg-[#f7f3eb] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#7f8b98]">Handoff note</p>
                <ArrowDownToLine className="h-4 w-4 text-[#8a6826]" />
              </div>
              <p className="mt-3 text-xs leading-5 text-[#536174]">Actions here are local simulations. Every operation is narrow, reversible, and labelled by the record it can change.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SummaryBand({ icon: Icon, label, value, tone }: { icon: typeof WalletCards; label: string; value: string; tone: 'safe' | 'warning' | 'danger' }) {
  const colors = { safe: 'text-[#2e6654]', warning: 'text-[#87631c]', danger: 'text-[#9b413a]' };
  return (
    <div className="flex items-center gap-3 bg-[#fbfaf6] px-4 py-3.5">
      <Icon className={`h-4 w-4 ${colors[tone]}`} />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#8994a2]">{label}</p>
        <p className={`mt-1 truncate text-xs font-extrabold ${colors[tone]}`}>{value}</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: CaseState }) {
  const resolved = status === 'resolved';
  const danger = status === 'unverified';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.1em] ${resolved ? 'border-[#b7d6c8] bg-[#eff7f2] text-[#2e6654]' : danger ? 'border-[#e6b9b2] bg-[#fff1ee] text-[#9b413a]' : 'border-[#e3c98f] bg-[#fff8e5] text-[#87631c]'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${resolved ? 'bg-[#3c856c]' : danger ? 'bg-[#c4574f]' : 'bg-[#bd8a27]'}`} />
      {stateLabel[status]}
    </span>
  );
}

function TimelineEvent({ event }: { event: EventRecord }) {
  const icon = event.marker === 'fact' ? CheckCircle2 : event.marker === 'unknown' ? AlertTriangle : event.marker === 'projection' ? Layers3 : Play;
  const Icon = icon;
  return (
    <div className="relative flex gap-3">
      <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-4 border-[#fbfaf6] ${event.tone === 'safe' ? 'bg-[#b7d6c8] text-[#2e6654]' : event.tone === 'danger' ? 'bg-[#e6b9b2] text-[#9b413a]' : event.tone === 'warning' ? 'bg-[#e3c98f] text-[#87631c]' : 'bg-[#d9d2c4] text-[#536174]'}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className={`min-w-0 flex-1 rounded-lg border px-3.5 py-3 ${toneClass[event.tone]}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs font-extrabold">{event.label}</p>
          <time className="font-mono text-[10px] opacity-70">{event.time}</time>
        </div>
        <p className="mt-1 text-[11px] leading-5 opacity-90">{event.detail}</p>
      </div>
    </div>
  );
}

function DiffRow({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${changed ? 'border-[#e3c98f] bg-[#fff8e5]' : 'border-[#d9d2c4] bg-[#f8f5ee]'}`}>
      <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#8994a2]">{label}</p>
      <div className="mt-2 flex items-center gap-2 font-mono text-[11px]">
        <span className="truncate text-[#697687]">{before}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-[#a2772e]" />
        <span className={`truncate font-bold ${changed ? 'text-[#9b413a]' : 'text-[#2e6654]'}`}>{after}</span>
      </div>
    </div>
  );
}

function ActionButton({ children, icon: Icon, onClick, disabled, busy, variant = 'primary' }: { children: React.ReactNode; icon: typeof RefreshCw; onClick: () => void; disabled?: boolean; busy?: boolean; variant?: 'primary' | 'quiet' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-55 ${variant === 'primary' ? 'bg-[#d7b86d] text-[#182333] hover:bg-[#e2ca8d]' : 'border border-[#455364] text-[#eef0eb] hover:border-[#9bb6aa] hover:bg-[#243243]'}`}
    >
      <span className="flex items-center gap-2">
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        {busy ? 'Working…' : children}
      </span>
      <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-60" />
    </button>
  );
}

function Rule({ icon: Icon, text }: { icon: typeof CheckCircle2; text: string }) {
  return (
    <li className="flex gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a2772e]" />
      <span>{text}</span>
    </li>
  );
}

function nextActionTitle(id: CaseId, status: CaseState) {
  if (id === 'settings') return status === 'resolved' ? 'Decision recorded' : 'Limit the retry to one field';
  if (id === 'payment') return status === 'resolved' ? 'Session is ready for a new reference' : 'Do not call this paid';
  return status === 'resolved' ? 'Projection is current' : 'Replay the read model only';
}

function nextActionCopy(id: CaseId, status: CaseState) {
  if (id === 'settings') return status === 'resolved' ? 'The saved name remains intact. The username decision is now explicit.' : 'The name write succeeded. Choose whether to retry only the rejected username or keep the current one.';
  if (id === 'payment') return status === 'resolved' ? 'A reopened session creates a path to new evidence; it does not alter the original payment result.' : 'There is no secure verification token on the public return. A visible total is context, not a paid claim.';
  return status === 'resolved' ? 'The merchant activity view can now read from the rebuilt projection.' : 'The source event is already in the ledger. Replay repairs its projection without touching balances, stock, or the payment.';
}