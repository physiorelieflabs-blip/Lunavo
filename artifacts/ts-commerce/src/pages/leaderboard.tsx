import { Trophy } from 'lucide-react';
import { Link } from 'wouter';
import { useGetLeaderboard } from '@workspace/api-client-react';
import { PublicHeader } from '@/components/app-shell';
import { ErrorState, LoadingState } from '@/components/primitives';
import { money } from '@/lib/format';

export default function Leaderboard() {
  const leaderboard = useGetLeaderboard();
  if (leaderboard.isLoading) return <main className="min-h-[100dvh] bg-[#f1eee7] px-5 py-8"><LoadingState label="Loading leaderboard" /></main>;
  if (leaderboard.isError || !leaderboard.data) return <main className="min-h-[100dvh] bg-[#f1eee7] px-5 py-8"><ErrorState onRetry={() => void leaderboard.refetch()} /></main>;
  return <main className="min-h-[100dvh] bg-[#f1eee7] text-[#182333]">
    <PublicHeader />
    <div className="mx-auto max-w-[920px] px-5 pb-16 pt-12 md:px-10">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Verified performance</p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-[-.06em] md:text-6xl">The TS leaderboard.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[#697687]">Published stores ranked by verified sales over the last 30 days. Pending, unverified, refunded, and reversed money never counts.</p>
      <div className="mt-9 overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6]">
        {leaderboard.data.length ? leaderboard.data.map((entry) => <div key={`${entry.merchantId}-${entry.currency}`} className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-[#e9e4da] px-5 py-5 last:border-0 md:grid-cols-[64px_1fr_140px_150px] md:px-7">
          <div className={`grid h-10 w-10 place-items-center rounded-full ${entry.rank <= 3 ? 'bg-[#f4e4b7] text-[#8a6826]' : 'bg-[#eee9df] text-[#697687]'}`}><Trophy className="h-4 w-4" /></div>
          <div><p className="font-extrabold">{entry.storeName}</p><p className="mt-1 text-xs text-[#697687]">{entry.salesCount} verified sale{entry.salesCount === 1 ? '' : 's'} · {entry.periodDays} days</p></div>
          <p className="hidden text-right font-mono text-sm text-[#697687] md:block">{entry.currency}</p>
          <p className="text-right font-mono text-sm font-bold">{money(entry.revenue, entry.currency)}</p>
        </div>) : <div className="px-7 py-12 text-center text-sm text-[#697687]">No verified sales have been recorded in the current period.</div>}
      </div>
      <Link href="/general-store" className="mt-7 inline-flex text-sm font-extrabold text-[#a2772e] underline">Browse the General Store</Link>
    </div>
  </main>;
}