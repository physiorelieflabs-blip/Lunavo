import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from "react";

type User={id:string;email:string;username:string;firstName:string;lastName:string;fullName:string;role:string;primaryEmailAddress?:{emailAddress:string;verification?:{status:string}}};
type AuthState={isLoaded:boolean;isSignedIn:boolean;user:User|null;refresh:()=>Promise<void>;updateProfile:(input:{firstName?:string;lastName?:string;username?:string|null})=>Promise<User>;updatePassword:(input:{currentPassword?:string;newPassword:string;signOutOfOtherSessions?:boolean})=>Promise<void>;signOut:(options?:{redirectUrl?:string})=>Promise<void>};
const AuthContext=createContext<AuthState|null>(null);
async function request(path:string,init:RequestInit={}){const response=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{}),...(init.headers||{})},...init});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Authentication request failed");return data;}
export function ClerkProvider({children}:{children:React.ReactNode;publishableKey?:string;proxyUrl?:string;appearance?:unknown;signInUrl?:string;signUpUrl?:string;localization?:unknown;routerPush?:(to:string)=>void;routerReplace?:(to:string)=>void}){const[user,setUser]=useState<User|null>(null);const[isLoaded,setLoaded]=useState(false);const refresh=useCallback(async()=>{try{const data=await request("/api/auth/session");setUser(data.signedIn?{...data.user,fullName:[data.user?.firstName,data.user?.lastName].filter(Boolean).join(" ").trim()}:null);}catch{setUser(null);}finally{setLoaded(true);}},[]);useEffect(()=>{void refresh()},[refresh]);const signOut=useCallback(async(options?:{redirectUrl?:string})=>{await request("/api/auth/sign-out",{method:"POST"});setUser(null);window.dispatchEvent(new CustomEvent("lunavo-auth-changed"));},[]);const updateProfile=useCallback(async(input:{firstName?:string;lastName?:string;username?:string|null})=>{const data=await request("/api/auth/profile",{method:"PUT",body:JSON.stringify(input)});setUser(data.user);window.dispatchEvent(new CustomEvent("lunavo-auth-changed"));return {...(data.user as User),fullName:[(data.user as User).firstName,(data.user as User).lastName].filter(Boolean).join(" ").trim()};},[]);
const updatePassword=useCallback(async(input:{currentPassword?:string;newPassword:string;signOutOfOtherSessions?:boolean})=>{await request("/api/auth/change-password",{method:"POST",body:JSON.stringify(input)});if(input.signOutOfOtherSessions!==false){}},[]);
const value=useMemo(()=>({isLoaded,isSignedIn:Boolean(user),user,refresh,updateProfile,updatePassword,signOut}),[isLoaded,user,refresh,updateProfile,updatePassword,signOut]);return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>}
export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error("useAuth must be used inside ClerkProvider");return{isLoaded:ctx.isLoaded,isSignedIn:ctx.isSignedIn,userId:ctx.user?.id??null,getToken:async()=>null,signOut:ctx.signOut};}
export function useUser(){
  const ctx=useContext(AuthContext);
  if(!ctx)throw new Error("useUser must be used inside ClerkProvider");
  const user=ctx.user?{
    ...ctx.user,
    update:ctx.updateProfile,
    updatePassword:ctx.updatePassword,
    reload:async()=>{await ctx.refresh();if(!ctx.user) return null;return ctx.user;}
  }:null;
  return{isLoaded:ctx.isLoaded,isSignedIn:ctx.isSignedIn,user};
}
export function useClerk(){const ctx=useContext(AuthContext);if(!ctx)throw new Error("useClerk must be used inside ClerkProvider");return{signOut:ctx.signOut,addListener:(listener:(event:{user:User|null})=>void)=>{const handler=()=>listener({user:ctx.user});window.addEventListener("lunavo-auth-changed",handler);return()=>window.removeEventListener("lunavo-auth-changed",handler);}};}
export function Show({when,children}:{when:"signed-in"|"signed-out";children:React.ReactNode}){const{isLoaded,isSignedIn}=useAuth();if(!isLoaded)return null;return when==="signed-in"?(isSignedIn?children:null):(!isSignedIn?children:null);}
function AuthCard({title,submit,children,fields}:{title:string;submit:string;fields:{firstName?:string;lastName?:string;username?:string};children:(state:{email:string;password:string;error:string;busy:boolean;setEmail:React.Dispatch<React.SetStateAction<string>>;setPassword:React.Dispatch<React.SetStateAction<string>>})=>React.ReactNode}){const[email,setEmail]=useState("");const[password,setPassword]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);const submitForm=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await request(submit==="Create account"?"/api/auth/sign-up":"/api/auth/sign-in",{method:"POST",body:JSON.stringify({email,password,...fields})});window.dispatchEvent(new CustomEvent("lunavo-auth-changed"));window.location.assign("/dashboard");}catch(err){setError(err instanceof Error?err.message:"Authentication failed");}finally{setBusy(false);}};return <form onSubmit={submitForm} className="w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)]"><h1 className="mb-5 text-2xl font-extrabold text-[#182333]">{title}</h1>{children({email,password,setEmail,setPassword,error,busy})}</form>;}
type SignInProps={routing?:string;path?:string;signUpUrl?:string;signInUrl?:string;fallbackRedirectUrl?:string;afterSignInUrl?:string};
export function SignIn(_props:SignInProps={}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [mfaToken,setMfaToken]=useState("");
  const [mfaCode,setMfaCode]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    setBusy(true);
    setError("");
    try{
      if(mfaToken){
        if(mfaCode.length!==6) throw new Error("Enter the six-digit authenticator code");
        await request("/api/auth/mfa/verify",{method:"POST",body:JSON.stringify({challengeToken:mfaToken,code:mfaCode})});
      }else{
        const result=await request("/api/auth/sign-in",{method:"POST",body:JSON.stringify({email,password})});
        if(result.mfaRequired){
          setMfaToken(String(result.challengeToken||""));
          setMfaCode("");
          setBusy(false);
          return;
        }
      }
      window.dispatchEvent(new CustomEvent("lunavo-auth-changed"));
      window.location.assign("/dashboard");
    }catch(err){
      setError(err instanceof Error?err.message:"Authentication failed");
    }finally{
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)]">
    <h1 className="mb-5 text-2xl font-extrabold text-[#182333]">{mfaToken?"Verify your authenticator":"Welcome back"}</h1>
    {!mfaToken&&<>
      <label className="block text-sm font-bold">Email<input required autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"/></label>
      <label className="mt-4 block text-sm font-bold">Password<input required autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"/></label>
    </>}
    {mfaToken&&<>
      <p className="text-sm leading-6 text-[#697687]">Enter the six-digit code from the authenticator app. No admin session is created until this check succeeds.</p>
      <label className="mt-4 block text-sm font-bold">Authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,"").slice(0,6))} className="mt-2 h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-center font-mono text-xl tracking-[.35em]"/></label>
    </>}
    {error&&<p className="mt-4 text-sm text-[#943b35]" aria-live="polite">{error}</p>}
    <button disabled={busy||(Boolean(mfaToken)&&mfaCode.length!==6)} className="mt-6 h-11 w-full rounded-xl bg-[#182333] text-sm font-extrabold text-white">{mfaToken?(busy?"Verifying…":"Verify & sign in"):(busy?"Signing in…":"Sign in")}</button>
  </form>;
}
type SignUpProps={routing?:string;path?:string;signInUrl?:string;signUpUrl?:string;fallbackRedirectUrl?:string;afterSignUpUrl?:string;initialValues?:{firstName?:string;lastName?:string;username?:string}};
export function SignUp({initialValues}:SignUpProps={}){
  const [firstName,setFirstName]=useState(initialValues?.firstName??"");
  const [lastName,setLastName]=useState(initialValues?.lastName??"");
  const [username,setUsername]=useState(initialValues?.username??"");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setError("");
    try{
      await request("/api/auth/sign-up",{method:"POST",body:JSON.stringify({firstName:firstName.trim(),lastName:lastName.trim(),username:username.trim().toLowerCase(),email,password})});
      window.dispatchEvent(new CustomEvent("lunavo-auth-changed"));
      window.location.assign("/dashboard");
    }catch(err){setError(err instanceof Error?err.message:"Account creation failed");}
    finally{setBusy(false);}
  };
  return <form onSubmit={submit} className="w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)]">
    <h1 className="mb-5 text-2xl font-extrabold text-[#182333]">Create your Lunavo account</h1>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold">First name<input required maxLength={64} autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"/></label>
      <label className="text-sm font-bold">Last name<input required maxLength={64} autoComplete="family-name" value={lastName} onChange={e=>setLastName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"/></label>
    </div>
    <label className="mt-4 block text-sm font-bold">Username<input required minLength={3} maxLength={64} autoComplete="username" value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g,""))} placeholder="your-store-name" className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"/></label>
    <label className="mt-4 block text-sm font-bold">Email<input required autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"/></label>
    <label className="mt-4 block text-sm font-bold">Password<input required minLength={12} autoComplete="new-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"/></label>
    <p className="mt-2 text-xs leading-5 text-[#697687]">Use at least 12 characters with uppercase, lowercase, a number, and a special character.</p>
    {error&&<p className="mt-4 text-sm text-[#943b35]" aria-live="polite">{error}</p>}
    <button disabled={busy} className="mt-6 h-11 w-full rounded-xl bg-[#182333] text-sm font-extrabold text-white">{busy?"Creating account…":"Create account"}</button>
  </form>;
}
export function useSignIn(){const[identifier,setIdentifier]=useState("");const[code,setCode]=useState("");return{isLoaded:true,signIn:{create:async(input:{strategy:string;identifier:string})=>{setIdentifier(input.identifier);return request("/api/auth/reset/request",{method:"POST",body:JSON.stringify({email:input.identifier})});},attemptFirstFactor:async(input:{strategy:string;code:string})=>{setCode(input.code);const result=await request("/api/auth/reset/verify",{method:"POST",body:JSON.stringify({email:identifier,code:input.code})});if(!result.valid)throw new Error("Invalid or expired verification code");return result;},resetPassword:async(input:{password:string;signOutOfOtherSessions?:boolean})=>{await request("/api/auth/reset/complete",{method:"POST",body:JSON.stringify({email:identifier,code,password:input.password})});return{status:"complete",createdSessionId:"local"};}},setActive:async(_input?:{session?:string})=>undefined};}
