import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { CheckCircle2, CircleAlert, ClipboardList, ExternalLink, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck, XCircle } from "lucide-react";

type RequestRow = {
  id: string;
  order_id: number;
  request_type: "return" | "exchange";
  quantity: number;
  reason: string;
  customer_message?: string | null;
  status: "pending" | "approved" | "rejected" | "received" | "completed" | "cancelled";
  return_window_days_snapshot: number;
  resolution_note?: string | null;
  inspection_grade?: "resellable" | "damaged" | "unsellable" | null;
  inspection_note?: string | null;
  inspected_at?: string | null;
  refund_record_id?: number | null;
  refund_status?: string | null;
  refund_amount_minor?: string | number | null;
  refund_currency?: string | null;
  refund_inventory_restock?: boolean | null;
  refund_inventory_restock_skip_reason?: string | null;
  created_at: string;
  updated_at: string;
  order_number: string;
  purchased_quantity: number;
  currency: string;
  order_total: string;
  fulfillment_status: string;
  product_title?: string | null;
  customer_name: string;
  customer_email: string;
};
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url,{ credentials:"same-origin", headers:{ Accept:"application/json", ...(init?.headers ?? {}) }, ...init });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(typeof body.error==="string" ? body.error : "The operation failed.");
  return body;
}
const REASON_LABEL: Record<string,string> = {
  damaged:"Arrived damaged",wrong_item:"Wrong item received",not_as_described:"Not as described",
  arrived_late:"Arrived late",changed_mind:"Changed mind",size_fit:"Size or fit issue",other:"Other",
};
const STATUS_CLASS: Record<string,string> = {
  pending:"bg-amber-100 text-amber-900",approved:"bg-blue-100 text-blue-900",
  received:"bg-violet-100 text-violet-900",completed:"bg-emerald-100 text-emerald-900",
  rejected:"bg-red-100 text-red-900",cancelled:"bg-slate-100 text-slate-700",
};
function currencyDigits(currency: string): number {
  try { return new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}
function money(value: string, currency: string) {
  const amount=Number(value); if(!Number.isFinite(amount))return currency+" "+value;
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(amount);}
  catch{return currency+" "+amount.toFixed(2);}
}
function moneyMinor(value: string | number | null | undefined, currency: string) {
  if(value==null||!Number.isFinite(Number(value)))return "Amount unavailable";
  const digits=currencyDigits(currency);
  return money((Number(value)/Math.pow(10,digits)).toFixed(digits),currency);
}
function toMinorUnits(value: string, currency: string): number | null {
  const trimmed=value.trim();
  if(!/^\d+(?:\.\d+)?$/.test(trimmed))return null;
  const digits=currencyDigits(currency);
  const fraction=trimmed.split(".")[1]??"";
  if(fraction.length>digits)return null;
  const amount=Math.round(Number(trimmed)*Math.pow(10,digits));
  return Number.isSafeInteger(amount)&&amount>0?amount:null;
}
type RefundDraft = {
  inspectionGrade: "resellable" | "damaged" | "unsellable";
  refundAmount: string;
  inspectionNote: string;
  restockReturnedItems: boolean;
};
const EMPTY_REFUND_DRAFT: RefundDraft = {
  inspectionGrade:"resellable",refundAmount:"",inspectionNote:"",restockReturnedItems:false,
};
const secondary="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-extrabold hover:bg-muted disabled:opacity-50";
const primary="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2 text-xs font-extrabold text-background disabled:opacity-50";

