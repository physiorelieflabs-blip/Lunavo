import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Check,
  CircleAlert,
  Gauge,
  History,
  Megaphone,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
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
  useResearchWeb,
  useSimulateAiScenario,
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
  const research = useResearchWeb();
  const simulate = useSimulateAiScenario();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [autonomyLevel, setAutonomyLevel] = useState<number | null>(null);
  const [trainingOptIn, setTrainingOptIn] = useState<boolean | null>(null);
  const [runMyBusiness, setRunMyBusiness] = useState<boolean | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [goalTarget, setGoalTarget] = useState<number | null | undefined>(undefined);
  const [researchQuery, setResearchQuery] = useState('');
  const [researchResult, setResearchResult] = useState<Awaited<ReturnType<typeof research.mutateAsync>> | null>(null);
  const [adBrief, setAdBrief] = useState('');
  const [productBrief, setProductBrief] = useState('');
  const [scenario, setScenario] = useState<'price_change' | 'discount_change' | 'new_product' | 'new_branch' | 'hiring' | 'supplier_change' | 'marketing_campaign' | 'inventory_change'>('price_change');
  const [scenarioValue, setScenarioValue] = useState('10');
  const [simulation, setSimulation] = useState<Awaited<ReturnType<typeof simulate.mutateAsync>> | null>(null);

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
  const businessGoal = goal ?? currentSettings.goal ?? '';
  const target = goalTarget === undefined ? currentSettings.goalTarget : goalTarget;
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
      data: {
        autonomyLevel: level,
        trainingOptIn: optIn,
        runMyBusiness: runBusiness,
        goal: businessGoal.trim() || null,
        goalTarget: target === null || target === undefined || Number.isNaN(target) ? null : target,
      },
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
  const runResearch = () => {
    setMessage('');
    setResearchResult(null);
    research.mutate({ data: { query: researchQuery } }, {
      onSuccess: (result) => { setResearchResult(result); setMessage('Research completed with source attribution.'); },
      onError: () => setMessage('Research could not be completed. Try a more specific query.'),
    });
  };
  const prepareAd = () => {
    setMessage('');
    createAction.mutate({
      data: {
        agent: 'Marketing assistant',
        actionType: 'ad_draft',
        title: `Prepare ad concepts${adBrief.trim() ? `: ${adBrief.trim().slice(0, 120)}` : ''}`,
        reason: adBrief.trim() || 'Use persisted catalog products to prepare reviewable ad copy variants.',
        risk: 'low',
        reversible: true,
      },
    }, {
      onSuccess: () => { setAdBrief(''); setMessage('Ad concepts are waiting in the approval center. Nothing was published.'); refresh(); },
      onError: () => setMessage('The ad assistant could not prepare a draft.'),
    });
  };
  const prepareProductDraft = () => {
    setMessage('');
    if (productBrief.trim().length < 3) {
      setMessage('Add a short product brief before preparing a draft.');
      return;
    }
    createAction.mutate({
      data: {
        agent: 'AI Product Creator',
        actionType: 'product_draft',
        title: 'Product draft: reviewable catalog copy',
        reason: `Create a reviewable product draft from merchant brief: ${productBrief.trim()}`,
        risk: 'low',
        reversible: true,
      },
    }, {
      onSuccess: () => { setProductBrief(''); setMessage('Product draft request created. Approve and execute it to generate the reviewable copy.'); refresh(); },
      onError: () => setMessage('The product creator could not prepare a draft.'),
    });
  };
  const runSimulation = () => {
    setMessage('');
    simulate.mutate({ data: { scenario, value: Number(scenarioValue) } }, {
      onSuccess: (result) => { setSimulation(result); setMessage('Scenario estimate updated. Review the assumptions before making a decision.'); },
      onError: () => setMessage('The scenario could not be simulated. Enter a valid numeric value.'),
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

       <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
         <div className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
           <SectionHeading eyebrow="Prediction center" title="What the evidence suggests" description="Every value is labeled as an estimate or observed signal. No forecast is a promise." />
           <div className="mt-5 grid gap-3 sm:grid-cols-3">{data.predictions.map((prediction) => <div key={prediction.key} className="rounded-lg border border-[#ded8cd] bg-[#f7f4ed] p-4"><p className="text-xs font-bold text-[#697687]">{prediction.label}</p><p className="mt-2 font-mono text-2xl font-extrabold">{prediction.value.toLocaleString()} <span className="text-sm text-[#697687]">{prediction.unit}</span></p><p className="mt-2 text-[11px] leading-5 text-[#697687]">{prediction.detail}</p><p className="mt-3 font-mono text-[10px] uppercase tracking-[.1em] text-[#a2772e]">{prediction.estimate ? 'Estimate' : 'Observed'} · {prediction.confidence === null ? 'confidence unavailable' : `${Math.round(prediction.confidence * 100)}% model confidence`}</p></div>)}</div>
         </div>
         <div className="rounded-xl border border-[#344454] bg-[#1f2b38] p-6 text-[#f8f3e8]">
           <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">Autonomy score</p><p className="mt-3 font-mono text-5xl tracking-[-.08em]">{data.autonomyScore}%</p></div><Gauge className="h-6 w-6 text-[#d6aa46]" /></div>
           <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#46566a]"><div className="h-full rounded-full bg-[#d6aa46]" style={{ width: `${data.autonomyScore}%` }} /></div>
           <p className="mt-3 text-xs leading-5 text-[#aab6c2]">Eligible workflow coverage based on your selected autonomy level. Approval remains required for restricted actions.</p>
           <div className="mt-5 border-t border-[#46566a] pt-4"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#8997a8]">Morning brief</p><p className="mt-2 text-sm leading-6 text-[#f8f3e8]">{data.briefs.morning}</p></div>
         </div>
       </section>

       <section className="mt-8 grid gap-8 lg:grid-cols-2">
         <div><SectionHeading eyebrow="Revenue opportunity map" title="Where to focus next" description="Prioritized from tenant-scoped orders, customers, catalog availability, and fulfillment records." />{data.opportunities.length ? <div className="space-y-3">{data.opportunities.map((opportunity) => <div key={`${opportunity.category}-${opportunity.title}`} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start gap-3"><Target className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{opportunity.title}</h3><Badge tone={opportunity.priority === 'high' ? 'warning' : 'info'}>{opportunity.priority}</Badge></div><p className="mt-1 text-xs leading-5 text-[#697687]">{opportunity.detail}</p>{opportunity.href && <Link href={opportunity.href} className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[#8a6826] underline">Review workflow <ArrowRight className="h-3 w-3" /></Link>}</div></div></div>)}</div> : <EmptyState title="No supported opportunities yet" description="The map will populate as real orders, customers, catalog items, or supplier-linked fulfillment records arrive." />}</div>
         <div><SectionHeading eyebrow="Savings engine" title="Avoidable exposure" description="The engine names evidence-backed risks without inventing costs or claiming savings that are not recorded." />{data.savings.length ? <div className="space-y-3">{data.savings.map((saving) => <div key={`${saving.category}-${saving.title}`} className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold text-[#765817]">{saving.title}</h3><Badge tone={saving.priority === 'high' ? 'warning' : 'neutral'}>{saving.priority}</Badge></div><p className="mt-1 text-xs leading-5 text-[#765817]">{saving.detail}</p>{saving.href && <Link href={saving.href} className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[#85601b] underline">Inspect source <ArrowRight className="h-3 w-3" /></Link>}</div></div></div>)}</div> : <EmptyState title="No avoidable exposure detected" description="This does not mean costs are zero; it means the current workspace has no supported savings signal." />}</div>
       </section>

       <section className="mt-8 rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-6">
         <SectionHeading eyebrow="Operating cadence" title="Weekly and monthly board notes" description="Generated from the same first-party evidence set as the daily brief." />
         <div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-lg border border-[#bfd6dc] bg-white/70 p-4"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#315e6c]">Weekly board meeting</p><p className="mt-2 text-sm leading-6 text-[#315e6c]">{data.briefs.weekly}</p></div><div className="rounded-lg border border-[#bfd6dc] bg-white/70 p-4"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#315e6c]">Monthly strategy</p><p className="mt-2 text-sm leading-6 text-[#315e6c]">{data.briefs.monthly}</p></div></div>
       </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section><SectionHeading eyebrow="Specialized agents" title="What is being watched" description="Each card reports from the same tenant-scoped evidence set." /><div className="grid gap-3 sm:grid-cols-2">{data.agents.map((agent) => <div key={agent.key} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start justify-between gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8e0cd] text-[#85601b]"><Target className="h-4 w-4" /></div><Badge tone={agent.status === 'waiting_for_data' ? 'warning' : 'info'}>{agent.status.replaceAll('_', ' ')}</Badge></div><h3 className="mt-4 font-extrabold">{agent.name}</h3><p className="mt-1 text-xs text-[#697687]">{agent.focus}</p><p className="mt-4 text-sm leading-5 text-[#536174]">{agent.insight}</p></div>)}</div></section>
        <section><SectionHeading eyebrow="Predictions and signals" title="What needs your attention" />{data.signals.length ? <div className="space-y-3">{data.signals.map((signal) => <div key={signal.title} className="flex gap-3 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" /><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{signal.title}</h3><Badge tone={signal.severity === 'warning' || signal.severity === 'attention' ? 'warning' : 'info'}>{signal.agent}</Badge></div><p className="mt-1 text-xs leading-5 text-[#697687]">{signal.detail}</p></div></div>)}</div> : <EmptyState title="No active signals" description="The local agents found no supported issue in the current data." />}</section>
      </div>

       <section className="mt-8"><SectionHeading eyebrow="AI operating team" title="Specialists covering the business" description="These roles share one tenant-scoped evidence set. Their status is advisory and never grants permission to act." /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.operatingTeam.map((agent) => <div key={agent.key} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start justify-between gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8e0cd] text-[#85601b]"><BrainCircuit className="h-4 w-4" /></div><Badge tone={agent.status === 'waiting_for_data' ? 'warning' : agent.status === 'guarded' ? 'neutral' : 'info'}>{agent.status.replaceAll('_', ' ')}</Badge></div><h3 className="mt-3 text-sm font-extrabold">{agent.name}</h3><p className="mt-1 text-[11px] font-bold text-[#8a6826]">{agent.focus}</p><p className="mt-3 text-xs leading-5 text-[#697687]">{agent.insight}</p></div>)}</div></section>

       <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
         <section><SectionHeading eyebrow="Recommendations" title="Suggested next steps" description="Nothing is executed automatically from this list." />{data.recommendations.length ? <div className="space-y-3">{data.recommendations.map((recommendation) => <div key={recommendation.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{recommendation.title}</h3><Badge tone={recommendation.risk === 'medium' ? 'warning' : 'success'}>{recommendation.risk} risk</Badge></div><p className="mt-1 text-sm text-[#536174]">{recommendation.detail}</p><p className="mt-2 text-xs text-[#697687]">{recommendation.reason}</p><Button variant="secondary" className="mt-3 min-h-8 px-3 text-xs" onClick={() => sendRecommendation(recommendation)} disabled={createAction.isPending}><ArrowRight className="h-3.5 w-3.5" />Send to approval center</Button></div></div></div>)}</div> : <EmptyState title="No recommendations yet" description="More persisted activity will give the local model more evidence to work with." />}</section>
         <section><SectionHeading eyebrow="Approval center" title={`${data.awaitingApproval} awaiting review`} description="Approval, execution, and rollback are separate audited steps." />{actions.data.length ? <div className="space-y-3">{actions.data.slice(0, 6).map((action) => <div key={action.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">{action.title}</p><p className="mt-1 text-xs text-[#697687]">{action.agent} · {action.actionType.replaceAll('_', ' ')}</p></div><Badge tone={action.status === 'awaiting_approval' ? 'warning' : action.status === 'rolled_back' ? 'neutral' : action.status === 'executed' ? 'success' : 'info'}>{action.status.replaceAll('_', ' ')}</Badge></div><p className="mt-3 text-xs leading-5 text-[#536174]">{action.reason}</p>{action.result && <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-[11px] leading-5 text-[#536174]">{JSON.stringify(action.result, null, 2)}</pre>}<div className="mt-3 flex flex-wrap gap-2">{action.status === 'awaiting_approval' && <><Button className="min-h-8 px-3 text-xs" onClick={() => act(approve, action.id, 'AI action approved. Execute it only when you are ready.') }><Check className="h-3.5 w-3.5" />Approve</Button><Button variant="danger" className="min-h-8 px-3 text-xs" onClick={() => act(reject, action.id, 'AI action rejected.')}><X className="h-3.5 w-3.5" />Reject</Button></>}{action.status === 'approved' && <Button className="min-h-8 px-3 text-xs" onClick={() => act(execute, action.id, 'AI action prepared safely. No external side effect was performed.')}><Sparkles className="h-3.5 w-3.5" />Execute safe preparation</Button>}{action.status === 'executed' && action.rollbackAvailable && <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => act(rollback, action.id, 'AI action rolled back with a compensating record.')}><RotateCcw className="h-3.5 w-3.5" />Rollback</Button>}</div></div>)}</div> : <EmptyState title="Nothing awaiting approval" description="Recommendations you send for review will appear here with their audit state." />}</section>
      </div>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#315e6c]">Web research</p><h2 className="mt-2 text-xl font-extrabold">Bring the open web into the room.</h2></div><Search className="h-5 w-5 text-[#315e6c]" /></div>
          <p className="mt-3 text-sm leading-6 text-[#477563]">Search is read-only and source-attributed. Results are evidence to review, not an oracle or an instruction to act.</p>
          <div className="mt-5 flex gap-2"><input value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} minLength={3} maxLength={180} placeholder="e.g. sustainable packaging trends 2026" className={inputClass} data-testid="input-ai-research" /><Button onClick={runResearch} disabled={research.isPending || researchQuery.trim().length < 3}><Search className="h-4 w-4" />{research.isPending ? 'Searching…' : 'Research'}</Button></div>
          {researchResult && <div className="mt-5 space-y-3"><p className="text-sm font-bold text-[#315e6c]">{researchResult.summary}</p>{researchResult.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-[#bfd6dc] bg-white/70 p-3 hover:bg-white"><p className="text-sm font-extrabold text-[#182333]">{source.title}</p><p className="mt-1 text-xs leading-5 text-[#477563]">{source.snippet || 'Open source for details.'}</p><p className="mt-2 truncate font-mono text-[10px] text-[#315e6c]">{source.url}</p></a>)}</div>}
          <p className="mt-4 text-[11px] leading-5 text-[#477563]">Limit: snippets can be incomplete or stale. Verify claims at the cited source before pricing, inventory, or campaign decisions.</p>
        </div>
        <div className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#85601b]">Ad assistance</p><h2 className="mt-2 text-xl font-extrabold">Turn real products into campaign drafts.</h2></div><Megaphone className="h-5 w-5 text-[#85601b]" /></div>
          <p className="mt-3 text-sm leading-6 text-[#765817]">The assistant uses your persisted catalog, then sends a reversible draft to approval. It never publishes, spends, or contacts customers.</p>
          <textarea value={adBrief} onChange={(event) => setAdBrief(event.target.value)} maxLength={500} rows={3} placeholder="Optional angle, audience, or offer context" className={`${inputClass} h-auto py-3`} data-testid="input-ai-ad-brief" />
          <Button className="mt-4" onClick={prepareAd} disabled={createAction.isPending}><Megaphone className="h-4 w-4" />{createAction.isPending ? 'Preparing…' : 'Prepare ad concepts'}</Button>
        </div>
      </section>

       <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="AI Product Creator" title="Turn a rough idea into reviewable product copy." description="The creator can draft product-page structure from your brief and existing catalog context. It does not publish or change products." /><div className="mt-5 flex flex-col gap-3 md:flex-row"><textarea value={productBrief} onChange={(event) => setProductBrief(event.target.value)} maxLength={1000} rows={3} className={`${inputClass} h-auto py-3`} placeholder="e.g. Premium linen co-ord for warm-weather workdays, breathable and easy to style" /><Button className="shrink-0 self-start" onClick={prepareProductDraft} disabled={createAction.isPending || productBrief.trim().length < 3}><Sparkles className="h-4 w-4" />Prepare product draft</Button></div><p className="mt-3 text-xs leading-5 text-[#697687]">Generated drafts are stored in the approval history so you can inspect the evidence and rollback the preparation record.</p></section>

       <section className="mt-8 rounded-xl border border-[#bca26a] bg-[#f7edd2] p-6 md:p-7"><SectionHeading eyebrow="Business simulator" title="Test a decision before committing." description="Scenarios use recorded revenue as the baseline and expose uncertainty. They do not change pricing, inventory, staffing, or campaigns." /><div className="mt-5 grid gap-4 md:grid-cols-[1.3fr_.7fr_auto]"><label className="block text-sm font-bold">Scenario<select className={inputClass} value={scenario} onChange={(event) => setScenario(event.target.value as typeof scenario)}><option value="price_change">Price change (%)</option><option value="discount_change">Discount change (%)</option><option value="new_product">Launch a new product</option><option value="new_branch">Open a new branch</option><option value="hiring">Hire capacity</option><option value="supplier_change">Change supplier</option><option value="marketing_campaign">Run a marketing campaign</option><option value="inventory_change">Change inventory (%)</option></select></label><label className="block text-sm font-bold">Scenario value<input className={inputClass} type="number" value={scenarioValue} onChange={(event) => setScenarioValue(event.target.value)} /></label><Button className="self-end" onClick={runSimulation} disabled={simulate.isPending}>{simulate.isPending ? 'Modeling…' : 'Simulate'}</Button></div>{simulation && <div className="mt-6 grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><div className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-5"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#85601b]">Estimate</p><p className="mt-3 text-sm font-bold text-[#765817]">Baseline {simulation.baselineRevenue.toLocaleString()} → estimated {simulation.estimatedRevenue.toLocaleString()} {data.metrics.find((metric) => metric.key === 'revenue')?.detail.split(';')[0] || ''}</p><p className="mt-3 text-xs text-[#765817]">Cost: {simulation.estimatedCost === null ? 'not modeled from recorded data' : simulation.estimatedCost.toLocaleString()} · Margin: {simulation.estimatedMargin === null ? 'not modeled from recorded data' : simulation.estimatedMargin.toLocaleString()}</p><Badge tone={simulation.risk === 'high' ? 'warning' : 'info'}>{simulation.risk} risk</Badge></div><div className="rounded-xl border border-[#dfc27a] bg-white/50 p-5"><p className="text-sm font-extrabold text-[#765817]">{simulation.uncertainty}</p><ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-[#765817]">{simulation.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div></div>}</section>

      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="Operating policy" title="Autonomy with guardrails" description="RUN MY BUSINESS can prepare reversible local work, but approval remains required. No AI setting can change permissions, payout destinations, ledgers, or external settlement." /><div className="grid gap-5 md:grid-cols-3"><label className="block text-sm font-bold">Autonomy level<select className={inputClass} value={level} onChange={(event) => setAutonomyLevel(Number(event.target.value))}><option value={0}>0 · Observe only</option><option value={1}>1 · Recommend</option><option value={2}>2 · Prepare drafts</option><option value={3}>3 · Prepare workflows</option><option value={4}>4 · RUN MY BUSINESS (approval required)</option></select></label><label className="flex items-center gap-3 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-4 py-3 text-sm font-bold"><input type="checkbox" checked={optIn} onChange={(event) => setTrainingOptIn(event.target.checked)} />Allow local training on workspace data</label><label className="flex items-center gap-3 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-4 py-3 text-sm font-bold"><input type="checkbox" checked={runBusiness} onChange={(event) => setRunMyBusiness(event.target.checked)} />Enable RUN MY BUSINESS</label><label className="block text-sm font-bold md:col-span-2">Business objective<input className={inputClass} value={businessGoal} onChange={(event) => setGoal(event.target.value)} maxLength={180} placeholder="Increase monthly revenue without compromising margin" /></label><label className="block text-sm font-bold">Target value<input className={inputClass} type="number" min="0" step="0.01" value={target ?? ''} onChange={(event) => setGoalTarget(event.target.value === '' ? null : Number(event.target.value))} placeholder="Optional" /></label></div><p className="mt-4 text-xs leading-5 text-[#697687]">{businessGoal ? `The operating team will evaluate recommendations against “${businessGoal}”${target === null || target === undefined ? '' : ` and the target ${target.toLocaleString()}`}.` : 'Set an objective to give the operating team a direction; the system will not promise results.'}</p><Button className="mt-5" onClick={saveSettings} disabled={updateSettings.isPending}><Check className="h-4 w-4" />{updateSettings.isPending ? 'Saving…' : 'Save operating policy'}</Button></section>

      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-5"><div className="flex items-center gap-3"><History className="h-5 w-5 text-[#a2772e]" /><div><p className="text-sm font-extrabold">Audited action history</p><p className="mt-1 text-xs text-[#697687]">{actions.data.length} action record{actions.data.length === 1 ? '' : 's'} retained for this merchant.</p></div></div><p className="text-xs text-[#697687]">Use the approval center for every state transition.</p></section>
    </div>
  </AppShell>;
}