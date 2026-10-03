import { createContext, type Dispatch, type FormEvent, type ReactNode, type SetStateAction, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { setSelectedWorkspaceId } from "@workspace/api-client-react";

export type LocalUser = {
  id: string; email: string; username: string; firstName: string; lastName: string; role: string; fullName: string;
  primaryEmailAddress: { emailAddress: string; verification: { status: "verified" | "unverified" } };
  update: (input: { firstName?: string; lastName?: string; username?: string | null }) => Promise<LocalUser>;
  reload: () => Promise<LocalUser | null>;
  updatePassword: (input: { currentPassword?: string; newPassword: string; signOutOfOtherSessions?: boolean }) => Promise<void>;
};

type AuthState = { isLoaded: boolean; isSignedIn: boolean; user: LocalUser | null; refresh: () => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

function apiError(data: any, fallback: string) { return data?.error ? String(data.error) : fallback; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [listeners, setListeners] = useState<Array<(user: LocalUser | null) => void>>([]);

  const hydrate = async () => {
    try {
      const response = await fetch("/api/auth/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.signedIn && data.user) {
        const next = buildUser(data.user, setUser, hydrate);
        setUser(next); setSelectedWorkspaceId(undefined, next.id);
      } else {
        setUser(null); setSelectedWorkspaceId(null, null);
      }
    } catch { setUser(null); }
    finally { setIsLoaded(true); }
  };

  useEffect(() => { void hydrate(); }, []);
  useEffect(() => { for (const listener of listeners) listener(user); }, [user]);

  const signOut = async () => {
    try { await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } }); }
    finally { setUser(null); setSelectedWorkspaceId(null, null); }
  };

  const value = useMemo(() => ({ isLoaded, isSignedIn: Boolean(user), user, refresh: hydrate, signOut }), [isLoaded, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function buildUser(raw: any, setUser: Dispatch<SetStateAction<LocalUser | null>>, refresh: () => Promise<void>): LocalUser {
  const base = {
    id: String(raw.id), email: String(raw.email ?? ""), username: String(raw.username ?? ""),
    firstName: String(raw.firstName ?? ""), lastName: String(raw.lastName ?? ""), role: String(raw.role ?? "merchant"),
    fullName: [String(raw.firstName ?? "").trim(), String(raw.lastName ?? "").trim()].filter(Boolean).join(" "),
    primaryEmailAddress: { emailAddress: String(raw.email ?? ""), verification: { status: raw.emailVerified === false ? "unverified" as const : "verified" as const } },
  };
  return {
    ...base,
    async update(input) {
      const response = await fetch("/api/auth/profile", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(input) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(apiError(data, "Profile update failed"));
      const next = buildUser(data.user, setUser, refresh); setUser(next); return next;
    },
    async reload() {
      const response = await fetch("/api/auth/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({})); if (!response.ok || !data?.user) { setUser(null); return null; }
      const next = buildUser(data.user, setUser, refresh); setUser(next); return next;
    },
    async updatePassword(input) {
      const response = await fetch("/api/auth/change-password", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ currentPassword: input.currentPassword ?? "", newPassword: input.newPassword, signOutOfOtherSessions: input.signOutOfOtherSessions ?? true }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(apiError(data, "Password update failed"));
    },
  };
}

export function useLocalAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing"); return value; }
export function useUser() { const auth = useLocalAuth(); return { isLoaded: auth.isLoaded, user: auth.user }; }
export function useAuth() { const auth = useLocalAuth(); return { isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, getToken: async () => null as string | null }; }
export function useClerk() { const auth = useLocalAuth(); return { signOut: async (options?: { redirectUrl?: string }) => { await auth.signOut(); if (options?.redirectUrl) window.location.assign(options.redirectUrl); }, addListener: (_listener: ({ user }: { user: LocalUser | null }) => void) => () => undefined }; }

export function Show({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) {
  const { isLoaded, isSignedIn } = useLocalAuth(); if (!isLoaded) return null;
  return when === "signed-in" ? (isSignedIn ? <>{children}</> : null) : (!isSignedIn ? <>{children}</> : null);
}

export function SignIn({ fallbackRedirectUrl = "/dashboard" }: { routing?: string; path?: string; signUpUrl?: string; fallbackRedirectUrl?: string }) {
  const { refresh } = useLocalAuth(); const [, navigate] = useLocation();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState(""); const [challenge, setChallenge] = useState(""); const [verificationEmail, setVerificationEmail] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(challenge ? "/api/auth/mfa/verify" : "/api/auth/sign-in", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(challenge ? { challengeToken: challenge, code: code.trim() } : { email: email.trim(), password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiError(data, "Sign in failed"));
      if (data.mfaRequired && data.challengeToken) { setChallenge(String(data.challengeToken)); setCode(""); return; }
      if (data.verificationRequired && data.user?.email) { setVerificationEmail(String(data.user.email)); return; }
      await refresh(); navigate(fallbackRedirectUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in failed"); } finally { setBusy(false); }
  };
  if (verificationEmail) return <EmailVerificationPanel email={verificationEmail} onVerified={async()=>{setVerificationEmail("");await refresh();navigate(fallbackRedirectUrl);}} />;
  return <form onSubmit={submit} className="w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)] sm:p-8">
    <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">{challenge ? "Authenticator required" : "Secure sign in"}</p>
    <h1 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[#182333]">{challenge ? "Enter your admin code" : "Welcome back"}</h1>
    {!challenge && <><label className="mt-6 block text-sm font-bold text-[#182333]">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label><label className="mt-4 block text-sm font-bold text-[#182333]">Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label></>}
    {challenge && <label className="mt-6 block text-sm font-bold text-[#182333]">6-digit authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-center font-mono text-lg tracking-[.3em]" /></label>}
    {error && <p className="mt-4 rounded-xl bg-[#fff0ed] px-3 py-3 text-sm text-[#943b35]" role="alert">{error}</p>}
    <button disabled={busy} className="mt-6 h-11 w-full rounded-xl bg-[#182333] text-sm font-extrabold text-[#f8f3e8] disabled:opacity-50">{busy ? "Working…" : challenge ? "Verify and continue" : "Sign in"}</button>
  </form>;
}

function EmailVerificationPanel({ email, onVerified }: { email: string; onVerified: (user: LocalUser) => Promise<void> }) {
  const [address,setAddress]=useState(email);
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [resending,setResending]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const verify=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/auth/verify-email",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({email:address.trim(),code:code.trim()})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(apiError(data,"Email verification failed"));
      await onVerified(data.user);
    }catch(caught){setError(caught instanceof Error?caught.message:"Email verification failed");}finally{setBusy(false);}
  };
  const resend=async()=>{
    setResending(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/auth/resend-verification",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({email:address.trim()})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(apiError(data,"Verification email could not be sent"));
      setMessage(String(data.message||"A new verification code has been sent."));
    }catch(caught){setError(caught instanceof Error?caught.message:"Verification email could not be sent");}finally{setResending(false);}
  };
  return <div className="w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)] sm:p-8">
    <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">Email verification</p>
    <h1 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[#182333]">Verify your email.</h1>
    <p className="mt-3 text-sm leading-6 text-[#697687]">We sent a six-digit code to the email address below. The code expires after 15 minutes.</p>
    <label className="mt-6 block text-sm font-bold">Email address<input required type="email" autoComplete="email" value={address} onChange={e=>setAddress(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label>
    <label className="mt-4 block text-sm font-bold">Verification code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-center font-mono text-lg tracking-[.3em]" /></label>
    {error&&<p className="mt-4 rounded-xl bg-[#fff0ed] px-3 py-3 text-sm text-[#943b35]" role="alert">{error}</p>}
    {message&&<p className="mt-4 rounded-xl bg-[#eefaf4] px-3 py-3 text-sm text-[#197653]">{message}</p>}
    <button disabled={busy} className="mt-6 h-11 w-full rounded-xl bg-[#182333] text-sm font-extrabold text-[#f8f3e8] disabled:opacity-50">{busy?"Verifying…":"Verify email"}</button>
    <button type="button" disabled={resending} onClick={()=>void resend()} className="mt-3 h-10 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] text-sm font-extrabold text-[#182333] disabled:opacity-50">{resending?"Sending…":"Resend verification code"}</button>
  </div>;
}

export function SignUp({ initialValues, fallbackRedirectUrl = "/dashboard" }: { routing?: string; path?: string; signInUrl?: string; fallbackRedirectUrl?: string; initialValues?: { firstName?: string; lastName?: string; username?: string } }) {
  const { refresh } = useLocalAuth(); const [, navigate] = useLocation();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [firstName, setFirstName] = useState(initialValues?.firstName ?? ""); const [lastName, setLastName] = useState(initialValues?.lastName ?? ""); const [username, setUsername] = useState(initialValues?.username ?? ""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [verificationRequired, setVerificationRequired] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try {
    const response = await fetch("/api/auth/sign-up", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(), username: username.trim().replace(/^@+/, "") }) });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(apiError(data, "Account creation failed"));
    if(data.verificationRequired){setVerificationRequired(true);return;}
    await refresh(); navigate(fallbackRedirectUrl);
  } catch (caught) { setError(caught instanceof Error ? caught.message : "Account creation failed"); } finally { setBusy(false); } };
  if(verificationRequired)return <EmailVerificationPanel email={email} onVerified={async(user)=>{await refresh();navigate(fallbackRedirectUrl);}} />;
  return <form onSubmit={submit} className="w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)] sm:p-8">
    <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">Create your workspace</p><h1 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[#182333]">Open your Lunavo account</h1>
    <p className="mt-3 text-sm leading-6 text-[#697687]">Create your merchant account, then verify your email before sensitive account actions.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">First name<input required value={firstName} onChange={e=>setFirstName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label><label className="text-sm font-bold">Last name<input required value={lastName} onChange={e=>setLastName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label></div>
    <label className="mt-4 block text-sm font-bold">Username<input required minLength={3} maxLength={64} value={username} onChange={e=>setUsername(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label>
    <label className="mt-4 block text-sm font-bold">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label>
    <label className="mt-4 block text-sm font-bold">Password<input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3" /></label>
    {error && <p className="mt-4 rounded-xl bg-[#fff0ed] px-3 py-3 text-sm text-[#943b35]" role="alert">{error}</p>}
    <button disabled={busy} className="mt-6 h-11 w-full rounded-xl bg-[#182333] text-sm font-extrabold text-[#f8f3e8] disabled:opacity-50">{busy ? "Creating…" : "Create account"}</button>
  </form>;
}

export function useSignIn() {
  const { refresh } = useLocalAuth();
  const [identifier, setIdentifier] = useState(""); const [challengeCode, setChallengeCode] = useState("");
  const signIn = useMemo(() => ({
    async create(input: { strategy: string; identifier: string }) {
      setIdentifier(input.identifier); const response = await fetch("/api/auth/reset/request", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: input.identifier }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(apiError(data, "Password reset request failed"));
    },
    async attemptFirstFactor(input: { strategy: string; code: string }) {
      setChallengeCode(input.code); const response = await fetch("/api/auth/reset/verify", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: identifier, code: input.code }) });
      const data = await response.json().catch(() => ({})); if (!response.ok || !data.valid) throw new Error("Invalid or expired verification code");
    },
    async resetPassword(input: { password: string; signOutOfOtherSessions?: boolean }) {
      const response = await fetch("/api/auth/reset/complete", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: identifier, code: challengeCode, password: input.password }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(apiError(data, "Password reset failed"));
      await refresh(); return { status: "complete", createdSessionId: "local" as const, user: data.user };
    },
  }), [identifier, challengeCode, refresh]);
  return { isLoaded: true, signIn, setActive: async (_input: { session: string }) => { await refresh(); } };
}