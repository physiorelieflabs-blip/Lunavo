import "./_group.css";
import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

type ProfileState = "idle" | "saving" | "partial" | "resolved" | "reverted";
type PaymentState = "missing" | "checking" | "failed" | "reopened" | "pending";
type EventState = "retry" | "replaying" | "processed";

function StatusPill({ tone, children }: { tone: "warning" | "success" | "danger" | "neutral" | "info"; children: ReactNode }) {
  const tones = {
    warning: "border-[#e3c18b] bg-[#fff5dd] text-[#855d24]",
    success: "border-[#afd0bf] bg-[#ecf6ef] text-[#396b57]",
    danger: "border-[#dfb1a8] bg-[#fff0ed] text-[#91463c]",
    neutral: "border-[#d8d1c4] bg-[#f0ede6] text-[#647178]",
    info: "border-[#b4cdd2] bg-[#edf6f6] text-[#3d6972]",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.12em] ${tones[tone]}`}>{children}</span>;
}

function StepDot({ state, number }: { state: "done" | "active" | "waiting" | "error"; number: number }) {
  if (state === "done") return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ecf6ef] text-[#396b57]"><Check className="h-4 w-4" strokeWidth={2.5} /></span>;
  if (state === "error") return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fff0ed] text-[#91463c]"><AlertCircle className="h-4 w-4" /></span>;
  if (state === "active") return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#b36e42] font-mono text-xs font-bold text-[#fffaf1]">{number}</span>;
  return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#d8d1c4] bg-[#f1eee6] font-mono text-xs text-[#89949a]">{number}</span>;
}

function Chevron({ open }: { open: boolean }) {
  return <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />;
}

function ActionButton({ children, onClick, secondary = false, disabled = false }: { children: ReactNode; onClick: () => void; secondary?: boolean; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-xs font-extrabold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${secondary ? "border border-[#cfc7b8] bg-[#f7f4ed] text-[#304049] hover:border-[#b36e42]" : "bg-[#17252b] text-[#fffaf1] hover:bg-[#274049]"}`}>{children}</button>;
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-[#e4ded3] py-2.5 last:border-0"><span className="text-xs text-[#647178]">{label}</span><span className={`text-right text-xs font-semibold text-[#304049] ${mono ? "font-mono" : ""}`}>{value}</span></div>;
}

