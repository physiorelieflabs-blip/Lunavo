import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, BrainCircuit, CheckCircle2, ChevronRight, CircleHelp, Clock3, Search, Sparkles, Target, WalletCards } from 'lucide-react';
import { Link } from 'wouter';
import { customFetch } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';

type Lesson = {
  id: string;
  area: string;
  title: string;
  summary: string;
  time: number;
  steps: Array<{ title: string; body: string; href?: string }>;
  keywords: string[];
};

const LESSONS: Lesson[] = [
  { id:'launch', area:'Start here', title:'Launch your first storefront', summary:'Set up a real store, catalog and checkout without relying on demo data.', time:8, keywords:['store','theme','publish','domain'], steps:[
    {title:'Build the storefront',body:'Set the store identity, theme, sections, brand assets and product layout.',href:'/store'},
    {title:'Add real products',body:'Use Sourcing to import an accessible supplier URL or use your normal catalog workflow.',href:'/suppliers'},
    {title:'Configure selling rules',body:'Check currency, taxes, shipping, checkout and payment configuration.',href:'/settings'},
    {title:'Preview and publish',body:'Verify the public customer experience before publishing.',href:'/store'}
  ]},
  { id:'sourcing', area:'Sourcing', title:'Source products from supplier links', summary:'Paste a supplier/product URL and turn accessible product information into a reviewable catalog record.', time:10, keywords:['supplier','source','import','dropship'], steps:[
    {title:'Paste a product URL',body:'Open Sourcing and submit a legitimate supplier/product URL. No supplier API key is required.',href:'/suppliers'},
    {title:'Review extracted facts',body:'Check title, images, price, variants, SKU, availability, shipping and other fields before saving.',href:'/suppliers'},
    {title:'Set your economics',body:'Choose markup, margin or a custom selling price and inspect the resulting economics.',href:'/suppliers'},
    {title:'Choose inventory behaviour',body:'Use manual, source-based or synchronized inventory only where the source supports it.',href:'/suppliers'},
    {title:'Confirm your content rights',body:'A public page is not automatically a resale licence. Confirm you can reuse supplier content.',href:'/suppliers'}
  ]},
  { id:'general-store', area:'Marketplace growth', title:'Put products in the TS General Store', summary:'Understand the difference between a merchant storefront and the customer-facing marketplace.', time:7, keywords:['marketplace','general store','advertising','sponsored'], steps:[
    {title:'Prepare a marketplace-ready product',body:'Make the product accurate, priced, available and visually complete.',href:'/store'},
    {title:'Create the marketplace listing',body:'Submit the product for the marketplace review workflow.',href:'/marketplace/manage'},
    {title:'Pay the $5 product advertising fee',body:'The advertising fee is a real payment event. Paid placement must not activate from a frontend click alone.',href:'/marketing'},
    {title:'Measure performance',body:'Use marketplace funnel data such as impressions, views, clicks, carts and purchases.',href:'/marketing'}
  ]},
  { id:'profit', area:'Finance', title:'See the profit, not just the sale', summary:'Understand how product cost, shipping, provider charges and the TS Commerce fee affect your economics.', time:6, keywords:['profit','margin','finance','fee','revenue'], steps:[
    {title:'Start with customer price',body:'Use the actual selling price and transaction currency.',href:'/finance'},
    {title:'Account for real costs',body:'Include source cost, discounts, shipping, payment-provider charges and the 1% TS Commerce transaction fee.',href:'/finance'},
    {title:'Separate held and available funds',body:'Use TS Pay to distinguish pending, held and available balances.',href:'/ts-pay'},
    {title:'Trust verified records',body:'Financial truth comes from verified payment evidence and authoritative ledger records.',href:'/ts-pay'}
  ]},
  { id:'orders', area:'Operations', title:'Run an order from checkout to fulfillment', summary:'Keep payment verification, inventory reservations and fulfillment states aligned.', time:9, keywords:['orders','fulfillment','shipping','inventory'], steps:[
    {title:'Verify payment state',body:'Only verified payment evidence should move an online transaction into a paid state.',href:'/orders'},
    {title:'Check stock and reservations',body:'Review reserved, committed and released quantities before fulfillment.',href:'/inventory'},
    {title:'Choose fulfillment route',body:'Use merchant inventory or the sourcing/fulfillment workflow when the order is supplier-backed.',href:'/dropshipping'},
    {title:'Update the real order state',body:'Keep customer-facing status aligned with what actually happened.',href:'/orders'}
  ]},
  { id:'marketing', area:'Growth', title:'Run a product growth loop', summary:'Turn product performance into decisions instead of guessing what to advertise.', time:8, keywords:['growth','marketing','ads','analytics'], steps:[
    {title:'Find high-interest products',body:'Look for products receiving views, carts or engagement.',href:'/analytics'},
    {title:'Check economics',body:'Do not scale a product that only looks popular but has weak economics.',href:'/finance'},
    {title:'Create or renew advertising',body:'Use the $5/product marketplace advertising workflow where appropriate.',href:'/marketing'},
    {title:'Ask AI for the next three moves',body:'Use the AI control room for an evidence-backed action plan.',href:'/ai'}
  ]},
  { id:'pos', area:'Sales channels', title:'Use TS POS', summary:'Handle in-person selling without creating a separate accounting universe.', time:7, keywords:['pos','retail','offline','receipt'], steps:[
    {title:'Open TS POS',body:'Confirm the active merchant workspace and location.',href:'/pos'},
    {title:'Sell from the real catalog',body:'Use current products and stock where available.',href:'/pos'},
    {title:'Complete payment truthfully',body:'A local receipt is not provider settlement proof. Use the configured payment workflow.',href:'/pos'},
    {title:'Reconcile',body:'Review the corresponding financial state in Finance or TS Pay.',href:'/finance'}
  ]},
  { id:'invoices', area:'B2B & payments', title:'Create and collect an invoice', summary:'Use invoice commerce for services, wholesale and custom orders.', time:6, keywords:['invoice','b2b','payment link'], steps:[
    {title:'Create the invoice',body:'Add the customer, lines, tax, discount, shipping and terms.',href:'/invoices'},
    {title:'Share the customer-facing invoice',body:'Use the public invoice link generated by the invoice workflow.',href:'/invoices'},
    {title:'Collect payment',body:'Use the supported payment flow instead of marking a payment successful from the UI.',href:'/invoices'},
    {title:'Verify and reconcile',body:'Review payment submissions and the authoritative ledger.',href:'/finance'}
  ]},
  { id:'ai', area:'AI', title:'Use AI with approval gates', summary:'Get an AI operating assistant without giving the model uncontrolled access to money, permissions or publishing.', time:8, keywords:['ai','copilot','operator','automation'], steps:[
    {title:'Ask a business question',body:'Ask about real sales, customers, catalog, inventory, suppliers, marketing or finance evidence.',href:'/ai'},
    {title:'Inspect uncertainty',body:'Separate recorded facts from estimates and missing information.',href:'/ai'},
    {title:'Prepare a reversible task',body:'Use AI to prepare drafts, reports and review tasks.',href:'/ai'},
    {title:'Execute through the owning workflow',body:'Payments, payouts, refunds, permissions, customer messages and inventory mutations keep their normal controls.',href:'/ai'}
  ]},
  { id:'media', area:'Merchandising', title:'Create better store visuals', summary:'Use the persistent media library and AI visual tools without inventing product facts.', time:7, keywords:['media','image','creative','banner'], steps:[
    {title:'Open Picture library',body:'Manage merchant-owned media, metadata and storefront assignments.',href:'/media'},
    {title:'Prepare visual concepts',body:'Use the AI visual studio for product imagery, banners and campaign creative.',href:'/ai'},
    {title:'Review the asset',body:'Check that the visual does not misrepresent the real product.',href:'/media'},
    {title:'Assign it to your store',body:'Export/assign the approved asset and publish through the storefront workflow.',href:'/store'}
  ]},
  { id:'security', area:'Security', title:'Secure the commerce operation', summary:'Protect people, money, customer data and team access.', time:8, keywords:['security','2fa','team','permissions','withdrawal'], steps:[
    {title:'Scope team access',body:'Give staff only the permissions and locations they require.',href:'/team'},
    {title:'Protect withdrawals',body:'Use the supported withdrawal security flow and keep sensitive destination data protected.',href:'/withdrawals'},
    {title:'Review activity',body:'Use activity and notification records to detect unexpected changes.',href:'/activity'},
    {title:'Reconcile payment evidence',body:'Review provider events, transaction references and ledger records before making financial decisions.',href:'/finance'}
  ]}
];

