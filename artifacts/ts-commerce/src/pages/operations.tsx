import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Headphones, PackageCheck, Plus, RefreshCw, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { customFetch } from "@workspace/api-client-react";

type Tab = "overview" | "support" | "bookings" | "returns" | "purchasing" | "b2b";
type Overview = { open_tickets:number; upcoming_bookings:number; open_returns:number; open_purchase_orders:number; approved_b2b_accounts:number };
type Ticket = { id:string; subject:string; description:string; status:string; priority:string; customer_id:number|null; order_id:number|null; created_at:string };
type Booking = { id:string; service_name:string; starts_at:string; ends_at:string; timezone:string; status:string; customer_id:number|null };
type ReturnRow = { id:string; order_id:number; reason:string; status:string; requested_amount_minor:number; currency:string; created_at:string };
type PurchaseOrder = { id:string; supplier_name:string; status:string; currency:string; created_at:string };
type PoItem = { id:string; purchase_order_id:string; description:string; quantity_ordered:number; quantity_received:number; unit_cost_minor:number; currency:string };
type B2b = { id:string; customer_id:number|null; company_name:string; status:string; payment_terms_days:number };

const tabs:[Tab,string,React.ReactNode][] = [
  ["overview","Overview",<ClipboardList className="h-4 w-4" key="i"/>],
  ["support","Support",<Headphones className="h-4 w-4" key="i"/>],
  ["bookings","Bookings",<CalendarDays className="h-4 w-4" key="i"/>],
  ["returns","Returns",<RefreshCw className="h-4 w-4" key="i"/>],
  ["purchasing","Purchasing",<PackageCheck className="h-4 w-4" key="i"/>],
  ["b2b","B2B",<UsersRound className="h-4 w-4" key="i"/>],
];
const panel = "rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6]";

function statusMessage(status:string) {
  return status==="approved" ? "Return approved for processing." :
    status==="inspection" ? "Return moved to inspection." :
    status==="denied" ? "Return denied." :
    "Return request closed.";
}
async function api<T>(path:string, options?:RequestInit) {
  return customFetch<T>(path, { ...(options ?? {}), responseType:"json" });
}