function ProfileRecovery() {
  const [state, setState] = useState<ProfileState>("idle");
  const [details, setDetails] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const save = () => {
    setState("saving");
    window.setTimeout(() => setState("partial"), 850);
  };

  const retryUsername = () => {
    setState("saving");
    window.setTimeout(() => setState("resolved"), 850);
  };

  return <article className="recovery-rise rounded-2xl border border-[#d8d1c4] bg-[#f9f7f1] shadow-[0_20px_46px_rgba(38,47,46,.06)]">
    <header className="border-b border-[#e4ded3] px-5 pb-5 pt-5 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ebe1d3] text-[#9b5e38]"><UserRound className="h-5 w-5" /></div>
          <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9b5e38]">01 · Account settings</p><h2 className="mt-1 text-lg font-extrabold tracking-[-.04em]">Save account details</h2></div>
        </div>
        <StatusPill tone={state === "resolved" ? "success" : state === "partial" ? "warning" : "info"}>{state === "resolved" ? "Complete" : state === "partial" ? "Partial save" : "Needs attention"}</StatusPill>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#647178]">A save can finish in more than one place. We show exactly what changed before asking you to retry anything.</p>
    </header>
    <div className="px-5 py-5 md:px-6">
      <div className="relative space-y-5 before:absolute before:left-[13px] before:top-4 before:h-[calc(100%-32px)] before:w-px before:bg-[#d8d1c4]">
        <div className="relative flex gap-3">
          <StepDot state={state === "idle" || state === "saving" ? "active" : "done"} number={1} />
          <div className="min-w-0 flex-1"><p className="text-sm font-bold">Save your name</p><p className="mt-1 text-xs text-[#647178]">{state === "partial" || state === "resolved" || state === "reverted" ? "First and last name · saved just now" : "First and last name · ready to save"}</p></div>
          {(state === "partial" || state === "resolved") && <CheckCircle2 className="mt-1 h-4 w-4 text-[#4f7b69]" />}
        </div>
        <div className="relative flex gap-3">
          <StepDot state={state === "partial" ? "error" : state === "resolved" ? "done" : "waiting"} number={2} />
          <div className="min-w-0 flex-1"><p className="text-sm font-bold">Update username</p><p className="mt-1 text-xs text-[#647178]">{state === "partial" ? "Could not reach the identity provider" : state === "resolved" ? "@mara-atelier · saved just now" : "@mara-atelier · optional"}</p></div>
          {state === "resolved" && <CheckCircle2 className="mt-1 h-4 w-4 text-[#4f7b69]" />}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#ddd6ca] bg-[#f3f0e8] p-3.5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <InfoRow label="Name" value="Mara Ellison" />
          <InfoRow label="Username" value={state === "partial" || state === "reverted" ? "@mara-atelier (unchanged)" : "@mara-atelier"} mono />
          <InfoRow label="Primary email" value="mara@atelier-north.com" />
          <InfoRow label="Last saved" value={state === "idle" ? "Not yet" : state === "saving" ? "Saving…" : "Today, 14:32 UTC"} />
        </div>
      </div>

      {state === "partial" && <div className="mt-4 rounded-xl border border-[#dfb1a8] bg-[#fff0ed] p-3.5" role="alert">
        <div className="flex gap-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#a34f43]" /><div><p className="text-sm font-extrabold text-[#803f37]">Name saved. Username not changed.</p><p className="mt-1 text-xs leading-5 text-[#91463c]">Your name is already safe. Retry only the username update; it will not submit the name again.</p></div></div>
      </div>}
      {state === "resolved" && <div className="mt-4 rounded-xl border border-[#afd0bf] bg-[#ecf6ef] p-3.5"><div className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#396b57]" /><div><p className="text-sm font-extrabold text-[#315b4a]">Both changes are saved.</p><p className="mt-1 text-xs leading-5 text-[#396b57]">The workspace now uses the updated account details.</p></div></div></div>}

      <div className="mt-5 flex flex-wrap gap-2.5">
        {state === "idle" && <ActionButton onClick={save}><Save className="h-4 w-4" />Save details</ActionButton>}
        {state === "saving" && <ActionButton onClick={() => undefined} disabled><CircleDashed className="h-4 w-4 animate-spin" />Saving safely…</ActionButton>}
        {state === "partial" && <><ActionButton onClick={retryUsername}><RefreshCw className="h-4 w-4" />Retry username only</ActionButton><ActionButton secondary onClick={() => setState("reverted")}><RotateCcw className="h-4 w-4" />Revert name</ActionButton></>}
        {state === "resolved" && <ActionButton secondary onClick={() => setState("reverted")}><RotateCcw className="h-4 w-4" />Undo name change</ActionButton>}
        {state === "reverted" && <ActionButton onClick={save}><Save className="h-4 w-4" />Save again</ActionButton>}
      </div>

      <button type="button" onClick={() => setDetails(!details)} className="mt-5 inline-flex items-center gap-2 text-xs font-extrabold text-[#8e5b38] underline decoration-[#c9a382] underline-offset-4"><Chevron open={details} />Show save details</button>
      {details && <div className="mt-3 rounded-lg border border-[#e4ded3] bg-[#fbfaf6] p-3 text-[11px] leading-5 text-[#647178]"><p><span className="font-mono text-[#304049]">identity.update</span> · firstName, lastName, username</p><p><span className="font-mono text-[#304049]">safe retry</span> · username operation only after partial save</p><p><span className="font-mono text-[#304049]">request id</span> · req_01HF7A2K9</p></div>}
      <div className="mt-4 flex items-center justify-between border-t border-[#e4ded3] pt-3 text-[10px] text-[#89949a]">
        <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" />Identity changes are protected</span>
        <button type="button" onClick={() => setShowToken(!showToken)} className="inline-flex items-center gap-1 text-[#647178] hover:text-[#304049]">{showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}{showToken ? "Hide" : "View"} audit ref</button>
      </div>
      {showToken && <p className="mt-2 text-right font-mono text-[10px] text-[#89949a]">audit_2024_0614_1432</p>}
    </div>
  </article>;
}

