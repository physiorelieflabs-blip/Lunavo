import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  UsersRound,
  X,
} from 'lucide-react';
import {
  getGetAdminOverviewQueryKey,
  getListMerchantsQueryKey,
  useGetAdminOverview,
  useReviewBankTransfer,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  Notice,
  SectionHeading,
} from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

export default function Admin() {
  const overview = useGetAdminOverview();
  const review = useReviewBankTransfer();
  const queryClient = useQueryClient();

  const reviewPayment = (id: number, status: 'confirmed' | 'rejected') => {
    const action = status === 'confirmed' ? 'Approve' : 'Reject';
    if (!window.confirm(`${action} this bank transfer? This decision is audited.`)) {
      return;
    }
    const note = window.prompt('Optional review note') ?? undefined;
    review.mutate(
      { id, data: { status, note: note || undefined } },
      {
        onSuccess: () => {
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: getGetAdminOverviewQueryKey(),
            }),
            queryClient.invalidateQueries({
              queryKey: getListMerchantsQueryKey(),
            }),
          ]);
        },
      },
    );
  };

  if (overview.isLoading) {
    return (
      <AppShell admin>
        <LoadingState />
      </AppShell>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <AppShell admin>
        <ErrorState onRetry={() => void overview.refetch()} />
      </AppShell>
    );
  }

  const data = overview.data;
  return (
    <AppShell admin>
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">
              Master admin
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">
              Platform control room
            </h1>
            <p className="mt-2 text-sm text-[#697687]">
              Only verified payments and real merchant records appear here.
            </p>
          </div>
          <Link
            href="/admin/merchants"
            className="rounded-lg bg-[#182333] px-4 py-3 text-sm font-extrabold text-[#f8f3e8] hover:bg-[#25354a]"
            data-testid="link-admin-merchants"
          >
            Manage merchants
          </Link>
        </div>

        {review.isError && (
          <div className="mt-6">
            <Notice tone="danger" title="Review not completed">
              The payment may already have been reviewed. Refresh the page and
              try again.
            </Notice>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Verified revenue"
            value={money(data.platformRevenue)}
            detail="Confirmed platform-fee payments"
            icon={<CircleDollarSign className="h-5 w-5" />}
            accent
          />
          <MetricCard
            label="Subscription revenue"
            value={money(data.subscriptionRevenue)}
            detail="Confirmed settlements"
            icon={<ArrowUpRight className="h-5 w-5" />}
          />
          <MetricCard
            label="Held merchant revenue"
            value={money(data.heldMerchantRevenue)}
            detail="Awaiting merchant settlement"
            icon={<Clock3 className="h-5 w-5" />}
          />
          <MetricCard
            label="Active merchants"
            value={data.activeMerchants.toLocaleString()}
            detail={`${data.suspendedAccounts} suspended accounts`}
            icon={<UsersRound className="h-5 w-5" />}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <section className="rounded-xl border border-[#bca26a] bg-[#f7edd2] p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#85601b]">
                  Attention required
                </p>
                <p
                  className="mt-4 font-mono text-5xl tracking-[-.1em] text-[#182333]"
                  data-testid="value-attention-required"
                >
                  {data.attentionRequired}
                </p>
                <p className="mt-2 text-sm text-[#765817]">
                  accounts need an operational review
                </p>
              </div>
              <CircleAlert className="h-5 w-5 text-[#85601b]" />
            </div>
            <Link
              href="/admin/merchants"
              className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-[#765817] underline"
              data-testid="link-review-attention"
            >
              Review accounts <ArrowUpRight className="h-4 w-4" />
            </Link>
          </section>

          <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
            <SectionHeading
              eyebrow="Payment review"
              title="Subscription payments"
              action={
                <span className="font-mono text-[10px] uppercase tracking-[.1em] text-[#8994a2]">
                  Latest entries
                </span>
              }
            />
            {data.recentPayments.length ? (
              <div className="divide-y divide-[#ded8cd]">
                {data.recentPayments.map((payment) => (
                  <div
                    className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"
                    key={payment.id}
                    data-testid={`payment-${payment.id}`}
                  >
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-extrabold">
                        {payment.merchantName}
                      </p>
                      <p className="mt-1 text-xs text-[#697687]">
                        {payment.method.replaceAll('_', ' ')} ·{' '}
                        {dateLabel(payment.createdAt)}
                      </p>
                      {payment.senderName && (
                        <p className="mt-1 text-xs text-[#697687]">
                          Sender: {payment.senderName} · Ref:{' '}
                          <span className="font-mono">{payment.reference}</span>
                        </p>
                      )}
                      {payment.reviewNote && (
                        <p className="mt-1 text-xs italic text-[#697687]">
                          “{payment.reviewNote}”
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-sm font-medium">
                      {money(payment.amount, payment.currency)}
                    </span>
                    <Badge
                      tone={
                        payment.status === 'confirmed'
                          ? 'success'
                          : payment.status === 'rejected'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {payment.status.replaceAll('_', ' ')}
                    </Badge>
                    {payment.method === 'bank_transfer' &&
                      payment.status === 'under_review' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              reviewPayment(payment.id, 'confirmed')
                            }
                            disabled={review.isPending}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-[#dfeee8] text-[#2f6958] hover:bg-[#cfe4dc] disabled:opacity-50"
                            aria-label={`Approve transfer from ${payment.merchantName}`}
                            data-testid={`button-approve-payment-${payment.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              reviewPayment(payment.id, 'rejected')
                            }
                            disabled={review.isPending}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-[#f6e2de] text-[#a33e38] hover:bg-[#edd1cc] disabled:opacity-50"
                            aria-label={`Reject transfer from ${payment.merchantName}`}
                            data-testid={`button-reject-payment-${payment.id}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No payments recorded"
                description="Real subscription settlements and transfer submissions will appear here."
              />
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}