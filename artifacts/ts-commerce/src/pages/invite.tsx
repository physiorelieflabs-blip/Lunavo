import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { CheckCircle2, LogIn, ShieldAlert } from 'lucide-react';
import { Link, useLocation, useRoute } from 'wouter';
import { getGetPublicInvitationPreviewQueryKey, useAcceptTeamInvitation, useGetPublicInvitationPreview } from '@workspace/api-client-react';
import { PublicHeader } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice } from '@/components/primitives';

export default function Invite() {
  const [, params] = useRoute('/invite/:token'); const token = params?.token ?? '';
  const preview = useGetPublicInvitationPreview(token, { query: { queryKey: getGetPublicInvitationPreviewQueryKey(token), enabled: !!token, retry: false } });
  const accept = useAcceptTeamInvitation(); const { isLoaded, isSignedIn } = useAuth(); const [, navigate] = useLocation();
  const [result, setResult] = useState('');
  useEffect(() => {
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  if (preview.isLoading || !isLoaded) return <main className="noise min-h-[100dvh] bg-[#f5f1e8]"><PublicHeader /><div className="mx-auto max-w-xl px-5 py-12"><LoadingState label="Loading invitation" /></div></main>;
  if (preview.isError || !preview.data) return <main className="noise min-h-[100dvh] bg-[#f5f1e8]"><PublicHeader /><div className="mx-auto max-w-xl px-5 py-12"><ErrorState onRetry={() => void preview.refetch()} /></div></main>;
  const active = preview.data.status === 'pending' || preview.data.status === 'active';
  const acceptInvite = () => accept.mutate({ data: { token } }, { onSuccess: () => { setResult('Invitation accepted. Taking you to your dashboard…'); window.setTimeout(() => navigate('/dashboard'), 550); }, onError: (error) => setResult(error instanceof Error ? error.message : 'This invitation could not be accepted. It may be for a different email, expired, revoked, or already used.') });
  return <main className="noise min-h-[100dvh] bg-[#f5f1e8] text-[#182333]"><PublicHeader /><div className="mx-auto max-w-xl px-5 py-12"><section className="rounded-2xl border border-[#d5cdbd] bg-[#fcfaf5] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)] sm:p-9"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Team invitation</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em]">Join {preview.data.merchantName}</h1><p className="mt-3 text-sm leading-6 text-[#697687]">You have been invited as <strong className="text-[#182333]">{preview.data.roleName}</strong>. This invitation expires {new Date(preview.data.expiresAt).toLocaleString()}.</p><div className="mt-5"><Badge tone={active ? 'success' : 'danger'}>{preview.data.status}</Badge></div>
    {!active && <Notice tone="danger" title="Invitation unavailable"><p>This link is {preview.data.status}. Ask the merchant to create a new invitation.</p></Notice>}
    {result && <Notice tone={result.startsWith('Invitation accepted') ? 'success' : 'danger'} title={result.startsWith('Invitation accepted') ? 'Access granted' : 'Unable to accept'}>{result}</Notice>}
    {active && !result.startsWith('Invitation accepted') && <div className="mt-6">{!isSignedIn ? <><Notice tone="info" title="Sign-in required">Sign in using the exact email address this invitation was sent to, then return to this link to accept it.</Notice><Link href={`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#1f2b38] px-4 text-sm font-bold text-[#f8f3e8]"><LogIn className="h-4 w-4" />Sign in to accept</Link></> : <Button onClick={acceptInvite} disabled={accept.isPending}><CheckCircle2 className="h-4 w-4" />{accept.isPending ? 'Accepting…' : 'Accept invitation'}</Button>}</div>}
    <div className="mt-7 flex gap-2 border-t border-[#e2ddd2] pt-5 text-xs text-[#697687]"><ShieldAlert className="h-4 w-4 shrink-0 text-[#a2772e]" />For security, acceptance is tied to the invited email. Email mismatch, expiry, revocation, and already-used links are rejected.</div></section></div></main>;
}