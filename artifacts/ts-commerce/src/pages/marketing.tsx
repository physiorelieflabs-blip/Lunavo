import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Mail,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Target,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMarketingBillingQueryKey,
  getGetCurrentWorkspaceQueryKey,
  getListAccessibleWorkspacesQueryKey,
  getListAiActionsQueryKey,
  setSelectedWorkspaceId,
  useApproveAiAction,
  useCreateAiAction,
  useExecuteAiAction,
  useGetCurrentWorkspace,
  useGetAiOverview,
  useGetMarketingBilling,
  useListAccessibleWorkspaces,
  useListAiActions,
  usePayAdvertisingFromEarnings,
  useRejectAiAction,
  useSubmitAdvertisingPaymentReference,
  customFetch,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  SectionHeading,
} from '@/components/primitives';
import { money } from '@/lib/format';

const inputClass =
  'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm font-bold text-[#182333] outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';

export default function Marketing() {
  const workspaces = useListAccessibleWorkspaces({ query: { queryKey: getListAccessibleWorkspacesQueryKey(), retry: false, staleTime: 60_000 } });
  const currentWorkspace = useGetCurrentWorkspace({ query: { queryKey: getGetCurrentWorkspaceQueryKey(), retry: false, staleTime: 60_000 } });
  const overview = useGetAiOverview();
  const actions = useListAiActions();
  const billing = useGetMarketingBilling();
  const createAction = useCreateAiAction();
  const approve = useApproveAiAction();
  const reject = useRejectAiAction();
  const execute = useExecuteAiAction();
  const payFromEarnings = usePayAdvertisingFromEarnings();
  const submitReference = useSubmitAdvertisingPaymentReference();
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState('launch a best seller');
  const [channel, setChannel] = useState<'email' | 'sms' | 'social'>('email');
  const [audience, setAudience] = useState('repeat customers');
  const [offer, setOffer] = useState('');
  const [budget, setBudget] = useState('25.00');
  const [references, setReferences] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [discountCodes, setDiscountCodes] = useState<Array<{id:number;code:string;kind:string;value:string;minimumSubtotal:string;currency:string;active:boolean;createdAt:string}>>([]);
  const [discountForm, setDiscountForm] = useState({code:'',kind:'percentage',value:'10',minimumSubtotal:'0'});
  const [discountBusy, setDiscountBusy] = useState(false);
  const loadDiscountCodes = async () => {
    try {
      const result = await customFetch<{codes: typeof discountCodes}>('/api/commerce/discount-codes', {responseType:'json'});
      setDiscountCodes(result.codes ?? []);
    } catch {}
  };
  useEffect(() => { void loadDiscountCodes(); }, [currentWorkspace.data?.id]);
  const createDiscountCode = async () => {
    setDiscountBusy(true);
    try {
      const result = await customFetch<{code:any}>('/api/commerce/discount-codes', {
        method:'POST', credentials:'include', headers:{'content-type':'application/json'},
        body:JSON.stringify(discountForm),
      });
      setDiscountCodes(v => [result.code, ...v]);
      setDiscountForm({code:'',kind:'percentage',value:'10',minimumSubtotal:'0'});
      setMessage('Discount code created and is now available for checkout.');
    } catch(error) {
      setMessage(error instanceof Error ? error.message : 'Discount code could not be created.');
    } finally { setDiscountBusy(false); }
  };
  const deactivateDiscountCode = async (id:number) => {
    setDiscountBusy(true);
    try {
      const result = await customFetch<{code:any}>(`/api/commerce/discount-codes/${id}/deactivate`, {method:'POST',credentials:'include',responseType:'json'});
      setDiscountCodes(v => v.map(item => item.id===id ? result.code : item));
      setMessage('Discount code deactivated.');
    } catch(error) {
      setMessage(error instanceof Error ? error.message : 'Discount code could not be deactivated.');
    } finally { setDiscountBusy(false); }
  };
  const switchStore = (merchantId: number) => {
    if (merchantId === currentWorkspace.data?.id) return;
    setSelectedWorkspaceId(merchantId);
    queryClient.clear();
    window.location.assign('/marketing');
  };

  const campaigns = useMemo(
    () =>
      (actions.data ?? []).filter(
        (action) =>
          action.actionType === 'ad_draft' ||
          action.actionType === 'draft_message',
      ),
    [actions.data],
  );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListAiActionsQueryKey() });
    void queryClient.invalidateQueries({
      queryKey: getGetMarketingBillingQueryKey(),
    });
  };
  const runTransition = (
    operation: {
      mutate: (
        input: { id: number },
        options: { onSuccess: () => void; onError: () => void },
      ) => void;
    },
    id: number,
    success: string,
  ) =>
    operation.mutate(
      { id },
      {
        onSuccess: () => {
          setMessage(success);
          refresh();
        },
        onError: () =>
          setMessage(
            'That campaign changed since this page loaded. Refresh and try again.',
          ),
      },
    );
  const prepareCampaign = () => {
    setMessage('');
    const isAdvert = channel === 'social';
    const parsedBudget = Number(budget);
    if (isAdvert && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      setMessage('Enter a positive budget for the social ad.');
      return;
    }
    createAction.mutate(
      {
        data: {
          agent: 'Marketing Director',
          actionType: isAdvert ? 'ad_draft' : 'draft_message',
          title: `${channel.toUpperCase()} campaign: ${objective}`,
          reason: `Prepare a reviewable ${channel} campaign for ${audience}. Objective: ${objective}. ${
            offer.trim()
              ? `Offer context: ${offer.trim()}.`
              : 'Use the current catalog and customer signals to recommend a responsible offer.'
          }`,
          budgetAmount: isAdvert ? parsedBudget : undefined,
          risk: 'low',
          reversible: true,
        },
      },
      {
        onSuccess: () => {
          setOffer('');
          setMessage(
            'Campaign draft created. It is waiting for approval and has not been sent.',
          );
          refresh();
        },
        onError: () => setMessage('The campaign draft could not be created.'),
      },
    );
  };
  const payCampaign = (id: number) => {
    setMessage('');
    payFromEarnings.mutate(
      { id },
      {
        onSuccess: () => {
          setMessage(
            'Advertising budget paid from your dashboard balance. The campaign still needs approval before execution.',
          );
          refresh();
        },
        onError: () =>
          setMessage(
            'The advertising budget could not be paid. Check the available balance and campaign state.',
          ),
      },
    );
  };
  const sendReference = (id: number) => {
    const paymentReference = references[id]?.trim() ?? '';
    if (paymentReference.length < 3) return;
    submitReference.mutate(
      { id, data: { paymentReference } },
      {
        onSuccess: () => {
          setReferences((current) => ({ ...current, [id]: '' }));
          setMessage(
            'Pay from bank payment reference submitted for admin review. No settlement was claimed yet.',
          );
          refresh();
        },
        onError: () =>
          setMessage(
            'That payment reference could not be submitted. A pending reference may already exist.',
          ),
      },
    );
  };

  if (overview.isLoading || actions.isLoading || billing.isLoading) {
    return (
      <AppShell>
        <LoadingState label="Loading marketing workspace" />
      </AppShell>
    );
  }
  if (
    overview.isError ||
    actions.isError ||
    billing.isError ||
    !overview.data ||
    !actions.data ||
    !billing.data
  ) {
    return (
      <AppShell>
        <ErrorState
          onRetry={() => {
            void overview.refetch();
            void actions.refetch();
            void billing.refetch();
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">
              Marketing studio
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">
              Grow demand without losing control.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">
              Create campaign drafts from your store signals. Every message
              stays reviewable, reversible, and unpublished until you
              explicitly approve it.
            </p>
          </div>
          <Badge tone="info">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
            Approval required
          </Badge>
        </div>
        {message && (
          <div className="mt-6">
            <Notice
              tone={
                message.includes('could not') ||
                message.includes('not enough') ||
                message.includes('couldn')
                  ? 'danger'
                  : 'success'
              }
              title="Marketing workspace"
            >
              {message}
            </Notice>
          </div>
        )}
        <section className="mt-8 rounded-2xl border border-[#bfd6dc] bg-[#eef7f8] p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#315e6c]">Store context</p><h2 className="mt-1 text-lg font-extrabold text-[#182333]">Choose the store to market</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#477563]">Campaign drafts, customer signals, budgets, approvals, and billing stay scoped to the selected merchant workspace. Switching stores reloads the page before you create anything.</p></div>
            <select aria-label="Store to market" value={currentWorkspace.data?.id ?? ''} onChange={(event) => switchStore(Number(event.target.value))} className="h-11 min-w-[220px] rounded-lg border border-[#a9c8cc] bg-white px-3 text-sm font-bold text-[#182333] outline-none focus:border-[#315e6c]">
              <option value="" disabled>Choose a store</option>
              {workspaces.data?.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.storeName}</option>)}
            </select>
          </div>
        </section>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
          <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
            <SectionHeading
              eyebrow="Campaign planner"
              title="Prepare a campaign"
              description="This creates a local approval item; it never sends email, SMS, or social posts."
            />
            <div className="grid gap-5">
              <label className="text-sm font-bold">
                Objective
                <select
                  className={inputClass}
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                >
                  <option>launch a best seller</option>
                  <option>win back lapsed customers</option>
                  <option>promote a new collection</option>
                  <option>clear slow-moving stock</option>
                </select>
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Channel
                  <select
                    className={inputClass}
                    value={channel}
                    onChange={(event) =>
                      setChannel(event.target.value as typeof channel)
                    }
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="social">Social ad</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Audience
                  <select
                    className={inputClass}
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                  >
                    <option>repeat customers</option>
                    <option>first-time buyers</option>
                    <option>high-value customers</option>
                    <option>all opted-in customers</option>
                  </select>
                </label>
              </div>
              {channel === 'social' && (
                <label className="text-sm font-bold">
                  Advertising budget ({billing.data.currency})
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={inputClass}
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    data-testid="input-advertising-budget"
                  />
                  <span className="mt-1 block text-xs font-normal text-[#697687]">
                    This budget must be paid before campaign preparation can
                    execute.
                  </span>
                </label>
              )}
              <label className="text-sm font-bold">
                Offer or creative angle{' '}
                <span className="font-normal text-[#8994a2]">(optional)</span>
                <textarea
                  rows={4}
                  maxLength={500}
                  className={`${inputClass} h-auto py-3 font-normal`}
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  placeholder="e.g. 10% off the new linen edit, valid this weekend"
                  data-testid="input-marketing-offer"
                />
              </label>
              <Button onClick={prepareCampaign} disabled={createAction.isPending}>
                <Megaphone className="h-4 w-4" />
                {createAction.isPending ? 'Preparing…' : 'Prepare campaign draft'}
              </Button>
            </div>
          </section>
          <section className="rounded-2xl border border-[#182333] bg-[#182333] p-6 text-[#f8f3e8] md:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">
              Signal context
            </p>
            <h2 className="mt-2 text-xl font-extrabold">
              Use the business you actually have.
            </h2>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[#24354a] p-4">
                <Target className="h-5 w-5 text-[#d6aa46]" />
                <p className="mt-4 font-mono text-2xl">
                  {overview.data.metrics.find((metric) => metric.key === 'revenue')
                    ?.value ?? 0}
                </p>
                <p className="mt-1 text-xs text-[#aab6c2]">Revenue signal</p>
              </div>
              <div className="rounded-xl bg-[#24354a] p-4">
                <Mail className="h-5 w-5 text-[#d6aa46]" />
                <p className="mt-4 font-mono text-2xl">
                  {overview.data.metrics.find(
                    (metric) => metric.key === 'customers',
                  )?.value ?? 0}
                </p>
                <p className="mt-1 text-xs text-[#aab6c2]">Customer records</p>
              </div>
              <div className="rounded-xl bg-[#24354a] p-4">
                <ShieldCheck className="h-5 w-5 text-[#7cae98]" />
                <p className="mt-4 font-mono text-2xl">
                  {money(billing.data.availableBalance, billing.data.currency)}
                </p>
                <p className="mt-1 text-xs text-[#aab6c2]">Dashboard balance</p>
              </div>
            </div>
            <div className="mt-7 space-y-3 text-sm text-[#c7d0d9]">
              <p className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#7cae98]" />
                Audience stays scoped to your merchant data
              </p>
              <p className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#7cae98]" />
                Manual references stay pending until admin review
              </p>
              <p className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#7cae98]" />
                No external provider is connected by default
              </p>
            </div>
          </section>
        </div>
        <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
          <SectionHeading eyebrow="Promotions" title="Discount codes" description="Create real checkout discounts for this merchant store. Discounts are validated and applied server-side; deactivating a code is immediate." />
          <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr_.7fr_1fr_auto]">
            <label className="text-sm font-bold">Code<input value={discountForm.code} onChange={e=>setDiscountForm(v=>({...v,code:e.target.value.toUpperCase()}))} maxLength={40} placeholder="WELCOME10" className={inputClass}/></label>
            <label className="text-sm font-bold">Type<select value={discountForm.kind} onChange={e=>setDiscountForm(v=>({...v,kind:e.target.value}))} className={inputClass}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
            <label className="text-sm font-bold">Value<input type="number" min="0.01" step="0.01" value={discountForm.value} onChange={e=>setDiscountForm(v=>({...v,value:e.target.value}))} className={inputClass}/></label>
            <label className="text-sm font-bold">Minimum subtotal<input type="number" min="0" step="0.01" value={discountForm.minimumSubtotal} onChange={e=>setDiscountForm(v=>({...v,minimumSubtotal:e.target.value}))} className={inputClass}/></label>
            <div className="flex items-end"><Button onClick={()=>void createDiscountCode()} disabled={discountBusy || discountForm.code.trim().length<3}><Megaphone className="h-4 w-4"/>Create</Button></div>
          </div>
          {discountCodes.length ? <div className="mt-6 overflow-hidden rounded-xl border border-[#d9d2c4]"><div className="divide-y divide-[#ded8cd]">{discountCodes.map(code=><div key={code.id} className="flex flex-wrap items-center gap-4 bg-[#f7f4ed] px-4 py-3"><div className="min-w-[150px]"><p className="font-mono font-extrabold tracking-wide">{code.code}</p><p className="mt-1 text-xs text-[#697687]">Minimum {money(Number(code.minimumSubtotal),code.currency)}</p></div><Badge tone={code.active?'success':'danger'}>{code.active?'active':'inactive'}</Badge><p className="text-sm font-bold">{code.kind==='percentage'?code.value+'%':money(Number(code.value),code.currency)}</p>{code.active&&<Button variant="ghost" className="ml-auto min-h-9 px-3 text-xs" onClick={()=>void deactivateDiscountCode(code.id)} disabled={discountBusy}>Deactivate</Button>}</div>)}</div></div> : <div className="mt-5"><EmptyState title="No discount codes" description="Create a code above and it will be enforced by the storefront checkout." /></div>}
        </section>
        <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
          <SectionHeading
            eyebrow="Approval center"
            title="Campaign drafts"
            description="Approve and pay only the work you are ready to prepare. Preparation never publishes or sends an advert."
            action={
              <Button variant="ghost" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            }
          />
          {campaigns.length ? (
            <div className="space-y-3">
              {campaigns.map((action) => {
                const payment = billing.data.payments.find(
                  (item) => item.aiActionId === action.id,
                );
                const isAdvert = action.actionType === 'ad_draft';
                return (
                  <div
                    key={action.id}
                    className="rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4"
                    data-testid={`marketing-action-${action.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={
                              action.status === 'executed'
                                ? 'success'
                                : action.status === 'awaiting_approval'
                                  ? 'warning'
                                  : action.status === 'rejected'
                                    ? 'danger'
                                    : 'info'
                            }
                          >
                            {action.status.replaceAll('_', ' ')}
                          </Badge>
                          <span className="text-xs font-bold uppercase tracking-[.1em] text-[#697687]">
                            {isAdvert ? 'Social ad' : 'Message'}
                          </span>
                        </div>
                        <h3 className="mt-2 font-extrabold">{action.title}</h3>
                        <p className="mt-1 text-sm leading-5 text-[#697687]">
                          {action.reason}
                        </p>
                        {isAdvert && action.budgetAmount !== null && (
                          <p className="mt-3 text-xs font-bold text-[#765817]">
                            Budget:{' '}
                            {money(
                              action.budgetAmount,
                              action.budgetCurrency ?? billing.data.currency,
                            )}
                            {' · '}
                            {payment
                              ? `payment ${payment.status.replaceAll('_', ' ')}`
                              : 'payment required'}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {action.status === 'awaiting_approval' && (
                          <>
                            <Button
                              className="min-h-9 px-3 text-xs"
                              onClick={() =>
                                runTransition(
                                  approve,
                                  action.id,
                                  'Campaign approved. It still needs a confirmed payment before preparation.',
                                )
                              }
                            >
                              <Check className="h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              className="min-h-9 px-3 text-xs"
                              onClick={() =>
                                runTransition(
                                  reject,
                                  action.id,
                                  'Campaign rejected and kept in the audit trail.',
                                )
                              }
                            >
                              <X className="h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        )}
                        {action.status === 'approved' &&
                          (!isAdvert || payment?.status === 'confirmed') && (
                            <Button
                              className="min-h-9 px-3 text-xs"
                              onClick={() =>
                                runTransition(
                                  execute,
                                  action.id,
                                  'Campaign preparation completed locally; no external send occurred.',
                                )
                              }
                            >
                              <Send className="h-4 w-4" />
                              Execute preparation
                            </Button>
                          )}
                      </div>
                    </div>
                    {isAdvert &&
                      action.status !== 'executed' &&
                      payment?.status !== 'confirmed' && (
                        <div className="mt-4 border-t border-[#ded8cd] pt-4">
                          <p className="text-xs font-bold uppercase tracking-[.1em] text-[#697687]">
                            Choose how to pay this advertising budget
                          </p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Button
                              variant="secondary"
                              className="shrink-0"
                              onClick={() => payCampaign(action.id)}
                              disabled={
                                payFromEarnings.isPending ||
                                payment?.status === 'pending_review'
                              }
                            >
                              {payFromEarnings.isPending
                                ? 'Paying…'
                                : 'Pay from dashboard'}
                            </Button>
                            <span className="text-xs text-[#697687]">or</span>
                            <input
                              value={references[action.id] ?? ''}
                              onChange={(event) =>
                                setReferences((current) => ({
                                  ...current,
                                  [action.id]: event.target.value,
                                }))
                              }
                              placeholder="Bank payment reference"
                              className={`${inputClass} mt-0 sm:max-w-xs`}
                              disabled={payment?.status === 'pending_review'}
                            />
                            <Button
                              className="shrink-0"
                              onClick={() => sendReference(action.id)}
                              disabled={
                                (references[action.id] ?? '').trim().length < 3 ||
                                submitReference.isPending ||
                                payment?.status === 'pending_review'
                              }
                            >
                              <Send className="h-4 w-4" />
                              Pay from bank
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-[#697687]">
                            Dashboard balance:{' '}
                            {money(
                              billing.data.availableBalance,
                              billing.data.currency,
                            )}
                            . Manual references do not activate the campaign
                            until an admin verifies them.
                          </p>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No campaign drafts yet"
              description="Use the planner above to create a reviewable campaign from your store signals."
            />
          )}
        </section>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-4 text-sm text-[#315e6c]">
            <Mail className="h-5 w-5" />
            <p className="mt-3 font-extrabold">Email architecture</p>
            <p className="mt-1 text-xs leading-5">
              Drafts are ready for a future email provider, but nothing is
              sent without a connected channel.
            </p>
          </div>
          <div className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4 text-sm text-[#765817]">
            <Smartphone className="h-5 w-5" />
            <p className="mt-3 font-extrabold">SMS architecture</p>
            <p className="mt-1 text-xs leading-5">
              Use explicit opt-in and a verified sender before activating SMS
              delivery.
            </p>
          </div>
          <div className="rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4 text-sm text-[#536174]">
            <MessageSquare className="h-5 w-5" />
            <p className="mt-3 font-extrabold">Analytics-ready</p>
            <p className="mt-1 text-xs leading-5">
              Every draft, payment, and approval transition is retained in
              the merchant activity history.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}