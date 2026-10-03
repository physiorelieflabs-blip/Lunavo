import { type FormEvent, useEffect, useRef, useState } from 'react';
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
  useSetWithdrawalPins,
  customFetch,
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
  const setWithdrawalPins = useSetWithdrawalPins();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [bankForm, setBankForm] = useState<BankForm>(emptyBank);
  const [editingBank, setEditingBank] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [amount, setAmount] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pinSetup, setPinSetup] = useState(['', '']);
  const [withdrawalPins, setWithdrawalPinsInput] = useState(['', '']);
  const [kyc, setKyc] = useState<{status:string;legalName:string|null;country:string|null;governmentIdType:string|null;governmentIdLast4:string|null;rejectionReason:string|null} | null>(null);
  const [kycError, setKycError] = useState('');
  const [kycForm, setKycForm] = useState({ legalName:'', businessType:'', country:'NG', governmentIdType:'national_id', governmentIdNumber:'', addressLine1:'', city:'', state:'', postalCode:'' });
  const [kycDocument, setKycDocument] = useState('');
  const [kycBusy, setKycBusy] = useState(false);
  const pendingWithdrawalRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const loadKyc = async () => {
    try {
      const result = await customFetch<{kyc:any}>('/api/kyc', { responseType:'json' });
      setKyc(result.kyc);
      setKycError('');
    } catch (error) {
      setKycError(error instanceof Error ? error.message : '');
    }
  };

  useEffect(() => { void loadKyc(); }, []);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListWithdrawalsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetWithdrawalSecurityQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetLinkedBankAccountQueryKey() }),
      loadKyc(),
    ]);
  };

   if (security.isLoading || withdrawals.isLoading || linkedBank.isLoading || currencySettings.isLoading) return <AppShell><LoadingState /></AppShell>;
   if (security.isError || withdrawals.isError || linkedBank.isError || currencySettings.isError || !security.data || !withdrawals.data) {
    return <AppShell><ErrorState onRetry={() => { void security.refetch(); void withdrawals.refetch(); void linkedBank.refetch(); }} /></AppShell>;
  }

  const startSetup = () => {
    setMessage('');
    setMessageIsError(false);
    beginSetup.mutate(undefined, {
      onSuccess: (result) => {
        setSetup({ secret: result.secret, otpAuthUri: result.otpAuthUri });
        setMessage('Setup started. Add the secret to an authenticator app, then enter the current six-digit code.');
      },
      onError: (error) => {
        setMessageIsError(true);
        setMessage(error instanceof Error ? error.message : 'Authenticator setup could not start.');
      },
    });
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    confirmSetup.mutate({ data: { code: setupCode } }, {
      onSuccess: () => {
        setSetup(null);
        setSetupCode('');
        setMessage('Withdrawal security is enabled.');
        void refresh();
      },
      onError: (error) => {
        setMessageIsError(true);
        setMessage(error instanceof Error ? error.message : 'That authenticator code was not accepted.');
      },
    });
  };

  const saveBankAccount = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setMessageIsError(false);
    saveBank.mutate({ data: bankForm }, {
      onSuccess: () => {
        setEditingBank(false);
        setBankForm(emptyBank);
        setMessage('Linked bank account saved. New withdrawals will use this destination.');
        void refresh();
      },
      onError: (error) => {
        setMessageIsError(true);
        setMessage(error instanceof Error ? error.message : 'Bank account could not be saved.');
      },
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
        void refresh();
      },
      onError: (error) => {
        setMessageIsError(true);
        setMessage(error instanceof Error ? error.message : 'The linked bank account could not be removed.');
      },
    });
  };

  const requestWithdrawal = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setMessageIsError(false);
    const withdrawalAmount = Number(amount);
    const currency = currencySettings.data?.currency ?? 'USD';
    if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0) {
      setMessageIsError(true);
      setMessage('Enter a withdrawal amount greater than zero.');
      return;
    }
    const fingerprint = `${withdrawalAmount.toFixed(2)}:${currency}`;
    const pending = pendingWithdrawalRef.current;
    const idempotencyKey = pending?.fingerprint === fingerprint
      ? pending.idempotencyKey
      : crypto.randomUUID();
    pendingWithdrawalRef.current = { fingerprint, idempotencyKey };
    try {
      await createWithdrawal.mutateAsync({
        data: {
          amount: withdrawalAmount,
          totpCode,
          pinCodes: withdrawalPins,
          idempotencyKey,
        },
      });
      setMessage('Withdrawal request submitted. It is reserved from your available balance and waiting for review.');
      setAmount('');
      setTotpCode('');
      setWithdrawalPinsInput(['', '']);
      pendingWithdrawalRef.current = null;
      await refresh();
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : 'Withdrawal could not be submitted.');
    }
  };

  const submitKyc = async (event: FormEvent) => {
    event.preventDefault();
    setKycBusy(true);
    setMessage('');
    setMessageIsError(false);
    try {
      if (!kycDocument) throw new Error('Upload a government ID document before submitting KYC.');
      const address = {
        line1: kycForm.addressLine1.trim(),
        city: kycForm.city.trim(),
        state: kycForm.state.trim(),
        postalCode: kycForm.postalCode.trim(),
      };
      if (!address.line1 || !address.city || !address.state) throw new Error('Complete the business address before submitting KYC.');
      await customFetch('/api/kyc', {
        method:'POST',
        headers:{'content-type':'application/json'},
        credentials:'include',
        body:JSON.stringify({
          legalName:kycForm.legalName.trim(),
          businessType:kycForm.businessType.trim(),
          country:kycForm.country.trim().toUpperCase(),
          governmentIdType:kycForm.governmentIdType,
          governmentIdNumber:kycForm.governmentIdNumber.trim(),
          address,
          documentData:kycDocument,
        }),
      });
      setMessage('KYC submitted. Withdrawals remain locked until an administrator approves the review.');
      setKycDocument('');
      setKycForm(current => ({...current, governmentIdNumber:''}));
      await loadKyc();
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : 'KYC submission failed.');
    } finally {
      setKycBusy(false);
    }
  };

  const chooseKycDocument = (file: File | undefined) => {
    if (!file) return;
    if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) {
      setMessageIsError(true);
      setMessage('KYC documents must be PDF, JPEG, PNG, or WebP and no larger than 6 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setKycDocument(reader.result);
    };
    reader.onerror = () => {
      setMessageIsError(true);
      setMessage('The KYC document could not be read.');
    };
    reader.readAsDataURL(file);
  };

  const configurePins = (event: FormEvent) => {
    event.preventDefault();
    setMessageIsError(false);
    setWithdrawalPins.mutate({ data: { pins: pinSetup } }, {
      onSuccess: () => {
        setMessage('Both merchant withdrawal PINs are configured. They are hashed and never shown again.');
        setPinSetup(['', '']);
        refresh();
      },
      onError: (error) => {
        setMessageIsError(true);
        setMessage(error instanceof Error ? error.message : 'PIN setup failed. Enter two different six-digit PINs and try again.');
      },
    });
  };

  const securityEnabled = security.data.enabled;
  const linkedAccount = linkedBank.data;
  const hasBank = Boolean(linkedAccount);
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

       {message && <div className="mt-7"><Notice tone={messageIsError ? 'danger' : 'success'} title={messageIsError ? 'Action not completed' : 'Withdrawal update'}>{message}</Notice></div>}

      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
         <SectionHeading eyebrow="Private withdrawal destination" title="Link your bank account" description="This account is used only for TS Pay withdrawals. Customers always pay through Flutterwave-generated sessions, and your bank details are never published on a storefront. Your account number is encrypted at rest; normal merchant screens show only the last four digits." />
        {linkedAccount && !editingBank ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#b8d6ca] bg-[#eff8f3] px-4 py-4"><div className="flex items-center gap-3 text-[#2e6957]"><ShieldCheck className="h-5 w-5" /><div><p className="text-sm font-extrabold">{linkedAccount.bankName} · ending {linkedAccount.accountLast4}</p><p className="mt-1 text-xs">{linkedAccount.beneficiaryName} · bank code {linkedAccount.bankCode}</p></div></div><div className="flex gap-2"><Button variant="secondary" onClick={editBankAccount}><Pencil className="h-4 w-4" />Change</Button><Button variant="danger" onClick={removeBankAccount} disabled={deleteBank.isPending}><Trash2 className="h-4 w-4" />Remove</Button></div></div> : <form onSubmit={saveBankAccount} className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-bold">Beneficiary name<input value={bankForm.beneficiaryName} onChange={(event) => setBankForm({ ...bankForm, beneficiaryName: event.target.value })} minLength={2} maxLength={160} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" placeholder="Name on the bank account" /></label><label className="block text-sm font-bold">Bank name<input value={bankForm.bankName} onChange={(event) => setBankForm({ ...bankForm, bankName: event.target.value })} minLength={2} maxLength={120} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" placeholder="Your bank" /></label><label className="block text-sm font-bold">Bank code<input value={bankForm.bankCode} onChange={(event) => setBankForm({ ...bankForm, bankCode: event.target.value })} minLength={2} maxLength={40} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="000123" /></label><label className="block text-sm font-bold">Account number<input value={bankForm.accountNumber} onChange={(event) => setBankForm({ ...bankForm, accountNumber: event.target.value })} inputMode="numeric" type="password" minLength={4} maxLength={40} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder={editingBank ? 'Enter the new account number' : 'Account number'} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><SubmitButton loading={saveBank.isPending}>{editingBank ? 'Save new bank account' : 'Link bank account'}</SubmitButton>{editingBank && <Button type="button" variant="ghost" onClick={() => { setEditingBank(false); setBankForm(emptyBank); }}>Cancel</Button>}</div></form>}
      </section>

      <section className="mt-6 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
        <SectionHeading eyebrow="Payout eligibility" title="Complete KYC before your first withdrawal" description="Identity evidence is encrypted at rest. Server-side payout authorization remains locked until an administrator approves your KYC review." />
        {kyc?.status === 'approved' ? (
          <div className="rounded-lg border border-[#b8d6ca] bg-[#eff8f3] px-4 py-4 text-sm text-[#2e6957]">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-extrabold">KYC approved</p><p className="mt-1 text-xs">{kyc.legalName} · {kyc.country} · {kyc.governmentIdType} ending {kyc.governmentIdLast4 ?? '••••'}</p></div><Badge tone="success">Payout eligible</Badge></div>
          </div>
        ) : (
          <>
            {kyc?.status === 'pending' && <Notice title="KYC is under review">Your evidence has been submitted. Withdrawals remain locked until review is approved.</Notice>}
            {kyc?.status === 'rejected' && <div className="mb-4"><Notice tone="danger" title="KYC needs correction">{kyc.rejectionReason || 'Review your details and resubmit your evidence.'}</Notice></div>}
            {!kyc && kycError && <div className="mb-4"><Notice tone="warning" title="KYC setup required">{kycError}</Notice></div>}
            {kyc?.status !== 'pending' && (
              <form onSubmit={submitKyc} className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold">Legal name<input required value={kycForm.legalName} onChange={e=>setKycForm(v=>({...v,legalName:e.target.value}))} maxLength={160} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm" /></label>
                <label className="text-sm font-bold">Business type<input required value={kycForm.businessType} onChange={e=>setKycForm(v=>({...v,businessType:e.target.value}))} maxLength={80} placeholder="Sole proprietor, company, partnership…" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm" /></label>
                <label className="text-sm font-bold">Country<input required value={kycForm.country} onChange={e=>setKycForm(v=>({...v,country:e.target.value.toUpperCase()}))} maxLength={3} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm uppercase" /></label>
                <label className="text-sm font-bold">Government ID type<select value={kycForm.governmentIdType} onChange={e=>setKycForm(v=>({...v,governmentIdType:e.target.value}))} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm"><option value="national_id">National ID</option><option value="passport">Passport</option><option value="drivers_license">Driver&apos;s licence</option><option value="voter_id">Voter ID</option></select></label>
                <label className="text-sm font-bold">Government ID number<input required value={kycForm.governmentIdNumber} onChange={e=>setKycForm(v=>({...v,governmentIdNumber:e.target.value}))} maxLength={120} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm" /></label>
                <label className="text-sm font-bold">Government ID document<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={e=>chooseKycDocument(e.target.files?.[0])} className="mt-2 block w-full text-sm" /><span className="mt-1 block text-xs font-normal text-[#697687]">{kycDocument ? 'Document selected and ready to submit.' : 'PDF/JPEG/PNG/WebP · max 6 MB'}</span></label>
                <label className="text-sm font-bold">Address line<input required value={kycForm.addressLine1} onChange={e=>setKycForm(v=>({...v,addressLine1:e.target.value}))} maxLength={240} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm" /></label>
                <label className="text-sm font-bold">City<input required value={kycForm.city} onChange={e=>setKycForm(v=>({...v,city:e.target.value}))} maxLength={120} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm" /></label>
                <label className="text-sm font-bold">State / region<input required value={kycForm.state} onChange={e=>setKycForm(v=>({...v,state:e.target.value}))} maxLength={120} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm" /></label>
                <label className="text-sm font-bold">Postal code<input value={kycForm.postalCode} onChange={e=>setKycForm(v=>({...v,postalCode:e.target.value}))} maxLength={32} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm" /></label>
                <div className="md:col-span-2"><SubmitButton loading={kycBusy}>{kycBusy ? 'Submitting…' : 'Submit KYC for review'}</SubmitButton></div>
              </form>
            )}
          </>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
        <SectionHeading eyebrow="Two merchant PINs" title="Add a second withdrawal gate" description={`Configure exactly two different six-digit PINs. Current status: ${security.data.merchantPinsConfigured}/2 configured. PINs are hashed and cannot be recovered.`} />
        <form onSubmit={configurePins} className="grid gap-4 md:grid-cols-3">
          {pinSetup.map((pin, index) => <label key={index} className="block text-sm font-bold">Merchant PIN {index + 1}<input type="password" value={pin} onChange={(event) => setPinSetup((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="Six digits" /></label>)}
          <div className="flex items-end"><SubmitButton loading={setWithdrawalPins.isPending}>Save two PINs</SubmitButton></div>
        </form>
      </section>

       <section className="mt-6 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
        <SectionHeading eyebrow="Two levels of security" title="Protect your withdrawal access" description="Clerk protects your account. An authenticator code protects this financial action, even if someone gets access to an open browser session." />
        {securityEnabled ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#b8d6ca] bg-[#eff8f3] px-4 py-4 text-sm text-[#2e6957]"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /><div><p className="font-extrabold">Authenticator security enabled</p><p className="mt-1 text-xs">A fresh six-digit code is required for every withdrawal.</p></div></div><Badge tone="success">Protected</Badge></div> : setup ? <div className="rounded-lg border border-[#dfc27a] bg-[#fff7df] p-4 text-[#765817]"><p className="text-sm font-extrabold">Add this account to your authenticator app</p><p className="mt-2 break-all font-mono text-xs">{setup.secret}</p><p className="mt-2 text-xs leading-5">Use the setup link in a compatible authenticator app, or enter the secret manually. Setup expires shortly.</p><form onSubmit={confirm} className="mt-4 flex flex-wrap gap-3"><input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="Current 6-digit code" className="h-10 rounded-lg border border-[#dfc27a] bg-[#fffdf5] px-3 font-mono text-sm outline-none focus:border-[#a2772e]" /><Button type="submit" disabled={confirmSetup.isPending}>{confirmSetup.isPending ? 'Confirming…' : 'Enable security'}</Button></form></div> : <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#dfc27a] bg-[#fff7df] px-4 py-4 text-sm text-[#765817]"><div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5" /><div><p className="font-extrabold">Authenticator setup required</p><p className="mt-1 text-xs">Set up a separate code before your first withdrawal.</p></div></div><Button type="button" onClick={startSetup} disabled={beginSetup.isPending}>{beginSetup.isPending ? 'Starting…' : 'Set up authenticator'}</Button></div>}
      </section>

        {securityEnabled && linkedAccount && kyc?.status === 'approved' && <section className="mt-6 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="New TS Pay request" title="Send available earnings" description={`Your balance is reserved immediately. Requests are submitted in ${currencySettings.data?.currency ?? 'USD'} to the linked bank destination.`} /><form onSubmit={requestWithdrawal} className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-bold">Amount ({currencySettings.data?.currency ?? 'USD'})<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="100.00" /></label><div className="rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-4 py-3 text-sm"><p className="font-bold">Payout destination</p><p className="mt-1 text-xs text-[#697687]">{linkedAccount.bankName} · ending {linkedAccount.accountLast4}</p></div><label className="block text-sm font-bold md:col-span-2">Authenticator code<input value={totpCode} onChange={(event) => setTotpCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required className="mt-2 h-11 w-full max-w-sm rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="123456" /></label><div className="grid gap-3 md:col-span-2 md:grid-cols-2">{withdrawalPins.map((pin, index) => <label key={index} className="block text-sm font-bold">Withdrawal PIN {index + 1}<input type="password" value={pin} onChange={(event) => setWithdrawalPinsInput((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" placeholder="Six digits" /></label>)}</div><div className="md:col-span-2"><SubmitButton loading={createWithdrawal.isPending}>Request TS Pay withdrawal</SubmitButton></div></form></section>}
      {!hasBank && <div className="mt-6"><Notice title="Link a bank account to unlock withdrawals">Your available balance stays safe until you add a payout destination above.</Notice></div>}

      <section className="mt-6"><SectionHeading eyebrow="Withdrawal history" title="Your requests" description="Pending and approved amounts stay reserved until rejected or marked paid." />{withdrawals.data.length ? <div className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{withdrawals.data.map((withdrawal) => <div key={withdrawal.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><ShieldCheck className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-bold">Withdrawal #{withdrawal.id}</p><Badge tone={withdrawal.status === 'paid' ? 'success' : withdrawal.status === 'rejected' ? 'danger' : withdrawal.status === 'approved' ? 'info' : 'warning'}>{withdrawal.status}</Badge></div><p className="mt-1 truncate text-xs text-[#697687]">{withdrawal.bankName} · ending {withdrawal.accountLast4} · {dateLabel(withdrawal.createdAt)}</p>{withdrawal.reviewNote && <p className="mt-1 text-xs italic text-[#697687]">“{withdrawal.reviewNote}”</p>}</div><p className="font-mono text-sm font-bold">{money(withdrawal.amount, withdrawal.currency)}</p></div>)}</div></div> : <EmptyState title="No withdrawals yet" description="Once you have paid or fulfilled sales, your available balance can be requested here." />}</section>
    </div>
  </AppShell>;
}