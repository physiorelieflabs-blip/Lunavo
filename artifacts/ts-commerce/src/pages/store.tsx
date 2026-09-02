import { FormEvent, useState } from 'react';
import { useUser } from '@clerk/react';
import { ExternalLink, Store as StoreIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetDashboardOverviewQueryKey,
  useCreateStore,
  useGetDashboardOverview,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';

export default function StorePage() {
  const overview = useGetDashboardOverview();
  const { user } = useUser();
  const createStore = useCreateStore();
  const queryClient = useQueryClient();
  const [storeName, setStoreName] = useState('');
  const [message, setMessage] = useState('');

  if (overview.isLoading) return <AppShell><LoadingState label="Loading store workspace" /></AppShell>;
  if (overview.isError || !overview.data) return <AppShell><ErrorState onRetry={() => { void overview.refetch(); }} /></AppShell>;

  const store = overview.data;
  const currentName = store.storeName;
  const value = storeName || currentName;
  const save = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    createStore.mutate({ data: { storeName: value } }, {
      onSuccess: (result) => {
        setStoreName(result.storeName);
        setMessage('Your store is live and the new name is saved to your merchant workspace.');
        void queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      },
      onError: () => setMessage('Store name could not be saved. Use 2 to 80 characters and try again.'),
    });
  };

  return <AppShell>
    <div className="mx-auto max-w-[900px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Merchant storefront</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Create your store.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Give your customer-facing workspace a name. This is persisted to your tenant and appears across your dashboard and public checkout.</p>
        </div>
        <Badge tone="success"><StoreIcon className="mr-1 h-3.5 w-3.5" /> Live</Badge>
      </div>

      {message && <div className="mt-7"><Notice tone={message.includes('could not') ? 'danger' : 'success'} title={message.includes('could not') ? 'Store not saved' : 'Store saved'}>{message}</Notice></div>}

      <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
        <SectionHeading eyebrow="Store identity" title="Make the storefront yours" description="You can change this later. Existing orders and historical money are not renamed or altered." />
        <form onSubmit={save} className="space-y-5">
          <label className="block text-sm font-bold">Store name
            <input value={value} onChange={(event) => setStoreName(event.target.value)} minLength={2} maxLength={80} required className="mt-2 h-12 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-base font-bold outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="input-store-name" />
          </label>
          <div className="grid gap-4 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4 text-sm sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-[.12em] text-[#697687]">Store slug</p><p className="mt-2 font-mono font-bold">/{store.storeSlug}</p></div>
            <div><p className="text-xs uppercase tracking-[.12em] text-[#697687]">Workspace status</p><p className="mt-2 font-bold text-[#2f6958]">Authenticated and tenant-owned</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton loading={createStore.isPending}>Save store</SubmitButton>
            {user?.id && <Link href={`/checkout/${user.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d9d2c4] px-4 text-sm font-extrabold text-[#536174] hover:bg-[#f7f4ed]" data-testid="link-preview-store">Preview checkout <ExternalLink className="h-4 w-4" /></Link>}
          </div>
        </form>
      </section>
    </div>
  </AppShell>;
}