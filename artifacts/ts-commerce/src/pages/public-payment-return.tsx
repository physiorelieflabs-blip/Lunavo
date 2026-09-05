import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, LoadingState, Notice } from '@/components/primitives';
import { money } from '@/lib/format';

type Verification = {
  orderNumber: string;
  total: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  paymentMessage: string;
};

export default function PublicPaymentReturn() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const apiBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const verify = useCallback(async () => {
    if (!token) {
      setError('This payment session is missing its secure token.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
     try {
       const transactionId = new URLSearchParams(window.location.search).get('transaction_id')
         ?? new URLSearchParams(window.location.search).get('tx_ref')
         ?? '';
       const response = await fetch(`${apiBasePath}/api/public/checkout/${encodeURIComponent(token)}/verify`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(transactionId ? { transaction_id: transactionId } : {}),
      });
      const payload = await response.json() as Verification & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Payment verification could not be completed.');
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment verification could not be completed.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void verify(); }, [verify]);

  const reopenPaymentSession = async () => {
    setError('');
    try {
      const response = await fetch(`${apiBasePath}/api/public/checkout/${encodeURIComponent(token)}/retry`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
        const payload = await response.json() as { paymentStatus?: string; paymentUrl?: string | null; error?: string };
       if (!response.ok) throw new Error(payload.error || 'The TS Commerce payment session could not be reopened.');
        if (payload.paymentUrl) {
          window.location.assign(payload.paymentUrl);
          return;
        }
       setError(payload.paymentStatus === 'submitted'
         ? 'Payment evidence is already awaiting merchant approval.'
         : 'The native payment session is ready. Submit your payment reference from the order page.');
       void verify();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The TS Commerce payment session could not be reopened.');
    }
  };

  return <main className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] px-5 py-10 text-[#182333]">
    <section className="w-full max-w-[560px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-7 shadow-[0_18px_38px_rgba(31,43,56,.07)] md:p-10">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">TS Commerce payment status</p>
      {loading ? <div className="mt-8"><LoadingState label="Checking your TS Commerce payment" /></div> : error ? <div className="mt-7"><Notice tone="danger" title="Payment status unavailable">{error}</Notice><Button variant="secondary" className="mt-5" onClick={() => void verify()}><RefreshCw className="h-4 w-4" />Try again</Button></div> : result ? <div className="mt-7">
        <div className={`grid h-12 w-12 place-items-center rounded-full ${result.status === 'paid' ? 'bg-[#e8f4ed] text-[#2f6958]' : result.status === 'failed' ? 'bg-[#fff0ed] text-[#a33e38]' : 'bg-[#fff7df] text-[#a2772e]'}`}>
          {result.status === 'paid' ? <CheckCircle2 className="h-6 w-6" /> : result.status === 'failed' ? <TriangleAlert className="h-6 w-6" /> : <Clock3 className="h-6 w-6" />}
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-[#697687]">{result.status === 'paid' ? 'Payment confirmed' : result.status === 'failed' ? 'Payment failed' : 'Payment processing'}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em]">{result.orderNumber}</h1>
        <p className="mt-3 text-sm leading-6 text-[#697687]">{result.paymentMessage}</p>
        <p className="mt-6 flex items-center justify-between border-y border-[#ded8cd] py-4 text-sm"><span className="text-[#697687]">Order total</span><strong className="font-mono">{money(result.total, result.currency)}</strong></p>
         {result.status !== 'paid' && <div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => void verify()}><RefreshCw className="h-4 w-4" />Check again</Button><Button variant="secondary" onClick={() => void reopenPaymentSession()}>Reopen payment session</Button></div>}
      </div> : null}
    </section>
  </main>;
}