import { useEffect, useState } from 'react';
import { BrainCircuit, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { Badge, Button, Notice } from '@/components/primitives';

type Props = { auctionId: number };
type Settings = { enabled?: boolean; strategy_mode?: string; minimum_acceptable_price?: number | null; target_price?: number | null; max_daily_marketing_actions?: number };
type Recommendation = { id: number; recommendation_type: string; recommendation: { posture?: string; nextMove?: string; targetBid?: number; recommendedIncrement?: number; actions?: string[] }; currency?: string; created_at: string };

export function AuctioneerPanel({ auctionId }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [strategy, setStrategy] = useState('maximize_value');
  const [target, setTarget] = useState('');
  const [floor, setFloor] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const data = await customFetch<{ settings: Settings; recommendations: Recommendation[] }>(`/api/merchant/store-auctions/${auctionId}/auctioneer-ai`, { responseType: 'json' });
    setSettings(data.settings); setRecommendations(data.recommendations ?? []);
    setEnabled(Boolean(data.settings?.enabled)); setStrategy(data.settings?.strategy_mode ?? 'maximize_value');
    setTarget(data.settings?.target_price == null ? '' : String(data.settings.target_price));
    setFloor(data.settings?.minimum_acceptable_price == null ? '' : String(data.settings.minimum_acceptable_price));
  };
  useEffect(() => { void load().catch(() => setMessage('Auctioneer AI settings could not be loaded.')); }, [auctionId]);

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      await customFetch(`/api/merchant/store-auctions/${auctionId}/auctioneer-ai`, { method: 'PUT', body: JSON.stringify({ enabled, strategyMode: strategy, targetPrice: target ? Number(target) : null, minimumAcceptablePrice: floor ? Number(floor) : null }), responseType: 'json' });
      await load(); setMessage(enabled ? 'Auctioneer AI is active under your seller controls.' : 'Auctioneer AI is disabled.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { setBusy(false); }
  };

  const recommend = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await customFetch<{ recommendation: Recommendation['recommendation'] }>(`/api/merchant/store-auctions/${auctionId}/auctioneer-ai/recommend`, { method: 'POST', body: JSON.stringify({}), responseType: 'json' });
      setMessage(result.recommendation?.nextMove || 'Fresh strategy generated from the recorded bid behaviour.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'A recommendation could not be generated.'); }
    finally { setBusy(false); }
  };

  return <section className="mt-4 rounded-2xl border border-[#cbd8e8] bg-[#f5f9ff] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#183d68] text-white"><BrainCircuit className="h-5 w-5" /></span><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#55718f]">Optional AI auctioneer</p><h3 className="mt-1 font-extrabold">Strategic bidding guidance</h3><p className="mt-1 max-w-xl text-xs leading-5 text-[#64748b]">The AI reacts to real bid velocity, spacing, momentum and bidder diversity. It never creates bids, bidders, fake urgency or deceptive claims.</p></div></div><Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Off'}</Badge></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold text-[#536174]">Mode<select value={strategy} onChange={e => setStrategy(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d3deeb] bg-white px-2 text-sm"><option value="maximize_value">Maximize value</option><option value="balanced">Balanced</option><option value="fast_sale">Fast sale</option></select></label><label className="text-xs font-bold text-[#536174]">Seller target<input type="number" min="0" step="0.01" value={target} onChange={e => setTarget(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d3deeb] bg-white px-2 text-sm" placeholder="Optional" /></label><label className="text-xs font-bold text-[#536174]">Minimum acceptable<input type="number" min="0" step="0.01" value={floor} onChange={e => setFloor(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d3deeb] bg-white px-2 text-sm" placeholder="Optional" /></label></div>
    <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { setEnabled(v => !v); }}><ShieldCheck className="h-4 w-4" />{enabled ? 'Turn AI off' : 'Turn AI on'}</Button><Button type="button" onClick={save} disabled={busy}><Sparkles className="h-4 w-4" />Save AI controls</Button><Button type="button" variant="secondary" onClick={recommend} disabled={busy || !enabled}><RefreshCw className="h-4 w-4" />Analyze live auction</Button></div>
    {message && <div className="mt-3"><Notice tone="success" title="Auctioneer update">{message}</Notice></div>}
    {recommendations[0] && <div className="mt-4 rounded-xl border border-[#d8e2ee] bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#55718f]">Latest strategy</p><span className="text-[10px] text-[#7a899b]">{new Date(recommendations[0].created_at).toLocaleString()}</span></div><p className="mt-2 text-sm font-extrabold capitalize">{recommendations[0].recommendation?.posture?.replaceAll('_', ' ') || 'Monitor'}</p><p className="mt-1 text-xs leading-5 text-[#64748b]">{recommendations[0].recommendation?.nextMove}</p>{recommendations[0].recommendation?.actions?.length ? <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-[#536174]">{recommendations[0].recommendation.actions.slice(0,3).map(action => <li key={action}>{action}</li>)}</ul> : null}</div>}
    {settings && <p className="mt-3 text-[10px] text-[#718096]">AI is guidance only: seller pricing, auction timing and external publishing remain under your controls.</p>}
  </section>;
}
