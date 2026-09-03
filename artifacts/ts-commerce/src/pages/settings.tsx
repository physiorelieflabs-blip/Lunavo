import { ArrowRight, Bell, CreditCard, LockKeyhole, MapPin, Store, UsersRound, WalletCards } from 'lucide-react';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { SectionHeading } from '@/components/primitives';

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