import { useState } from 'react';
import { Check, Eye, RefreshCw, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListAdminWithdrawalsQueryKey, useListAdminWithdrawals, useRevealWithdrawalDetails, useReviewWithdrawal } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

export default function AdminWithdrawals() {
  const withdrawals = useListAdminWithdrawals();
  const review = useReviewWithdrawal();
  const reveal = useRevealWithdrawalDetails();
  const queryClient = useQueryClient();
  const [securityCode, setSecurityCode] = useState('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<{ id: number; beneficiaryName: string; bankName: string; bankCode: string; accountNumber: string } | null>(null);

  if (withdrawals.isLoading) return <AppShell admin><LoadingState /></AppShell>;
  if (withdrawals.isError || !withdrawals.data) return <AppShell admin><ErrorState onRetry={() => void withdrawals.refetch()} /></AppShell>;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: getListAdminWithdrawalsQueryKey() });
  const act = (id: number, status: 'approved' | 'rejected' | 'paid') => {
    const confirmation = window.prompt(`Type ${status.toUpperCase()} WITHDRAWAL ${id} to continue`) ?? '';
    if (!confirmation) return;
    const note = window.prompt('Optional note for the merchant') ?? undefined;
    review.mutate({ id, data: { status, securityCode, confirmation, note: note || undefined } }, {
      onSuccess: () => { setMessage(`Withdrawal #${id} is now ${status}.`); refresh(); },
      onError: () => setMessage('Admin action failed. Check your authenticator code, typed confirmation, and the current request status.'),
    });
  };
  const showDetails = (id: number) => {
    const confirmation = window.prompt(`Type VIEW WITHDRAWAL ${id} to reveal transfer details`) ?? '';
    if (!confirmation) return;
    reveal.mutate({ id, data: { securityCode, confirmation } }, {
      onSuccess: setDetails,
      onError: () => setMessage('Transfer details stayed locked. Check the authenticator code and confirmation.'),
    });
  };

  return <AppShell admin>
    <div className="mx-auto max-w-[1320px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Master admin · manual payouts</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Secure withdrawal review.</h1><p className="mt-2 max-w-2xl text-sm text-[#697687]">Five gates protect each admin action: authenticated Clerk session, canonical admin identity, verified primary email, authenticator code, and exact transaction confirmation.</p></div><Button variant="ghost" onClick={() => void withdrawals.refetch()}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
      {message && <div className="mt-6"><Notice tone={message.startsWith('Admin') || message.includes('locked') ? 'danger' : 'success'} title={message.startsWith('Admin') || message.includes('locked') ? 'Action not completed' : 'Withdrawal updated'}>{message}</Notice></div>}
      <section className="mt-8 rounded-xl border border-[#dfc27a] bg-[#fff7df] p-5"><p className="text-sm font-extrabold text-[#765817]">Admin authenticator code</p><p className="mt-1 text-xs text-[#765817]">Enter the current six-digit code once. It is sent only over the protected request and never stored.</p><input value={securityCode} onChange={(event) => setSecurityCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" className="mt-3 h-10 w-full max-w-xs rounded-lg border border-[#dfc27a] bg-[#fffdf5] px-3 font-mono text-sm outline-none focus:border-[#a2772e]" /></section>
      <section className="mt-8"><SectionHeading eyebrow="Queue" title="Withdrawal requests" description="Only approved requests can be marked paid. Rejected requests release their reserved balance." />{withdrawals.data.length ? <div className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{withdrawals.data.map((withdrawal) => <div key={withdrawal.id} className="flex flex-wrap items-center gap-4 px-5 py-5"><div className="min-w-[220px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-bold">#{withdrawal.id} · {withdrawal.merchantName}</p><Badge tone={withdrawal.status === 'paid' ? 'success' : withdrawal.status === 'rejected' ? 'danger' : withdrawal.status === 'approved' ? 'info' : 'warning'}>{withdrawal.status}</Badge></div><p className="mt-1 text-xs text-[#697687]">{withdrawal.merchantEmail} · {withdrawal.bankName} · ending {withdrawal.accountLast4} · {dateLabel(withdrawal.createdAt)}</p></div><p className="font-mono text-sm font-bold">{money(withdrawal.amount, withdrawal.currency)}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => showDetails(withdrawal.id)} disabled={!securityCode || reveal.isPending}><Eye className="h-4 w-4" />Details</Button>{withdrawal.status === 'pending' && <><Button variant="secondary" onClick={() => act(withdrawal.id, 'approved')} disabled={!securityCode || review.isPending}><Check className="h-4 w-4" />Approve</Button><Button variant="danger" onClick={() => act(withdrawal.id, 'rejected')} disabled={!securityCode || review.isPending}><X className="h-4 w-4" />Reject</Button></>}{withdrawal.status === 'approved' && <><Button onClick={() => act(withdrawal.id, 'paid')} disabled={!securityCode || review.isPending}><Check className="h-4 w-4" />Mark paid</Button><Button variant="danger" onClick={() => act(withdrawal.id, 'rejected')} disabled={!securityCode || review.isPending}><X className="h-4 w-4" />Reject</Button></>}</div></div>)}</div></div> : <EmptyState title="No withdrawal requests" description="New merchant requests will appear here after they complete two-level withdrawal security." />}</section>
      {details && <section className="mt-6 rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-5 text-[#2e6957]"><SectionHeading eyebrow="Unlocked for manual transfer" title={`Withdrawal #${details.id} details`} description="Use these details to complete the approved manual transfer, then mark the request paid." /><div className="grid gap-3 text-sm md:grid-cols-4"><div><p className="text-xs uppercase tracking-[.12em]">Beneficiary</p><p className="mt-1 font-bold">{details.beneficiaryName}</p></div><div><p className="text-xs uppercase tracking-[.12em]">Bank</p><p className="mt-1 font-bold">{details.bankName}</p></div><div><p className="text-xs uppercase tracking-[.12em]">Bank code</p><p className="mt-1 font-mono font-bold">{details.bankCode}</p></div><div><p className="text-xs uppercase tracking-[.12em]">Account</p><p className="mt-1 font-mono font-bold">{details.accountNumber}</p></div></div></section>}
    </div>
  </AppShell>;
}