import { type FormEvent, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Copy, Landmark, RefreshCw, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetMerchantBalancesQueryKey,
  getGetTsPayAccountQueryKey,
  getListTsPayTransactionsQueryKey,
  useCreateTsPayTransfer,
  useGetMerchantBalances,
  useGetTsPayAccount,
  useListTsPayTransactions,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

export default function TsPay() {
  const queryClient = useQueryClient();
  const account = useGetTsPayAccount();
  const balances = useGetMerchantBalances();
  const transactions = useListTsPayTransactions();
  const createTransfer = useCreateTsPayTransfer();
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const pendingTransferRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetTsPayAccountQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMerchantBalancesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListTsPayTransactionsQueryKey() }),
    ]);
  };

  const balance = useMemo(
    () => balances.data?.find((item) => item.currency === account.data?.currency),
    [account.data?.currency, balances.data],
  );

  if (account.isLoading || balances.isLoading || transactions.isLoading) return <AppShell><LoadingState label="Opening your TS Pay account" /></AppShell>;
  if (account.isError || balances.isError || transactions.isError || !account.data || !balances.data || !transactions.data) {
    return <AppShell><ErrorState onRetry={() => { void account.refetch(); void balances.refetch(); void transactions.refetch(); }} /></AppShell>;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setMessageIsError(false);
    const toAccountNumber = destination.trim().toUpperCase();
    const transferAmount = Number(amount);
    const transferNote = note.trim();
    if (!/^TS[A-Z0-9]{16}$/.test(toAccountNumber)) {
      setMessageIsError(true);
      setMessage('Enter a valid TS Pay destination account number.');
      return;
    }
    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      setMessageIsError(true);
      setMessage('Enter a transfer amount greater than zero.');
      return;
    }
    const fingerprint = JSON.stringify({
      toAccountNumber,
      amount: transferAmount,
      currency: account.data.currency,
      note: transferNote,
    });
    const pending = pendingTransferRef.current;
    const idempotencyKey = pending?.fingerprint === fingerprint
      ? pending.idempotencyKey
      : crypto.randomUUID();
    pendingTransferRef.current = { fingerprint, idempotencyKey };
    try {
      await createTransfer.mutateAsync({
        data: {
          toAccountNumber,
          amount: transferAmount,
          currency: account.data.currency,
          note: transferNote || undefined,
          idempotencyKey,
        },
      });
      setMessage('Transfer completed. Both sides of the TS Pay ledger were posted atomically.');
      setDestination('');
      setAmount('');
      setNote('');
      pendingTransferRef.current = null;
      await refresh();
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : 'Transfer could not be completed.');
    }
  };

  const copyAccount = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(account.data.accountNumber);
      setMessageIsError(false);
      setMessage('TS Pay account number copied.');
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : 'The TS Pay account number could not be copied.');
    }
  };

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">TS Pay · internal bank</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Move money inside the platform.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Your TS Pay account is the platform’s own internal settlement account. Sales, refunds, holds, withdrawals, and transfers remain visible in one ledger.</p>
        </div>
         <div className="flex flex-wrap gap-2"><Link href="/withdrawals" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-4 text-sm font-extrabold text-[#1f2b38] hover:bg-[#f1ede4]">External payouts</Link><Button variant="secondary" onClick={refresh}><RefreshCw className="h-4 w-4" />Refresh account</Button></div>
      </div>

       {message && <div className="mt-7"><Notice tone={messageIsError ? 'danger' : 'success'} title={messageIsError ? 'TS Pay action failed' : 'TS Pay update'}>{message}</Notice></div>}

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-2xl bg-[#1f2b38] p-7 text-[#f8f3e8] shadow-[0_18px_38px_rgba(31,43,56,.16)]">
          <div className="flex items-start justify-between gap-4">
            <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#9aa7b5]">TS Pay account</p><p className="mt-3 text-3xl font-extrabold tracking-[-.05em]">{account.data.accountNumber}</p></div>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#c85d3f]"><Landmark className="h-5 w-5" /></div>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#3c4b5a] pt-5">
            <div><p className="text-xs text-[#9aa7b5]">Settlement currency</p><p className="mt-1 font-mono text-sm font-bold">{account.data.currency} · {account.data.status}</p></div>
            <Button variant="ghost" className="text-[#f8f3e8] hover:bg-[#304151] hover:text-[#f8f3e8]" onClick={copyAccount}><Copy className="h-4 w-4" />Copy account number</Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#697687]">Available to move</p><p className="mt-3 font-mono text-3xl font-extrabold">{money((balance?.availableBalanceMinor ?? 0) / 100, account.data.currency)}</p><p className="mt-2 text-xs text-[#697687]">After withdrawal and subscription holds.</p></section>
           <section className="rounded-2xl border border-[#dfc27a] bg-[#fff7df] p-6"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#85601b]">Subscription hold</p><p className="mt-3 font-mono text-3xl font-extrabold text-[#765817]">{money((balance?.heldBalanceMinor ?? 0) / 100, account.data.currency)}</p><p className="mt-2 text-xs text-[#765817]">Withdrawal reservations are already removed from the ledger balance.</p></section>
        </div>
      </section>

      <section className="mt-7 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
        <SectionHeading eyebrow="Internal transfer" title="Send to another TS Pay account" description="Transfers are instant inside TS Commerce and create matching debit and credit entries. They cannot overdraft available funds." />
        <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
           <label className="block text-sm font-bold">Destination account<input required pattern="TS[A-Z0-9]{16}" value={destination} onChange={(event) => setDestination(event.target.value.toUpperCase())} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="TS4F8A2C9D10E7B6A" /></label>
          <label className="block text-sm font-bold">Amount ({account.data.currency})<input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="100.00" /></label>
          <label className="block text-sm font-bold md:col-span-2">Note <span className="font-normal text-[#697687]">(optional)</span><input maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" placeholder="Why are you sending this?" /></label>
          <div className="md:col-span-2"><SubmitButton loading={createTransfer.isPending}><Send className="h-4 w-4" />Send through TS Pay</SubmitButton></div>
        </form>
      </section>

      <section className="mt-7">
        <SectionHeading eyebrow="Account activity" title="Unified TS Pay history" description="Sales, refunds, payout reservations, and internal transfers all appear in this one account record." />
        {transactions.data.length ? <div className="mt-4 overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{transactions.data.map((transaction) => { const credit = transaction.direction === 'credit'; const hold = transaction.direction === 'hold'; return <div key={transaction.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${credit ? 'bg-[#e8f4ed] text-[#2f6958]' : hold ? 'bg-[#fff7df] text-[#85601b]' : 'bg-[#fae8df] text-[#a84e38]'}`}>{credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold capitalize">{transaction.kind} · {transaction.status}</p><Badge tone={hold ? 'warning' : credit ? 'success' : 'neutral'}>{transaction.direction}</Badge></div><p className="mt-1 truncate text-xs text-[#697687]">{transaction.description} · {dateLabel(transaction.occurredAt)}</p></div><p className={`font-mono text-sm font-bold ${credit ? 'text-[#2f6958]' : hold ? 'text-[#85601b]' : 'text-[#a84e38]'}`}>{credit ? '+' : hold ? '' : '-'}{money(transaction.amountMinor / 100, transaction.currency)}</p></div>; })}</div></div> : <div className="mt-4"><EmptyState title="No TS Pay transactions yet" description="Sales, refunds, payout reservations, and internal transfers will appear here from one unified history." /></div>}
      </section>
    </div>
  </AppShell>;
}