import { type FormEvent, useState } from 'react';
import { Banknote, Check, Eye, LockKeyhole, Pencil, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAdminOverviewQueryKey, getGetCurrencySettingsQueryKey, getGetDashboardOverviewQueryKey, getGetLinkedBankAccountQueryKey, getGetWithdrawalSecurityQueryKey, getListAdminWithdrawalsQueryKey, useBeginWithdrawalSecuritySetup, useConfirmWithdrawalSecuritySetup, useCreateWithdrawal, useDeleteLinkedBankAccount, useGetAdminOverview, useGetCurrencySettings, useGetLinkedBankAccount, useGetWithdrawalSecurity, useListAdminWithdrawals, useRevealWithdrawalDetails, useReviewWithdrawal, useSaveLinkedBankAccount, useSetWithdrawalPins } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

type BankForm = { beneficiaryName: string; bankName: string; bankCode: string; accountNumber: string };
const emptyBank: BankForm = { beneficiaryName: '', bankName: '', bankCode: '', accountNumber: '' };

export default function AdminWithdrawals() {
  const overview = useGetAdminOverview();
  const withdrawals = useListAdminWithdrawals();
  const security = useGetWithdrawalSecurity();
  const linkedBank = useGetLinkedBankAccount();
  const currencySettings = useGetCurrencySettings();
  const beginSetup = useBeginWithdrawalSecuritySetup();
  const confirmSetup = useConfirmWithdrawalSecuritySetup();
  const saveBank = useSaveLinkedBankAccount();
  const deleteBank = useDeleteLinkedBankAccount();
  const createWithdrawal = useCreateWithdrawal();
  const setWithdrawalPins = useSetWithdrawalPins();
  const review = useReviewWithdrawal();
  const reveal = useRevealWithdrawalDetails();
  const queryClient = useQueryClient();
  const [securityCode, setSecurityCode] = useState('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<{ id: number; beneficiaryName: string; bankName: string; bankCode: string; accountNumber: string } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [bankForm, setBankForm] = useState<BankForm>(emptyBank);
  const [editingBank, setEditingBank] = useState(false);
  const [amount, setAmount] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [adminPins, setAdminPins] = useState(['', '', '', '', '']);

  if (overview.isLoading || withdrawals.isLoading || security.isLoading || linkedBank.isLoading || currencySettings.isLoading) return <AppShell admin><LoadingState /></AppShell>;
  if (overview.isError || !overview.data || withdrawals.isError || !withdrawals.data || security.isError || !security.data || linkedBank.isError || currencySettings.isError || !currencySettings.data) return <AppShell admin><ErrorState onRetry={() => { void overview.refetch(); void withdrawals.refetch(); void security.refetch(); void linkedBank.refetch(); void currencySettings.refetch(); }} /></AppShell>;

  const refresh = () => void Promise.all([
    queryClient.invalidateQueries({ queryKey: getListAdminWithdrawalsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetLinkedBankAccountQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetWithdrawalSecurityQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetCurrencySettingsQueryKey() }),
  ]);
  const act = (id: number, status: 'approved' | 'rejected' | 'paid') => {
    const confirmation = window.prompt(`Type ${status.toUpperCase()} WITHDRAWAL ${id} to continue`) ?? '';
    if (!confirmation) return;
    const note = window.prompt('Optional note for the merchant') ?? undefined;
    const settlementReference = status === 'paid'
      ? window.prompt('Enter the bank transfer reference used for this manual payout')?.trim()
      : undefined;
    if (status === 'paid' && !settlementReference) return;
    review.mutate({ id, data: { status, securityCode, pinCodes: adminPins, confirmation, note: note || undefined, settlementReference } }, {
      onSuccess: () => { setMessage(`Withdrawal #${id} is now ${status}.`); refresh(); },
      onError: () => setMessage('Admin action failed. Check your authenticator code, typed confirmation, and the current request status.'),
    });
  };
  const showDetails = (id: number) => {
    const confirmation = window.prompt(`Type VIEW WITHDRAWAL ${id} to reveal transfer details`) ?? '';
    if (!confirmation) return;
    reveal.mutate({ id, data: { securityCode, pinCodes: adminPins, confirmation } }, {
      onSuccess: setDetails,
      onError: () => setMessage('Transfer details stayed locked. Check the authenticator code and confirmation.'),
    });
  };
  const saveAdminBankAccount = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    saveBank.mutate({ data: bankForm }, {
      onSuccess: () => { setEditingBank(false); setBankForm(emptyBank); setMessage('TS Pay admin bank destination saved. New admin withdrawals will use it.'); refresh(); },
      onError: () => setMessage('Admin bank destination could not be saved. Check the details and try again.'),
    });
  };
  const editAdminBankAccount = () => {
    if (!linkedBank.data) return;
    setBankForm({ beneficiaryName: linkedBank.data.beneficiaryName, bankName: linkedBank.data.bankName, bankCode: linkedBank.data.bankCode, accountNumber: '' });
    setEditingBank(true);
  };
  const removeAdminBankAccount = () => {
    if (!window.confirm('Remove the admin bank destination? Existing requests keep their original destination.')) return;
    deleteBank.mutate(undefined, {
      onSuccess: () => { setMessage('Admin bank destination removed. Link another account before requesting a payout.'); refresh(); },
      onError: () => setMessage('The admin bank destination could not be removed.'),
    });
  };
  const startSetup = () => {
    setMessage('');
    beginSetup.mutate(undefined, {
      onSuccess: (result) => { setSetup({ secret: result.secret, otpAuthUri: result.otpAuthUri }); setMessage('Admin authenticator setup started. Add the secret to your authenticator app and enter the current code.'); },
      onError: () => setMessage('Admin authenticator setup could not start. Verify the primary admin email.'),
    });
  };
  const confirmAdminSetup = (event: FormEvent) => {
    event.preventDefault();
    confirmSetup.mutate({ data: { code: setupCode } }, {
      onSuccess: () => { setSetup(null); setSetupCode(''); setMessage('Admin withdrawal security is enabled.'); refresh(); },
      onError: () => setMessage('That admin authenticator code was not accepted.'),
    });
  };
  const requestAdminWithdrawal = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    const normalizedAmount = Number(amount);
    const expected = `REQUEST WITHDRAWAL ${normalizedAmount.toFixed(2)} ${overview.data.currency}`;
    if (confirmation.trim().toUpperCase() !== expected) {
      setMessage(`Type ${expected} exactly to confirm this admin payout.`);
      return;
    }
    createWithdrawal.mutate({ data: { amount: normalizedAmount, currency: overview.data.currency, totpCode, pinCodes: adminPins, confirmation, idempotencyKey: crypto.randomUUID() } }, {
      onSuccess: () => { setMessage('TS Pay admin withdrawal queued. Funds are reserved while the payout is reviewed.'); setAmount(''); setTotpCode(''); setAdminPins(['', '', '', '', '']); setConfirmation(''); refresh(); },
      onError: () => setMessage('Admin withdrawal could not be submitted. Check the available balance, bank destination, authenticator code, and exact confirmation.'),
    });
  };
  const configureAdminPins = (event: FormEvent) => {
    event.preventDefault();
    setWithdrawalPins.mutate({ data: { pins: adminPins } }, {
      onSuccess: () => { setMessage('All five admin withdrawal PINs are configured. They are hashed and never shown again.'); setAdminPins(['', '', '', '', '']); refresh(); },
      onError: () => setMessage('Admin PIN setup failed. Enter five different six-digit PINs and try again.'),
    });
  };
  const securityEnabled = security.data.enabled;
  const linkedAccount = linkedBank.data;
  const adminCurrency = overview.data.currency;
  const expectedConfirmation = amount ? `REQUEST WITHDRAWAL ${Number(amount).toFixed(2)} ${adminCurrency}` : `REQUEST WITHDRAWAL 0.00 ${adminCurrency}`;

  return <AppShell admin>
    <div className="mx-auto max-w-[1320px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Master admin · manual payouts</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Secure withdrawal review.</h1><p className="mt-2 max-w-2xl text-sm text-[#697687]">Five gates protect each admin action: authenticated Clerk session, canonical admin identity, verified primary email, authenticator code, and exact transaction confirmation.</p></div><Button variant="ghost" onClick={() => void withdrawals.refetch()}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
      {message && <div className="mt-6"><Notice tone={message.startsWith('Admin') || message.includes('locked') ? 'danger' : 'success'} title={message.startsWith('Admin') || message.includes('locked') ? 'Action not completed' : 'Withdrawal updated'}>{message}</Notice></div>}
       <section className="mt-8 rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-6 md:p-7" id="admin-ts-pay">
         <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#2f6958]">TS Pay · admin account</p><h2 className="mt-2 text-xl font-extrabold text-[#245746]">Withdraw platform funds</h2><p className="mt-1 max-w-2xl text-sm text-[#477563]">Available TS Pay funds are shown in {adminCurrency}. Link the destination, enable authenticator security, then submit a payout with exact confirmation.</p></div><div className="rounded-lg border border-[#a7cbbb] bg-white/60 px-4 py-3 text-right"><p className="text-[10px] uppercase tracking-[.12em] text-[#477563]">Available</p><p className="mt-1 font-mono text-xl font-extrabold text-[#245746]">{money(overview.data.availableBalance, adminCurrency)}</p><p className="mt-1 text-xs text-[#477563]">Reserved: {money(overview.data.withdrawalReserved, adminCurrency)}</p></div></div>
         <div className="mt-6 rounded-lg border border-[#a7cbbb] bg-white/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3 text-[#2e6957]"><Banknote className="h-5 w-5" /><div><p className="text-sm font-extrabold">Admin bank destination</p>{linkedAccount ? <p className="mt-1 text-xs">{linkedAccount.bankName} · ending {linkedAccount.accountLast4} · {linkedAccount.beneficiaryName}</p> : <p className="mt-1 text-xs">No destination linked yet.</p>}</div></div>{linkedAccount && !editingBank && <div className="flex gap-2"><Button variant="secondary" onClick={editAdminBankAccount}><Pencil className="h-4 w-4" />Change</Button><Button variant="danger" onClick={removeAdminBankAccount} disabled={deleteBank.isPending}><Trash2 className="h-4 w-4" />Remove</Button></div>}</div>{(!linkedAccount || editingBank) && <form onSubmit={saveAdminBankAccount} className="mt-4 grid gap-3 md:grid-cols-2"><label className="block text-sm font-bold">Beneficiary name<input value={bankForm.beneficiaryName} onChange={(event) => setBankForm({ ...bankForm, beneficiaryName: event.target.value })} minLength={2} maxLength={160} required className="mt-2 h-10 w-full rounded-lg border border-[#b8d6ca] bg-white px-3 text-sm outline-none focus:border-[#2f6958]" placeholder="Name on the bank account" /></label><label className="block text-sm font-bold">Bank name<input value={bankForm.bankName} onChange={(event) => setBankForm({ ...bankForm, bankName: event.target.value })} minLength={2} maxLength={120} required className="mt-2 h-10 w-full rounded-lg border border-[#b8d6ca] bg-white px-3 text-sm outline-none focus:border-[#2f6958]" placeholder="Your bank" /></label><label className="block text-sm font-bold">Bank code<input value={bankForm.bankCode} onChange={(event) => setBankForm({ ...bankForm, bankCode: event.target.value })} minLength={2} maxLength={40} required className="mt-2 h-10 w-full rounded-lg border border-[#b8d6ca] bg-white px-3 font-mono text-sm outline-none focus:border-[#2f6958]" placeholder="000123" /></label><label className="block text-sm font-bold">Account number<input value={bankForm.accountNumber} onChange={(event) => setBankForm({ ...bankForm, accountNumber: event.target.value })} type="password" inputMode="numeric" minLength={4} maxLength={40} required className="mt-2 h-10 w-full rounded-lg border border-[#b8d6ca] bg-white px-3 font-mono text-sm outline-none focus:border-[#2f6958]" placeholder={editingBank ? 'Enter the new account number' : 'Account number'} /></label><div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={saveBank.isPending}>{saveBank.isPending ? 'Saving…' : editingBank ? 'Save new destination' : 'Link bank destination'}</Button>{editingBank && <Button type="button" variant="ghost" onClick={() => { setEditingBank(false); setBankForm(emptyBank); }}>Cancel</Button>}</div></form>}</div>
         <div className="mt-4 rounded-lg border border-[#a7cbbb] bg-white/60 p-4">{securityEnabled ? <div className="flex items-center gap-3 text-[#2e6957]"><ShieldCheck className="h-5 w-5" /><div><p className="text-sm font-extrabold">Admin authenticator enabled</p><p className="mt-1 text-xs">A fresh six-digit code is required for this payout.</p></div></div> : setup ? <><p className="text-sm font-extrabold text-[#765817]">Add this secret to your authenticator app</p><p className="mt-2 break-all font-mono text-xs text-[#765817]">{setup.secret}</p><p className="mt-2 break-all text-xs text-[#765817]">{setup.otpAuthUri}</p><form onSubmit={confirmAdminSetup} className="mt-3 flex flex-wrap gap-2"><input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="Current 6-digit code" className="h-10 rounded-lg border border-[#dfc27a] bg-[#fffdf5] px-3 font-mono text-sm outline-none" /><Button type="submit" disabled={confirmSetup.isPending}>{confirmSetup.isPending ? 'Confirming…' : 'Enable admin security'}</Button></form></> : <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3 text-[#765817]"><LockKeyhole className="h-5 w-5" /><div><p className="text-sm font-extrabold">Authenticator setup required</p><p className="mt-1 text-xs">Enable this before requesting platform funds.</p></div></div><Button type="button" onClick={startSetup} disabled={beginSetup.isPending}>{beginSetup.isPending ? 'Starting…' : 'Set up authenticator'}</Button></div>}</div>
         {securityEnabled && linkedAccount && <form onSubmit={requestAdminWithdrawal} className="mt-4 grid gap-3 rounded-lg border border-[#a7cbbb] bg-white/60 p-4 md:grid-cols-2"><label className="block text-sm font-bold">Amount ({adminCurrency})<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-2 h-10 w-full rounded-lg border border-[#b8d6ca] bg-white px-3 font-mono text-sm outline-none focus:border-[#2f6958]" placeholder="100.00" /></label><div className="rounded-lg border border-[#b8d6ca] bg-white px-3 py-2 text-sm"><p className="font-bold">Transfer destination</p><p className="mt-1 text-xs text-[#477563]">{linkedAccount.bankName} · ending {linkedAccount.accountLast4}</p></div><label className="block text-sm font-bold">Authenticator code<input value={totpCode} onChange={(event) => setTotpCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required className="mt-2 h-10 w-full rounded-lg border border-[#b8d6ca] bg-white px-3 font-mono text-sm outline-none focus:border-[#2f6958]" placeholder="123456" /></label><label className="block text-sm font-bold md:col-span-2">Exact confirmation<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required className="mt-2 h-10 w-full rounded-lg border border-[#b8d6ca] bg-white px-3 font-mono text-sm outline-none focus:border-[#2f6958]" placeholder={expectedConfirmation} /><span className="mt-1 block text-xs font-normal text-[#477563]">Type exactly: {expectedConfirmation}</span></label><div className="md:col-span-2"><Button type="submit" disabled={createWithdrawal.isPending}><Banknote className="h-4 w-4" />{createWithdrawal.isPending ? 'Queuing…' : 'Queue TS Pay withdrawal'}</Button></div></form>}
       </section>
      <section className="mt-8 rounded-xl border border-[#dfc27a] bg-[#fff7df] p-5">
        <p className="text-sm font-extrabold text-[#765817]">Admin withdrawal security</p>
        <p className="mt-1 text-xs leading-5 text-[#765817]">Authenticator step-up plus five separate PINs are required before every admin withdrawal action. Current setup: {security.data.adminPinsConfigured}/5. PINs are hashed and never displayed.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {adminPins.map((pin, index) => <label key={index} className="block text-xs font-extrabold text-[#765817]">Admin PIN {index + 1}<input type="password" value={pin} onChange={(event) => setAdminPins((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="Six digits" className="mt-2 h-10 w-full rounded-lg border border-[#dfc27a] bg-[#fffdf5] px-3 font-mono text-sm outline-none focus:border-[#a2772e]" /></label>)}
        </div>
        <Button className="mt-4" variant="secondary" onClick={configureAdminPins} disabled={setWithdrawalPins.isPending || adminPins.some((pin) => !/^[0-9]{6}$/.test(pin))}>{setWithdrawalPins.isPending ? 'Saving…' : 'Save or rotate five PINs'}</Button>
        <label className="mt-5 block text-sm font-bold text-[#765817]">Authenticator code<input value={securityCode} onChange={(event) => setSecurityCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" className="mt-2 h-10 w-full max-w-xs rounded-lg border border-[#dfc27a] bg-[#fffdf5] px-3 font-mono text-sm outline-none focus:border-[#a2772e]" /></label>
      </section>
       <section className="mt-8"><SectionHeading eyebrow="Queue" title="Withdrawal requests" description="This queue is manual by design: only an approved bank transfer with a reference can become settled. Rejected requests release their ledger reservation." />{withdrawals.data.length ? <div className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{withdrawals.data.map((withdrawal) => <div key={withdrawal.id} className="flex flex-wrap items-center gap-4 px-5 py-5"><div className="min-w-[220px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-bold">#{withdrawal.id} · {withdrawal.merchantName}</p><Badge tone={withdrawal.status === 'paid' ? 'success' : withdrawal.status === 'rejected' ? 'danger' : withdrawal.status === 'approved' ? 'info' : 'warning'}>{withdrawal.status}</Badge><span className="text-[10px] font-mono uppercase tracking-[.12em] text-[#697687]">{withdrawal.payoutProvider} · {withdrawal.providerStatus?.replaceAll('_', ' ')}</span></div><p className="mt-1 text-xs text-[#697687]">{withdrawal.merchantEmail} · {withdrawal.bankName} · ending {withdrawal.accountLast4} · {dateLabel(withdrawal.createdAt)}</p>{withdrawal.settlementReference && <p className="mt-1 text-xs font-mono text-[#2f6958]">Bank reference: {withdrawal.settlementReference}</p>}</div><p className="font-mono text-sm font-bold">{money(withdrawal.amount, withdrawal.currency)}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => showDetails(withdrawal.id)} disabled={!securityCode || reveal.isPending}><Eye className="h-4 w-4" />Details</Button>{withdrawal.status === 'pending' && <><Button variant="secondary" onClick={() => act(withdrawal.id, 'approved')} disabled={!securityCode || review.isPending}><Check className="h-4 w-4" />Approve</Button><Button variant="danger" onClick={() => act(withdrawal.id, 'rejected')} disabled={!securityCode || review.isPending}><X className="h-4 w-4" />Reject</Button></>}{withdrawal.status === 'approved' && <><Button onClick={() => act(withdrawal.id, 'paid')} disabled={!securityCode || review.isPending}><Check className="h-4 w-4" />Mark settled</Button><Button variant="danger" onClick={() => act(withdrawal.id, 'rejected')} disabled={!securityCode || review.isPending}><X className="h-4 w-4" />Reject</Button></>}</div></div>)}</div></div> : <EmptyState title="No withdrawal requests" description="New merchant requests will appear here after they complete two-level withdrawal security." />}</section>
      {details && <section className="mt-6 rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-5 text-[#2e6957]"><SectionHeading eyebrow="Unlocked for manual transfer" title={`Withdrawal #${details.id} details`} description="Use these details to complete the approved manual transfer, then mark the request paid." /><div className="grid gap-3 text-sm md:grid-cols-4"><div><p className="text-xs uppercase tracking-[.12em]">Beneficiary</p><p className="mt-1 font-bold">{details.beneficiaryName}</p></div><div><p className="text-xs uppercase tracking-[.12em]">Bank</p><p className="mt-1 font-bold">{details.bankName}</p></div><div><p className="text-xs uppercase tracking-[.12em]">Bank code</p><p className="mt-1 font-mono font-bold">{details.bankCode}</p></div><div><p className="text-xs uppercase tracking-[.12em]">Account</p><p className="mt-1 font-mono font-bold">{details.accountNumber}</p></div></div></section>}
    </div>
  </AppShell>;
}