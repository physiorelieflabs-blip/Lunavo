import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { ArrowRight, Bell, CreditCard, LockKeyhole, Mail, MapPin, Save, ShieldCheck, Store, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { Link } from 'wouter';
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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setUsername(user.username ?? '');
  }, [user?.id]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setMessage('');
    try {
      await user.update({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        username: username.trim() || null,
      });
      setMessage('Your account details have been updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your account details could not be updated.');
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
              <SubmitButton loading={false}><Save className="h-4 w-4" />Save account details</SubmitButton>
              <Link href="/sign-in/forgot-password" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline underline-offset-4"><ShieldCheck className="h-4 w-4" />Change password</Link>
            </div>
          </form>
          {message && <div className="mt-5"><Notice tone={message.includes('could not') || message.includes('not allowed') ? 'danger' : 'success'} title={message.includes('could not') || message.includes('not allowed') ? 'Profile not updated' : 'Profile updated'}>{message}</Notice></div>}
        </section>

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