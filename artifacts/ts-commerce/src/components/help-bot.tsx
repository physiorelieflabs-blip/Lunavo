import { useMemo, useState } from 'react';
import { Bot, ChevronRight, CircleHelp, Send, Sparkles, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';

type Reply = { text: string; href?: string };
type Message = Reply & { id: number; from: 'bot' | 'user' };

const quickQuestions = [
  'How do I make a sale?',
  'How do I withdraw?',
  'How do I add inventory?',
  'How do I use AI?',
];

function answerFor(question: string): Reply {
  const normalized = question.toLowerCase();
  if (normalized.includes('sale') || normalized.includes('pos') || normalized.includes('sell')) {
    return { text: 'Open TS POS, add a product, choose a payment method, and verify payment before completing the receipt. Offline tickets sync safely when you reconnect.', href: '/pos' };
  }
  if (normalized.includes('withdraw') || normalized.includes('payout') || normalized.includes('bank')) {
    return { text: 'Open Withdrawals, link a bank account, enable your authenticator, then configure two merchant PINs. Every payout needs the authenticator code and both PINs.', href: '/withdrawals' };
  }
  if (normalized.includes('inventory') || normalized.includes('stock')) {
    return { text: 'Open Inventory to review availability, inspect reservation holds, and apply a documented adjustment. Verified sales and refunds are the authoritative stock movements.', href: '/inventory' };
  }
  if (normalized.includes('customer') || normalized.includes('crm')) {
    return { text: 'Open Customers to search profiles, review order history, see segments, and export the current customer list.', href: '/customers' };
  }
  if (normalized.includes('store') || normalized.includes('shop')) {
    return { text: 'Open Create a new store to set your storefront name, domain, category, and contact details. Save it to make the store persistent.', href: '/store' };
  }
  if (normalized.includes('ai') || normalized.includes('research') || normalized.includes('ad')) {
    return { text: 'Open the AI control room for source-attributed research and draft actions. AI suggestions stay approval-gated and cannot publish, spend, move money, or change permissions automatically.', href: '/ai' };
  }
  if (normalized.includes('finance') || normalized.includes('payment') || normalized.includes('ledger')) {
    return { text: 'Open Finance to review payment evidence, authoritative ledger entries, refunds, and reconciliation status. A client status alone never creates paid revenue.', href: '/finance' };
  }
  if (normalized.includes('billing') || normalized.includes('subscription')) {
    return { text: 'Open Billing to see your subscription countdown, currency, amount due, and payment options.', href: '/billing' };
  }
  return { text: 'I can guide you through POS, inventory, withdrawals, Customers, store setup, AI, Finance, and Billing. Try one of the suggested questions below.' };
}

export function HelpBot() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, from: 'bot', text: 'Hi — I’m your TS Commerce guide. Ask me how to use a feature and I’ll take you there.' },
  ]);
  const contextHint = useMemo(() => {
    if (location === '/pos') return 'You’re in POS. Ask me about making a sale or syncing offline tickets.';
    if (location === '/withdrawals' || location === '/admin/withdrawals') return 'You’re in Withdrawals. Ask me about payout security or review steps.';
    if (location === '/inventory') return 'You’re in Inventory. Ask me about stock holds or adjustments.';
    return 'Choose a question to get a guided answer.';
  }, [location]);

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const reply = answerFor(trimmed);
    setMessages((current) => [...current, { id: Date.now(), from: 'user', text: trimmed }, { id: Date.now() + 1, from: 'bot', ...reply }]);
    setDraft('');
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && <section className="mb-3 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] shadow-[0_24px_70px_rgba(24,35,51,.22)]" aria-label="TS Commerce help">
        <div className="flex items-center justify-between bg-[#182333] px-4 py-3 text-[#f8f3e8]">
          <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#d6aa46] text-[#182333]"><Bot className="h-5 w-5" /></div><div><p className="text-sm font-extrabold">TS Guide</p><p className="text-[10px] text-[#aab6c2]">How-to help, right here</p></div></div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-[#aab6c2] hover:bg-[#2a3a4d] hover:text-white" aria-label="Close help"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[min(440px,60vh)] space-y-3 overflow-y-auto p-4">
          <p className="text-xs text-[#697687]">{contextHint}</p>
          {messages.map((message) => <div key={message.id} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-5 ${message.from === 'user' ? 'rounded-br-md bg-[#182333] text-[#f8f3e8]' : 'rounded-bl-md border border-[#ded8cd] bg-[#f1eee7] text-[#354357]'}`}>{message.text}{message.href && <Link href={message.href} onClick={() => setOpen(false)} className="mt-2 flex items-center gap-1 font-extrabold text-[#8a6826] underline">Open this feature <ChevronRight className="h-3 w-3" /></Link>}</div></div>)}
          {messages.length === 1 && <div className="grid gap-2">{quickQuestions.map((question) => <button key={question} onClick={() => ask(question)} className="flex items-center justify-between rounded-xl border border-[#ded8cd] bg-white px-3 py-2 text-left text-xs font-bold text-[#354357] transition hover:border-[#bba15e] hover:bg-[#fff7df]">{question}<Sparkles className="h-3.5 w-3.5 text-[#a2772e]" /></button>)}</div>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); ask(draft); }} className="flex gap-2 border-t border-[#ded8cd] p-3">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask how to do something…" aria-label="Ask the TS Guide" className="min-w-0 flex-1 rounded-xl border border-[#d9d2c4] bg-white px-3 py-2 text-xs outline-none focus:border-[#bca26a]" />
          <button type="submit" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#d6aa46] text-[#182333] hover:bg-[#e0b95d]" aria-label="Send question"><Send className="h-4 w-4" /></button>
        </form>
      </section>}
      <button onClick={() => setOpen((current) => !current)} className="ml-auto flex items-center gap-2 rounded-full border border-[#f0d48b] bg-[#d6aa46] px-4 py-3 text-xs font-extrabold text-[#182333] shadow-[0_12px_28px_rgba(24,35,51,.18)] transition hover:-translate-y-0.5 hover:bg-[#e0b95d]" aria-label={open ? 'Close TS Guide' : 'Open TS Guide'}><CircleHelp className="h-4 w-4" />TS Guide</button>
    </div>
  );
}