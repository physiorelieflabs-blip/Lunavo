import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Check,
  CircleAlert,
  Gauge,
  History,
  RotateCcw,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAiOverviewQueryKey,
  getGetAiSettingsQueryKey,
  getListAiActionsQueryKey,
  useApproveAiAction,
  useCreateAiAction,
  useExecuteAiAction,
  useGetAiOverview,
  useGetAiSettings,
  useListAiActions,
  useRejectAiAction,
  useRollbackAiAction,
  useTrainAiModel,
  useUpdateAiSettings,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  Notice,
  SectionHeading,
} from '@/components/primitives';

const inputClass =
  'mt-2 h-10 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm font-bold outline-none focus:border-[#bca26a]';

export default function AiControlRoom() {
  const overview = useGetAiOverview();
  const settings = useGetAiSettings();
  const actions = useListAiActions();
  const train = useTrainAiModel();
  const updateSettings = useUpdateAiSettings();
  const createAction = useCreateAiAction();
  const approve = useApproveAiAction();
  const reject = useRejectAiAction();
  const execute = useExecuteAiAction();
  const rollback = useRollbackAiAction();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [autonomyLevel, setAutonomyLevel] = useState<number | null>(null);
  const [trainingOptIn, setTrainingOptIn] = useState<boolean | null>(null);
  const [runMyBusiness, setRunMyBusiness] = useState<boolean | null>(null);

  if (overview.isLoading || settings.isLoading || actions.isLoading) {
    return <AppShell><LoadingState label="Loading AI control room" /></AppShell>;
  }
  if (overview.isError || settings.isError || actions.isError || !overview.data || !settings.data || !actions.data) {
    return <AppShell><ErrorState onRetry={() => { void overview.refetch(); void settings.refetch(); void actions.refetch(); }} /></AppShell>;
  }

  const data = overview.data;
  const currentSettings = settings.data;
  const level = autonomyLevel ?? currentSettings.autonomyLevel;
  const optIn = trainingOptIn ?? currentSettings.trainingOptIn;
  const runBusiness = runMyBusiness ?? currentSettings.runMyBusiness;
  const refresh = () => void Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetAiOverviewQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetAiSettingsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListAiActionsQueryKey() }),
  ]);
  const act = (
    operation: { mutate: (input: { id: number }, options: { onSuccess: () => void; onError: () => void }) => void },
    id: number,
    success: string,
  ) => {
    operation.mutate({ id }, { onSuccess: () => { setMessage(success); refresh(); }, onError: () => setMessage('That AI action is no longer in a valid state. Refresh and try again.') });
  };
  const saveSettings = () => {
    setMessage('');
    updateSettings.mutate({
      data: { autonomyLevel: level, trainingOptIn: optIn, runMyBusiness: runBusiness },
    }, {
      onSuccess: () => { setMessage('AI operating settings saved. Approval safeguards remain active.'); refresh(); },
      onError: () => setMessage('Settings were not saved. RUN MY BUSINESS requires level 4 and local training consent.'),
    });
  };
  const trainModel = () => {
    setMessage('');
    train.mutate(undefined, {
      onSuccess: (model) => { setMessage(model.status === 'trained' ? `Model trained on ${model.trainingExamples} persisted examples.` : 'The model needs more persisted commerce data before it can train.'); refresh(); },
      onError: () => setMessage('Training could not start. Check local training consent and try again.'),
    });
  };
  const sendRecommendation = (recommendation: typeof data.recommendations[number]) => {
    createAction.mutate({
      data: {
        agent: recommendation.agent,
        actionType: recommendation.id === 'review-pending-orders' ? 'fulfillment_review' : 'catalog_review',
        title: recommendation.title,
        reason: recommendation.reason,
        risk: recommendation.risk as 'low' | 'medium' | 'high',
        reversible: recommendation.reversible,
      },
    }, {
      onSuccess: () => { setMessage('Recommendation sent to the approval center.'); refresh(); },
      onError: () => setMessage('The recommendation could not be sent for approval.'),
    });
  };
  const errorMessage = message.includes('not') || message.includes('could') || message.includes('requires');

  return <AppShell>
    <div className="mx-auto max-w-[1320px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">First-party intelligence</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Your business, with evidence.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">A local signals model reads this workspace’s persisted orders, customers, catalog, and payouts. It does not invent results or move money.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={data.model.status === 'trained' ? 'success' : 'warning'}>{data.model.status.replaceAll('_', ' ')}</Badge>
          <Button onClick={trainModel} disabled={train.isPending || !optIn}><BrainCircuit className="h-4 w-4" />{train.isPending ? 'Training…' : 'Train locally'}</Button>
        </div>
      </div>

      {message && <div className="mt-7"><Notice tone={errorMessage ? 'danger' : 'success'} title={errorMessage ? 'Action not completed' : 'AI workspace updated'}>{message}</Notice></div>}

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-xl border border-[#182333] bg-[#182333] p-6 text-[#f8f3e8] md:p-7">
          <div className="flex items-start justify-between gap-5">
            <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">Business health</p><p className="mt-4 font-mono text-6xl tracking-[-.1em]" data-testid="value-ai-health">{data.healthScore}<span className="ml-1 text-2xl text-[#8997a8]">/100</span></p><p className="mt-3 max-w-lg text-sm leading-6 text-[#aab6c2]">{data.brief}</p></div>
            <Gauge className="h-6 w-6 text-[#d6aa46]" />
          </div>
          <div className="mt-7 h-2 overflow-hidden rounded-full bg-[#46566a]"><div className="h-full rounded-full bg-[#d6aa46] transition-all" style={{ width: `${data.healthScore}%` }} /></div>
          <p className="mt-3 text-xs text-[#8997a8]">Signals are scoped to your current settlement currency and recorded activity.</p>
        </div>
        <div className="rounded-xl border border-[#bca26a] bg-[#f7edd2] p-6">
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#85601b]">Model status</p>
          <h2 className="mt-2 text-xl font-extrabold">Local commerce signals</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><p className="text-[#765817]">Version</p><p className="mt-1 font-mono font-bold">{data.model.version}</p></div><div><p className="text-[#765817]">Examples</p><p className="mt-1 font-mono font-bold">{data.model.trainingExamples}</p></div><div><p className="text-[#765817]">Evaluation</p><p className="mt-1 font-mono font-bold">{data.model.evaluationScore === null ? 'Not evaluated' : `${Math.round(data.model.evaluationScore * 100)}%`}</p></div><div><p className="text-[#765817]">Autonomy</p><p className="mt-1 font-mono font-bold">Level {level}</p></div></div>
          <p className="mt-5 border-t border-[#dfc27a] pt-4 text-xs leading-5 text-[#765817]">This is a forecasting and signal layer, not a generative assistant. Training requires consent and real workspace data.</p>
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.metrics.map((metric) => <MetricCard key={metric.key} label={metric.label} value={metric.key === 'revenue' || metric.key === 'average_order' ? metric.value.toFixed(2) : `${metric.value}${metric.key === 'revenue_change' || metric.key === 'repeat_customer_rate' ? '%' : ''}`} detail={metric.detail} icon={<Activity className="h-5 w-5" />} accent={metric.key === 'revenue'} />)}</div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section><SectionHeading eyebrow="Specialized agents" title="What is being watched" description="Each card reports from the same tenant-scoped evidence set." /><div className="grid gap-3 sm:grid-cols-2">{data.agents.map((agent) => <div key={agent.key} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start justify-between gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8e0cd] text-[#85601b]"><Target className="h-4 w-4" /></div><Badge tone={agent.status === 'waiting_for_data' ? 'warning' : 'info'}>{agent.status.replaceAll('_', ' ')}</Badge></div><h3 className="mt-4 font-extrabold">{agent.name}</h3><p className="mt-1 text-xs text-[#697687]">{agent.focus}</p><p className="mt-4 text-sm leading-5 text-[#536174]">{agent.insight}</p></div>)}</div></section>
        <section><SectionHeading eyebrow="Predictions and signals" title="What needs your attention" />{data.signals.length ? <div className="space-y-3">{data.signals.map((signal) => <div key={signal.title} className="flex gap-3 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" /><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{signal.title}</h3><Badge tone={signal.severity === 'warning' || signal.severity === 'attention' ? 'warning' : 'info'}>{signal.agent}</Badge></div><p className="mt-1 text-xs leading-5 text-[#697687]">{signal.detail}</p></div></div>)}</div> : <EmptyState title="No active signals" description="The local agents found no supported issue in the current data." />}</section>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section><SectionHeading eyebrow="Recommendations" title="Suggested next steps" description="Nothing is executed automatically from this list." />{data.recommendations.length ? <div className="space-y-3">{data.recommendations.map((recommendation) => <div key={recommendation.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{recommendation.title}</h3><Badge tone={recommendation.risk === 'medium' ? 'warning' : 'success'}>{recommendation.risk} risk</Badge></div><p className="mt-1 text-sm text-[#536174]">{recommendation.detail}</p><p className="mt-2 text-xs text-[#697687]">{recommendation.reason}</p><Button variant="secondary" className="mt-3 min-h-8 px-3 text-xs" onClick={() => sendRecommendation(recommendation)} disabled={createAction.isPending}><ArrowRight className="h-3.5 w-3.5" />Send to approval center</Button></div></div></div>)}</div> : <EmptyState title="No recommendations yet" description="More persisted activity will give the local model more evidence to work with." />}</section>
        <section><SectionHeading eyebrow="Approval center" title={`${data.awaitingApproval} awaiting review`} description="Approval, execution, and rollback are separate audited steps." />{actions.data.length ? <div className="space-y-3">{actions.data.slice(0, 6).map((action) => <div key={action.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">{action.title}</p><p className="mt-1 text-xs text-[#697687]">{action.agent} · {action.actionType.replaceAll('_', ' ')}</p></div><Badge tone={action.status === 'awaiting_approval' ? 'warning' : action.status === 'rolled_back' ? 'neutral' : action.status === 'executed' ? 'success' : 'info'}>{action.status.replaceAll('_', ' ')}</Badge></div><p className="mt-3 text-xs leading-5 text-[#536174]">{action.reason}</p><div className="mt-3 flex flex-wrap gap-2">{action.status === 'awaiting_approval' && <><Button className="min-h-8 px-3 text-xs" onClick={() => act(approve, action.id, 'AI action approved. Execute it only when you are ready.') }><Check className="h-3.5 w-3.5" />Approve</Button><Button variant="danger" className="min-h-8 px-3 text-xs" onClick={() => act(reject, action.id, 'AI action rejected.')}><X className="h-3.5 w-3.5" />Reject</Button></>}{action.status === 'approved' && <Button className="min-h-8 px-3 text-xs" onClick={() => act(execute, action.id, 'AI action prepared safely. No external side effect was performed.')}><Sparkles className="h-3.5 w-3.5" />Execute safe preparation</Button>}{action.status === 'executed' && action.rollbackAvailable && <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => act(rollback, action.id, 'AI action rolled back with a compensating record.')}><RotateCcw className="h-3.5 w-3.5" />Rollback</Button>}</div></div>)}</div> : <EmptyState title="Nothing awaiting approval" description="Recommendations you send for review will appear here with their audit state." />}</section>
      </div>

      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="Operating policy" title="Autonomy with guardrails" description="RUN MY BUSINESS can prepare reversible local work, but approval remains required. No AI setting can change permissions, payout destinations, ledgers, or external settlement." /><div className="grid gap-5 md:grid-cols-3"><label className="block text-sm font-bold">Autonomy level<select className={inputClass} value={level} onChange={(event) => setAutonomyLevel(Number(event.target.value))}><option value={0}>0 · Observe only</option><option value={1}>1 · Recommend</option><option value={2}>2 · Prepare drafts</option><option value={3}>3 · Prepare workflows</option><option value={4}>4 · RUN MY BUSINESS (approval required)</option></select></label><label className="flex items-center gap-3 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-4 py-3 text-sm font-bold"><input type="checkbox" checked={optIn} onChange={(event) => setTrainingOptIn(event.target.checked)} />Allow local training on workspace data</label><label className="flex items-center gap-3 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-4 py-3 text-sm font-bold"><input type="checkbox" checked={runBusiness} onChange={(event) => setRunMyBusiness(event.target.checked)} />Enable RUN MY BUSINESS</label></div><Button className="mt-5" onClick={saveSettings} disabled={updateSettings.isPending}><Check className="h-4 w-4" />{updateSettings.isPending ? 'Saving…' : 'Save operating policy'}</Button></section>

      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-5"><div className="flex items-center gap-3"><History className="h-5 w-5 text-[#a2772e]" /><div><p className="text-sm font-extrabold">Audited action history</p><p className="mt-1 text-xs text-[#697687]">{actions.data.length} action record{actions.data.length === 1 ? '' : 's'} retained for this merchant.</p></div></div><p className="text-xs text-[#697687]">Use the approval center for every state transition.</p></section>
    </div>
  </AppShell>;
}