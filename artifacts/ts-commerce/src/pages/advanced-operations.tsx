import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, LoadingState, Notice, SectionHeading } from "@/components/primitives";
import { customFetch } from "@workspace/api-client-react";

const kinds = [
  ["return","Returns"],["exchange","Exchanges"],["booking","Bookings"],["event","Events"],
  ["ticket","Tickets"],["quote","Quotes"],["purchase_order","Purchase orders"],["expense","Expenses"],
  ["lead","Leads"],["task","Tasks"],["support_ticket","Support tickets"],["message_thread","Message threads"],
  ["preorder","Preorders"],["waitlist","Waitlists"],["product_alert","Product alerts"],
  ["document","Documents"],["customer_document","Customer documents"],
  ["app_listing","App marketplace"],["theme_listing","Theme marketplace"],["creator_listing","Creator marketplace"],
  ["customer_subscription","Customer subscriptions"],["b2b_account","B2B accounts"],["price_list","Price lists"],
  ["sales_funnel","Sales funnels"],["customer_intake","Customer intake"],["review","Reviews"],
  ["blog_post","Blog posts"],["business_goal","Business goals"],["backup","Backups"],
  ["data_repair","Data repair"],["shipping_rule","Shipping rules"],["tax_rule","Tax rules"],
  ["delivery_issue","Delivery issues"],["supplier_issue","Supplier issues"],["dispute","Disputes"],
  ["chargeback","Chargebacks"],["refund_request","Refund requests"],["store_transfer","Store transfers"],
  ["beneficiary_change","Beneficiary changes"],["security_incident","Security incidents"],
] as const;

type Operation = {
  id:string; kind:string; status:string; title:string; description:string|null; priority:string;
  reference:string|null; updated_at:string;
};

type ApiKey={id:string;name:string;key_prefix:string;revoked_at:string|null;created_at:string};
type Flag={key:string;enabled:boolean};
type Experiment={id:string;key:string;name:string;status:string};
type Period={id:string;period_key:string;start_date:string;end_date:string;status:string};

const label=(kind:string)=>kinds.find(function(x){return x[0]===kind;})?.[1]||kind.replaceAll("_"," ");

