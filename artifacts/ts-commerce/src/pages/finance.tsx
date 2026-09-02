import { type FormEvent, useRef, useState } from 'react';
import { CheckCircle2, CircleDollarSign, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardOverviewQueryKey,
  getGetMerchantBalancesQueryKey,
  getListCustomersQueryKey,
  getListOrdersQueryKey,
  getListReconciliationsQueryKey,
  useApproveRefund,
  useCreatePaymentIntent,
  useCreateRefund,
  useCreateReconciliation,
  useGetMerchantBalances,
  useListOrders,
  useListReconciliations,
  useUpdateReconciliation,
  useVerifyPayment,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { downloadMerchantExport } from '@/lib/export';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';
const minorMoney = (minor: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(minor / 100);

export default function Finance() {
  const orders = useListOrders();
  const balances = useGetMerchantBalances();
  const reconciliations = useListReconciliations();
  const createPayment = useCreatePaymentIntent();
  const verifyPayment = useVerifyPayment();
  const createRefund = useCreateRefund();
  const approveRefund = useApproveRefund();
  const createReconciliation = useCreateReconciliation();
  const updateReconciliation = useUpdateReconciliation();
  const client = useQueryClient();
  const key = useRef<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [method, setMethod] = useState('manual_bank_transfer');
  const [evidence, setEvidence] = useState('');
  const [payment, setPayment] = useState<{ id: number; status: string; amountMinor: number; currency: string } | null>(null);
  const [refundOrder, setRefundOrder] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(false);
  const [refund, setRefund] = useState<{ id: number; status: string } | null>(null);
  const [message, setMessage] = useState('');

  const invalidate = () => void Promise.all([
    client.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
    client.invalidateQueries({ queryKey: getListCustomersQueryKey() }),
    client.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
    client.invalidateQueries({ queryKey: getGetMerchantBalancesQueryKey() }),
    client.invalidateQueries({ queryKey: getListReconciliationsQueryKey() }),
  ]);
  const fail = (text: string) => setMessage(text);
  const submitPayment = (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    const order = orders.data?.find((item) => item.id === Number(orderId));
    if (!order) return fail('Select an existing order before creating a payment intent.');
    key.current ??= crypto.randomUUID();
    createPayment.mutate({ data: { orderId: order.id, amountMinor: Math.round(order.total * 100), currency: order.currency, method: method as 'manual_bank_transfer' | 'manual_cash' | 'manual_other', evidenceReference: evidence || null, idempotencyKey: key.current } }, {
      onSuccess: (value) => { setPayment(value); setEvidence(''); key.current = null; invalidate(); setMessage('Payment intent created. Evidence remains pending until verified.'); },
      onError: () => fail('Payment intent could not be created. The order amount and currency must match the ledger.'),
    });
  };
  const submitRefund = (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    const order = orders.data?.find((item) => item.id === Number(refundOrder));
    if (!order) return fail('Select an existing order before requesting a refund.');
    createRefund.mutate({ data: { orderId: order.id, amountMinor: Number(refundAmount), reason, inventoryRestock: restock } }, {
      onSuccess: (value) => { setRefund(value); setRefundAmount(''); setReason(''); invalidate(); setMessage('Refund requested and awaiting approval.'); },
      onError: () => fail('Refund request failed. Confirm the amount is in minor units and does not exceed the refundable amount.'),
    });
  };
  const submitReconciliation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    createReconciliation.mutate({ data: { currency: String(form.get('currency')), expectedMinor: Number(form.get('expectedMinor')), observedMinor: Number(form.get('observedMinor')), note: String(form.get('note') || '') || null } }, { onSuccess: () => { event.currentTarget.reset(); invalidate(); setMessage('Reconciliation record saved.'); }, onError: () => fail('Reconciliation record could not be saved.') });
  };
  if (orders.isLoading || balances.isLoading || reconciliations.isLoading) return <AppShell><LoadingState label="Loading finance ledger" /></AppShell>;
  if (orders.isError || balances.isError || reconciliations.isError || !orders.data || !balances.data || !reconciliations.data) return <AppShell><ErrorState onRetry={() => { void orders.refetch(); void balances.refetch(); void reconciliations.refetch(); }} /></AppShell>;
  return <AppShell><div className="mx-auto max-w-[1180px]">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Finance / TS Pay</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Your ledger, in control.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Balances are derived from posted ledger entries. Manual evidence records an internal payment claim; it does not represent external bank settlement.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void downloadMerchantExport('transactions')}><Download className="h-4 w-4" />Export ledger</Button><Button variant="ghost" onClick={() => { void orders.refetch(); void balances.refetch(); void reconciliations.refetch(); }} data-testid="button-refresh-finance"><RefreshCw className="h-4 w-4" />Refresh</Button></div></div>
    {message && <div className="mt-7"><Notice tone={message.includes('could') || message.includes('failed') || message.includes('Select') ? 'danger' : 'success'} title={message.includes('could') || message.includes('failed') || message.includes('Select') ? 'Action not completed' : 'Finance updated'}>{message}</Notice></div>}
    <div className="mt-8 grid gap-4 md:grid-cols-3">{balances.data.map((balance) => <section key={balance.currency} className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5" data-testid={`card-balance-${balance.currency}`}><div className="flex justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#697687]">{balance.currency} ledger balance</p><CircleDollarSign className="h-5 w-5 text-[#a2772e]" /></div><p className="mt-4 font-mono text-2xl font-bold" data-testid={`text-ledger-balance-${balance.currency}`}>{minorMoney(balance.ledgerBalanceMinor, balance.currency)}</p><p className="mt-2 text-xs text-[#697687]">Available {minorMoney(balance.availableBalanceMinor, balance.currency)} · Held {minorMoney(balance.heldBalanceMinor, balance.currency)}</p></section>)}</div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="TS Pay" title="Create payment intent" description="Use a real order and enter evidence as a reference, not a settlement promise." /><form onSubmit={submitPayment} className="space-y-4"><label className="block text-sm font-bold">Existing order<select required value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inputClass} data-testid="select-payment-order"><option value="">Select an order</option>{orders.data.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {minorMoney(Math.round(order.total * 100), order.currency)}</option>)}</select></label><label className="block text-sm font-bold">Method<select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass} data-testid="select-payment-method"><option value="manual_bank_transfer">Manual bank transfer</option><option value="manual_cash">Manual cash</option><option value="manual_other">Manual other</option></select></label><label className="block text-sm font-bold">Evidence or reference <span className="font-normal text-[#697687]">(optional)</span><input value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={500} className={inputClass} data-testid="input-payment-evidence" placeholder="Internal reference or receipt location" /></label><SubmitButton loading={createPayment.isPending}>Create payment intent</SubmitButton></form>{payment && <div className="mt-5 rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4" data-testid="status-payment-intent"><div className="flex items-center gap-2"><Badge tone={payment.status === 'verified' ? 'success' : 'warning'}>{payment.status}</Badge><span className="text-xs">{minorMoney(payment.amountMinor, payment.currency)}</span></div>{payment.status === 'submitted' && <Button type="button" className="mt-3 min-h-8 px-3 text-xs" disabled={verifyPayment.isPending} onClick={() => verifyPayment.mutate({ id: payment.id, data: { evidenceReference: evidence || null, note: 'Verified in merchant finance workspace.' } }, { onSuccess: (value) => { setPayment(value); invalidate(); setMessage('Payment evidence verified and posted.'); }, onError: () => fail('Payment evidence could not be verified.') })} data-testid="button-verify-payment"><ShieldCheck className="h-4 w-4" />Verify submitted evidence</Button>}</div>}</section>
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Refunds" title="Request a refund" description="Refund amounts are entered in minor units, such as 1250 for 12.50." /><form onSubmit={submitRefund} className="space-y-4"><label className="block text-sm font-bold">Existing order<select required value={refundOrder} onChange={(e) => setRefundOrder(e.target.value)} className={inputClass} data-testid="select-refund-order"><option value="">Select an order</option>{orders.data.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.currency}</option>)}</select></label><label className="block text-sm font-bold">Amount (minor units)<input required min="1" step="1" type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className={inputClass} data-testid="input-refund-amount" /></label><label className="block text-sm font-bold">Reason<textarea required minLength={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} h-20 py-2`} data-testid="input-refund-reason" /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} data-testid="input-refund-restock" />Restock inventory</label><SubmitButton loading={createRefund.isPending}>Request refund</SubmitButton></form>{refund && <div className="mt-5 rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4" data-testid="status-refund"><Badge tone="warning">{refund.status}</Badge>{refund.status === 'requested' && <Button type="button" className="mt-3 min-h-8 px-3 text-xs" disabled={approveRefund.isPending} onClick={() => approveRefund.mutate({ id: refund.id }, { onSuccess: (value) => { setRefund(value); invalidate(); setMessage('Refund approved and posted to the ledger.'); }, onError: () => fail('Refund could not be approved.') })} data-testid="button-approve-refund"><CheckCircle2 className="h-4 w-4" />Approve refund</Button>}</div>}</section>
    </div>
    <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Controls" title="Reconciliation" description="Compare expected and observed minor-unit amounts without rewriting ledger history." /><form onSubmit={submitReconciliation} className="grid gap-4 md:grid-cols-4"><label className="text-sm font-bold">Currency<input name="currency" required minLength={3} maxLength={3} defaultValue={balances.data[0]?.currency || 'USD'} className={inputClass} data-testid="input-reconciliation-currency" /></label><label className="text-sm font-bold">Expected minor<input name="expectedMinor" required type="number" min="0" step="1" className={inputClass} data-testid="input-reconciliation-expected" /></label><label className="text-sm font-bold">Observed minor<input name="observedMinor" required type="number" min="0" step="1" className={inputClass} data-testid="input-reconciliation-observed" /></label><label className="text-sm font-bold">Notes<input name="note" maxLength={2000} className={inputClass} data-testid="input-reconciliation-note" /></label><SubmitButton loading={createReconciliation.isPending}>Record discrepancy</SubmitButton></form>{reconciliations.data.length ? <div className="mt-6 divide-y divide-[#ded8cd] rounded-xl border border-[#d9d2c4]">{reconciliations.data.map((record) => <div key={record.id} className="flex flex-wrap items-center gap-4 p-4" data-testid={`row-reconciliation-${record.id}`}><div className="min-w-0 flex-1"><p className="font-mono text-sm font-bold">{record.currency} · expected {record.expectedMinor} / observed {record.observedMinor} minor</p><p className="mt-1 text-xs text-[#697687]">{record.note || 'No notes recorded'}</p></div><Badge tone={record.status === 'resolved' ? 'success' : 'warning'}>{record.status}</Badge>{record.status !== 'resolved' && record.status !== 'void' && <Button type="button" variant="secondary" className="min-h-8 px-3 text-xs" disabled={updateReconciliation.isPending} onClick={() => updateReconciliation.mutate({ id: record.id, data: { status: record.status === 'open' ? 'investigating' : 'resolved', note: record.note } }, { onSuccess: () => { invalidate(); setMessage('Reconciliation status updated.'); }, onError: () => fail('Reconciliation status could not be updated.') })} data-testid={`button-update-reconciliation-${record.id}`}>{record.status === 'open' ? 'Investigate' : 'Resolve'}</Button>}</div>)}</div> : <div className="mt-5"><EmptyState title="No reconciliation records" description="Record a discrepancy when your expected and observed ledger amounts differ." /></div>}</section>
  </div></AppShell>;
}