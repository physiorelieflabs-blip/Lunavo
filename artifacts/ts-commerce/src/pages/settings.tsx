import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { ArrowRight, Bell, CreditCard, LockKeyhole, Mail, MapPin, Save, ShieldCheck, Store, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getGetCheckoutSettingsQueryKey, getGetCurrencySettingsQueryKey, useGetCheckoutSettings, useGetCurrencySettings, useUpdateCheckoutSettings, useUpdateCurrencySettings } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';

const groups = [
  {
    eyebrow: 'Workspace',
    title: 'Store and access',
    description: 'Keep your public store identity and team permissions in one place.',
    items: [
      { href: '/store', label: 'Store profile', detail: 'Name, contact details, address, tax, and shipping', icon: Store },
      { href: '/team', label: 'Team & locations', detail: 'Staff access, roles, operating locations, and invitations', icon: UsersRound },
    ],
  },
  {
    eyebrow: 'Money',
    title: 'Payments and payouts',
    description: 'Review what is owed, what is available, and where withdrawals are protected.',
    items: [
      { href: '/billing', label: 'Subscription billing', detail: 'Pay from bank or pay from dashboard', icon: CreditCard },
      { href: '/finance', label: 'Finance', detail: 'Payment evidence, refunds, links, and reconciliation', icon: WalletCards },
      { href: '/withdrawals', label: 'Payout security', detail: 'Bank destination, PINs, authenticator, and withdrawals', icon: LockKeyhole },
    ],
  },
  {
    eyebrow: 'Operations',
    title: 'Commerce preferences',
    description: 'Jump directly to the controls that shape daily store operations.',
    items: [
      { href: '/inventory', label: 'Inventory', detail: 'Stock, reservations, adjustments, and movement history', icon: MapPin },
      { href: '/activity', label: 'Notifications & activity', detail: 'Ledger events, approvals, and operational history', icon: Bell },
    ],
  },
];