export default function Operations() {
  const [tab,setTab]=useState<Tab>("overview");
  const [overview,setOverview]=useState<Overview|null>(null);
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [returns,setReturns]=useState<ReturnRow[]>([]);
  const [purchaseOrders,setPurchaseOrders]=useState<PurchaseOrder[]>([]);
  const [poItems,setPoItems]=useState<PoItem[]>([]);
  const [b2b,setB2b]=useState<B2b[]>([]);
  const [replyFor,setReplyFor]=useState("");
  const [replyText,setReplyText]=useState("");
  const [b2bProductId,setB2bProductId]=useState("");
  const [b2bMinimumQty,setB2bMinimumQty]=useState("1");
  const [b2bUnitPrice,setB2bUnitPrice]=useState("");
  const [b2bRuleCurrency,setB2bRuleCurrency]=useState("USD");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const [ticketSubject,setTicketSubject]=useState("");
  const [ticketDescription,setTicketDescription]=useState("");
  const [ticketPriority,setTicketPriority]=useState("normal");
  const [serviceName,setServiceName]=useState("");
  const [startsAt,setStartsAt]=useState("");
  const [endsAt,setEndsAt]=useState("");
  const [bookingNotes,setBookingNotes]=useState("");
  const [returnOrderId,setReturnOrderId]=useState("");
  const [returnAmount,setReturnAmount]=useState("");
  const [returnReason,setReturnReason]=useState("");
  const [supplierName,setSupplierName]=useState("");
  const [poCurrency,setPoCurrency]=useState("USD");
  const [poDescription,setPoDescription]=useState("");
  const [poQuantity,setPoQuantity]=useState("1");
  const [poUnitCost,setPoUnitCost]=useState("0");
  const [companyName,setCompanyName]=useState("");
  const [b2bCustomerId,setB2bCustomerId]=useState("");
  const [terms,setTerms]=useState("0");

  const refresh = async () => {
    setLoading(true);
    try {
      const [o,t,b,r,p,x] = await Promise.all([
        api<Overview>("/api/merchant/operations/overview"),
        api<{tickets:Ticket[]}>("/api/merchant/operations/tickets"),
        api<{bookings:Booking[]}>("/api/merchant/operations/bookings"),
        api<{returns:ReturnRow[]}>("/api/merchant/operations/returns"),
        api<{purchaseOrders:PurchaseOrder[];items:PoItem[]}>("/api/merchant/operations/purchase-orders"),
        api<{accounts:B2b[]}>("/api/merchant/operations/b2b-accounts"),
      ]);
      setOverview(o); setTickets(t.tickets); setBookings(b.bookings); setReturns(r.returns); setPurchaseOrders(p.purchaseOrders); setPoItems(p.items); setB2b(x.accounts);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operations could not be loaded.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const submit = async (work:()=>Promise<unknown>, success:string) => {
    setBusy(true); setMessage("");
    try { await work(); setMessage(success); await refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "The action could not be completed."); }
    finally { setBusy(false); }
  };
  const openPoItems = useMemo(() => poItems.filter((item) => purchaseOrders.some((po)=>po.id===item.purchase_order_id)), [poItems,purchaseOrders]);

  const createTicket = () => submit(async()=>{
    await api("/api/merchant/operations/tickets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subject:ticketSubject,description:ticketDescription,priority:ticketPriority})});
    setTicketSubject(""); setTicketDescription("");
  },"Support ticket created.");

  const createBooking = () => submit(async()=>{
    const start=new Date(startsAt), end=new Date(endsAt);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start) throw new Error("Choose a valid start and end time.");
    await api("/api/merchant/operations/bookings",{method:"POST",headers:{"content-type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({serviceName,startsAt:start.toISOString(),endsAt:end.toISOString(),notes:bookingNotes})});
    setServiceName(""); setStartsAt(""); setEndsAt(""); setBookingNotes("");
  },"Booking created and placed under the server-side scheduling guard.");

  const createReturn = () => submit(async()=>{
    await api("/api/merchant/operations/returns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orderId:Number(returnOrderId),amountMinor:Number(returnAmount),reason:returnReason})});
    setReturnOrderId(""); setReturnAmount(""); setReturnReason("");
  },"Return request created. Any actual refund remains a TS Pay/provider operation.");

  const createPo = () => submit(async()=>{
    await api("/api/merchant/operations/purchase-orders",{method:"POST",headers:{"content-type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({supplierName,currency:poCurrency,items:[{description:poDescription,quantity:Number(poQuantity),unitCostMinor:Number(poUnitCost)}]})});
    setSupplierName(""); setPoDescription(""); setPoQuantity("1"); setPoUnitCost("0");
  },"Purchase order created. No supplier payment was simulated.");

  const createB2b = () => submit(async()=>{
    await api("/api/merchant/operations/b2b-accounts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyName,customerId:Number(b2bCustomerId),paymentTermsDays:Number(terms)})});
    setCompanyName(""); setB2bCustomerId(""); setTerms("0");
  },"B2B account created in pending state.");

  const updateTicket = (id:string,status:string) => submit(async()=>{
    await api("/api/merchant/operations/tickets/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
  },"Support ticket updated.");

  const sendTicketMessage = (id:string) => submit(async()=>{
    if(!replyText.trim()) throw new Error("Message is required.");
    await api("/api/merchant/operations/tickets/"+id+"/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({body:replyText})});
    setReplyFor(""); setReplyText("");
  },"Reply added to the support ticket.");

  const updateBooking = (id:string,status:string) => submit(async()=>{
    await api("/api/merchant/operations/bookings/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
  },"Booking status updated.");

  const updateReturn = (id:string,status:string) => submit(async()=>{
    await api("/api/merchant/operations/returns/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
  },statusMessage(status));

  const receivePurchaseItem = (item:PoItem) => submit(async()=>{
    await api("/api/merchant/operations/purchase-orders/"+item.purchase_order_id+"/receive",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items:[{id:item.id,quantity:1}]})});
  },"One unit received and the purchase-order status recalculated.");

  const updateB2bAccount = (id:string,status:string) => submit(async()=>{
    await api("/api/merchant/operations/b2b-accounts/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
  },"B2B account status updated.");

  const addB2bRule = (id:string) => submit(async()=>{
    const productId=Number(b2bProductId), minimum=Number(b2bMinimumQty), price=Number(b2bUnitPrice);
    if(!Number.isInteger(productId)||productId<1||!Number.isInteger(minimum)||minimum<1||!Number.isInteger(price)||price<1) throw new Error("Enter a valid product, minimum quantity, and unit price in minor units.");
    await api("/api/merchant/operations/b2b-accounts/"+id+"/price-rules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({supplierProductId:productId,minimumQuantity:minimum,unitPriceMinor:price,currency:b2bRuleCurrency})});
    setB2bProductId(""); setB2bMinimumQty("1"); setB2bUnitPrice("");
  },"B2B wholesale price rule saved.");

  return <AppShell><main className="mx-auto max-w-[1260px] space-y-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-[#a2772e]">Lunavo Operations</p><h1 className="mt-2 text-4xl font-black tracking-[-.06em] text-[#182333]">Run the business, not just the storefront.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#697687]">Support, scheduling, returns, purchasing and B2B workflows live in one tenant-scoped operations layer. Financial settlement never bypasses TS Pay.</p></div>
      <button disabled={loading||busy} onClick={()=>void refresh()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d9d2c4] bg-white px-4 text-sm font-black text-[#182333] disabled:opacity-50"><RefreshCw className="h-4 w-4"/>Refresh</button>
    </header>
    {message && <div className="rounded-2xl border border-[#cad6ea] bg-[#f1f5fb] p-4 text-sm font-bold text-[#203f73]">{message}</div>}
    <nav className="flex gap-2 overflow-x-auto pb-1">{tabs.map(([id,label,icon])=><button key={id} onClick={()=>setTab(id)} className={tab===id ? "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#182333] px-4 text-sm font-black text-white" : "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] px-4 text-sm font-black text-[#5d6a7b]"}>{icon}{label}</button>)}</nav>

    {loading ? <section className={panel + " p-8"}>Loading operations…</section> : <>
      {tab==="overview" && <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ["Open support",overview?.open_tickets??0,Headphones],
          ["Upcoming bookings",overview?.upcoming_bookings??0,CalendarDays],
          ["Open returns",overview?.open_returns??0,RefreshCw],
          ["Open purchase orders",overview?.open_purchase_orders??0,PackageCheck],
          ["Approved B2B",overview?.approved_b2b_accounts??0,UsersRound],
        ] as Array<[string, number, LucideIcon]>).map(([label,value,I])=><article key={String(label)} className={panel + " p-5"}><I className="h-5 w-5 text-[#a2772e]"/><p className="mt-5 text-xs font-bold text-[#697687]">{String(label)}</p><b className="mt-1 block text-3xl font-black">{String(value)}</b></article>)}
        <article className="sm:col-span-2 lg:col-span-5 rounded-2xl border border-[#cad6ea] bg-[#f1f5fb] p-5"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 text-[#2f5c9f]"/><div><b className="text-[#203f73]">Financial boundary</b><p className="mt-1 text-sm leading-6 text-[#536a8c]">Returns never issue a refund here. Purchase orders never create a debit here. Booking/support/B2B actions cannot change a ledger balance. Customer payments remain provider-verified through TS Pay.</p></div></div></article>
      </section>}

      {tab==="support" && <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <form onSubmit={(e)=>{e.preventDefault();void createTicket();}} className={panel + " p-5 space-y-3"}><h2 className="text-lg font-black">New support ticket</h2><input required value={ticketSubject} onChange={e=>setTicketSubject(e.target.value)} placeholder="Subject" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><textarea required value={ticketDescription} onChange={e=>setTicketDescription(e.target.value)} placeholder="What needs attention?" className="min-h-32 w-full rounded-xl border border-[#d9d2c4] bg-white p-3"/><select value={ticketPriority} onChange={e=>setTicketPriority(e.target.value)} className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select><button disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-4 text-sm font-black text-white"><Plus className="h-4 w-4"/>Create ticket</button></form>
        <section className="space-y-3">{tickets.length?tickets.map(t=><article key={t.id} className={panel + " p-5"}><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{t.subject}</h3><p className="mt-1 text-sm leading-6 text-[#697687]">{t.description}</p></div><span className="rounded-full border border-[#d9d2c4] px-2.5 py-1 text-[10px] font-black uppercase">{t.priority}</span></div><p className="mt-4 text-xs text-[#8791a0]">{t.status} · {new Date(t.created_at).toLocaleString()}</p></article>):<div className={panel + " p-8 text-center text-sm text-[#697687]"}>No support tickets yet.</div>}</section>
      </section>}

      {tab==="bookings" && <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form onSubmit={(e)=>{e.preventDefault();void createBooking();}} className={panel + " p-5 space-y-3"}><h2 className="text-lg font-black">Book a service</h2><input required value={serviceName} onChange={e=>setServiceName(e.target.value)} placeholder="Service name" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><label className="block text-xs font-bold text-[#697687]">Starts<input required value={startsAt} onChange={e=>setStartsAt(e.target.value)} type="datetime-local" className="mt-1 h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/></label><label className="block text-xs font-bold text-[#697687]">Ends<input required value={endsAt} onChange={e=>setEndsAt(e.target.value)} type="datetime-local" className="mt-1 h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/></label><textarea value={bookingNotes} onChange={e=>setBookingNotes(e.target.value)} placeholder="Notes" className="min-h-24 w-full rounded-xl border border-[#d9d2c4] bg-white p-3"/><button disabled={busy} className="h-11 w-full rounded-xl bg-[#182333] text-sm font-black text-white">Create booking</button><p className="text-[11px] leading-5 text-[#697687]">Overlapping active bookings are rejected by PostgreSQL.</p></form>
        <section className="space-y-3">{bookings.length?bookings.map(b=><article key={b.id} className={panel + " p-5"}><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#188b68]"/><h3 className="font-black">{b.service_name}</h3></div><p className="mt-2 text-sm text-[#536174]">{new Date(b.starts_at).toLocaleString()} → {new Date(b.ends_at).toLocaleTimeString()}</p><p className="mt-2 text-xs font-bold uppercase text-[#8791a0]">{b.status} · {b.timezone}</p></article>):<div className={panel + " p-8 text-center text-sm text-[#697687]"}>No bookings yet.</div>}</section>
      </section>}

      {tab==="returns" && <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form onSubmit={(e)=>{e.preventDefault();void createReturn();}} className={panel + " p-5 space-y-3"}><h2 className="text-lg font-black">Create return request</h2><input required type="number" min="1" value={returnOrderId} onChange={e=>setReturnOrderId(e.target.value)} placeholder="Order ID" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><input required type="number" min="1" value={returnAmount} onChange={e=>setReturnAmount(e.target.value)} placeholder="Requested refund amount (minor units)" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><textarea required value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="Reason" className="min-h-28 w-full rounded-xl border border-[#d9d2c4] bg-white p-3"/><button disabled={busy} className="h-11 w-full rounded-xl bg-[#182333] text-sm font-black text-white">Create request</button><p className="text-[11px] leading-5 text-[#697687]">Creating this request never refunds the customer.</p></form>
        <section className="space-y-3">{returns.length?returns.map(r=><article key={r.id} className={panel + " p-5"}><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">Order #{r.order_id}</h3><p className="mt-1 text-sm text-[#697687]">{r.reason}</p></div><b className="font-mono text-sm">{(r.requested_amount_minor/100).toFixed(2)} {r.currency}</b></div><p className="mt-3 text-xs font-bold uppercase text-[#8791a0]">{r.status} · {new Date(r.created_at).toLocaleString()}</p></article>):<div className={panel + " p-8 text-center text-sm text-[#697687]"}>No return requests yet.</div>}</section>
      </section>}

      {tab==="purchasing" && <section className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <form onSubmit={(e)=>{e.preventDefault();void createPo();}} className={panel + " p-5 space-y-3"}><h2 className="text-lg font-black">New purchase order</h2><input required value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="Supplier" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><select value={poCurrency} onChange={e=>setPoCurrency(e.target.value)} className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option><option>GHS</option><option>KES</option><option>ZAR</option></select><input required value={poDescription} onChange={e=>setPoDescription(e.target.value)} placeholder="Item description" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><div className="grid grid-cols-2 gap-3"><input required type="number" min="1" value={poQuantity} onChange={e=>setPoQuantity(e.target.value)} placeholder="Qty" className="h-11 rounded-xl border border-[#d9d2c4] bg-white px-3"/><input required type="number" min="0" value={poUnitCost} onChange={e=>setPoUnitCost(e.target.value)} placeholder="Unit cost (minor)" className="h-11 rounded-xl border border-[#d9d2c4] bg-white px-3"/></div><button disabled={busy} className="h-11 w-full rounded-xl bg-[#182333] text-sm font-black text-white">Create PO</button><p className="text-[11px] leading-5 text-[#697687]">Purchase orders record obligations and receiving. Supplier payment is never fabricated.</p></form>
        <section className="space-y-3">{purchaseOrders.length?purchaseOrders.map(po=><article key={po.id} className={panel + " p-5"}><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{po.supplier_name}</h3><p className="mt-1 text-xs text-[#8791a0]">{po.id}</p></div><b className="rounded-full bg-[#eef8f3] px-2.5 py-1 text-[10px] font-black uppercase text-[#176b55]">{po.status}</b></div><div className="mt-4 space-y-2">{openPoItems.filter(i=>i.purchase_order_id===po.id).map(i=><div key={i.id} className="rounded-xl border border-[#e6e0d5] bg-white p-3 text-sm"><div className="flex justify-between gap-4"><span>{i.description}</span><b>{i.quantity_received}/{i.quantity_ordered}</b></div><p className="mt-1 text-xs text-[#8791a0]">{(i.unit_cost_minor/100).toFixed(2)} {i.currency} per unit</p></div>)}</div></article>):<div className={panel + " p-8 text-center text-sm text-[#697687]"}>No purchase orders yet.</div>}</section>
      </section>}

      {tab==="b2b" && <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form onSubmit={(e)=>{e.preventDefault();void createB2b();}} className={panel + " p-5 space-y-3"}><h2 className="text-lg font-black">New B2B account</h2><input required value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Company name" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><input required type="number" min="1" value={b2bCustomerId} onChange={e=>setB2bCustomerId(e.target.value)} placeholder="Existing customer ID" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><input required type="number" min="0" max="365" value={terms} onChange={e=>setTerms(e.target.value)} placeholder="Payment terms (days)" className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-white px-3"/><button disabled={busy} className="h-11 w-full rounded-xl bg-[#182333] text-sm font-black text-white">Create B2B account</button><p className="text-[11px] leading-5 text-[#697687]">Accounts begin pending and remain tenant-scoped.</p></form>
        <section className="space-y-3">{b2b.length?b2b.map(a=><article key={a.id} className={panel + " p-5"}><div className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-[#a2772e]"/><div className="min-w-0 flex-1"><h3 className="font-black">{a.company_name}</h3><p className="text-xs text-[#8791a0]">Customer #{a.customer_id} · Net {a.payment_terms_days} days</p></div><b className="rounded-full border border-[#d9d2c4] px-2.5 py-1 text-[10px] font-black uppercase">{a.status}</b></div></article>):<div className={panel + " p-8 text-center text-sm text-[#697687]"}>No B2B accounts yet.</div>}</section>
      </section>}
    </>}
  </main></AppShell>;
}