function matches(lesson: Lesson, query: string) {
  if (!query.trim()) return true;
  const text = [lesson.area, lesson.title, lesson.summary, ...lesson.keywords, ...lesson.steps.map((s) => s.title + ' ' + s.body)].join(' ').toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

export default function Guide() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(LESSONS[0]!.id);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<Record<string, number[]>>({});
  const lesson = LESSONS.find((item) => item.id === selected) ?? LESSONS[0]!;
  const visible = useMemo(() => LESSONS.filter((item) => matches(item, query)), [query]);
  const doneSet = new Set(done[lesson.id] ?? []);

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const result = await customFetch<{ reply: string }>('/api/ai/guide', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          message: 'Learning lesson: ' + lesson.title + '. Lesson instructions: ' + lesson.steps.map((s,i)=> (i+1)+'. '+s.title+': '+s.body).join(' ') + ' User question: ' + q,
          location:'/guide',
          history:[]
        })
      });
      setAnswer(result.reply);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : 'TS Guide AI is temporarily unavailable. The step-by-step lesson remains available.');
    } finally {
      setAsking(false);
    }
  };

  const toggle = (index:number) => {
    setDone((current) => {
      const set = new Set(current[lesson.id] ?? []);
      if (set.has(index)) set.delete(index); else set.add(index);
      return { ...current, [lesson.id]: Array.from(set).sort((a,b)=>a-b) };
    });
  };

  return <AppShell>
    <div className="mx-auto max-w-[1280px]">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">TS Commerce Academy</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-.06em]">Learn the platform by doing it.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#697687]">A living manual for sourcing, storefronts, General Store advertising, orders, finance, POS, invoices, AI, media and security. Every lesson links to the real workspace.</p>
        </div>
        <Link href="/ai" className="inline-flex items-center gap-2 rounded-xl bg-[#182333] px-4 py-3 text-sm font-extrabold text-[#f8f3e8]"><BrainCircuit className="h-4 w-4"/>Open AI control room</Link>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><BookOpen className="h-5 w-5 text-[#a2772e]"/><p className="mt-4 text-lg font-extrabold">Step-by-step lessons</p><p className="mt-1 text-xs leading-5 text-[#697687]">{LESSONS.length} task playbooks for core merchant workflows.</p></div>
        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><Target className="h-5 w-5 text-[#315e6c]"/><p className="mt-4 text-lg font-extrabold">Live workflow links</p><p className="mt-1 text-xs leading-5 text-[#697687]">Learn and jump directly into the actual feature.</p></div>
        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><BrainCircuit className="h-5 w-5 text-[#8a6826]"/><p className="mt-4 text-lg font-extrabold">Ask while learning</p><p className="mt-1 text-xs leading-5 text-[#697687]">TS Guide AI explains the current lesson in plain language.</p></div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[350px_1fr]">
        <aside className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-4">
          <div className="flex items-center gap-2 rounded-xl border border-[#d9d2c4] bg-white px-3"><Search className="h-4 w-4 text-[#8b95a1]"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search the manual" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"/></div>
          <div className="mt-4 space-y-4 overflow-y-auto pr-1 lg:max-h-[700px]">
            {visible.map((item)=><button key={item.id} onClick={()=>setSelected(item.id)} className={'w-full rounded-xl px-3 py-3 text-left transition '+(selected===item.id?'bg-[#182333] text-[#f8f3e8]':'hover:bg-[#f1eee7]')}><div className="flex gap-3"><ChevronRight className="mt-1 h-4 w-4"/><div><p className="text-sm font-extrabold">{item.title}</p><p className={'mt-1 text-[10px] '+(selected===item.id?'text-[#cbd5df]':'text-[#87919d]')}>{item.area} · {item.time} min</p></div></div></button>)}
            {!visible.length && <div className="p-5 text-center text-sm text-[#697687]">No lessons match that search.</div>}
          </div>
        </aside>

        <main>
          <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#f1e4c6] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#765817]">{lesson.area}</span><span className="inline-flex items-center gap-1 rounded-full bg-[#f1eee7] px-3 py-1 text-[10px] font-extrabold text-[#697687]"><Clock3 className="h-3 w-3"/>{lesson.time} minutes</span></div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-[-.05em]">{lesson.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#697687]">{lesson.summary}</p>

            <div className="mt-7 space-y-3">
              {lesson.steps.map((step,index)=><div key={step.title} className={'rounded-2xl border p-4 '+(doneSet.has(index)?'border-[#a7c9b4] bg-[#f0f8f2]':'border-[#d9d2c4] bg-white')}><div className="flex gap-4"><button onClick={()=>toggle(index)} className={'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border '+(doneSet.has(index)?'border-[#78a98b] bg-[#d9efdf] text-[#3b7550]':'border-[#cfc6b8] text-transparent hover:border-[#a2772e]')} aria-label={doneSet.has(index)?'Mark step incomplete':'Mark step complete'}><CheckCircle2 className="h-4 w-4"/></button><div><p className="text-sm font-extrabold">{index+1}. {step.title}</p><p className="mt-1 text-sm leading-6 text-[#697687]">{step.body}</p>{step.href&&<Link href={step.href} className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[#8a6826] underline">Open workflow <ArrowRight className="h-3.5 w-3.5"/></Link>}</div></div></div>)}
            </div>
            <div className="mt-5 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4"><p className="text-sm font-extrabold">Progress</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#a2772e]" style={{width:`${Math.round((doneSet.size/lesson.steps.length)*100)}%`}}/></div><p className="mt-2 text-xs text-[#697687]">{doneSet.size} of {lesson.steps.length} steps completed.</p></div>
          </section>

          <section className="mt-5 rounded-2xl border border-[#bfd6dc] bg-[#eef7f8] p-6">
            <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#d9eef0] text-[#315e6c]"><BrainCircuit className="h-5 w-5"/></div><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#315e6c]">TS Guide AI</p><h3 className="mt-1 text-xl font-extrabold">Ask: “What do I do next?”</h3><p className="mt-2 text-sm leading-6 text-[#477563]">The AI can explain the lesson and answer practical questions. It remains read-only and does not invent payment, order, stock or publishing outcomes.</p></div></div>
            <div className="mt-4 flex gap-2"><input value={question} onChange={(e)=>setQuestion(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter') void ask()}} placeholder="Ask about this lesson" className="h-11 min-w-0 flex-1 rounded-xl border border-[#b9cfd3] bg-white px-3 text-sm outline-none"/><button onClick={()=>void ask()} disabled={asking||!question.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] disabled:opacity-50"><Sparkles className="h-4 w-4"/>{asking?'Thinking…':'Explain'}</button></div>
            {answer&&<div className="mt-4 rounded-xl border border-[#b9cfd3] bg-white p-4 text-sm leading-6 whitespace-pre-wrap text-[#354357]">{answer}</div>}
          </section>
          
          <section className="mt-5 grid gap-4 md:grid-cols-3">
            <Link href="/growth" className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 hover:border-[#bca26a]"><Target className="h-5 w-5 text-[#a2772e]"/><p className="mt-3 text-sm font-extrabold">Growth Control Room</p><p className="mt-1 text-xs leading-5 text-[#697687]">Sourcing, Store Doctor and growth intelligence.</p></Link>
            <Link href="/suppliers" className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 hover:border-[#bca26a]"><BookOpen className="h-5 w-5 text-[#315e6c]"/><p className="mt-3 text-sm font-extrabold">Sourcing Center</p><p className="mt-1 text-xs leading-5 text-[#697687]">Import, review, price and refresh sourced products.</p></Link>
            <Link href="/ts-pay" className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 hover:border-[#bca26a]"><WalletCards className="h-5 w-5 text-[#8a6826]"/><p className="mt-3 text-sm font-extrabold">TS Pay</p><p className="mt-1 text-xs leading-5 text-[#697687]">Understand ledger, payments, fees and payout controls.</p></Link>
          </section>
        </main>
      </div>
      
      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#dfc27a] bg-[#fff7df] p-5 text-sm leading-6 text-[#765817]"><CircleHelp className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-extrabold text-[#614a15]">Commerce safety rule</p><p className="mt-1">TS Guide AI is a teaching and preparation layer. Verified payment evidence and the TS Pay ledger remain authoritative; payouts, refunds, permissions, publication, customer communication and inventory changes remain controlled by their owning workflows.</p></div></div>
    </div>
  </AppShell>;
}