export default function Settings() {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const currencySettings = useGetCurrencySettings({
    query: {
      queryKey: getGetCurrencySettingsQueryKey(),
      enabled: isLoaded && !!user,
    },
  });
  const updateCurrency = useUpdateCurrencySettings();
  const checkoutSettings = useGetCheckoutSettings({
    query: {
      queryKey: getGetCheckoutSettingsQueryKey(),
      enabled: isLoaded && !!user,
    },
  });
  const updateCheckout = useUpdateCheckoutSettings();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [messageIsError, setMessageIsError] = useState(false);
  const [currency, setCurrency] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [shippingFee, setShippingFee] = useState('');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('');
  const [commerceMessage, setCommerceMessage] = useState('');
  const [commerceMessageIsError, setCommerceMessageIsError] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setUsername(user.username ?? '');
  }, [user?.id]);

  useEffect(() => {
    if (!currencySettings.data) return;
    setCurrency(currencySettings.data.currency);
  }, [currencySettings.data]);

  useEffect(() => {
    if (!checkoutSettings.data) return;
    setTaxRate(String(checkoutSettings.data.taxRate));
    setShippingFee(String(checkoutSettings.data.shippingFee));
    setFreeShippingThreshold(
      checkoutSettings.data.freeShippingThreshold === null
        ? ''
        : String(checkoutSettings.data.freeShippingThreshold),
    );
  }, [checkoutSettings.data]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setMessage('');
    setMessageIsError(false);
    setSaving(true);
    try {
      const nextFirstName = firstName.trim();
      const nextLastName = lastName.trim();
      const nextUsername = username.trim();
      const currentFirstName = user.firstName ?? '';
      const currentLastName = user.lastName ?? '';
      const currentUsername = user.username ?? '';
      const changed: string[] = [];
      const failures: string[] = [];

       if (nextFirstName !== currentFirstName) {
        try {
           const updatedUser = await user.update({ firstName: nextFirstName });
          setFirstName(updatedUser.firstName ?? '');
           changed.push('first name');
        } catch (error) {
           failures.push(`Your first name could not be changed. ${getApiErrorMessage(error, 'The first-name profile attribute may be disabled for this account.')}`);
         }
       }

       if (nextLastName !== currentLastName) {
         try {
           const updatedUser = await user.update({ lastName: nextLastName });
           setLastName(updatedUser.lastName ?? '');
           changed.push('last name');
         } catch (error) {
           failures.push(`Your last name could not be changed. ${getApiErrorMessage(error, 'The last-name profile attribute may be disabled for this account.')}`);
        }
      }

      if (nextUsername !== currentUsername) {
        try {
          const updatedUser = await user.update({ username: nextUsername || null });
          setUsername(updatedUser.username ?? '');
          changed.push('username');
        } catch (error) {
         failures.push(`Your username could not be changed. ${getApiErrorMessage(error, 'Usernames may be disabled for this account or already taken.')}`);
        }
      }

      const reloadedUser = await user.reload();
      setFirstName(reloadedUser.firstName ?? '');
      setLastName(reloadedUser.lastName ?? '');
      setUsername(reloadedUser.username ?? '');
      if (failures.length) {
        setMessageIsError(true);
        setMessage(`${changed.length ? `${changed.join(' and ')} saved. ` : ''}${failures.join(' ')}`);
      } else if (changed.length) {
        setMessage('Your account details have been updated.');
      } else {
        setMessage('No account details were changed.');
      }
    } catch (error) {
      setMessageIsError(true);
      setMessage(getApiErrorMessage(error, 'Your account details could not be updated.'));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setCommerceMessage('');
    setCommerceMessageIsError(false);
    const nextPassword = newPassword;
    if (nextPassword.length < 8) {
      setCommerceMessageIsError(true);
      setCommerceMessage('Password must be at least 8 characters long.');
      return;
    }
    if (nextPassword !== confirmPassword) {
      setCommerceMessageIsError(true);
      setCommerceMessage('The new password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await user.updatePassword({
        newPassword: nextPassword,
        ...(currentPassword.trim() ? { currentPassword: currentPassword.trim() } : {}),
        signOutOfOtherSessions: true,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCommerceMessage('Password updated. Other active sessions were signed out.');
    } catch (error) {
      setCommerceMessageIsError(true);
      setCommerceMessage(getApiErrorMessage(error, 'Password could not be updated. Check your current password and try again.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const saveCurrency = async () => {
    setCommerceMessage('');
    setCommerceMessageIsError(false);
    if (!currency) {
      setCommerceMessageIsError(true);
      setCommerceMessage('Choose a settlement currency before saving.');
      return;
    }
    try {
      const result = await updateCurrency.mutateAsync({ data: { currency } });
      setCurrency(result.currency);
      setCommerceMessage(`Settlement currency saved as ${result.currency}. Historical orders remain unchanged.`);
      await Promise.all([
        currencySettings.refetch(),
        checkoutSettings.refetch(),
        queryClient.invalidateQueries({ queryKey: getGetCurrencySettingsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetCheckoutSettingsQueryKey() }),
      ]);
    } catch (error) {
      setCommerceMessageIsError(true);
      setCommerceMessage(getApiErrorMessage(error, 'Settlement currency could not be saved. Choose one of the supported currencies.'));
    }
  };

  const saveCheckout = async (event: FormEvent) => {
    event.preventDefault();
    setCommerceMessage('');
    setCommerceMessageIsError(false);
    const tax = Number(taxRate);
    const shipping = Number(shippingFee);
    const threshold = freeShippingThreshold.trim() === '' ? null : Number(freeShippingThreshold);
    if (
      !Number.isFinite(tax) || tax < 0 || tax > 100 ||
      !Number.isFinite(shipping) || shipping < 0 ||
      (threshold !== null && (!Number.isFinite(threshold) || threshold < 0))
    ) {
      setCommerceMessageIsError(true);
      setCommerceMessage('Checkout rules could not be saved. Use a tax rate from 0 to 100 and non-negative amounts.');
      return;
    }
    try {
      const result = await updateCheckout.mutateAsync({
        data: { taxRate: tax, shippingFee: shipping, freeShippingThreshold: threshold },
      });
      setTaxRate(String(result.taxRate));
      setShippingFee(String(result.shippingFee));
      setFreeShippingThreshold(result.freeShippingThreshold === null ? '' : String(result.freeShippingThreshold));
      setCommerceMessage('Checkout rules saved. New orders will use these server-calculated values.');
      await Promise.all([
        checkoutSettings.refetch(),
        queryClient.invalidateQueries({ queryKey: getGetCheckoutSettingsQueryKey() }),
      ]);
    } catch (error) {
      setCommerceMessageIsError(true);
      setCommerceMessage(getApiErrorMessage(error, 'Checkout rules could not be saved. Check the values and try again.'));
    }
  };

  if (!isLoaded) return <AppShell><LoadingState label="Loading account settings" /></AppShell>;
  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px]">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Workspace settings</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Everything that keeps your store in order.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Use these shortcuts to manage your store, people, money, security, and operating preferences without hunting through the workspace.</p>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline underline-offset-4">Back to overview <ArrowRight className="h-4 w-4" /></Link>
        </div>

        <section className="mt-9 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <SectionHeading eyebrow="Account profile" title="Your personal details" description="Change the name and username shown across your account. These identity details are managed securely by Clerk." />
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#e9e1cd] text-[#8a6826]"><UserRound className="h-5 w-5" /></span>
          </div>
          <form onSubmit={saveProfile} className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={64} className={inputClass} placeholder="Your first name" /></label>
            <label className="text-sm font-bold">Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={64} className={inputClass} placeholder="Your last name" /></label>
            <label className="text-sm font-bold">Username<span className="ml-1 font-normal text-[#697687]">(optional)</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={64} className={inputClass} placeholder="Choose a username" /></label>
            <div className="rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm">
              <p className="flex items-center gap-2 font-bold"><Mail className="h-4 w-4 text-[#a2772e]" />Primary email</p>
              <p className="mt-1 truncate text-xs text-[#697687]">{user?.primaryEmailAddress?.emailAddress ?? 'No verified email on file'}</p>
              <p className="mt-1 text-[11px] text-[#8994a2]">Email changes and verification are handled by Clerk account security.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <SubmitButton loading={saving}><Save className="h-4 w-4" />Save account details</SubmitButton>
              <a href="#change-password" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline underline-offset-4"><ShieldCheck className="h-4 w-4" />Change password</a>
            </div>
          </form>
           {message && <div className="mt-5" aria-live="polite"><Notice tone={messageIsError ? 'danger' : 'success'} title={messageIsError ? 'Profile not updated' : 'Profile updated'}>{message}</Notice></div>}
        </section>

        <section className="mt-9 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <SectionHeading eyebrow="Settlement" title="Choose your currency" description="This controls new dashboard settlements and withdrawals. Existing orders keep their original currency." />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e9e1cd] text-[#8a6826]"><WalletCards className="h-5 w-5" /></span>
            </div>
            {currencySettings.isError ? <Notice tone="danger" title="Currency settings unavailable">Refresh the page and try again.</Notice> : <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="min-w-[180px] flex-1 text-sm font-bold">Settlement currency
                <select value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={currencySettings.isLoading || updateCurrency.isPending} className={inputClass} aria-label="Settlement currency">
                  {!currency && <option value="">Loading currencies…</option>}
                  {(currencySettings.data?.availableCurrencies ?? (currency ? [currency] : [])).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button type="button" onClick={saveCurrency} disabled={currencySettings.isLoading || updateCurrency.isPending || !currency} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] disabled:cursor-not-allowed disabled:opacity-50">{updateCurrency.isPending ? 'Saving…' : 'Save currency'}<Save className="h-4 w-4" /></button>
            </div>}
          </div>
          <div className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <SectionHeading eyebrow="Customer checkout" title="Tax and shipping defaults" description="These rules are calculated on the server and snapshotted on each new order." />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e9e1cd] text-[#8a6826]"><CreditCard className="h-5 w-5" /></span>
            </div>
            {checkoutSettings.isError ? <Notice tone="danger" title="Checkout settings unavailable">Refresh the page and try again.</Notice> : <form onSubmit={saveCheckout} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-bold">Tax (%)
                  <input value={taxRate} onChange={(event) => setTaxRate(event.target.value)} type="number" min="0" max="100" step="0.01" required className={inputClass} />
                </label>
                <label className="text-sm font-bold">Shipping ({(checkoutSettings.data?.currency ?? currency) || '—'})
                  <input value={shippingFee} onChange={(event) => setShippingFee(event.target.value)} type="number" min="0" step="0.01" required className={inputClass} />
                </label>
                <label className="text-sm font-bold">Free over ({(checkoutSettings.data?.currency ?? currency) || '—'})
                  <input value={freeShippingThreshold} onChange={(event) => setFreeShippingThreshold(event.target.value)} type="number" min="0" step="0.01" placeholder="No threshold" className={inputClass} />
                </label>
              </div>
              <div className="flex justify-end"><SubmitButton loading={updateCheckout.isPending}>Save checkout rules</SubmitButton></div>
            </form>}
          </div>
        </section>
        <section id="change-password" className="mt-9 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <SectionHeading eyebrow="Account security" title="Change your password" description="Use your current password when required by your account. Other active sessions will be signed out after a successful change." />
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#e9e1cd] text-[#8a6826]"><LockKeyhole className="h-5 w-5" /></span>
          </div>
          <form onSubmit={savePassword} className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-bold">Current password <span className="font-normal text-[#697687]">(if required)</span>
              <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" className={inputClass} />
            </label>
            <label className="text-sm font-bold">New password
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" required className={inputClass} />
            </label>
            <label className="text-sm font-bold">Confirm new password
              <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" required className={inputClass} />
            </label>
            <div className="md:col-span-3 flex justify-end">
              <SubmitButton loading={savingPassword}><ShieldCheck className="h-4 w-4" />Update password</SubmitButton>
            </div>
          </form>
        </section>
        {commerceMessage && <div className="mt-5"><Notice tone={commerceMessageIsError ? 'danger' : 'success'} title={commerceMessageIsError ? 'Settings not saved' : 'Settings saved'}>{commerceMessage}</Notice></div>}

        <div className="mt-9 space-y-8">
          {groups.map((group) => (
            <section key={group.title}>
              <SectionHeading eyebrow={group.eyebrow} title={group.title} description={group.description} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map(({ href, label, detail, icon: Icon }) => (
                  <Link key={href} href={href} className="group rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 transition hover:-translate-y-0.5 hover:border-[#bca26a] hover:shadow-[0_12px_25px_rgba(31,39,48,.06)]">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#e9e1cd] text-[#8a6826]"><Icon className="h-5 w-5" /></span>
                      <ArrowRight className="h-4 w-4 text-[#a2772e] transition group-hover:translate-x-1" />
                    </div>
                    <h2 className="mt-5 font-extrabold">{label}</h2>
                    <p className="mt-1 text-xs leading-5 text-[#697687]">{detail}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20';

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) {
    const details = error.errors
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return '';
        const candidate = item as { longMessage?: unknown; message?: unknown };
        return typeof candidate.longMessage === 'string'
          ? candidate.longMessage
          : typeof candidate.message === 'string'
            ? candidate.message
            : '';
      })
      .filter(Boolean)
      .join(' ');
    if (details) return details;
  }
  if (error instanceof Error && error.message && !error.message.includes('Failed to fetch')) {
    return error.message;
  }
  return fallback;
}