export default function AdvancedOperations(){
 const [operations,setOperations]=useState<Operation[]>([]);
 const [filter,setFilter]=useState("");
 const [kind,setKind]=useState("return");
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const [priority,setPriority]=useState("normal");
 const [reference,setReference]=useState("");
 const [apiKeys,setApiKeys]=useState<ApiKey[]>([]);
 const [newKeyName,setNewKeyName]=useState("");
 const [newSecret,setNewSecret]=useState("");
 const [flags,setFlags]=useState<Flag[]>([]);
 const [flagKey,setFlagKey]=useState("");
 const [flagEnabled,setFlagEnabled]=useState(false);
 const [experiments,setExperiments]=useState<Experiment[]>([]);
 const [experimentKey,setExperimentKey]=useState(""); const [experimentName,setExperimentName]=useState("");
 const [periodKey,setPeriodKey]=useState(""); const [periodStart,setPeriodStart]=useState(""); const [periodEnd,setPeriodEnd]=useState("");
 const [periods,setPeriods]=useState<Period[]>([]);
 const [message,setMessage]=useState("");
 const [error,setError]=useState(false);
 const [loading,setLoading]=useState(true);

 const load=async()=>{
  setLoading(true);
  try{
   const qs=filter?"?kind="+encodeURIComponent(filter):"";
   const results=await Promise.all([
    customFetch<{operations:Operation[]}>("/api/merchant/operations"+qs),
    customFetch<{keys:ApiKey[]}>("/api/merchant/api-keys"),
    customFetch<{flags:Flag[]}>("/api/merchant/feature-flags"),
    customFetch<{experiments:Experiment[]}>("/api/merchant/experiments"),
    customFetch<{periods:Period[]}>("/api/merchant/accounting-periods")
   ]);
   setOperations(results[0].operations);setApiKeys(results[1].keys);setFlags(results[2].flags);setExperiments(results[3].experiments);setPeriods(results[4].periods);
   setError(false);
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:"Advanced workspace could not be loaded.");}
  finally{setLoading(false);}
 };
 useEffect(function(){void load();},[filter]);

 const createOperation=async()=>{
  if(!title.trim())return;
  try{
   await customFetch("/api/merchant/operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,title,description,priority,reference:reference||undefined})});
   setTitle("");setDescription("");setReference("");setMessage(label(kind)+" created.");await load();
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:"Could not create workflow.");}
 };

 const nextActions=(op:Operation)=>{
  const maps:Record<string,Record<string,string[]>>={
   return:{pending:["approved","rejected"],approved:["completed","cancelled"]},
   exchange:{pending:["approved","rejected"],approved:["completed","cancelled"]},
   booking:{scheduled:["in_progress","cancelled"],in_progress:["completed","cancelled"]},
   event:{draft:["scheduled","cancelled"],scheduled:["active","cancelled"],active:["completed","cancelled"]},
   ticket:{open:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]},
   quote:{draft:["pending","cancelled"],pending:["approved","rejected"],approved:["completed","cancelled"],rejected:["draft"]},
   purchase_order:{draft:["pending","cancelled"],pending:["approved","rejected"],approved:["completed","cancelled"],rejected:["draft"]},
   expense:{pending:["approved","rejected"],approved:["completed"],rejected:["pending"]},
   lead:{open:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]},
   task:{open:["in_progress","completed","cancelled"],in_progress:["completed","cancelled"]},
   support_ticket:{open:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]},
   message_thread:{open:["closed","archived"],closed:["archived"]},
   preorder:{pending:["approved","cancelled"],approved:["completed","cancelled"]},
   waitlist:{open:["closed"]},
   product_alert:{open:["resolved","closed"],resolved:["closed"]},
   document:{active:["archived"]},customer_document:{active:["archived"]},
   app_listing:{pending:["approved","rejected"],approved:["archived"],rejected:["pending"]},
   theme_listing:{pending:["approved","rejected"],approved:["archived"],rejected:["pending"]},
   creator_listing:{pending:["approved","rejected"],approved:["archived"],rejected:["pending"]},
   customer_subscription:{pending:["approved","cancelled"],approved:["completed","cancelled"]},
   b2b_account:{draft:["active","cancelled"],active:["closed","cancelled"]},
   price_list:{draft:["active","archived"],active:["archived"]},
   sales_funnel:{draft:["active","archived"],active:["completed","archived"]},
   customer_intake:{open:["in_progress","completed","cancelled"],in_progress:["completed","cancelled"]},
   review:{pending:["approved","rejected"],approved:["archived"],rejected:["pending"]},
   blog_post:{draft:["scheduled","active","archived"],scheduled:["active","cancelled"],active:["archived"]},
   business_goal:{draft:["active","completed","cancelled"],active:["completed","cancelled"]},
   backup:{pending:["completed","failed","cancelled"],failed:["pending"]},
   data_repair:{pending:["approved","completed","cancelled"],approved:["completed","cancelled"]},
   shipping_rule:{draft:["active","archived"],active:["archived"]},
   tax_rule:{draft:["active","archived"],active:["archived"]},
   delivery_issue:{open:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]},
   supplier_issue:{open:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]},
   dispute:{open:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]},
   chargeback:{pending:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]},
   refund_request:{pending:["approved","rejected"],approved:["completed","cancelled"],rejected:["pending"]},
   store_transfer:{pending:["approved","rejected"],approved:["completed","cancelled"],rejected:["pending"]},
   beneficiary_change:{pending:["approved","rejected"],approved:["completed","cancelled"],rejected:["pending"]},
   security_incident:{open:["in_progress","resolved","closed"],in_progress:["resolved","closed"],resolved:["closed"]}
  };
  return maps[op.kind] && maps[op.kind][op.status] ? maps[op.kind][op.status] : [];
 };

 const transition=async(op:Operation,status:string)=>{
  try{await customFetch("/api/merchant/operations/"+op.id+"/transition",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await load();}
  catch(e){setError(true);setMessage(e instanceof Error?e.message:"Status change failed.");}
 };

 const createApiKey=async()=>{
  if(!newKeyName.trim())return;
  try{
   const r=await customFetch<{key:string}>("/api/merchant/api-keys",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:newKeyName,scopes:["api.read","api.write"]})});
   setNewSecret(r.key);setNewKeyName("");setMessage("API key created. Copy the secret now; it is shown once.");await load();
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:"API key creation failed.");}
 };
 const revokeKey=async(id:string)=>{
  try{await customFetch("/api/merchant/api-keys/"+id+"/revoke",{method:"POST"});await load();}catch(e){setError(true);setMessage(e instanceof Error?e.message:"API key revoke failed.");}
 };
 const saveFlag=async()=>{
  if(!flagKey.trim())return;
  try{await customFetch("/api/merchant/feature-flags/"+encodeURIComponent(flagKey.trim()),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({enabled:flagEnabled})});setFlagKey("");await load();setMessage("Feature flag saved.");}
  catch(e){setError(true);setMessage(e instanceof Error?e.message:"Feature flag update failed.");}
 };

 const createExperiment=async()=>{
  if(!experimentKey.trim()||!experimentName.trim())return;
  try{
   await customFetch("/api/merchant/experiments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({key:experimentKey,name:experimentName,variants:[{key:"control",weight:50},{key:"variant",weight:50}],metrics:["conversion_rate","revenue"]})});
   setExperimentKey("");setExperimentName("");setMessage("Experiment created.");await load();
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:"Experiment creation failed.");}
 };
 const transitionPeriod=async(id:string,status:string)=>{
  try{await customFetch("/api/merchant/accounting-periods/"+id+"/transition",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await load();}
  catch(e){setError(true);setMessage(e instanceof Error?e.message:"Accounting-period transition failed.");}
 };
 const createPeriod=async()=>{
  if(!periodKey.trim()||!periodStart||!periodEnd)return;
  try{
   await customFetch("/api/merchant/accounting-periods",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({periodKey,startDate:periodStart,endDate:periodEnd})});
   setPeriodKey("");setPeriodStart("");setPeriodEnd("");setMessage("Accounting period created.");await load();
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:"Accounting period creation failed.");}
 };
 if(loading)return <AppShell><LoadingState label="Loading advanced commerce workspace" /></AppShell>;

 return <AppShell>
  <div className="mx-auto max-w-[1260px]">
   <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Lunavo operating system</p>
   <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
    <div><h1 className="text-4xl font-extrabold tracking-[-.07em]">Operations & Advanced</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#697687]">Returns, exchanges, bookings, events, tickets, quotes, procurement, expenses, leads, tasks, support, preorders, waitlists, alerts, documents, developer keys, rollout controls and accounting periods.</p></div>
    <Badge tone="success">Persisted + tenant-authorized</Badge>
   </div>
   {message&&<div className="mt-6"><Notice tone={error?"danger":"success"} title={error?"Action failed":"Updated"}>{message}</Notice></div>}

   <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
    <SectionHeading eyebrow="Operations" title="Create a workflow" description="Every record is stored server-side, tied to your merchant workspace and protected by state-transition rules." />
    <div className="mt-5 grid gap-3 md:grid-cols-4">
      <label className="text-sm font-bold">Workflow<select value={kind} onChange={function(e){setKind(e.target.value)}} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-white px-3">{kinds.map(function(x){return <option key={x[0]} value={x[0]}>{x[1]}</option>})}</select></label>
      <label className="text-sm font-bold">Priority<select value={priority} onChange={function(e){setPriority(e.target.value)}} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-white px-3"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label>
      <label className="text-sm font-bold">Reference<input value={reference} onChange={function(e){setReference(e.target.value)}} placeholder="Optional reference" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-white px-3" /></label>
      <label className="text-sm font-bold md:col-span-2">Title<input value={title} onChange={function(e){setTitle(e.target.value)}} placeholder={"New "+label(kind).toLowerCase()} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-white px-3" /></label>
      <label className="text-sm font-bold md:col-span-2">Description<textarea value={description} onChange={function(e){setDescription(e.target.value)}} rows={3} placeholder="Context, requirements or internal notes" className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-white p-3" /></label>
    </div>
    <div className="mt-4 flex flex-wrap gap-3"><Button onClick={createOperation} disabled={!title.trim()}>Create workflow</Button><select value={filter} onChange={function(e){setFilter(e.target.value)}} className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"><option value="">All workflows</option>{kinds.map(function(x){return <option key={x[0]} value={x[0]}>{x[1]}</option>})}</select></div>
    <div className="mt-6 space-y-3">{operations.length?operations.map(function(op){return <div key={op.id} className="rounded-xl border border-[#ded8cd] bg-[#f7f4ed] p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{op.title}</p><Badge>{label(op.kind)}</Badge><Badge tone={op.status==="completed"||op.status==="resolved"||op.status==="approved"?"success":"neutral"}>{op.status}</Badge><Badge tone={op.priority==="high"||op.priority==="urgent"?"warning":"neutral"}>{op.priority}</Badge></div>{op.description&&<p className="mt-2 text-sm leading-6 text-[#697687]">{op.description}</p>}<p className="mt-2 text-[11px] text-[#8994a2]">{op.reference?("Ref "+op.reference+" · "):""}Updated {new Date(op.updated_at).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2">{nextActions(op).map(function(s){return <button key={s} type="button" onClick={function(){void transition(op,s)}} className="rounded-lg border border-[#d9d2c4] bg-white px-3 py-2 text-xs font-extrabold capitalize">{s.replaceAll("_"," ")}</button>})}</div></div>}) : <p className="rounded-xl border border-dashed border-[#d9d2c4] p-5 text-sm text-[#697687]">No records yet.</p>}</div>
   </section>

   <section className="mt-8 grid gap-5 lg:grid-cols-3">
    <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
      <SectionHeading eyebrow="Developer" title="Merchant API keys" description="Secrets are hashed at rest and revealed only once when created." />
      <div className="mt-4 flex gap-2"><input value={newKeyName} onChange={function(e){setNewKeyName(e.target.value)}} placeholder="Key name" className="h-10 min-w-0 flex-1 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><Button onClick={createApiKey} disabled={!newKeyName.trim()}>Create</Button></div>
      {newSecret&&<div className="mt-4 rounded-lg border border-[#b8d6ca] bg-[#f2faf5] p-3 text-xs"><p className="font-bold text-[#245746]">Copy once</p><p className="mt-2 break-all font-mono">{newSecret}</p></div>}
      <div className="mt-4 space-y-2">{apiKeys.map(function(k){return <div key={k.id} className="rounded-lg bg-[#f7f4ed] p-3 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-extrabold">{k.name}</span>{k.revoked_at?<Badge>Revoked</Badge>:<button type="button" onClick={function(){void revokeKey(k.id)}} className="font-extrabold text-[#a33e38]">Revoke</button>}</div><p className="mt-1 font-mono text-[#697687]">{k.key_prefix}…</p></div>})}</div>
    </div>
    <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
      <SectionHeading eyebrow="Rollout" title="Feature flags" description="Merchant-scoped controls for safe rollout and emergency disabling." />
      <div className="mt-4 flex gap-2"><input value={flagKey} onChange={function(e){setFlagKey(e.target.value)}} placeholder="feature.key" className="h-10 min-w-0 flex-1 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><Button onClick={saveFlag} disabled={!flagKey.trim()}>Save</Button></div>
      <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={flagEnabled} onChange={function(e){setFlagEnabled(e.target.checked)}}/> Enabled</label>
      <div className="mt-4 space-y-2">{flags.map(function(f){return <div key={f.key} className="flex items-center justify-between rounded-lg bg-[#f7f4ed] p-3 text-xs"><span className="font-mono">{f.key}</span><Badge tone={f.enabled?"success":"neutral"}>{f.enabled?"on":"off"}</Badge></div>})}</div>
    </div>
    <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
      <SectionHeading eyebrow="Experimentation" title="A/B experiments" description="Persisted experiment definitions use deterministic subject assignment, avoiding random re-assignment." />
      <div className="mt-4 grid gap-2"><input value={experimentKey} onChange={function(e){setExperimentKey(e.target.value)}} placeholder="checkout-hero" className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><input value={experimentName} onChange={function(e){setExperimentName(e.target.value)}} placeholder="Checkout hero test" className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><Button onClick={createExperiment} disabled={!experimentKey.trim()||!experimentName.trim()}>Create experiment</Button></div>
      <div className="mt-4 space-y-2">{experiments.length?experiments.map(function(e){return <div key={e.id} className="rounded-lg bg-[#f7f4ed] p-3 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-extrabold">{e.name}</span><Badge tone={e.status==="active"?"success":"neutral"}>{e.status}</Badge></div><p className="mt-1 font-mono text-[#697687]">{e.key}</p></div>}):<p className="mt-4 text-sm text-[#697687]">No experiments are configured yet.</p>}</div>
    </div>
   </section>

   <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
    <SectionHeading eyebrow="Accounting" title="Reporting periods" description="Explicit open → closed → locked lifecycle for reporting and accounting operations." />
    <div className="mt-5 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"><input value={periodKey} onChange={function(e){setPeriodKey(e.target.value)}} placeholder="2026-Q4" className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><input value={periodStart} onChange={function(e){setPeriodStart(e.target.value)}} type="date" className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><input value={periodEnd} onChange={function(e){setPeriodEnd(e.target.value)}} type="date" className="h-10 rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/><Button onClick={createPeriod} disabled={!periodKey||!periodStart||!periodEnd}>Create</Button></div>
    <div className="mt-5 grid gap-3 md:grid-cols-3">{periods.length?periods.map(function(p){return <div key={p.id} className="rounded-xl bg-[#f7f4ed] p-4"><div className="flex items-center justify-between gap-3"><p className="font-extrabold">{p.period_key}</p><Badge tone={p.status==="locked"?"success":"neutral"}>{p.status}</Badge></div><p className="mt-1 text-xs text-[#697687]">{p.start_date} → {p.end_date}</p><div className="mt-3 flex flex-wrap gap-2">{p.status==="open"&&<button type="button" onClick={function(){void transitionPeriod(p.id,"closed")}} className="rounded-lg border border-[#d9d2c4] bg-white px-3 py-1.5 text-xs font-bold">Close</button>}{p.status==="closed"&&<button type="button" onClick={function(){void transitionPeriod(p.id,"locked")}} className="rounded-lg border border-[#d9d2c4] bg-white px-3 py-1.5 text-xs font-bold">Lock</button>}</div></div>}):<p className="text-sm text-[#697687]">No periods configured.</p>}</div>
   </section>
  </div>
 </AppShell>;
}
