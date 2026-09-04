import "./_group.css";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileWarning,
  Filter,
  History,
  LockKeyhole,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  X,
  Zap,
} from "lucide-react";

type IssueKind = "account" | "payment" | "activity";
type IssueState =
  | "partial"
  | "retrying"
  | "resolved"
  | "missing"
  | "failed"
  | "reopened"
  | "retry"
  | "replaying"
  | "processed"
  | "dead_letter";

type Issue = {
  id: IssueKind;
  kind: IssueKind;
  state: IssueState;
  title: string;
  subtitle: string;
  owner: string;
  ownerInitials: string;
  urgency: "High" | "Medium" | "Low";
  lastSeen: string;
  record: string;
  detail: string;
  actionLabel: string;
};

const initialIssues: Issue[] = [
  {
    id: "account",
    kind: "account",
    state: "partial",
    title: "Account details saved partially",
    subtitle: "The name was updated; the username was not.",
    owner: "Merchant settings",
    ownerInitials: "MS",
    urgency: "Medium",
    lastSeen: "2 min ago",
    record: "Mara Voss · @maravoss",
    detail:
      "The profile update reached the account service, but the username change was rejected by the workspace policy. No existing username was overwritten.",
    actionLabel: "Retry username",
  },
  {
    id: "payment",
    kind: "payment",
    state: "missing",
    title: "Payment return needs verification",
    subtitle: "The public return arrived without a secure token.",
    owner: "Checkout",
    ownerInitials: "CO",
    urgency: "High",
    lastSeen: "8 min ago",
    record: "Order TS-10482 · $184.00 USD",
    detail:
      "Payment status cannot be confirmed from this return. Treat the order as unverified; no paid claim has been recorded.",
    actionLabel: "Retry verification",
  },
  {
    id: "activity",
    kind: "activity",
    state: "retry",
    title: "Activity projection needs replay",
    subtitle: "The ledger event is authoritative; its alert is stale.",
    owner: "Event projection",
    ownerInitials: "EP",
    urgency: "Low",
    lastSeen: "21 min ago",
    record: "inventory.adjusted · SKU TS-LAMP-04",
    detail:
      "The source event was accepted once. Only the merchant-facing activity projection needs to be replayed; no stock movement will be applied again.",
    actionLabel: "Replay projection",
  },
];

const stateLabel: Record<IssueState, string> = {
  partial: "Partially saved",
  retrying: "Retrying",
  resolved: "Resolved",
  missing: "Token missing",
  failed: "Verification failed",
  reopened: "Session reopened",
  retry: "Replay available",
  replaying: "Replaying",
  processed: "Projection current",
  dead_letter: "Dead letter",
};

const stateTone: Record<IssueState, "amber" | "red" | "teal" | "slate"> = {
  partial: "amber",
  retrying: "amber",
  resolved: "teal",
  missing: "red",
  failed: "red",
  reopened: "amber",
  retry: "amber",
  replaying: "amber",
  processed: "teal",
  dead_letter: "red",
};

const stateOptions: Record<IssueKind, { value: IssueState; label: string }[]> = {
  account: [
    { value: "partial", label: "Partially saved" },
    { value: "resolved", label: "Saved completely" },
  ],
  payment: [
    { value: "missing", label: "Token missing" },
    { value: "failed", label: "Verification failed" },
    { value: "reopened", label: "Session reopened" },
  ],
  activity: [
    { value: "retry", label: "Replay available" },
    { value: "dead_letter", label: "Dead letter" },
    { value: "processed", label: "Projection current" },
  ],
};

