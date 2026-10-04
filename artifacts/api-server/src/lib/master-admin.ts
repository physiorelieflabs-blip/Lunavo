import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export const MASTER_ADMIN_EMAIL = process.env.LUNAVO_MASTER_ADMIN_EMAIL?.trim().toLowerCase() || "ifeoluwaolowu4@gmail.com";

export async function isMasterAdmin(localUserId: string): Promise<boolean> {
  const pinnedId=process.env.LUNAVO_MASTER_ADMIN_USER_ID?.trim();
  const result=await db.execute(sql`SELECT 1 FROM local_auth_users WHERE id=${localUserId} AND email_verified=true AND role='master_admin' AND (
    lower(email)=lower(${MASTER_ADMIN_EMAIL}) OR (${pinnedId || null} IS NOT NULL AND id=${pinnedId || ""})
  ) LIMIT 1`);
  return result.rows.length>0;
}

export async function requireMasterAdmin(localUserId:string, options:{allowMfaSetup?:boolean}={}):Promise<void>{if(!(await isMasterAdmin(localUserId))){const error=new Error("Master admin access required");(error as Error&{statusCode?:number}).statusCode=403;throw error;}if(!options.allowMfaSetup && !(await masterAdminMfaEnabled(localUserId))){const error=new Error("Master Admin MFA must be enabled before privileged operations are allowed");(error as Error&{statusCode?:number}).statusCode=403;throw error;}}
export const MASTER_ADMIN_ROLE="master_admin" as const;


import { createHash, randomBytes } from "node:crypto";
import {
  createTotpUri,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  verifyTotp,
} from "./withdrawal-security";

function challengeHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function masterAdminMfaEnabled(localUserId: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT 1 FROM master_admin_security WHERE user_id=${localUserId} AND enabled_at IS NOT NULL AND totp_secret_ciphertext IS NOT NULL LIMIT 1`);
  return result.rows.length > 0;
}

export async function beginMasterAdminMfaSetup(localUserId: string): Promise<{ secret: string; otpauthUri: string }> {
  await requireMasterAdmin(localUserId,{allowMfaSetup:true});
  const userResult = await db.execute(sql`SELECT email FROM local_auth_users WHERE id=${localUserId} LIMIT 1`);
  const user = userResult.rows[0] as { email?: string } | undefined;
  if (!user?.email) throw new Error("Master Admin account email is unavailable");
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  await db.execute(sql`INSERT INTO master_admin_security (user_id,pending_totp_secret_ciphertext,pending_totp_expires_at,updated_at)
    VALUES (${localUserId},${encrypted},now()+interval '10 minutes',now())
    ON CONFLICT (user_id) DO UPDATE SET pending_totp_secret_ciphertext=EXCLUDED.pending_totp_secret_ciphertext,pending_totp_expires_at=EXCLUDED.pending_totp_expires_at,updated_at=now()`);
  return { secret, otpauthUri: createTotpUri(secret, user.email) };
}

export async function confirmMasterAdminMfa(localUserId: string, code: string): Promise<void> {
  await requireMasterAdmin(localUserId,{allowMfaSetup:true});
  const result = await db.execute(sql`SELECT pending_totp_secret_ciphertext,pending_totp_expires_at FROM master_admin_security WHERE user_id=${localUserId} LIMIT 1`);
  const row = result.rows[0] as { pending_totp_secret_ciphertext?: string; pending_totp_expires_at?: string | Date } | undefined;
  if (!row?.pending_totp_secret_ciphertext || !row.pending_totp_expires_at || new Date(row.pending_totp_expires_at).getTime() <= Date.now()) {
    throw new Error("MFA setup has expired; start setup again");
  }
  const secret = decryptSecret(String(row.pending_totp_secret_ciphertext));
  if (!verifyTotp(secret, code)) throw new Error("Invalid authenticator code");
  await db.execute(sql`UPDATE master_admin_security SET totp_secret_ciphertext=${row.pending_totp_secret_ciphertext},pending_totp_secret_ciphertext=NULL,pending_totp_expires_at=NULL,enabled_at=now(),failed_attempts=0,locked_until=NULL,last_used_step=NULL,updated_at=now() WHERE user_id=${localUserId}`);
}

export async function verifyMasterAdminMfa(localUserId: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`SELECT totp_secret_ciphertext,failed_attempts,locked_until,last_used_step FROM master_admin_security WHERE user_id=${localUserId} AND enabled_at IS NOT NULL LIMIT 1 FOR UPDATE`);
    const row = result.rows[0] as any;
    if (!row?.totp_secret_ciphertext) return false;
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) return false;
    const secret = decryptSecret(String(row.totp_secret_ciphertext));
    const step = Math.floor(Date.now() / 1000 / 30);
    if (row.last_used_step !== null && Number(row.last_used_step) === step) return false;
    if (!verifyTotp(secret, code)) {
      const attempts = Number(row.failed_attempts ?? 0) + 1;
      const locked = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await tx.execute(sql`UPDATE master_admin_security SET failed_attempts=${attempts},locked_until=${locked},updated_at=now() WHERE user_id=${localUserId}`);
      return false;
    }
    await tx.execute(sql`UPDATE master_admin_security SET failed_attempts=0,locked_until=NULL,last_used_step=${step},updated_at=now() WHERE user_id=${localUserId}`);
    return true;
  });
}

export async function createMasterAdminMfaChallenge(localUserId: string): Promise<{ token: string; expiresAt: string }> {
  await requireMasterAdmin(localUserId);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.execute(sql`DELETE FROM master_admin_mfa_challenges WHERE expires_at<=now() OR user_id=${localUserId}`);
  await db.execute(sql`INSERT INTO master_admin_mfa_challenges (user_id,challenge_hash,expires_at) VALUES (${localUserId},${challengeHash(token)},${expiresAt})`);
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function verifyMasterAdminMfaChallenge(token: string, code: string): Promise<string | null> {
  if (!token || !/^\d{6}$/.test(code)) return null;
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`SELECT id,user_id,attempts,expires_at FROM master_admin_mfa_challenges WHERE challenge_hash=${challengeHash(token)} LIMIT 1 FOR UPDATE`);
    const row = result.rows[0] as any;
    if (!row || new Date(row.expires_at).getTime() <= Date.now() || Number(row.attempts) >= 5) return null;
    const security = await tx.execute(sql`SELECT totp_secret_ciphertext,failed_attempts,locked_until,last_used_step FROM master_admin_security WHERE user_id=${row.user_id} AND enabled_at IS NOT NULL LIMIT 1 FOR UPDATE`);
    const securityRow = security.rows[0] as any;
    if (!securityRow?.totp_secret_ciphertext) return null;
    if (securityRow.locked_until && new Date(securityRow.locked_until).getTime() > Date.now()) return null;
    const step = Math.floor(Date.now() / 1000 / 30);
    if (securityRow.last_used_step !== null && Number(securityRow.last_used_step) === step) return null;
    const ok = verifyTotp(decryptSecret(String(securityRow.totp_secret_ciphertext)), code);
    if (!ok) {
      const attempts = Number(securityRow.failed_attempts ?? 0) + 1;
      const locked = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await tx.execute(sql`UPDATE master_admin_security SET failed_attempts=${attempts},locked_until=${locked},updated_at=now() WHERE user_id=${row.user_id}`);
      await tx.execute(sql`UPDATE master_admin_mfa_challenges SET attempts=attempts+1 WHERE id=${row.id}`);
      return null;
    }
    await tx.execute(sql`UPDATE master_admin_security SET failed_attempts=0,locked_until=NULL,last_used_step=${step},updated_at=now() WHERE user_id=${row.user_id}`);
    await tx.execute(sql`DELETE FROM master_admin_mfa_challenges WHERE id=${row.id}`);
    return String(row.user_id);
  });
}
