import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useSignIn } from '@clerk/react/legacy';
import { Link, useLocation } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

type ResetStep = 'email' | 'code' | 'password' | 'complete';

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const errors = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    const first = errors?.[0];
    if (first?.longMessage || first?.message) return first.longMessage || first.message || '';
  }
  return 'Something went wrong. Please try again.';
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="noise flex min-h-[100dvh] items-center justify-center bg-[#f5f1e8] px-4 py-8">
      <div className="w-full max-w-[440px]">
        <div className="mb-7 text-center">
          <Link href="/" className="inline-flex" data-testid="link-reset-logo">
            <span className="font-mono text-xs font-medium tracking-[.08em] text-[#1f2b38]">TS COMMERCE PLATTFORM</span>
          </Link>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[.16em] text-[#c85d3f]">A clearer way to run your commerce</p>
        </div>
        {children}
      </div>
    </main>
  );
}

function ResetCard({
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)] sm:p-8">
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fae8df] text-[#b14f36]">{icon}</div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[#182333]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#697687]">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function PasswordReset() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<ResetStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || !signIn) return;
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setStep('code');
      setMessage('If an account uses this email, a verification code is on its way.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || !signIn) return;
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
      });
      setStep('password');
      setMessage('Your email is verified. Choose a new password.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || !signIn) return;
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      const result = await signIn.resetPassword({
        password,
        signOutOfOtherSessions: true,
      });
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw new Error('Password reset could not be completed. Please start again.');
      }
      await setActive({ session: result.createdSessionId });
      setStep('complete');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (!isLoaded || !signIn) return;
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setMessage('A new verification code has been sent.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell>
      {step === 'email' && (
        <ResetCard
          eyebrow="Account recovery"
          title="Forgot your password?"
          description="Enter the email address on your account and we’ll send a verification code to reset it."
          icon={<Mail className="h-5 w-5" />}
        >
          <form onSubmit={submitEmail} className="space-y-4">
            <label className="block text-sm font-bold text-[#182333]">
              Email address
              <input
                required
                autoFocus
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none transition focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15"
                placeholder="you@example.com"
                data-testid="input-reset-email"
              />
            </label>
            {error && <p className="rounded-xl bg-[#fff0ed] px-3 py-3 text-sm leading-5 text-[#943b35]" role="alert">{error}</p>}
            <button type="submit" disabled={!isLoaded || isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] transition hover:bg-[#25354a] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-send-reset-code">
              {isSubmitting ? 'Sending code…' : 'Send verification code'} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-[#697687]">
            Remembered it? <Link href="/sign-in" className="font-extrabold text-[#b14f36] underline">Back to sign in</Link>
          </p>
        </ResetCard>
      )}

      {step === 'code' && (
        <ResetCard
          eyebrow="Verify your email"
          title="Enter your code"
          description={`Enter the verification code sent to ${email.trim()}. The code confirms it’s really you.`}
          icon={<ShieldCheck className="h-5 w-5" />}
        >
          <form onSubmit={submitCode} className="space-y-4">
            <label className="block text-sm font-bold text-[#182333]">
              Verification code
              <input
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                minLength={4}
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-center font-mono text-lg tracking-[.35em] text-[#182333] outline-none transition focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15"
                placeholder="123456"
                data-testid="input-reset-code"
              />
            </label>
            {message && <p className="rounded-xl bg-[#eff8f3] px-3 py-3 text-sm leading-5 text-[#2f6958]" role="status">{message}</p>}
            {error && <p className="rounded-xl bg-[#fff0ed] px-3 py-3 text-sm leading-5 text-[#943b35]" role="alert">{error}</p>}
            <button type="submit" disabled={!isLoaded || isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] transition hover:bg-[#25354a] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-verify-reset-code">
              {isSubmitting ? 'Verifying…' : 'Verify code'} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-5 flex items-center justify-between gap-3 text-sm">
            <button type="button" onClick={() => { setStep('email'); setError(''); setMessage(''); }} className="inline-flex items-center gap-1 font-bold text-[#697687] hover:text-[#182333]" data-testid="button-change-reset-email">
              <ArrowLeft className="h-4 w-4" /> Change email
            </button>
            <button type="button" onClick={() => void resendCode()} disabled={isSubmitting} className="font-extrabold text-[#b14f36] underline disabled:opacity-50" data-testid="button-resend-reset-code">
              Resend code
            </button>
          </div>
        </ResetCard>
      )}

      {step === 'password' && (
        <ResetCard
          eyebrow="New password"
          title="Create a new password"
          description="Use a strong password you haven’t used for this account before."
          icon={<KeyRound className="h-5 w-5" />}
        >
          <form onSubmit={submitPassword} className="space-y-4">
            <label className="block text-sm font-bold text-[#182333]">
              New password
              <input
                required
                autoFocus
                autoComplete="new-password"
                type="password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none transition focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15"
                data-testid="input-new-password"
              />
            </label>
            <label className="block text-sm font-bold text-[#182333]">
              Confirm new password
              <input
                required
                autoComplete="new-password"
                type="password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none transition focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15"
                data-testid="input-confirm-password"
              />
            </label>
            {message && <p className="rounded-xl bg-[#eff8f3] px-3 py-3 text-sm leading-5 text-[#2f6958]" role="status">{message}</p>}
            {error && <p className="rounded-xl bg-[#fff0ed] px-3 py-3 text-sm leading-5 text-[#943b35]" role="alert">{error}</p>}
            <button type="submit" disabled={!isLoaded || isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] transition hover:bg-[#25354a] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-reset-password">
              {isSubmitting ? 'Updating password…' : 'Update password'} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </ResetCard>
      )}

      {step === 'complete' && (
        <ResetCard
          eyebrow="All set"
          title="Your password was updated"
          description="You’re signed in with your new password. Your other sessions were signed out for your security."
          icon={<CheckCircle2 className="h-5 w-5" />}
        >
          <button type="button" onClick={() => setLocation('/dashboard')} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] transition hover:bg-[#25354a]" data-testid="button-continue-after-reset">
            Continue to workspace <ArrowRight className="h-4 w-4" />
          </button>
        </ResetCard>
      )}
    </AuthShell>
  );
}