export function ActionHub() {
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [expandedId, setExpandedId] = useState<IssueKind | null>("payment");
  const [dismissed, setDismissed] = useState<IssueKind[]>([]);
  const [busyId, setBusyId] = useState<IssueKind | null>(null);
  const [filter, setFilter] = useState<"all" | "urgent" | "mine">("all");
  const [toast, setToast] = useState("");

  const visibleIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (dismissed.includes(issue.id)) return false;
        if (filter === "urgent") return issue.urgency === "High";
        if (filter === "mine") return issue.owner === "Merchant settings";
        return true;
      }),
    [dismissed, filter, issues],
  );

  const openCount = issues.filter(
    (issue) => issue.state !== "resolved" && issue.state !== "processed",
  ).length;
  const resolvedCount = issues.filter(
    (issue) => issue.state === "resolved" || issue.state === "processed",
  ).length;

  const setIssueState = (id: IssueKind, state: IssueState) => {
    setIssues((current) =>
      current.map((issue) => (issue.id === id ? { ...issue, state } : issue)),
    );
    setToast(
      id === "payment" && state === "reopened"
        ? "Payment session reopened. Verification is still required."
        : "Simulation state updated locally.",
    );
  };

  const runPrimaryAction = (issue: Issue) => {
    if (busyId) return;
    setBusyId(issue.id);
    setToast("");

    const nextState: IssueState =
      issue.id === "account"
        ? "resolved"
        : issue.id === "payment"
          ? issue.state === "reopened"
            ? "failed"
            : "failed"
          : "processed";

    window.setTimeout(() => {
      setIssues((current) =>
        current.map((item) =>
          item.id === issue.id ? { ...item, state: nextState } : item,
        ),
      );
      setBusyId(null);
      setToast(
        issue.id === "account"
          ? "Username retry completed. Account details are now consistent."
          : issue.id === "payment"
            ? "Verification still could not be confirmed. The order remains unverified."
            : "Projection replay completed. The source event was not re-applied.",
      );
    }, 650);
  };

  const reopenPaymentSession = () => {
    setIssues((current) =>
      current.map((issue) =>
        issue.id === "payment" ? { ...issue, state: "reopened" } : issue,
      ),
    );
    setToast(
      "A fresh payment session is ready. This does not confirm the previous payment.",
    );
  };

  const resetDesk = () => {
    setIssues(initialIssues);
    setDismissed([]);
    setToast("Simulation reset to the three original recovery cases.");
    setExpandedId("payment");
  };

  return (
    <main className="min-h-[100dvh] bg-[#f1eee6] text-[#1d2b2a] [font-family:ui-sans-serif,system-ui,sans-serif]">
      <style>{`
        @keyframes ah-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ah-pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
        .ah-rise { animation: ah-rise .45s ease both; }
        .ah-delay-1 { animation-delay: 70ms; }
        .ah-delay-2 { animation-delay: 140ms; }
        .ah-delay-3 { animation-delay: 210ms; }
        .ah-pulse { animation: ah-pulse 1.4s ease-in-out infinite; }
        select { appearance: none; }
      `}</style>
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-9 lg:py-7">
        <header className="ah-rise flex flex-col gap-5 border-b border-[#d8d4c9] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[#173f3b] text-[#f6f1e7] shadow-[0_5px_0_#c8bca7]">
              <Zap className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8b6b35]">
                  TS Commerce Plattform
                </p>
                <span className="rounded-full border border-[#c8d8ce] bg-[#e8f1eb] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-[#276451]">
                  Operations desk
                </span>
              </div>
              <h1 className="mt-2 text-[clamp(1.7rem,4vw,2.65rem)] font-extrabold leading-[1.03] tracking-[-.055em]">
                Action Hub
              </h1>
              <p className="mt-2 max-w-[590px] text-[13px] leading-5 text-[#68736f]">
                One place to see what needs attention, who owns it, and the safest next move.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#d8d4c9] bg-[#f8f5ed] px-3 py-2 text-xs text-[#64706d]">
              <CircleDashed className="h-3.5 w-3.5 text-[#b27a26]" />
              <span>Last checked</span>
              <strong className="font-mono text-[#1d2b2a]">09:42:18 UTC</strong>
            </div>
            <button
              type="button"
              onClick={resetDesk}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#c9c4b8] bg-[#f8f5ed] px-3 text-xs font-bold text-[#344542] transition hover:border-[#8b6b35] hover:bg-[#fffaf0]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset simulation
            </button>
          </div>
        </header>

        <section className="ah-rise ah-delay-1 mt-6 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Open cases"
            value={String(openCount).padStart(2, "0")}
            detail="Across 3 workstreams"
            icon={<ShieldAlert className="h-4 w-4" />}
            tone="red"
          />
          <Metric
            label="Needs action now"
            value={String(issues.filter((issue) => issue.urgency === "High" && issue.state !== "resolved").length).padStart(2, "0")}
            detail="High urgency, merchant-visible"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="amber"
          />
          <Metric
            label="Resolved in session"
            value={String(resolvedCount).padStart(2, "0")}
            detail="Safe local simulation only"
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="teal"
          />
        </section>

        <section className="ah-rise ah-delay-2 mt-7 rounded-[14px] border border-[#d8d4c9] bg-[#f8f5ed] shadow-[0_12px_30px_rgba(57,59,50,.055)]">
          <div className="flex flex-col gap-4 border-b border-[#e0dcd2] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-extrabold tracking-[-.02em]">Recovery queue</h2>
                <span className="rounded-full bg-[#e9e3d6] px-2 py-0.5 font-mono text-[10px] font-bold text-[#746951]">
                  {visibleIssues.length} visible
                </span>
              </div>
              <p className="mt-1 text-xs text-[#7b827d]">
                Triage the exception, then leave a clear record of what happened.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[#d8d4c9] bg-[#f1eee6] p-1">
                <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                  All
                </FilterButton>
                <FilterButton active={filter === "urgent"} onClick={() => setFilter("urgent")}>
                  Urgent
                </FilterButton>
                <FilterButton active={filter === "mine"} onClick={() => setFilter("mine")}>
                  Mine
                </FilterButton>
              </div>
              <button
                type="button"
                onClick={() => setToast("Queue is already current. No server connection was used.")}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#d8d4c9] bg-[#f1eee6] text-[#65726e] transition hover:border-[#8b6b35] hover:text-[#8b6b35]"
                aria-label="Refresh queue simulation"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#e2ded5]">
            {visibleIssues.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-[#2f765e]" />
                <h3 className="mt-3 text-base font-extrabold">Nothing in this view</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#7a847e]">
                  Try another filter or reset the simulation to inspect each recovery path again.
                </p>
                <button
                  type="button"
                  onClick={resetDesk}
                  className="mt-4 text-xs font-bold text-[#86662e] underline underline-offset-4"
                >
                  Restore original cases
                </button>
              </div>
            ) : (
              visibleIssues.map((issue, index) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  expanded={expandedId === issue.id}
                  busy={busyId === issue.id}
                  index={index}
                  onToggle={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                  onPrimary={() => runPrimaryAction(issue)}
                  onReopen={issue.id === "payment" ? reopenPaymentSession : undefined}
                  onStateChange={(state) => setIssueState(issue.id, state)}
                  onDismiss={() => {
                    setDismissed((current) => [...current, issue.id]);
                    setToast(`${issue.title} dismissed from this queue.`);
                  }}
                />
              ))
            )}
          </div>
        </section>

        {toast && (
          <div className="ah-rise mt-4 flex items-start gap-3 rounded-lg border border-[#bed3c5] bg-[#e9f3ec] px-4 py-3 text-xs text-[#285d4d]" role="status">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1 leading-5">{toast}</span>
            <button type="button" onClick={() => setToast("")} aria-label="Dismiss message" className="text-[#57816f] hover:text-[#1f513f]">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <footer className="mt-5 flex flex-col gap-2 pb-4 text-[10px] leading-4 text-[#8a8e87] sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" /> Safe simulation · no payment, ledger, or account data was changed.</p>
          <p className="font-mono tracking-[.05em]">ACTION HUB / RECOVERY-03</p>
        </footer>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "red" | "amber" | "teal";
}) {
  const tones = {
    red: "border-[#e2c9c2] bg-[#fbefea] text-[#a44d40]",
    amber: "border-[#e0d2af] bg-[#fbf4df] text-[#96702e]",
    teal: "border-[#c5d9cc] bg-[#ecf4ed] text-[#387361]",
  };
  return (
    <div className={`rounded-[12px] border px-4 py-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.11em]">{icon}{label}</span>
        <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <strong className="font-mono text-2xl font-bold tracking-[-.07em]">{value}</strong>
        <span className="mb-1 text-[10px] opacity-75">{detail}</span>
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition ${active ? "bg-[#173f3b] text-[#f7f1e6] shadow-sm" : "text-[#707873] hover:text-[#1d2b2a]"}`}>
      {children}
    </button>
  );
}

function IssueRow({
  issue,
  expanded,
  busy,
  index,
  onToggle,
  onPrimary,
  onReopen,
  onStateChange,
  onDismiss,
}: {
  issue: Issue;
  expanded: boolean;
  busy: boolean;
  index: number;
  onToggle: () => void;
  onPrimary: () => void;
  onReopen?: () => void;
  onStateChange: (state: IssueState) => void;
  onDismiss: () => void;
}) {
  const tone = stateTone[issue.state];
  const isResolved = issue.state === "resolved" || issue.state === "processed";
  const icon = issue.kind === "account" ? <UserRound className="h-4 w-4" /> : issue.kind === "payment" ? <FileWarning className="h-4 w-4" /> : <History className="h-4 w-4" />;
  const toneClasses = {
    amber: "border-[#ddc994] bg-[#fbf4df] text-[#8b692b]",
    red: "border-[#e2c3bc] bg-[#fbefea] text-[#a1493e]",
    teal: "border-[#bed6c6] bg-[#e9f3eb] text-[#2f705b]",
    slate: "border-[#d6d8d0] bg-[#eff0eb] text-[#66706b]",
  };

  return (
    <article className={`ah-rise ah-delay-${Math.min(index + 1, 3)} ${isResolved ? "bg-[#f5f4ee]" : "bg-[#f8f5ed]"}`}>
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${toneClasses[tone]}`}>{icon}</span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[14px] font-extrabold tracking-[-.018em]">{issue.title}</span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.08em] ${toneClasses[tone]}`}>
                {busy && <span className="ah-pulse"><CircleDashed className="h-2.5 w-2.5" /></span>}
                {stateLabel[issue.state]}
              </span>
            </span>
            <span className="mt-1 block text-xs text-[#737d78]">{issue.subtitle}</span>
          </span>
        </button>

        <div className="grid grid-cols-2 gap-x-5 gap-y-2 pl-12 text-[11px] sm:grid-cols-3 sm:pl-12 lg:w-[390px] lg:shrink-0 lg:pl-0">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9a9b93]">Owner</p>
            <p className="mt-1 flex items-center gap-1.5 font-bold text-[#52605b]"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#dce5dd] font-mono text-[8px] text-[#31584b]">{issue.ownerInitials}</span>{issue.owner}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9a9b93]">Urgency</p>
            <p className={`mt-1 font-bold ${issue.urgency === "High" ? "text-[#aa5043]" : issue.urgency === "Medium" ? "text-[#956f2e]" : "text-[#65726d]"}`}>{issue.urgency}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9a9b93]">Last seen</p>
            <p className="mt-1 flex items-center gap-1 font-bold text-[#52605b]"><Clock3 className="h-3 w-3" />{issue.lastSeen}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-12 lg:pl-0">
          {!isResolved ? (
            <button type="button" onClick={onPrimary} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#173f3b] px-3 text-xs font-extrabold text-[#f8f1e5] transition hover:bg-[#285951] disabled:cursor-wait disabled:opacity-70">
              {busy ? <CircleDashed className="ah-pulse h-3.5 w-3.5" /> : issue.id === "activity" ? <RotateCcw className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {busy ? "Working…" : issue.actionLabel}
            </button>
          ) : (
            <button type="button" onClick={onDismiss} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#c7d6cb] bg-[#eef5ef] px-3 text-xs font-bold text-[#34705b] transition hover:border-[#8aa995]">
              <Check className="h-3.5 w-3.5" /> Dismiss
            </button>
          )}
          <button type="button" onClick={onToggle} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d8d4c9] text-[#727b75] transition hover:border-[#9a8a68] hover:text-[#72582b]" aria-label={expanded ? "Collapse details" : "Open details"}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#e3ded4] bg-[#f2efe7] px-4 py-4 sm:px-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
            <div className="pl-0 sm:pl-12">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.15em] text-[#9a8a68]">What happened</p>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-[#5e6a65]">{issue.detail}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#d8d4c9] bg-[#f8f5ed] px-2 py-1 font-mono text-[10px] text-[#68736d]"><ExternalLink className="h-3 w-3" />{issue.record}</span>
                {issue.id === "payment" && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#e4c6be] bg-[#fbefea] px-2 py-1 font-mono text-[10px] text-[#a1493e]"><AlertTriangle className="h-3 w-3" />Never mark as paid from this screen</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-[#dad6cc] bg-[#f8f5ed] p-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${issue.id}-state`} className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#4d5d57]"><SlidersHorizontal className="h-3.5 w-3.5 text-[#997634]" /> Simulated state</label>
                <MoreHorizontal className="h-4 w-4 text-[#a7a59d]" />
              </div>
              <div className="relative mt-2">
                <select id={`${issue.id}-state`} value={issue.state} onChange={(event) => onStateChange(event.target.value as IssueState)} className="h-9 w-full rounded-md border border-[#d4d0c5] bg-[#f1eee6] px-2.5 pr-8 text-xs font-bold text-[#485650] outline-none focus:border-[#a17a36]">
                  {stateOptions[issue.kind].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5 text-[#7e827a]" />
              </div>
              <p className="mt-2 text-[10px] leading-4 text-[#89908a]">Local only. Use this to compare the recovery language before connecting a real workflow.</p>
              {issue.id === "payment" && (
                <button type="button" onClick={onReopen} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#8a672c] underline decoration-[#c9b27f] underline-offset-4">
                  <ExternalLink className="h-3 w-3" /> Reopen payment session
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}