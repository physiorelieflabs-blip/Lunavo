import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const scrypt=(password:string,salt:Buffer,keyLength:number):Promise<Buffer>=>new Promise((resolve,reject)=>nodeScrypt(password,salt,keyLength,(error,key)=>error?reject(error):resolve(key)));export const COOKIE="lunavo_session";const SESSION_DAYS=30;const PASSWORD_MIN_LENGTH=12;
export type LocalAuthUser={id:string;email:string;username:string;firstName:string;lastName:string;role:string;emailVerified:boolean};type AuthRequest=Request&{auth?:{userId:string|null};localUser?:LocalAuthUser};
function sessionHash(token:string){return createHash("sha256").update(token).digest("hex");}
async function passwordHash(password:string){const salt=randomBytes(16);const key=Buffer.from(await scrypt(password,salt,64));return `${salt.toString("base64url")}.${key.toString("base64url")}`;}
async function verifyPassword(password:string,encoded:string){const[saltEncoded,hashEncoded]=encoded.split(".");if(!saltEncoded||!hashEncoded)return false;const salt=Buffer.from(saltEncoded,"base64url");const expected=Buffer.from(hashEncoded,"base64url");const actual=Buffer.from(await scrypt(password,salt,expected.length));return actual.length===expected.length&&timingSafeEqual(actual,expected);}
function readCookie(req:Request){const header=req.headers.cookie;if(!header)return null;for(const pair of header.split(";")){const[name,...value]=pair.trim().split("=");if(name===COOKIE)return decodeURIComponent(value.join("="));}return null;}
export async function authenticateRequest(req:AuthRequest,_res:Response,next:NextFunction){try{const token=readCookie(req);if(!token){req.auth={userId:null};next();return;}const digest=sessionHash(token);const result=await db.execute(sql`SELECT u.id,u.email,u.username,u.first_name,u.last_name,u.role,u.email_verified FROM local_auth_sessions s INNER JOIN local_auth_users u ON u.id=s.user_id WHERE s.token_hash=${digest} AND s.expires_at>now() AND u.role<>'deleted' LIMIT 1`);const row=result.rows[0] as any;if(!row){req.auth={userId:null};next();return;}req.auth={userId:String(row.id)};req.localUser={id:String(row.id),email:String(row.email),username:String(row.username),firstName:String(row.first_name),lastName:String(row.last_name),role:String(row.role),emailVerified:Boolean(row.email_verified)};void db.execute(sql`UPDATE local_auth_sessions SET last_seen_at=now() WHERE token_hash=${digest}`);next();}catch(error){next(error);}}
export async function createLocalSession(userId:string, metadata?: { ipAddress?: string | null; userAgent?: string | null }){const token=randomBytes(48).toString("base64url");await db.execute(sql`INSERT INTO local_auth_sessions (id,user_id,token_hash,expires_at,ip_address,user_agent) VALUES (${randomUUID()},${userId},${sessionHash(token)},now()+${SESSION_DAYS} * interval '1 day',${metadata?.ipAddress?.slice(0,255) ?? null},${metadata?.userAgent?.slice(0,500) ?? null})`);return token;}
export function setSessionCookie(res:Response,token:string){const secure=process.env.NODE_ENV==="production";res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS*24*60*60}${secure?"; Secure":""}`);}
export function clearSessionCookie(res:Response){const secure=process.env.NODE_ENV==="production";res.setHeader("Set-Cookie",`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?"; Secure":""}`);}
export async function revokeCurrentSession(req:Request){const token=readCookie(req);if(token)await db.execute(sql`DELETE FROM local_auth_sessions WHERE token_hash=${sessionHash(token)}`);}
export async function listLocalSessions(userId:string,currentToken:string|null){
  const currentHash=currentToken?sessionHash(currentToken):null;
  const result=await db.execute(sql`SELECT id,created_at,last_seen_at,expires_at,ip_address,user_agent,CASE WHEN ${currentHash ?? ""} <> '' AND token_hash=${currentHash ?? ""} THEN true ELSE false END AS current FROM local_auth_sessions WHERE user_id=${userId} AND expires_at>now() ORDER BY last_seen_at DESC`);
  return result.rows.map((row:any)=>({
    id:String(row.id),createdAt:row.created_at,lastSeenAt:row.last_seen_at,expiresAt:row.expires_at,
    ipAddress:row.ip_address ? String(row.ip_address) : null,userAgent:row.user_agent ? String(row.user_agent) : null,
    current:Boolean(row.current),
  }));
}
export async function revokeLocalSession(userId:string,sessionId:string){
  const result=await db.execute(sql`DELETE FROM local_auth_sessions WHERE id=${sessionId} AND user_id=${userId} RETURNING id`);
  return result.rows.length>0;
}
export async function revokeOtherLocalSessions(userId:string,currentToken:string|null){
  if(currentToken){await db.execute(sql`DELETE FROM local_auth_sessions WHERE user_id=${userId} AND token_hash<>${sessionHash(currentToken)}`);}
  else {await db.execute(sql`DELETE FROM local_auth_sessions WHERE user_id=${userId}`);}
}
export async function registerLocalUser(input:{email:string;username:string;firstName:string;lastName:string;password:string}){const email=input.email.trim().toLowerCase();const username=input.username.trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Error("Enter a valid email address");if(!/^[a-z0-9_.-]{3,64}$/.test(username))throw new Error("Username must be 3–64 letters, numbers, dots, dashes, or underscores");if(input.password.length<PASSWORD_MIN_LENGTH)throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);const id=randomUUID();const hash=await passwordHash(input.password);await db.transaction(async tx=>{await tx.execute(sql`INSERT INTO local_auth_users (id,email,username,first_name,last_name,password_hash,email_verified,role) VALUES (${id},${email},${username},${input.firstName.trim()},${input.lastName.trim()},${hash},false,${"merchant"})`);await tx.execute(sql`INSERT INTO merchants (local_auth_user_id,clerk_user_id,name,email,store_name,status) VALUES (${id},${id},${`${input.firstName} ${input.lastName}`.trim()},${email},${`${input.firstName}'s Store`.slice(0,120)},'active')`);await tx.execute(sql`INSERT INTO subscriptions (merchant_id,amount_due,amount_paid,earnings_held,status,payment_method) SELECT id,30,0,0,'pending',NULL FROM merchants WHERE local_auth_user_id=${id}`);});const user=await localAuthUserForId(id);if(!user)throw new Error("Account creation failed");await createEmailVerification(id,email);return user;}
export async function verifyLocalPasswordForUser(userId:string,password:string):Promise<boolean>{
  const result=await db.execute(sql`SELECT password_hash FROM local_auth_users WHERE id=${userId} LIMIT 1`);
  const row=result.rows[0] as {password_hash?:unknown}|undefined;
  if(!row?.password_hash) return false;
  return verifyPassword(password,String(row.password_hash));
}
export async function verifyLocalCredentials(email:string,password:string){
  return db.transaction(async (tx)=>{
    const normalizedEmail=email.trim().toLowerCase();
    const result=await tx.execute(sql`SELECT id,email,username,first_name,last_name,password_hash,role,email_verified,failed_login_attempts,login_locked_until FROM local_auth_users WHERE lower(email)=lower(${normalizedEmail}) AND role<>'deleted' LIMIT 1 FOR UPDATE`);
    const row=result.rows[0] as any;
    if(!row) throw new Error("Invalid email or password");
    if(row.login_locked_until && new Date(row.login_locked_until).getTime()>Date.now()) throw new Error("Invalid email or password");
    const valid=await verifyPassword(password,String(row.password_hash));
    if(!valid){
      const attempts=Number(row.failed_login_attempts??0)+1;
      const lockedUntil=attempts>=5?new Date(Date.now()+15*60*1000):null;
      await tx.execute(sql`UPDATE local_auth_users SET failed_login_attempts=${attempts},login_locked_until=${lockedUntil},updated_at=now() WHERE id=${row.id}`);
      throw new Error("Invalid email or password");
    }
    await tx.execute(sql`UPDATE local_auth_users SET failed_login_attempts=0,login_locked_until=NULL,updated_at=now() WHERE id=${row.id}`);
    return{id:String(row.id),email:String(row.email),username:String(row.username),firstName:String(row.first_name),lastName:String(row.last_name),role:String(row.role),emailVerified:Boolean(row.email_verified)};
  });
}
async function deliverLocalMail(email:string,subject:string,body:string){
  const from=process.env.LUNAVO_LOCAL_MAIL_FROM?.trim()||"no-reply@lunavo.local";
  const message="From: "+from+"\nTo: "+email+"\nSubject: "+subject+"\n\n"+body+"\n";
  const root=process.env.LUNAVO_LOCAL_OBJECT_STORAGE_PATH?.trim()||(process.env.NODE_ENV==="production"?"/data/lunavo":"./data/lunavo");
  const outbox=path.join(root,"mail-outbox");
  await mkdir(outbox,{recursive:true});
  await writeFile(path.join(outbox,Date.now()+"-"+randomUUID()+".eml"),message,{mode:0o600});
  return "local_outbox" as const;
}
async function deliverEmailVerificationCode(email:string,code:string){
  return deliverLocalMail(email,"Verify your Lunavo email address","Your Lunavo email verification code is "+code+". It expires in 15 minutes. If you did not create this Lunavo account, ignore this message.");
}
async function createEmailVerification(userId:string,email:string){
  const code=String(100000+randomBytes(4).readUInt32BE(0)%900000).padStart(6,"0");
  await db.transaction(async tx=>{
    await tx.execute(sql`UPDATE local_auth_email_verifications SET consumed_at=now() WHERE user_id=${userId} AND consumed_at IS NULL`);
    await tx.execute(sql`INSERT INTO local_auth_email_verifications (id,user_id,code_hash,expires_at) VALUES (${randomUUID()},${userId},${sessionHash(code)},now()+interval '15 minutes')`);
  });
  await deliverEmailVerificationCode(email,code);
}
export async function verifyEmailVerificationCode(email:string,code:string){
  const result=await db.transaction(async tx=>{
    const rows=await tx.execute(sql`SELECT v.id,v.user_id,v.code_hash,v.attempts FROM local_auth_email_verifications v INNER JOIN local_auth_users u ON u.id=v.user_id WHERE lower(u.email)=lower(${email.trim()}) AND v.consumed_at IS NULL AND v.expires_at>now() ORDER BY v.created_at DESC LIMIT 1 FOR UPDATE`);
    const row=rows.rows[0] as any;
    if(!row||Number(row.attempts)>=5)return null;
    const supplied=Buffer.from(sessionHash(code.trim()));
    const expected=Buffer.from(String(row.code_hash));
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){
      await tx.execute(sql`UPDATE local_auth_email_verifications SET attempts=attempts+1 WHERE id=${row.id}`);
      return null;
    }
    const updated=await tx.execute(sql`UPDATE local_auth_users SET email_verified=true,updated_at=now() WHERE id=${row.user_id} RETURNING id,email,username,first_name,last_name,role,email_verified`);
    await tx.execute(sql`UPDATE local_auth_email_verifications SET consumed_at=now() WHERE id=${row.id} AND consumed_at IS NULL`);
    return updated.rows[0] as any;
  });
  if(!result)return null;
  return{id:String(result.id),email:String(result.email),username:String(result.username),firstName:String(result.first_name),lastName:String(result.last_name),role:String(result.role),emailVerified:Boolean(result.email_verified)};
}
export async function resendEmailVerification(userId:string,email:string){
  const user=await localAuthUserForId(userId);
  if(!user)throw new Error("Account not found");
  if(user.emailVerified)return user;
  await createEmailVerification(userId,email.trim().toLowerCase());
  return user;
}
async function deliverResetCode(email:string,code:string){
  return deliverLocalMail(
    email,
    "Lunavo password reset code",
    `Your Lunavo password reset code is ${code}. It expires in 15 minutes. If you did not request this, ignore this message.`,
  );
}
export async function isLoginContextAnomalous(userId:string, metadata:{ipAddress?:string|null;userAgent?:string|null}):Promise<boolean>{
  const result=await db.execute(sql`SELECT ip_address,user_agent FROM local_auth_sessions WHERE user_id=${userId} AND expires_at>now() ORDER BY last_seen_at DESC LIMIT 1`);
  const row=result.rows[0] as {ip_address?:string|null;user_agent?:string|null}|undefined;
  if(!row)return false;
  const ipDifferent=Boolean(metadata.ipAddress&&row.ip_address&&String(metadata.ipAddress)!==String(row.ip_address));
  const uaDifferent=Boolean(metadata.userAgent&&row.user_agent&&String(metadata.userAgent)!==String(row.user_agent));
  return ipDifferent||uaDifferent;
}

export async function sendMasterAdminLoginAlert(
  email:string,
  metadata:{ipAddress?:string|null;userAgent?:string|null;occurredAt?:Date;suspicious?:boolean;mfaCompleted?:boolean},
):Promise<"local_outbox">{
  const subject=metadata.suspicious?"Lunavo security alert: new Master Admin login context":"Lunavo Master Admin login alert";
  const occurredAt=(metadata.occurredAt??new Date()).toISOString();
  const body=`Master Admin login detected.\n\nTime: ${occurredAt}\nIP: ${metadata.ipAddress||"unknown"}\nUser agent: ${metadata.userAgent||"unknown"}\nMFA completed: ${metadata.mfaCompleted===true?"yes":"no"}\nContext anomaly: ${metadata.suspicious===true?"yes":"no"}\n\nNo passwords, session tokens, API keys, or webhook secrets are included in this alert.`;
  return deliverLocalMail(email,subject,body);
}
export async function requestPasswordReset(email:string){const result=await db.execute(sql`SELECT id FROM local_auth_users WHERE lower(email)=lower(${email.trim()}) LIMIT 1`);const user=result.rows[0] as {id?:string}|undefined;const generic={accepted:true};if(!user?.id)return generic;const code=String(100000+randomBytes(4).readUInt32BE(0)%900000).padStart(6,"0");await db.execute(sql`UPDATE local_auth_password_resets SET consumed_at=now() WHERE user_id=${user.id} AND consumed_at IS NULL`);await db.execute(sql`INSERT INTO local_auth_password_resets (id,user_id,code_hash,expires_at) VALUES (${randomUUID()},${user.id},${sessionHash(code)},now()+interval '15 minutes')`);await deliverResetCode(email.trim().toLowerCase(),code);return generic;}
export async function verifyPasswordResetCode(email:string,code:string){const result=await db.execute(sql`SELECT r.id,r.user_id,r.code_hash,r.attempts FROM local_auth_password_resets r INNER JOIN local_auth_users u ON u.id=r.user_id WHERE lower(u.email)=lower(${email.trim()}) AND r.consumed_at IS NULL AND r.expires_at>now() ORDER BY r.created_at DESC LIMIT 1`);const row=result.rows[0] as any;if(!row||Number(row.attempts)>=5)return false;const valid=timingSafeEqual(Buffer.from(sessionHash(code.trim())),Buffer.from(String(row.code_hash)));if(!valid)await db.execute(sql`UPDATE local_auth_password_resets SET attempts=attempts+1 WHERE id=${row.id}`);return valid;}
export async function completePasswordReset(email:string,code:string,newPassword:string){
  if(newPassword.length<PASSWORD_MIN_LENGTH)throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  const result=await db.transaction(async(tx)=>{
    const rows=await tx.execute(sql`SELECT r.id,r.user_id,r.code_hash,r.attempts,r.expires_at FROM local_auth_password_resets r INNER JOIN local_auth_users u ON u.id=r.user_id WHERE lower(u.email)=lower(${email.trim()}) AND r.consumed_at IS NULL AND r.expires_at>now() ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE`);
    const row=rows.rows[0] as any;
    if(!row||Number(row.attempts)>=5)return{ok:false as const};
    const supplied=Buffer.from(sessionHash(code.trim()));
    const expected=Buffer.from(String(row.code_hash));
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){
      await tx.execute(sql`UPDATE local_auth_password_resets SET attempts=attempts+1 WHERE id=${row.id}`);
      return{ok:false as const};
    }
    const hash=await passwordHash(newPassword);
    const updated=await tx.execute(sql`UPDATE local_auth_users SET password_hash=${hash},updated_at=now() WHERE id=${row.user_id} RETURNING id`);
    const user=updated.rows[0] as {id?:string}|undefined;
    if(!user?.id)return{ok:false as const};
    await tx.execute(sql`UPDATE local_auth_password_resets SET consumed_at=now() WHERE id=${row.id} AND consumed_at IS NULL`);
    await tx.execute(sql`DELETE FROM local_auth_sessions WHERE user_id=${user.id}`);
    return{ok:true as const,userId:String(user.id)};
  });
  if(!result.ok)throw new Error("Invalid or expired verification code");
  return result.userId;
}

export async function localAuthUserForId(userId:string):Promise<LocalAuthUser|null>{
  const result=await db.execute(sql`SELECT id,email,username,first_name,last_name,role,email_verified FROM local_auth_users WHERE id=${userId} LIMIT 1`);
  const row=result.rows[0] as any;
  if(!row)return null;
  return {id:String(row.id),email:String(row.email),username:String(row.username),firstName:String(row.first_name),lastName:String(row.last_name),role:String(row.role),emailVerified:Boolean(row.email_verified)};
}


export async function updateLocalProfile(userId: string, input: { firstName?: string; lastName?: string; username?: string | null }): Promise<LocalAuthUser> {
  const firstName = input.firstName === undefined ? undefined : input.firstName.trim();
  const lastName = input.lastName === undefined ? undefined : input.lastName.trim();
  let username = input.username === undefined ? undefined : input.username === null ? null : input.username.trim().toLowerCase();
  if (firstName !== undefined && (!firstName || firstName.length > 64)) throw new Error("First name is invalid");
  if (lastName !== undefined && (!lastName || lastName.length > 64)) throw new Error("Last name is invalid");
  if (username !== undefined && username !== null && !/^[a-z0-9_.-]{3,64}$/.test(username)) throw new Error("Username is invalid");
  if (username === null) username = (await localAuthUserForId(userId))?.username;
  await db.transaction(async (tx) => {
    if (username !== undefined && username !== null) {
      const duplicate = await tx.execute(sql`SELECT id FROM local_auth_users WHERE lower(username)=lower(${username}) AND id<>${userId} LIMIT 1`);
      if (duplicate.rows.length) throw new Error("Username is already registered");
    }
    if (firstName !== undefined) await tx.execute(sql`UPDATE local_auth_users SET first_name=${firstName}, updated_at=now() WHERE id=${userId}`);
    if (lastName !== undefined) await tx.execute(sql`UPDATE local_auth_users SET last_name=${lastName}, updated_at=now() WHERE id=${userId}`);
    if (username !== undefined && username !== null) {
      await tx.execute(sql`UPDATE local_auth_users SET username=${username}, updated_at=now() WHERE id=${userId}`);
    }
  });
  const user = await localAuthUserForId(userId);
  if (!user) throw new Error("Account not found");
  await db.execute(sql`UPDATE merchants SET name=${(user.firstName + " " + user.lastName).trim()} WHERE clerk_user_id=${userId}`);
  return user;
}

export async function changeLocalPassword(userId: string, currentPassword: string, newPassword: string, currentSessionToken?: string, signOutOfOtherSessions = true): Promise<void> {
  if (newPassword.length < PASSWORD_MIN_LENGTH) throw new Error("Password must be at least 12 characters");
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) throw new Error("Password must include uppercase, lowercase, number, and special character");
  const result = await db.execute(sql`SELECT password_hash FROM local_auth_users WHERE id=${userId} LIMIT 1`);
  const row = result.rows[0] as { password_hash?: string } | undefined;
  if (!row?.password_hash || !(await verifyPassword(currentPassword, String(row.password_hash)))) throw new Error("Current password is incorrect");
  const hash = await passwordHash(newPassword);
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE local_auth_users SET password_hash=${hash}, updated_at=now() WHERE id=${userId}`);
    if (signOutOfOtherSessions) {
      if (currentSessionToken) await tx.execute(sql`DELETE FROM local_auth_sessions WHERE user_id=${userId} AND token_hash<>${sessionHash(currentSessionToken)}`);
      else await tx.execute(sql`DELETE FROM local_auth_sessions WHERE user_id=${userId}`);
    }
  });
}
