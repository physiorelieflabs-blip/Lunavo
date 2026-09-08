import { useEffect, useState } from 'react';
import { BadgeCheck, BookOpen, Gift, Layers3, Megaphone, PackageCheck, Percent, Sparkles, UsersRound, WalletCards } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Notice, SectionHeading, LoadingState } from '@/components/primitives';

type AutoDsResponse = {
  settings: { enabled:boolean; mode:string; autoAllocateSupplierCost:boolean; requireApprovalBeforeExternalOrder:boolean; minimumMarginPercent:string|number; defaultCarrier:string|null };
  capabilities: { automaticInternalRouting:boolean; automaticSupplierApiOrdering:boolean; reason:string };
  jobs: Array<{ id:string; orderId:number; status:string; mode:string; currency:string|null; createdAt:string; lastError:string|null }>;
};

type Discount = { id:number; code:string; kind:string; value:string; active:boolean; usageCount:number; usageLimit:number|null; currency:string|null };

export default function CommerceSuite() {
  const [data,setData]=useState<AutoDsResponse|null>(null);
  const [discounts,setDiscounts]=useState<Discount[]>([]);
  const [enabled,setEnabled]=useState(false);
  const [mode,setMode]=useState<'assisted'|'auto'>('assisted');
  const [autoAllocate,setAutoAllocate]=useState(false);
  const [approval,setApproval]=useState(true);
  const [margin,setMargin]=useState('10');
  const [carrier,setCarrier]=useState('');
  const [code,setCode]=useState('');
  const [value,setValue]=useState('10');
  const [kind,setKind]=useState<'percentage'|'fixed'>('percentage');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  const load=async()=>{
    setLoading(true);
    try{
      const [auto,discount] = await Promise.all([
        customFetch<AutoDsResponse>('/api/automation/auto-ds'),
        customFetch<{codes:Discount[]}>('/api/commerce/discount-codes')
      ]);
      setData(auto); setDiscounts(discount.codes);
      setEnabled(auto.settings.enabled); setMode(auto.settings.mode==='auto'?'auto':'assisted');
      setAutoAllocate(auto.settings.autoAllocateSupplierCost); setApproval(auto.settings.requireApprovalBeforeExternalOrder);
      setMargin(String(auto.settings.minimumMarginPercent)); setCarrier(auto.settings.defaultCarrier??'');
    } catch(e){setMessage(e instanceof Error?e.message:'Commerce Suite could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const saveAutoDs=async()=>{
    setSaving(true);setMessage('');
    try{
      await customFetch('/api/automation/auto-ds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled,mode,autoAllocateSupplierCost:autoAllocate,requireApprovalBeforeExternalOrder:approval,minimumMarginPercent:Number(margin),defaultCarrier:carrier})});
      setMessage('Auto-DS settings saved.'); await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Auto-DS settings could not be saved.');}
    finally{setSaving(false);}
  };

  const createDiscount=async()=>{
    try{
      await customFetch('/api/commerce/discount-codes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,value:Number(value),kind})});
      setCode(''); setMessage('Discount code created.'); await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Discount code could not be created.');}
  };

  if(loading)return <AppShell><LoadingState label="Loading Commerce Suite" /></AppShell>;

  return <AppShell>
    <div className="mx-auto max-w-[1240px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">TS Commerce Suite</p><h1 className="mt-2 text-4xl font-extrabold tracking-[-.07em]">More commerce, fewer disconnected apps.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#697687]">One control surface for automated fulfillment, promotions, loyalty, affiliates, digital products and growth operations.</p></div><Badge tone="success">Production commerce controls</Badge></div>
      {message&&<div className="mt-6"><Notice tone={message.includes('could not')||message.includes('unavailable')?'danger':'success'} title="Commerce Suite">{message}</Notice></div>}

      <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">Auto-DS</p><h2 className="mt-2 text-2xl font-extrabold">Automatically route paid supplier orders.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#b8c2cc]">When a supplier-backed order is genuinely paid and verified, TS Commerce can create a fulfillment job automatically. This removes repetitive internal work while keeping external supplier checkout honest.</p></div><PackageCheck className="h-7 w-7 text-[#d6aa46]" /></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="rounded-xl border border-[#536174] bg-[#243344] p-4 text-sm font-bold">Enabled<select value={enabled?'yes':'no'} onChange={e=>setEnabled(e.target.value==='yes')} className="mt-2 h-10 w-full rounded-lg bg-[#1b2a39] px-3 text-[#f8f3e8]"><option value="no">Off</option><option value="yes">On</option></select></label>
          <label className="rounded-xl border border-[#536174] bg-[#243344] p-4 text-sm font-bold">Operating mode<select value={mode} onChange={e=>setMode(e.target.value as 'assisted'|'auto')} className="mt-2 h-10 w-full rounded-lg bg-[#1b2a39] px-3 text-[#f8f3e8]"><option value="assisted">Assisted</option><option value="auto">Auto routing</option></select></label>
          <label className="rounded-xl border border-[#536174] bg-[#243344] p-4 text-sm font-bold">Minimum margin %<input value={margin} onChange={e=>setMargin(e.target.value)} type="number" min="0" max="100" step="0.01" className="mt-2 h-10 w-full rounded-lg bg-[#1b2a39] px-3 text-[#f8f3e8]"/></label>
          <label className="rounded-xl border border-[#536174] bg-[#243344] p-4 text-sm font-bold">Default carrier<input value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="Optional" className="mt-2 h-10 w-full rounded-lg bg-[#1b2a39] px-3 text-[#f8f3e8]"/></label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="flex gap-3 rounded-xl border border-[#536174] bg-[#243344] p-4 text-sm font-bold"><input type="checkbox" checked={approval} onChange={e=>setApproval(e.target.checked)}/>Require approval before any external supplier order</label><label className="flex gap-3 rounded-xl border border-[#536174] bg-[#243344] p-4 text-sm font-bold"><input type="checkbox" checked={autoAllocate} onChange={e=>setAutoAllocate(e.target.checked)}/>Allow recorded supplier-cost allocation when the merchant explicitly enables it</label></div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={saveAutoDs} disabled={saving} className="bg-[#d6aa46] text-[#182333] hover:bg-[#e0b95d]">{saving?'Saving…':'Save Auto-DS settings'}</Button><p className="text-xs leading-5 text-[#aeb9c4]">{data?.capabilities.reason}</p></div>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Promotions" title="Discount codes" description="Create reusable percentage or fixed-value codes for your promotion strategy." /><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px_140px_auto]"><input value={code} onChange={e=>setCode(e.target.value)} placeholder="WELCOME10" className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><select value={kind} onChange={e=>setKind(e.target.value as 'percentage'|'fixed')} className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"><option value="percentage">%</option><option value="fixed">Fixed</option></select><input value={value} onChange={e=>setValue(e.target.value)} type="number" min="0.01" className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><Button onClick={createDiscount} disabled={!code.trim()}>Create</Button></div><div className="mt-5 space-y-2">{discounts.length?discounts.map(d=><div key={d.id} className="flex items-center justify-between rounded-xl border border-[#d9d2c4] p-3"><div><p className="text-sm font-extrabold">{d.code}</p><p className="text-xs text-[#697687]">{d.kind==='percentage'?d.value+'%':d.value+' '+(d.currency??'')} · {d.usageCount} uses</p></div><Badge tone={d.active?'success':'neutral'}>{d.active?'Active':'Inactive'}</Badge></div>):<p className="text-sm text-[#697687]">No discount codes yet.</p>}</div></div>

        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Creator commerce" title="Digital products & courses" description="Selar-style digital delivery foundations: digital products, courses, memberships, files, curriculum, drip access and certificates." /><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f7f4ed] p-4"><BookOpen className="h-5 w-5 text-[#315e6c]"/><p className="mt-2 text-sm font-extrabold">Courses</p><p className="mt-1 text-xs text-[#697687]">Sections, lessons, video links, previews and certificates.</p></div><div className="rounded-xl bg-[#f7f4ed] p-4"><Gift className="h-5 w-5 text-[#a2772e]"/><p className="mt-2 text-sm font-extrabold">Digital delivery</p><p className="mt-1 text-xs text-[#697687]">Downloadable assets and customer entitlements.</p></div><div className="rounded-xl bg-[#f7f4ed] p-4"><UsersRound className="h-5 w-5 text-[#8a6826]"/><p className="mt-2 text-sm font-extrabold">Memberships</p><p className="mt-1 text-xs text-[#697687]">Membership-style access is modeled for the commerce engine.</p></div><div className="rounded-xl bg-[#f7f4ed] p-4"><Layers3 className="h-5 w-5 text-[#315e6c]"/><p className="mt-2 text-sm font-extrabold">Creator catalog</p><p className="mt-1 text-xs text-[#697687]">Products can be classified as digital, course, membership or service.</p></div></div></div>

        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Partner growth" title="Affiliate-ready product network" description="Create merchant affiliate offers with configurable commission rates and track clicks/conversions in the commerce layer." /><div className="mt-5 grid gap-3"><div className="flex items-center gap-3 rounded-xl bg-[#f7f4ed] p-4"><Megaphone className="h-5 w-5 text-[#a2772e]"/><p className="text-sm font-extrabold">Commission-driven promotion</p></div><div className="flex items-center gap-3 rounded-xl bg-[#f7f4ed] p-4"><BadgeCheck className="h-5 w-5 text-[#315e6c]"/><p className="text-sm font-extrabold">Reviewable merchant offers</p></div><p className="text-xs leading-5 text-[#697687]">This layer is intentionally reviewable: commission payout should only be created from an attributable, verified sale.</p></div></div>

        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Retention" title="Loyalty, gifts and saved shopping" description="The data model now supports loyalty balances/transactions, gift cards, saved carts and wishlists so these can grow into full customer self-service." /><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f7f4ed] p-4"><Percent className="h-5 w-5 text-[#a2772e]"/><p className="mt-2 text-sm font-extrabold">Loyalty points</p></div><div className="rounded-xl bg-[#f7f4ed] p-4"><Gift className="h-5 w-5 text-[#315e6c]"/><p className="mt-2 text-sm font-extrabold">Gift cards</p></div><div className="rounded-xl bg-[#f7f4ed] p-4"><Sparkles className="h-5 w-5 text-[#8a6826]"/><p className="mt-2 text-sm font-extrabold">Wishlists</p></div><div className="rounded-xl bg-[#f7f4ed] p-4"><WalletCards className="h-5 w-5 text-[#315e6c]"/><p className="mt-2 text-sm font-extrabold">Saved carts</p></div></div></div>
      </section>

      <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Recent automation" title="Fulfillment jobs" description="Verified supplier-backed orders that entered the Auto-DS orchestration layer." />{data?.jobs?.length?<div className="mt-4 space-y-2">{data.jobs.map(j=><div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9d2c4] p-4"><div><p className="text-sm font-extrabold">Order #{j.orderId}</p><p className="mt-1 text-xs text-[#697687]">{j.mode} · {j.currency??'currency pending'} · {new Date(j.createdAt).toLocaleString()}</p></div><Badge tone={j.status==='approved'?'success':'warning'}>{j.status}</Badge></div>)}</div>:<p className="mt-4 text-sm text-[#697687]">No Auto-DS jobs yet. Turn Auto-DS on and complete a verified supplier-backed order to create one.</p>}</section>

      <div className="mt-8 rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-5 text-sm leading-6 text-[#315e6c]">Shopify currently combines B2B, checkout, order fulfillment, shipping, returns, POS, analytics and international selling, while Selar emphasizes digital products, courses and affiliate commerce. TS Commerce is being built to combine those categories rather than depend on separate apps. citeturn525542search6turn525542search3turn525542search0turn254755search0turn254755search5</div>
    </div>
  </AppShell>;
}
