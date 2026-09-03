import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowUpRight, Check, CircleAlert, CircleCheck, LoaderCircle, RefreshCw } from 'lucide-react';

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return <span className="inline-flex items-center gap-3" data-testid="brand-logo"><span className="relative grid h-8 w-8 place-items-center rounded-[9px] bg-[#c85d3f] shadow-[0_5px_14px_rgba(200,93,63,.2)]"><span className="absolute h-4 w-[2px] rotate-45 bg-[#f8f3e8]" /><span className="absolute h-4 w-[2px] -rotate-45 bg-[#f8f3e8]" /><span className="absolute h-[2px] w-4 bg-[#f8f3e8]" /></span><span className={`font-mono text-[14px] font-medium tracking-[.02em] ${inverse ? 'text-[#f8f3e8]' : 'text-[#182333]'}`}>TS / COMMERCE</span></span>;
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = { primary: 'bg-[#1f2b38] text-[#f8f3e8] shadow-[0_8px_20px_rgba(31,43,56,.16)] hover:bg-[#2d3a48] active:translate-y-px', secondary: 'border border-[#d5cdbd] bg-[#fcfaf5] text-[#1f2b38] hover:border-[#c85d3f] hover:bg-[#f5eee3]', ghost: 'text-[#536174] hover:bg-[#ebe5db] hover:text-[#1f2b38]', danger: 'border border-[#e2b9b3] bg-[#fff8f5] text-[#a33e38] hover:bg-[#fbedeb]' };
  return <button {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-bold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`} />;
}

export function IconButton({ children, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} aria-label={label} title={label} className={`grid h-9 w-9 place-items-center rounded-[10px] text-[#536174] hover:bg-[#ebe7dd] hover:text-[#1f2b38] ${className}`}>{children}</button>;
}

export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brass' | 'info'; className?: string }) {
  const tones = { neutral: 'bg-[#ebe7dd] text-[#536174]', success: 'bg-[#e3eee9] text-[#2f6958]', warning: 'bg-[#f7edd2] text-[#85601b]', danger: 'bg-[#f6e2de] text-[#a33e38]', brass: 'bg-[#f4e6be] text-[#79591b]', info: 'bg-[#e1ebee] text-[#316071]' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] ${tones[tone]} ${className}`}>{children}</span>;
}

export function MetricCard({ label, value, detail, icon, accent = false }: { label: string; value: string; detail?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return <section className={`group rounded-[15px] border p-5 shadow-[0_10px_24px_rgba(31,39,48,.045)] transition-transform duration-300 hover:-translate-y-0.5 ${accent ? 'border-[#d88c75] bg-[#fae8df]' : 'border-[#d5cdbd] bg-[#fcfaf5]'}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#697687]">{label}</p><span className="text-[#c85d3f]">{icon}</span></div><p className="mt-4 font-mono text-[clamp(1.65rem,3vw,2.3rem)] tracking-[-.08em] text-[#1f2b38]" data-testid={`value-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p>{detail && <div className="mt-2 text-xs text-[#697687]">{detail}</div>}</section>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-5 flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">{eyebrow}</p><h2 className="mt-1 text-xl font-extrabold tracking-[-.04em] text-[#182333]">{title}</h2>{description && <p className="mt-1 max-w-xl text-sm text-[#697687]">{description}</p>}</div>{action}</div>;
}

export function Notice({ tone = 'warning', title, children, onDismiss }: { tone?: 'warning' | 'danger' | 'success' | 'info'; title: string; children: ReactNode; onDismiss?: () => void }) {
  const Icon = tone === 'success' ? CircleCheck : CircleAlert;
  const styles = { warning: 'border-[#dfc27a] bg-[#fff7df] text-[#765817]', danger: 'border-[#e2b9b3] bg-[#fff3f0] text-[#943b35]', success: 'border-[#b8d6ca] bg-[#eff8f3] text-[#2e6957]', info: 'border-[#bfd6dc] bg-[#eef7f8] text-[#315e6c]' };
  return <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${styles[tone]}`} data-testid={`notice-${tone}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{title}</p><div className="mt-0.5 text-xs leading-5 opacity-85">{children}</div></div>{onDismiss && <button onClick={onDismiss} className="text-xs font-bold underline" data-testid="button-dismiss-notice">Dismiss</button>}</div>;
}

export function LoadingState({ label = 'Loading ledger' }: { label?: string }) {
  return <div className="space-y-4" aria-label={label} data-testid="state-loading">{[1, 2, 3].map((item) => <div key={item} className="skeleton-shimmer h-16 rounded-2xl bg-[#e8e3d9]" />)}</div>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-2xl border border-[#e2b9b3] bg-[#fff3f0] p-8 text-center" data-testid="state-error"><CircleAlert className="mx-auto h-7 w-7 text-[#a33e38]" /><h3 className="mt-3 font-extrabold text-[#182333]">The ledger is taking a moment</h3><p className="mt-1 text-sm text-[#697687]">We could not load this view. Your account is safe.</p><Button variant="secondary" className="mt-4" onClick={onRetry} data-testid="button-retry"><RefreshCw className="h-4 w-4" />Try again</Button></div>;
}

export function SubmitButton({ loading, children }: { loading?: boolean; children: ReactNode }) {
  return <Button type="submit" disabled={loading} data-testid="button-submit">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{loading ? 'Saving…' : children}</Button>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-[#cfc7b8] bg-[#f7f4ed] px-6 py-12 text-center" data-testid="state-empty"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><ArrowUpRight className="h-5 w-5" /></div><h3 className="mt-4 font-extrabold text-[#182333]">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-[#697687]">{description}</p></div>;
}