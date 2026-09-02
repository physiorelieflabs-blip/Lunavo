import { type FormEvent, useState } from 'react';
import { ArrowRight, LockKeyhole, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardOverviewQueryKey,
  getGetLinkedBankAccountQueryKey,
  getGetWithdrawalSecurityQueryKey,
  getListWithdrawalsQueryKey,
  useBeginWithdrawalSecuritySetup,
  useConfirmWithdrawalSecuritySetup,
  useCreateWithdrawal,
  useDeleteLinkedBankAccount,
  useGetLinkedBankAccount,
  useGetCurrencySettings,
  useGetWithdrawalSecurity,
  useListWithdrawals,
  useSaveLinkedBankAccount,
} from '@workspace/api-client-react';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

type BankForm = { beneficiaryName: string; bankName: string; bankCode: string; accountNumber: string };

const emptyBank: BankForm = { beneficiaryName: '', bankName: '', bankCode: '', accountNumber: '' };

export default function Withdrawals() {
  const security = useGetWithdrawalSecurity();
  const withdrawals = useListWithdrawals();
  const linkedBank = useGetLinkedBankAccount();
  const currencySettings = useGetCurrencySettings();
  const beginSetup = useBeginWithdrawalSecuritySetup();
  const confirmSetup = useConfirmWithdrawalSecuritySetup();
  const saveBank = useSaveLinkedBankAccount();
  const deleteBank = useDeleteLinkedBankAccount();
  const createWithdrawal = useCreateWithdrawal();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [bankForm, setBankForm] = useState<BankForm>(emptyBank);
  const [editingBank, setEditingBank] = useState(false);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const refresh = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: getListWithdrawalsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetWithdrawalSecurityQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetLinkedBankAccountQueryKey() }),
    ]);
  };

   if (security.isLoading || withdrawals.isLoading || linkedBank.isLoading || currencySettings.isLoading) return <AppShell><LoadingState /></AppShell>;
   if (security.isError || withdrawals.isError || linkedBank.isError || currencySettings.isError || !security.data || !withdrawals.data) {
    return <AppShell><ErrorState onRetry={() => { void security.refetch(); void withdrawals.refetch(); void linkedBank.refetch(); }} /></AppShell>;
  }

  const startSetup = () => {
    setMessage('');
    beginSetup.mutate(undefined, {
      onSuccess: (result) => {
        setSetup({ secret: result.secret, otpAuthUri: result.otpAuthUri });
        setMessage('Setup started. Add the secret to an authenticator app, then enter the current six-digit code.');
      },
      onError: () => setMessage('Authenticator setup could not start. Verify your email and try again.'),
    });
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    confirmSetup.mutate({ data: { code: setupCode } }, {
      onSuccess: () => {
        setSetup(null);
        setSetupCode('');
        setMessage('Withdrawal security is enabled.');
        refresh();
      },
      onError: () => setMessage('That authenticator code was not accepted. Try the current code again.'),
    });
  };

  const saveBankAccount = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    saveBank.mutate({ data: bankForm }, {
      onSuccess: () => {
        setEditingBank(false);
        setBankForm(emptyBank);
        setMessage('Linked bank account saved. New withdrawals will use this destination.');
        refresh();
      },
      onError: () => setMessage('Bank account could not be saved. Check the details and try again.'),
    });
  };

  const editBankAccount = () => {
    if (!linkedBank.data) return;
    setBankForm({
      beneficiaryName: linkedBank.data.beneficiaryName,
      bankName: linkedBank.data.bankName,
      bankCode: linkedBank.data.bankCode,
      accountNumber: '',
    });
    setEditingBank(true);
  };

  const removeBankAccount = () => {
    if (!window.confirm('Remove this linked bank account? Existing withdrawal requests keep their original destination.')) return;
    deleteBank.mutate(undefined, {
      onSuccess: () => {
        setMessage('Linked bank account removed. Link another account before requesting a withdrawal.');
        refresh();
      },
      onError: () => setMessage('The linked bank account could not be removed.'),
    });
  };

  const requestWithdrawal = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    createWithdrawal.mutate({
      data: {
        amount: Number(amount),
        totpCode,
        idempotencyKey: crypto.randomUUID(),
      },
    }, {
      onSuccess: () => {
        setMessage('Withdrawal request submitted. It is reserved from your available balance and waiting for review.');
        setAmount('');
        setTotpCode('');
        refresh();
      },
      onError: () => setMessage('Withdrawal could not be submitted. Check your balance and authenticator code.'),
    });
  };

  const securityEnabled = security.data.enabled;
  const linkedAccount = linkedBank.data;
  const hasBank = Boolean(linkedAccount);
  const errorMessage = message.includes('could not') || message.includes('not accepted');

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
       <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
           <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">TS Pay · funds movement</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Withdraw when you’re ready.</h1>
           <p className="mt-2 max-w-2xl text-sm text-[#697687]">Link a bank account first, then request a TS Pay payout from available earnings. You can change the linked destination at any time.</p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline">Back to overview <ArrowRight className="h-4 w-4" /></Link>
      </div>

      {message && <div className="mt-7"><Notice tone={errorMessage ? 'danger' : 'success'} title={errorMessage ? 'Action not completed' : 'Withdrawal update'}>{message}</Notice></div>}

      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
        <SectionHeading eyebrow="Required payout destination" title="Link your bank account" description="Your account number is encrypted at rest. Normal screens show only the last four digits. Changing this account affects new withdrawals, not requests already submitted." />
        {linkedAccount && !editingBank ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#b8d6ca] bg-[#eff8f3] px-4 py-4"><div className="flex items-center gap-3 text-[#2e6957]"><ShieldCheck className="h-5 w-5" /><div><p className="text-sm font-extrabold">{linkedAccount.bankName} · ending {linkedAccount.accountLast4}</p><p className="mt-1 text-xs">{linkedAccount.beneficiaryName} · bank code {linkedAccount.bankCode}</p></div></div><div className="flex gap-2"><Button variant="secondary" onClick={editBankAccount}><Pencil className="h-4 w-4" />Change</Button><Button variant="danger" onClick={removeBankAccount} disabled={deleteBank.isPending}><Trash2 className="h-4 w-4" />Remove</Button></div></div> : <form onSubmit={saveBankAccount} className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-bold">Beneficiary name<input value={bankForm.beneficiaryName} onChange={(event) => setBankForm({ ...bankForm, beneficiaryName: event.target.value })} minLength={2} maxLength={160} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" placeholder="Name on the bank account" /></label><label className="block text-sm font-bold">Bank name<input value={bankForm.bankName} onChange={(event) => setBankForm({ ...bankForm, bankName: event.target.value })} minLength={2} maxLength={120} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" placeholder="Your bank" /></label><label className="block text-sm font-bold">Bank code<input value={bankForm.bankCode} onChange={(event) => setBankForm({ ...bankForm, bankCode: event.target.value })} minLength={2} maxLength={40} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="000123" /></label><label className="block text-sm font-bold">Account number<input value={bankForm.accountNumber} onChange={(event) => setBankForm({ ...bankForm, accountNumber: event.target.value })} inputMode="numeric" type="password" minLength={4} maxLength={40} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder={editingBank ? 'Enter the new account number' : 'Account number'} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><SubmitButton loading={saveBank.isPending}>{editingBank ? 'Save new bank account' : 'Link bank account'}</SubmitButton>{editingBank && <Button type="button" variant="ghost" onClick={() => { setEditingBank(false); setBankForm(emptyBank); }}>Cancel</Button>}</div></form>}
      </section>

       <section className="mt-6 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
        <SectionHeading eyebrow="Two levels of security" title="Protect your withdrawal access" description="Clerk protects your account. An authenticator code protects this financial action, even if someone gets access to an open browser session." />
        {securityEnabled ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#b8d6ca] bg-[#eff8f3] px-4 py-4 text-sm text-[#2e6957]"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /><div><p className="font-extrabold">Authenticator security enabled</p><p className="mt-1 text-xs">A fresh six-digit code is required for every withdrawal.</p></div></div><Badge tone="success">Protected</Badge></div> : setup ? <div className="rounded-lg border border-[#dfc27a] bg-[#fff7df] p-4 text-[#765817]"><p className="text-sm font-extrabold">Add this account to your authenticator app</p><p className="mt-2 break-all font-mono text-xs">{setup.secret}</p><p className="mt-2 text-xs leading-5">Use the setup link in a compatible authenticator app, or enter the secret manually. Setup expires shortly.</p><form onSubmit={confirm} className="mt-4 flex flex-wrap gap-3"><input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="Current 6-digit code" className="h-10 rounded-lg border border-[#dfc27a] bg-[#fffdf5] px-3 font-mono text-sm outline-none focus:border-[#a2772e]" /><Button type="submit" disabled={confirmSetup.isPending}>{confirmSetup.isPending ? 'Confirming…' : 'Enable security'}</Button></form></div> : <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#dfc27a] bg-[#fff7df] px-4 py-4 text-sm text-[#765817]"><div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5" /><div><p className="font-extrabold">Authenticator setup required</p><p className="mt-1 text-xs">Set up a separate code before your first withdrawal.</p></div></div><Button type="button" onClick={startSetup} disabled={beginSetup.isPending}>{beginSetup.isPending ? 'Starting…' : 'Set up authenticator'}</Button></div>}
      </section>

        {securityEnabled && linkedAccount && <section className="mt-6 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="New TS Pay request" title="Send available earnings" description={`Your balance is reserved immediately. Requests are submitted in ${currencySettings.data?.currency ?? 'USD'} to the linked bank destination.`} /><form onSubmit={requestWithdrawal} className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-bold">Amount ({currencySettings.data?.currency ?? 'USD'})<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="100.00" /></label><div className="rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-4 py-3 text-sm"><p className="font-bold">Payout destination</p><p className="mt-1 text-xs text-[#697687]">{linkedAccount.bankName} · ending {linkedAccount.accountLast4}</p></div><label className="block text-sm font-bold md:col-span-2">Authenticator code<input value={totpCode} onChange={(event) => setTotpCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required className="mt-2 h-11 w-full max-w-sm rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="123456" /></label><div className="md:col-span-2"><SubmitButton loading={createWithdrawal.isPending}>Request TS Pay withdrawal</SubmitButton></div></form></section>}
      {!hasBank && <div className="mt-6"><Notice title="Link a bank account to unlock withdrawals">Your available balance stays safe until you add a payout destination above.</Notice></div>}

      <section className="mt-6"><SectionHeading eyebrow="Withdrawal history" title="Your requests" description="Pending and approved amounts stay reserved until rejected or marked paid." />{withdrawals.data.length ? <div className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{withdrawals.data.map((withdrawal) => <div key={withdrawal.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><ShieldCheck className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-bold">Withdrawal #{withdrawal.id}</p><Badge tone={withdrawal.status === 'paid' ? 'success' : withdrawal.status === 'rejected' ? 'danger' : withdrawal.status === 'approved' ? 'info' : 'warning'}>{withdrawal.status}</Badge></div><p className="mt-1 truncate text-xs text-[#697687]">{withdrawal.bankName} · ending {withdrawal.accountLast4} · {dateLabel(withdrawal.createdAt)}</p>{withdrawal.reviewNote && <p className="mt-1 text-xs italic text-[#697687]">“{withdrawal.reviewNote}”</p>}</div><p className="font-mono text-sm font-bold">{money(withdrawal.amount, withdrawal.currency)}</p></div>)}</div></div> : <EmptyState title="No withdrawals yet" description="Once you have paid or fulfilled sales, your available balance can be requested here." />}</section>
    </div>
  </AppShell>;
}