export default function CustomerReturns() {
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busyId,setBusyId]=useState<string|null>(null);
  const [refundDrafts,setRefundDrafts]=useState<Record<string,RefundDraft>>({});
  const draftFor=(row:RequestRow)=>refundDrafts[row.id]??EMPTY_REFUND_DRAFT;
  const patchRefundDraft=(rowId:string,patch:Partial<RefundDraft>)=>setRefundDrafts(previous=>({
    ...previous,[rowId]:{...(previous[rowId]??EMPTY_REFUND_DRAFT),...patch},
  }));

  const load=useCallback(async(quiet=false)=>{
    if(quiet)setRefreshing(true);else setLoading(true);
    try{
      const result=await api("/api/merchant/order-portal/return-requests?limit=200");
      setRows(Array.isArray(result.requests)?result.requests:[]);
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Return requests could not load.");}
    finally{setLoading(false);setRefreshing(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const act=async(row:RequestRow,action:"approve"|"reject"|"mark_received"|"complete"|"cancel")=>{
    setError("");setNotice("");
    let resolutionNote="";
    if(action==="reject"){
      const answer=window.prompt("Record the reason this return/exchange request is being rejected:");
      if(answer===null)return;
      resolutionNote=answer.trim();
      if(!resolutionNote){setError("A reason is required to reject a request.");return;}
    }
    const confirmation:Record<string,string>={
      approve:"Approve this request for the next returns step? This will not issue a refund or restock inventory.",
      mark_received:"Confirm the returned package was physically received? This will not issue a refund or restock inventory.",
      complete:"Mark the exchange review complete? This records the review only; it does not create a replacement order or shipment.",
      cancel:"Cancel this pending or approved request? This does not refund the customer.",
    };
    if(action!=="reject"&&!window.confirm(confirmation[action]||"Continue?"))return;
    setBusyId(row.id);
    try{
      await api("/api/merchant/order-portal/return-requests/"+encodeURIComponent(row.id),{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,resolutionNote:resolutionNote||undefined}),
      });
      setNotice(action==="approve"?"Request approved; refund and restocking remain separate guarded actions."
        :action==="mark_received"?"Receipt recorded; refund and restocking remain separate guarded actions."
        :action==="complete"?"Exchange review completed; no replacement order or shipment was created."
        :action==="reject"?"Request rejected with a recorded reason.":"Request cancelled.");
      await load(true);
    }catch(e){setError(e instanceof Error?e.message:"The request status could not be changed.");}
    finally{setBusyId(null);}
  };

  const prepareRefund=async(row:RequestRow)=>{
    const draft=draftFor(row);
    const refundAmountMinor=toMinorUnits(draft.refundAmount,row.currency);
    if(refundAmountMinor===null){
      setError("Enter a positive refund amount with no more than "+currencyDigits(row.currency)+" decimal places for "+row.currency+".");
      return;
    }
    setError("");setNotice("");
    const actionSummary="Create a refund request for "+moneyMinor(refundAmountMinor,row.currency)+
      " after recording an inspection result? This does not send money yet. Finance must approve the refund.";
    if(!window.confirm(actionSummary))return;
    setBusyId(row.id);
    try{
      const result=await api("/api/merchant/order-portal/return-requests/"+encodeURIComponent(row.id)+"/prepare-refund",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          inspectionGrade:draft.inspectionGrade,
          inspectionNote:draft.inspectionNote.trim()||undefined,
          refundAmountMinor,
          restockReturnedItems:draft.restockReturnedItems,
        }),
      });
      const refund=result.refund as {id?:number|string;status?:string;inventory_restock?:boolean}|undefined;
      setNotice("Refund request "+String(refund?.id??"")+" is recorded and linked to this return. No funds have been sent yet; review and approve it through Finance.");
      await load(true);
    }catch(e){setError(e instanceof Error?e.message:"Refund request could not be prepared.");}
    finally{setBusyId(null);}
  };

  const pending=rows.filter(r=>r.status==="pending").length;
  const inProgress=rows.filter(r=>["approved","received"].includes(r.status)).length;
  return <AppShell><div className="space-y-6">
    <section className="overflow-hidden rounded-[24px] border border-[#1c3f68] bg-[#0b2748] p-6 text-white sm:p-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-[#8fb8e8]">Customer experience · fulfillment</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-[-.05em] sm:text-4xl">Returns & exchanges, in one review queue.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">Customer requests are linked to real orders and delivery records. Approving a request never quietly creates a refund, writes the ledger or restocks inventory.</p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-[#12345a]" onClick={()=>void load(true)} disabled={refreshing}><RefreshCw className={"h-4 w-4 "+(refreshing?"animate-spin":"")}/>{refreshing?"Refreshing…":"Refresh queue"}</button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[{label:"All requests",value:rows.length},{label:"Awaiting review",value:pending},{label:"In progress",value:inProgress}].map(item=><div key={item.label} className="rounded-xl border border-white/10 bg-white/[.05] p-4"><p className="text-xs font-bold text-white/60">{item.label}</p><p className="mt-1 text-2xl font-black">{loading?"—":item.value}</p></div>)}
      </div>
    </section>
    {notice&&<div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><span>{notice}</span></div>}
    {error&&<div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-accent/10 p-2 text-accent"><ClipboardList className="h-5 w-5"/></div><div><h2 className="text-xl font-black">Request queue</h2><p className="text-xs text-muted-foreground">Newest and unresolved requests appear first.</p></div></div>
      {loading?<div className="grid min-h-48 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground"/></div>
      :rows.length===0?<div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center"><RotateCcw className="mx-auto h-7 w-7 text-muted-foreground"/><p className="mt-2 text-sm font-extrabold">No return requests yet</p><p className="mt-1 text-xs text-muted-foreground">Requests submitted through the customer tracking link will appear here.</p></div>
      :<div className="mt-5 space-y-3">{rows.map(row=><article key={row.id} className="rounded-xl border border-border p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={"rounded-full px-2.5 py-1 text-[10px] font-black uppercase "+(STATUS_CLASS[row.status]??"bg-muted")}>{row.status}</span><span className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{row.request_type}</span></div>
            <h3 className="mt-2 text-base font-black">{row.product_title||"Order item"} · qty {row.quantity}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Order {row.order_number} · {money(row.order_total,row.currency)} · Purchased quantity {row.purchased_quantity}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.customer_name} · {row.customer_email}</p>
          </div>
          <Link href={"/orders/"+row.order_id} className="inline-flex items-center gap-1 self-start text-xs font-bold text-accent">Open order <ExternalLink className="h-3.5 w-3.5"/></Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Reason</p><p className="mt-1 text-sm font-bold">{REASON_LABEL[row.reason]??row.reason}</p><p className="mt-2 text-[10px] text-muted-foreground">Requested {new Date(row.created_at).toLocaleString()}</p><p className="mt-1 text-[10px] text-muted-foreground">Return window at request: {row.return_window_days_snapshot} days</p></div>
          <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Customer message</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{row.customer_message||"No additional details provided."}</p>{row.resolution_note&&<p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">Resolution note: {row.resolution_note}</p>}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {row.status==="pending"&&<><button className={primary} disabled={busyId===row.id} onClick={()=>void act(row,"approve")}><CheckCircle2 className="h-3.5 w-3.5"/>Approve request</button><button className={secondary} disabled={busyId===row.id} onClick={()=>void act(row,"reject")}><XCircle className="h-3.5 w-3.5"/>Reject with reason</button><button className={secondary} disabled={busyId===row.id} onClick={()=>void act(row,"cancel")}>Cancel</button></>}
          {row.status==="approved"&&<><button className={primary} disabled={busyId===row.id} onClick={()=>void act(row,"mark_received")}><CheckCircle2 className="h-3.5 w-3.5"/>Mark physically received</button><button className={secondary} disabled={busyId===row.id} onClick={()=>void act(row,"cancel")}>Cancel</button></>}
          {row.status==="received"&&row.request_type==="return"&&!row.refund_record_id&&<div className="mt-2 w-full rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-3"><p className="text-sm font-black">Inspect item and prepare refund</p><p className="mt-1 text-xs leading-5 text-muted-foreground">This creates a refund request for Finance. It never sends money automatically; the existing refund approval workflow remains in control.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1 text-xs font-bold">Inspection result
                <select value={draftFor(row).inspectionGrade} onChange={event=>patchRefundDraft(row.id,{inspectionGrade:event.target.value as RefundDraft["inspectionGrade"]})} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
                  <option value="resellable">Resellable</option><option value="damaged">Damaged</option><option value="unsellable">Unsellable</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold">Refund amount ({row.currency})
                <input type="number" min="0" step="any" inputMode="decimal" value={draftFor(row).refundAmount} onChange={event=>patchRefundDraft(row.id,{refundAmount:event.target.value})} placeholder="Enter amount" className="h-10 rounded-xl border border-border bg-background px-3 text-sm"/>
              </label>
              <label className="grid gap-1 text-xs font-bold sm:col-span-2">Inspection note
                <input maxLength={2000} value={draftFor(row).inspectionNote} onChange={event=>patchRefundDraft(row.id,{inspectionNote:event.target.value})} placeholder="Condition, packaging, missing parts…" className="h-10 rounded-xl border border-border bg-background px-3 text-sm"/>
              </label>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <input type="checkbox" checked={draftFor(row).restockReturnedItems} onChange={event=>patchRefundDraft(row.id,{restockReturnedItems:event.target.checked})} className="mt-1"/>
              <span>Request automatic restock only if the full order is returned, the item is resellable, no earlier refund exists, and inventory/payment are eligible. Lunavo validates all these conditions.</span>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className={primary} disabled={busyId===row.id} onClick={()=>void prepareRefund(row)}><ShieldCheck className="h-3.5 w-3.5"/>{busyId===row.id?"Preparing…":"Prepare refund request"}</button>
              <span className="text-[10px] text-muted-foreground">Currency minor-unit precision is applied automatically.</span>
            </div>
            {row.inspection_grade&&<p className="mt-2 text-xs text-muted-foreground">Recorded inspection: {row.inspection_grade}{row.inspection_note?" · "+row.inspection_note:""}</p>}
          </div>}
          {row.status==="received"&&row.request_type==="exchange"&&<button className={primary} disabled={busyId===row.id} onClick={()=>void act(row,"complete")}><ShieldCheck className="h-3.5 w-3.5"/>Complete exchange review</button>}
          {row.refund_record_id!=null&&<div className="mt-2 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs">
            <span>Linked refund #{row.refund_record_id} · <strong>{row.refund_status??"requested"}</strong>{row.refund_amount_minor!=null&&row.refund_currency?" · "+moneyMinor(row.refund_amount_minor,row.refund_currency):""}{row.refund_inventory_restock?" · restocked":" "}{row.refund_inventory_restock_skip_reason?" · restock skipped: "+row.refund_inventory_restock_skip_reason:""}{row.inspection_grade?" · inspected: "+row.inspection_grade:""}{row.inspection_note?" · "+row.inspection_note:""}</span>
            <Link href="/finance" className="font-extrabold text-accent underline underline-offset-2">Review in Finance</Link>
          </div>}
          {busyId===row.id&&<span className="self-center text-xs font-bold text-muted-foreground">Saving status…</span>}
          {["completed","rejected","cancelled"].includes(row.status)&&<span className="self-center text-xs text-muted-foreground">This workflow is in a final state.</span>}
        </div>
      </article>)}</div>}
    </section>
  </div></AppShell>;
}
