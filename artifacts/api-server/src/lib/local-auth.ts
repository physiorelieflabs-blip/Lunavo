import { randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const scrypt = promisify(nodeScrypt);
const COOKIE = "lunavo_session";
const SESSION_DAYS = 30;

export type LocalAuthUser = { id: string; email: string; username: string; firstName: string; lastName: string; role: string };

type AuthRequest = Request & { auth?: { userId: string | null }; localUser?: LocalAuthUser };

function passwordHash(password: string, salt = randomBytes(16)) {
  return scrypt(password, salt, 64).then(key => `${salt.toString("base64url")}.${Buffer.from(key).toString("base64url")}`);
}

async function verifyPassword(password: string, encoded: string) {
  const [saltEncoded, hashEncoded] = encoded.split(".");
  if (!saltEncoded || !hashEncoded) return false;
  const salt = Buffer.from(saltEncoded, "base64url");
  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = Buffer.from(await scrypt(password, salt, expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenHash(token: string) { return Buffer.from(token).toString("hex").slice(0, 128); }
function rawTokenHash(token: string) { return requireHash(token); }
function requireHash(token: string) {
  return Buffer.from(token).toString("base64url");
}

function readCookie(req: Request) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function authenticateRequest(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const token = readCookie(req);
    if (!token) { req.auth = { userId: null }; next(); return; }
    const digest = tokenHash(token);
    const result = await db.execute(sql`SELECT u.id,u.email,u.username,u.first_name,u.last_name,u.role FROM local_auth_sessions s INNER JOIN local_auth_users u ON u.id=s.user_id WHERE s.token_hash=${digest} AND s.expires_at>now() LIMIT 1`);
    const row = result.rows[0] as any;
    if (!row) { req.auth = { userId: null }; next(); return; }
    req.auth = { userId: String(row.id) };
    req.localUser = { id:String(row.id), email:String(row.email), username:String(row.username), firstName:String(row.first_name), lastName:String(row.last_name), role:String(row.role) };
    await db.execute(sql`UPDATE local_auth_sessions SET last_seen_at=now() WHERE token_hash=${digest}`);
    next();
  } catch (error) { next(error); }
}

export async function createLocalSession(userId: string) {
  const token = randomBytes(48).toString("base64url");
  await db.execute(sql`INSERT INTO local_auth_sessions (id,user_id,token_hash,expires_at) VALUES (${randomUUID()},${userId},${tokenHash(token)},now()+${SESSION_DAYS} * interval '1 day')`);
  return token;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/", maxAge:SESSION_DAYS*24*60*60*1000 });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/" });
}

export async function registerLocalUser(input:{email:string;username:string;firstName:string;lastName:string;password:string;role?:string}) {
  if(input.password.length < 8) throw new Error("Password must be at least 8 characters");
  const id=randomUUID();
  const hash=await passwordHash(input.password);
  await db.transaction(async tx=>{
    await tx.execute(sql`INSERT INTO local_auth_users (id,email,username,first_name,last_name,password_hash,role) VALUES (${id},${input.email.toLowerCase()},${input.username},${input.firstName},${input.lastName},${hash},${input.role??"merchant"})`);
    await tx.execute(sql`INSERT INTO merchants (local_auth_user_id,clerk_user_id,name,email,store_name,status) VALUES (${id},${id},${`${input.firstName} ${input.lastName}`.trim()},${input.email.toLowerCase()},${`${input.firstName}'s Store`.slice(0,120)},'active')`);
    await tx.execute(sql`INSERT INTO subscriptions (merchant_id,amount_due,amount_paid,earnings_held,status,payment_method) SELECT id,30,0,0,'pending',NULL FROM merchants WHERE local_auth_user_id=${id}`);
  });
  return { id, email:input.email.toLowerCase(), username:input.username, firstName:input.firstName, lastName:input.lastName, role:input.role??"merchant" };
}

export async function verifyLocalCredentials(email:string,password:string) {
  const result=await db.execute(sql`SELECT id,email,username,first_name,last_name,password_hash,role FROM local_auth_users WHERE lower(email)=lower(${email.trim()}) LIMIT 1`);
  const row=result.rows[0] as any;
  if(!row || !(await verifyPassword(password,String(row.password_hash)))) throw new Error("Invalid email or password");
  return { id:String(row.id), email:String(row.email), username:String(row.username), firstName:String(row.first_name), lastName:String(row.last_name), role:String(row.role) };
}

export { COOKIE };
