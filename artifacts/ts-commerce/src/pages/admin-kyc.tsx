import { useEffect, useState } from 'react';
import { Check, Eye, FileText, RefreshCw, X } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';

type KycRow = {
  id:string; merchantId:number; status:string; legalName:string|null; businessType:string|null; country:string|null;
  submittedAt:string|null; reviewedAt:string|null; rejectionReason:string|null;
  merchantName?:string; merchantEmail?:string; storeName?:string;
};
type KycDetail = KycRow & { governmentIdType:string|null; governmentIdNumber:string|null; documentData:string|null; address:Record<string,unknown> };

export default function AdminKyc() {
  const [rows,setRows]=useState<KycRow[]>([]);
  const [selected,setSelected]=useState<KycDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [rejectionReason,setRejectionReason]=useState('');

  const load=async()=>{
    setLoading(true);
    try {
      const result=await customFetch<{kyc:KycRow[]}>('/api/admin/kyc',{responseType:'json'});
      setRows(result.kyc??[]);
      setMessage('');
    } catch(error) {
      setMessage(error instanceof Error?error.message:'KYC queue could not be loaded.');
    } finally { setLoading(false); }
  };
  useEffect(()=>{void load()},[]);

  const open=async(id:number)=>{
    setBusy(true);
    try {
      const result=await customFetch<{kyc:KycDetail}>(`/api/admin/kyc/${id}`,{responseType:'json'});
      setSelected(result.kyc);
      setRejectionReason(result.kyc.rejectionReason??'');
    } catch(error) {
      setMessage(error instanceof Error?error.message:'KYC record could not be opened.');
    } finally { setBusy(false); }
  };

  const review=async(status:'approved'|'rejected')=>{
    if(!selected)return;
    if(status==='rejected'&&!rejectionReason.trim()){setMessage('Enter a rejection reason before rejecting the application.');return;}
    setBusy(true);
    try {
      await customFetch(`/api/admin/kyc/${selected.merchantId}/review`,{
        method:'POST',headers:{'content-type':'application/json'},credentials:'include',
        body:JSON.stringify({status,rejectionReason:rejectionReason.trim()})
      });
      setMessage(`KYC for merchant #${selected.merchantId} is now ${status}.`);
      setSelected(null);
      await load();
    } catch(error) {
      setMessage(error instanceof Error?error.message:'KYC review could not be completed.');
    } finally { setBusy(false); }
  };

  if(loading)return <AppShell admin><LoadingState label="Loading KYC queue"/></AppShell>;

  return <AppShell admin>
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Master admin · compliance</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Merchant KYC review.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Review payout eligibility from the encrypted merchant verification queue. Sensitive identity data is only revealed after an authenticated admin opens a specific record.</p></div>
        <Button variant="ghost" onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button>
      </div>
      {message&&<div className="mt-6"><Notice tone={message.includes('could not')||message.includes('Enter a')?'danger':'success'} title="KYC review">{message}</Notice></div>}
      <section className="mt-8"><SectionHeading eyebrow="Queue" title="Submitted merchant verifications" description="Pending records require review. Approved records unlock the server-side payout gate."/>
        {rows.length?<div className="overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{rows.map(row=><div key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ece7db] text-[#765817]"><FileText className="h-4 w-4"/></div><div className="min-w-[240px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{row.merchantName??`Merchant #${row.merchantId}`}</p><Badge tone={row.status==='approved'?'success':row.status==='rejected'?'danger':'warning'}>{row.status}</Badge></div><p className="mt-1 text-xs text-[#697687]">{row.merchantEmail??'—'} · {row.legalName??'Legal name not supplied'} · {row.country??'—'}</p></div><p className="text-xs text-[#697687]">{row.submittedAt?new Date(row.submittedAt).toLocaleString():'Not submitted'}</p><Button variant="secondary" onClick={()=>void open(row.merchantId)} disabled={busy}><Eye className="h-4 w-4"/>Review</Button></div>)}</div></div>:<EmptyState title="No KYC submissions" description="Merchant applications will appear here after they submit payout verification."/>}
      </section>
      {selected&&<section className="mt-8 rounded-2xl border border-[#b8d6ca] bg-[#eff8f3] p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#2f6958]">Merchant #{selected.merchantId}</p><h2 className="mt-2 text-2xl font-extrabold">{selected.legalName??'Unnamed legal entity'}</h2><p className="mt-1 text-sm text-[#477563]">{selected.businessType??'—'} · {selected.country??'—'} · {selected.governmentIdType??'Government ID'}</p></div><Badge tone={selected.status==='approved'?'success':selected.status==='rejected'?'danger':'warning'}>{selected.status}</Badge></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-[#c8ded3] bg-white/70 p-4 text-sm"><p className="font-mono text-[10px] uppercase tracking-[.12em] text-[#477563]">Government ID</p><p className="mt-2 font-mono font-bold">{selected.governmentIdNumber??'Unavailable'}</p></div><div className="rounded-xl border border-[#c8ded3] bg-white/70 p-4 text-sm"><p className="font-mono text-[10px] uppercase tracking-[.12em] text-[#477563]">Business address</p><p className="mt-2 leading-6">{Object.values(selected.address??{}).filter(Boolean).join(' · ')||'Unavailable'}</p></div></div>
        <div className="mt-4 rounded-xl border border-[#c8ded3] bg-white/70 p-4">{selected.documentData?<><p className="font-mono text-[10px] uppercase tracking-[.12em] text-[#477563]">Submitted identity document</p><a href={selected.documentData} download={`merchant-${selected.merchantId}-kyc`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#182333] px-4 py-2.5 text-sm font-extrabold text-white"><FileText className="h-4 w-4"/>Open / download document</a></>:<p className="text-sm">No document is available.</p>}</div>
        {selected.status!=='approved'&&<div className="mt-6 rounded-xl border border-[#d9d2c4] bg-white/70 p-4"><label className="block text-sm font-bold">Rejection reason<span className="block text-xs font-normal text-[#697687]">Required only when rejecting.</span><textarea value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm" /></label><div className="mt-4 flex flex-wrap gap-2"><Button onClick={()=>void review('approved')} disabled={busy}><Check className="h-4 w-4"/>Approve KYC</Button><Button variant="danger" onClick={()=>void review('rejected')} disabled={busy}><X className="h-4 w-4"/>Reject</Button><Button variant="ghost" onClick={()=>setSelected(null)}>Close</Button></div></div>}
      </section>}
    </div>
  </AppShell>;
}
