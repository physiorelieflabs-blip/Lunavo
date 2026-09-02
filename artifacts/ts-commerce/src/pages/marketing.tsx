import { useMemo, useState } from 'react';
import { Check, Mail, Megaphone, MessageSquare, RefreshCw, Send, ShieldCheck, Smartphone, Target, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListAiActionsQueryKey, useApproveAiAction, useCreateAiAction, useExecuteAiAction, useGetAiOverview, useListAiActions, useRejectAiAction } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm font-bold text-[#182333] outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';

export default function Marketing() {
  const overview = useGetAiOverview();
  const actions = useListAiActions();
  const createAction = useCreateAiAction();
  const approve = useApproveAiAction();
  const reject = useRejectAiAction();
  const execute = useExecuteAiAction();
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState('launch a best seller');
  const [channel, setChannel] = useState<'email' | 'sms' | 'social'>('email');
  const [audience, setAudience] = useState('repeat customers');
  const [offer, setOffer] = useState('');
  const [message, setMessage] = useState('');

  const campaigns = useMemo(() => (actions.data ?? []).filter((action) => action.actionType === 'ad_draft' || action.actionType === 'draft_message'), [actions.data]);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: getListAiActionsQueryKey() });
  const runTransition = (operation: { mutate: (input: { id: number }, options: { onSuccess: () => void; onError: () => void }) => void }, id: number, success: string) => operation.mutate({ id }, { onSuccess: () => { setMessage(success); refresh(); }, onError: () => setMessage('That campaign changed since this page loaded. Refresh and try again.') });
  const prepareCampaign = () => {
    setMessage('');
    createAction.mutate({
      data: {
        agent: 'Marketing Director',
        actionType: channel === 'social' ? 'ad_draft' : 'draft_message',
        title: `${channel.toUpperCase()} campaign: ${objective}`,
        reason: `Prepare a reviewable ${channel} campaign for ${audience}. Objective: ${objective}. ${offer.trim() ? `Offer context: ${offer.trim()}.` : 'Use the current catalog and customer signals to recommend a responsible offer.'}`,
        risk: 'low',
        reversible: true,
      },
    }, {
      onSuccess: () => { setOffer(''); setMessage('Campaign draft created. It is waiting for approval and has not been sent.'); refresh(); },
      onError: () => setMessage('The campaign draft could not be created.'),
    });
  };

  if (overview.isLoading || actions.isLoading) return <AppShell><LoadingState label="Loading marketing workspace" /></AppShell>;
  if (overview.isError || actions.isError || !overview.data || !actions.data) return <AppShell><ErrorState onRetry={() => { void overview.refetch(); void actions.refetch(); }} /></AppShell>;

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Marketing studio</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Grow demand without losing control.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Create campaign drafts from your store signals. Every message stays reviewable, reversible, and unpublished until you explicitly approve it.</p></div><Badge tone="info"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Approval required</Badge></div>
      {message && <div className="mt-6"><Notice tone={message.includes('could not') || message.includes('changed') ? 'danger' : 'success'} title={message.includes('could not') ? 'Campaign not created' : 'Marketing workspace'}>{message}</Notice></div>}
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="Campaign planner" title="Prepare a campaign" description="This creates a local approval item; it never sends email, SMS, or social posts." /><div className="grid gap-5"><label className="text-sm font-bold">Objective<select className={inputClass} value={objective} onChange={(event) => setObjective(event.target.value)}><option>launch a best seller</option><option>win back lapsed customers</option><option>promote a new collection</option><option>clear slow-moving stock</option></select></label><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold">Channel<select className={inputClass} value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="email">Email</option><option value="sms">SMS</option><option value="social">Social ad</option></select></label><label className="text-sm font-bold">Audience<select className={inputClass} value={audience} onChange={(event) => setAudience(event.target.value)}><option>repeat customers</option><option>first-time buyers</option><option>high-value customers</option><option>all opted-in customers</option></select></label></div><label className="text-sm font-bold">Offer or creative angle <span className="font-normal text-[#8994a2]">(optional)</span><textarea rows={4} maxLength={500} className={`${inputClass} h-auto py-3 font-normal`} value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="e.g. 10% off the new linen edit, valid this weekend" data-testid="input-marketing-offer" /></label><Button onClick={prepareCampaign} disabled={createAction.isPending}><Megaphone className="h-4 w-4" />{createAction.isPending ? 'Preparing…' : 'Prepare campaign draft'}</Button></div></section>
        <section className="rounded-2xl border border-[#182333] bg-[#182333] p-6 text-[#f8f3e8] md:p-7"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">Signal context</p><h2 className="mt-2 text-xl font-extrabold">Use the business you actually have.</h2><div className="mt-7 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#24354a] p-4"><Target className="h-5 w-5 text-[#d6aa46]" /><p className="mt-4 font-mono text-2xl">{overview.data.metrics.find((metric) => metric.key === 'revenue')?.value ?? 0}</p><p className="mt-1 text-xs text-[#aab6c2]">Recorded revenue signal</p></div><div className="rounded-xl bg-[#24354a] p-4"><Mail className="h-5 w-5 text-[#d6aa46]" /><p className="mt-4 font-mono text-2xl">{overview.data.metrics.find((metric) => metric.key === 'customers')?.value ?? 0}</p><p className="mt-1 text-xs text-[#aab6c2]">Customer records</p></div></div><div className="mt-7 space-y-3 text-sm text-[#c7d0d9]"><p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#7cae98]" />Audience stays scoped to your merchant data</p><p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#7cae98]" />Drafts can be rejected or rolled back</p><p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#7cae98]" />No external provider is connected by default</p></div></section>
      </div>
      <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="Approval center" title="Campaign drafts" description="Approve only the work you are ready to send through a separately connected provider." action={<Button variant="ghost" onClick={refresh}><RefreshCw className="h-4 w-4" />Refresh</Button>} />{campaigns.length ? <div className="space-y-3">{campaigns.map((action) => <div key={action.id} className="rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4 md:flex md:items-center md:justify-between md:gap-5" data-testid={`marketing-action-${action.id}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={action.status === 'executed' ? 'success' : action.status === 'awaiting_approval' ? 'warning' : action.status === 'rejected' ? 'danger' : 'info'}>{action.status.replaceAll('_', ' ')}</Badge><span className="text-xs font-bold uppercase tracking-[.1em] text-[#697687]">{action.actionType === 'draft_message' ? 'Message' : 'Social ad'}</span></div><h3 className="mt-2 font-extrabold">{action.title}</h3><p className="mt-1 text-sm leading-5 text-[#697687]">{action.reason}</p></div><div className="mt-4 flex shrink-0 flex-wrap gap-2 md:mt-0">{action.status === 'awaiting_approval' && <><Button className="min-h-9 px-3 text-xs" onClick={() => runTransition(approve, action.id, 'Campaign approved. It remains unpublished until execution.') }><Check className="h-4 w-4" />Approve</Button><Button variant="danger" className="min-h-9 px-3 text-xs" onClick={() => runTransition(reject, action.id, 'Campaign rejected and kept in the audit trail.')}><X className="h-4 w-4" />Reject</Button></>}{action.status === 'approved' && <Button className="min-h-9 px-3 text-xs" onClick={() => runTransition(execute, action.id, 'Campaign preparation executed locally; no external send occurred.')}><Send className="h-4 w-4" />Execute preparation</Button>}</div></div>)}</div> : <EmptyState title="No campaign drafts yet" description="Use the planner above to create a reviewable campaign from your store signals." />}</section>
      <div className="mt-5 grid gap-4 md:grid-cols-3"><div className="rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-4 text-sm text-[#315e6c]"><Mail className="h-5 w-5" /><p className="mt-3 font-extrabold">Email architecture</p><p className="mt-1 text-xs leading-5">Drafts are ready for a future email provider, but nothing is sent without a connected channel.</p></div><div className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4 text-sm text-[#765817]"><Smartphone className="h-5 w-5" /><p className="mt-3 font-extrabold">SMS architecture</p><p className="mt-1 text-xs leading-5">Use explicit opt-in and a verified sender before activating SMS delivery.</p></div><div className="rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4 text-sm text-[#536174]"><MessageSquare className="h-5 w-5" /><p className="mt-3 font-extrabold">Analytics-ready</p><p className="mt-1 text-xs leading-5">Every draft and approval transition is retained in the merchant activity history.</p></div></div>
    </div>
  </AppShell>;
}