function PaymentRecovery() {
  const [state, setState] = useState<PaymentState>("missing");
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);

  const verify = () => {
    setBusy(true);
    setState("checking");
    window.setTimeout(() => { setBusy(false); setState("failed"); }, 900);
  };

  const reopen = () => {
    setBusy(true);
    window.setTimeout(() => { setBusy(false); setState("reopened"); }, 900);
  };

  return <article className="recovery-rise recovery-delay-1 rounded-2xl border border-[#d8d1c4] bg-[#f9f7f1] shadow-[0_20px_46px_rgba(38,47,46,.06)]">
    <header className="border-b border-[#e4ded3] px-5 pb-5 pt-5 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e7e2d5] text-[#476d75]"><CreditCard className="h-5 w-5" /></div><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#476d75]">02 · Public payment return</p><h2 className="mt-1 text-lg font-extrabold tracking-[-.04em]">Check payment status</h2></div></div>
        <StatusPill tone={state === "pending" ? "warning" : state === "reopened" ? "info" : state === "failed" ? "danger" : "warning"}>{state === "reopened" ? "Session ready" : state === "pending" ? "Processing" : state === "failed" ? "Not verified" : "Needs attention"}</StatusPill>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#647178]">An order is not marked paid until a secure verification token returns a confirmed result.</p>
    </header>
    <div className="px-5 py-5 md:px-6">
      <div className="relative space-y-5 before:absolute before:left-[13px] before:top-4 before:h-[calc(100%-32px)] before:w-px before:bg-[#d8d1c4]">
        <div className="relative flex gap-3"><StepDot state={state === "missing" ? "error" : state === "checking" ? "active" : "done"} number={1} /><div className="flex-1"><p className="text-sm font-bold">Receive verification token</p><p className="mt-1 text-xs text-[#647178]">{state === "missing" ? "Token missing from return URL" : state === "checking" || state === "failed" ? "Token still unavailable" : "New session token issued"}</p></div>{(state === "checking" || state === "failed") && <AlertCircle className="mt-1 h-4 w-4 text-[#a34f43]" />}</div>
        <div className="relative flex gap-3"><StepDot state={state === "pending" ? "active" : state === "reopened" ? "active" : "waiting"} number={2} /><div className="flex-1"><p className="text-sm font-bold">Verify payment evidence</p><p className="mt-1 text-xs text-[#647178]">{state === "pending" ? "Awaiting payment provider result" : "No confirmation has been received"}</p></div></div>
        <div className="relative flex gap-3"><StepDot state={state === "pending" ? "waiting" : "waiting"} number={3} /><div className="flex-1"><p className="text-sm font-bold">Confirm the order</p><p className="mt-1 text-xs text-[#89949a]">Only after verification is confirmed</p></div></div>
      </div>

      <div className="mt-5 rounded-xl border border-[#ddd6ca] bg-[#f3f0e8] p-3.5">
        <InfoRow label="Order" value="TS-10482" mono />
        <InfoRow label="Total" value="€184.00" mono />
        <InfoRow label="Return received" value="14 Jun 2024 · 14:35 UTC" />
        <InfoRow label="Payment status" value={state === "pending" ? "Processing — not paid" : "Unverified — not paid"} />
      </div>

      {(state === "missing" || state === "failed") && <div className="mt-4 rounded-xl border border-[#dfb1a8] bg-[#fff0ed] p-3.5" role="alert"><div className="flex gap-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#a34f43]" /><div><p className="text-sm font-extrabold text-[#803f37]">{state === "missing" ? "Verification token is missing." : "Verification could not be completed."}</p><p className="mt-1 text-xs leading-5 text-[#91463c]">{state === "missing" ? "The return page cannot confirm this payment. Checking again is safe; it does not create a new payment." : "No payment claim is being made. Reopening the session is separate from retrying verification."}</p></div></div></div>}
      {state === "reopened" && <div className="mt-4 rounded-xl border border-[#b4cdd2] bg-[#edf6f6] p-3.5"><div className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#3d6972]" /><div><p className="text-sm font-extrabold text-[#345b63]">A fresh payment session is ready.</p><p className="mt-1 text-xs leading-5 text-[#3d6972]">This reopened session still needs a provider result. The order remains unverified and unpaid.</p></div></div></div>}
      {state === "pending" && <div className="mt-4 rounded-xl border border-[#e3c18b] bg-[#fff5dd] p-3.5"><div className="flex gap-2.5"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#855d24]" /><div><p className="text-sm font-extrabold text-[#76511f]">Payment verification is processing.</p><p className="mt-1 text-xs leading-5 text-[#855d24]">Keep this page open or return later. The order will not be confirmed until verification succeeds.</p></div></div></div>}

      <div className="mt-5 flex flex-wrap gap-2.5">
        {state !== "pending" && <ActionButton onClick={state === "reopened" ? () => setState("pending") : verify} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Checking…" : state === "reopened" ? "Verify reopened session" : "Retry verification"}</ActionButton>}
        {(state === "missing" || state === "failed") && <ActionButton secondary onClick={reopen} disabled={busy}><Play className="h-4 w-4" />Reopen payment session</ActionButton>}
        {state === "pending" && <ActionButton secondary onClick={() => setState("failed")}><X className="h-4 w-4" />Stop checking</ActionButton>}
      </div>
      <button type="button" onClick={() => setDetails(!details)} className="mt-5 inline-flex items-center gap-2 text-xs font-extrabold text-[#476d75] underline decoration-[#9bbbc0] underline-offset-4"><Chevron open={details} />Show verification details</button>
      {details && <div className="mt-3 rounded-lg border border-[#e4ded3] bg-[#fbfaf6] p-3 text-[11px] leading-5 text-[#647178]"><p><span className="font-mono text-[#304049]">verification</span> · token required, credentials omitted</p><p><span className="font-mono text-[#304049]">retry</span> · reads existing session only</p><p><span className="font-mono text-[#304049]">reopen</span> · starts a new native payment session</p></div>}
    </div>
  </article>;
}

function EventRecovery() {
  const [state, setState] = useState<EventState>("retry");
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);

  const replay = () => {
    setBusy(true);
    setState("replaying");
    window.setTimeout(() => { setBusy(false); setState("processed"); }, 1050);
  };

  return <article className="recovery-rise recovery-delay-2 rounded-2xl border border-[#d8d1c4] bg-[#f9f7f1] shadow-[0_20px_46px_rgba(38,47,46,.06)]">
    <header className="border-b border-[#e4ded3] px-5 pb-5 pt-5 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e5e7dd] text-[#4f7b69]"><Database className="h-5 w-5" /></div><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#4f7b69]">03 · Merchant activity</p><h2 className="mt-1 text-lg font-extrabold tracking-[-.04em]">Replay event projection</h2></div></div>
        <StatusPill tone={state === "processed" ? "success" : state === "replaying" ? "info" : "danger"}>{state === "processed" ? "Processed" : state === "replaying" ? "Replaying" : "Retry needed"}</StatusPill>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#647178]">The source event is intact. Replay rebuilds the activity projection without changing the underlying order or stock ledger.</p>
    </header>
    <div className="px-5 py-5 md:px-6">
      <div className="relative space-y-5 before:absolute before:left-[13px] before:top-4 before:h-[calc(100%-32px)] before:w-px before:bg-[#d8d1c4]">
        <div className="relative flex gap-3"><StepDot state="done" number={1} /><div className="flex-1"><p className="text-sm font-bold">Event written to ledger</p><p className="mt-1 text-xs text-[#647178]">order.payment.submitted · immutable source</p></div><CheckCircle2 className="mt-1 h-4 w-4 text-[#4f7b69]" /></div>
        <div className="relative flex gap-3"><StepDot state={state === "retry" ? "error" : state === "replaying" ? "active" : "done"} number={2} /><div className="flex-1"><p className="text-sm font-bold">Project into activity</p><p className="mt-1 text-xs text-[#647178]">{state === "retry" ? "Last attempt failed · notification projection" : state === "replaying" ? "Rebuilding notification projection…" : "Projection rebuilt successfully"}</p></div>{state === "retry" && <AlertCircle className="mt-1 h-4 w-4 text-[#a34f43]" />}</div>
        <div className="relative flex gap-3"><StepDot state={state === "processed" ? "done" : "waiting"} number={3} /><div className="flex-1"><p className="text-sm font-bold">Show merchant activity</p><p className="mt-1 text-xs text-[#89949a]">{state === "processed" ? "Notification is visible in activity" : "Waiting for projection to finish"}</p></div></div>
      </div>

      <div className="mt-5 rounded-xl border border-[#ddd6ca] bg-[#f3f0e8] p-3.5">
        <InfoRow label="Event type" value="order.payment.submitted" mono />
        <InfoRow label="Order" value="TS-10482" mono />
        <InfoRow label="Source" value="checkout" />
        <InfoRow label="Projection" value={state === "processed" ? "Processed · just now" : state === "replaying" ? "Replay in progress" : "Retry 2 of 5 · failed"} />
      </div>
      {state === "retry" && <div className="mt-4 rounded-xl border border-[#dfb1a8] bg-[#fff0ed] p-3.5" role="alert"><div className="flex gap-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#a34f43]" /><div><p className="text-sm font-extrabold text-[#803f37]">Activity projection needs a replay.</p><p className="mt-1 text-xs leading-5 text-[#91463c]">The payment event is recorded. Replay affects only the activity view; it does not replay money, stock, or the payment.</p></div></div></div>}
      {state === "processed" && <div className="mt-4 rounded-xl border border-[#afd0bf] bg-[#ecf6ef] p-3.5"><div className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#396b57]" /><div><p className="text-sm font-extrabold text-[#315b4a]">Projection is current.</p><p className="mt-1 text-xs leading-5 text-[#396b57]">The activity view now reflects the recorded event. No ledger operation was repeated.</p></div></div></div>}
      <div className="mt-5 flex flex-wrap gap-2.5">
        {state !== "processed" && <ActionButton onClick={replay} disabled={busy}><RotateCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Replaying projection…" : "Replay projection"}</ActionButton>}
        {state === "processed" && <ActionButton secondary onClick={() => setState("retry")}><RotateCcw className="h-4 w-4" />Return to retry state</ActionButton>}
      </div>
      <button type="button" onClick={() => setDetails(!details)} className="mt-5 inline-flex items-center gap-2 text-xs font-extrabold text-[#4f7b69] underline decoration-[#9abbab] underline-offset-4"><Chevron open={details} />Show event details</button>
      {details && <div className="mt-3 rounded-lg border border-[#e4ded3] bg-[#fbfaf6] p-3 text-[11px] leading-5 text-[#647178]"><p><span className="font-mono text-[#304049]">event id</span> · evt_01HF7A2K9PAY</p><p><span className="font-mono text-[#304049]">payload</span> · version 3 · actor customer</p><p><span className="font-mono text-[#304049]">safe boundary</span> · activity projection only</p></div>}
    </div>
  </article>;
}

export function GuidedRecovery() {
  const [activityOpen, setActivityOpen] = useState(true);
  return <main className="min-h-[100dvh] bg-[#f1eee6] px-4 py-5 text-[#17252b] sm:px-6 md:px-10 md:py-8">
    <div className="mx-auto max-w-[1420px]">
      <header className="recovery-rise flex flex-wrap items-end justify-between gap-6 border-b border-[#d8d1c4] pb-6">
        <div>
          <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#17252b] font-serif text-lg text-[#fffaf1]">T</span><span className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#647178]">TS Commerce Plattform</span></div>
          <div className="mt-7 flex items-start gap-4"><div className="mt-2 hidden h-10 w-1 rounded-full bg-[#b36e42] sm:block" /><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#9b5e38]">Recovery desk · 14 Jun 2024</p><h1 className="mt-2 max-w-3xl font-serif text-4xl leading-[.95] tracking-[-.04em] sm:text-5xl md:text-6xl">Let’s put the<br className="hidden sm:block" /> uncertain things in order.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#647178]">Three operations need a careful next step. Work from top to bottom; each action is scoped to the problem it can safely fix.</p></div></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[#d8d1c4] bg-[#f9f7f1] px-3.5 py-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#ecf6ef] text-[#396b57]"><ShieldCheck className="h-4 w-4" /></span><div><p className="text-xs font-extrabold">Control room ready</p><p className="mt-0.5 text-[10px] text-[#647178]">No automatic retries running</p></div></div>
      </header>

      <section className="recovery-rise recovery-delay-1 mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#d8d1c4] bg-[#f9f7f1] p-4"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#647178]">Open cases</span><span className="font-mono text-xl text-[#17252b]">03</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#e1dbd0]"><div className="h-full w-2/3 rounded-full bg-[#b36e42]" /></div><p className="mt-2 text-[11px] text-[#647178]">One case in each recovery lane</p></div>
        <div className="rounded-xl border border-[#d8d1c4] bg-[#f9f7f1] p-4"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#647178]">Money at risk</span><span className="font-mono text-xl text-[#17252b]">€184.00</span></div><p className="mt-3 text-[11px] leading-5 text-[#647178]">Unverified order TS-10482 remains unpaid</p></div>
        <div className="rounded-xl border border-[#d8d1c4] bg-[#f9f7f1] p-4"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#647178]">Guiding rule</span><LockKeyhole className="h-4 w-4 text-[#9b5e38]" /></div><p className="mt-3 text-[11px] leading-5 text-[#647178]">Fix the smallest safe boundary, then verify what changed.</p></div>
      </section>

      <section className="mt-9">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#9b5e38]">Ordered recovery</p><h2 className="mt-1 text-xl font-extrabold tracking-[-.04em]">Your next safe steps</h2></div><button type="button" onClick={() => setActivityOpen(!activityOpen)} className="inline-flex items-center gap-2 text-xs font-extrabold text-[#647178]">{activityOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{activityOpen ? "Hide supporting detail" : "Show supporting detail"}</button></div>
        <div className="grid gap-5 xl:grid-cols-3">
          <ProfileRecovery />
          <PaymentRecovery />
          {activityOpen ? <EventRecovery /> : <div className="rounded-2xl border border-dashed border-[#c9c0b0] bg-[#ebe7de] p-7 text-center"><ClipboardCheck className="mx-auto h-7 w-7 text-[#647178]" /><p className="mt-3 text-sm font-bold">Activity detail is tucked away</p><p className="mt-1 text-xs leading-5 text-[#647178]">Show supporting detail when you are ready to replay the projection.</p><button type="button" onClick={() => setActivityOpen(true)} className="mt-4 text-xs font-extrabold text-[#4f7b69] underline underline-offset-4">Show event case</button></div>}
        </div>
      </section>

      <footer className="recovery-rise recovery-delay-3 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#d8d1c4] pt-5 text-[10px] text-[#89949a]"><span className="inline-flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />Every action is local to its case</span><span className="font-mono">guided recovery / sandbox simulation</span></footer>
    </div>
  </main>;
}
