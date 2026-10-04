import { useEffect,useState } from "react";
import { ArrowRight, CreditCard, ShieldCheck } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { AppShell } from "@/components/app-shell";
import { Badge,Button,LoadingState,Notice } from "@/components/primitives";
import { useRoute,Link } from "wouter";

export default function PublicSubscription(){
 const [,params]=useRoute("/subscribe/:id");const [plan,setPlan]=useState<any>(null),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[name,setName]=useState(""),[email,setEmail]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!params?.id)return;void customFetch<{plan:any}>("/api/public/customer-subscription-plans/"+encodeURIComponent(params.id),{responseType:"json"}).then(x=>setPlan(x.plan)).catch(e=>setMessage(e instanceof Error?e.message:"Plan could not be loaded.")).finally(()=>setLoading(false));},[params?.id]);
 const subscribe=async()=>{if(!plan||!name.trim()||!email.trim())return;setBusy(true);setMessage("");try{const r=await customFetch<any>("/api/public/customer-subscriptions/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planId:plan.id,customerName:name.trim(),customerEmail:email.trim(),idempotencyKey:crypto.randomUUID()}),responseType:"json"});sessionStorage.setItem("lunavo_subscription_token",r.manageToken);if(r.paymentUrl)window.location.assign(r.paymentUrl);else setMessage("Subscription created. Open the subscription portal to complete payment.");}catch(e){setMessage(e instanceof Error?e.message:"Subscription could not be started.");}finally{setBusy(false);}};
 if(loading)return <AppShell><LoadingState label="Loading subscription plan"/></AppShell>;
 if(!plan)return <AppShell><div className="mx-auto max-w-xl py-16"><Notice title="Subscription unavailable" tone="danger">{message||"This plan is not available."}</Notice></div></AppShell>;
 return <AppShell><div className="mx-auto max-w-2xl py-10">
  <section className="overflow-hidden rounded-3xl border border-[#d9d2c4] bg-[#fbfaf6] shadow-[0_25px_70px_rgba(31,43,56,.08)]">
   <div className="bg-[#182333] p-7 text-[#f8f3e8] md:p-9"><div className="flex items-start justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">{plan.store_name}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em]">{plan.name}</h1><p className="mt-2 text-sm text-[#bcc6d0]">{plan.description||"Recurring customer access."}</p></div><Badge tone="success"><ShieldCheck className="mr-1 inline h-3.5 w-3.5"/>Verified billing</Badge></div></div>
   <div className="p-7 md:p-9"><div className="rounded-2xl border border-[#ded8cd] bg-[#f7f4ed] p-5"><p className="font-mono text-3xl font-black">{(Number(plan.amount_minor)/100).toFixed(2)} {plan.currency}</p><p className="mt-1 text-sm text-[#697687]">Every {plan.interval_count} {plan.interval_unit}{Number(plan.interval_count)===1?"":"s"}. Cancel any time from your customer portal.</p></div>
    {message&&<div className="mt-5"><Notice title="Subscription">{message}</Notice></div>}
    <div className="mt-6 grid gap-4"><label className="text-sm font-bold">Full name<input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/></label><label className="text-sm font-bold">Email address<input autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={240} className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/></label></div>
    <Button onClick={()=>void subscribe()} disabled={busy||!name.trim()||!email.trim()} className="mt-6 w-full py-3.5">{busy?"Preparing secure checkout…":<>Subscribe with Flutterwave <CreditCard className="h-4 w-4"/></>}</Button>
    <div className="mt-4 flex items-center justify-between gap-4 text-xs text-[#697687]"><span>Payment is verified server-side before access changes.</span><Link href="/subscription-portal" className="font-extrabold text-[#a34c35] underline">Existing subscriber</Link></div>
   </div>
  </section>
 </div></AppShell>;
}