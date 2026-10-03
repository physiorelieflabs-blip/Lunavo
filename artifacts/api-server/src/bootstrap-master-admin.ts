import { randomBytes, randomUUID, scrypt as nodeScrypt } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const scrypt = (password: string, salt: Buffer, keyLength: number): Promise<Buffer> => new Promise((resolve, reject) => nodeScrypt(password, salt, keyLength, (error, key) => error ? reject(error) : resolve(key)));
const email = process.env.LUNAVO_MASTER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.LUNAVO_MASTER_ADMIN_PASSWORD;
const username = (process.env.LUNAVO_MASTER_ADMIN_USERNAME?.trim().toLowerCase() || "tsadmin");

function assertPassword(value: string): void {
  if (
    value.length < 12 ||
    !/[A-Z]/.test(value) ||
    !/[a-z]/.test(value) ||
    !/[0-9]/.test(value) ||
    !/[!@#$%^&*(),.?":{}|<>]/.test(value)
  ) throw new Error("LUNAVO_MASTER_ADMIN_PASSWORD must be at least 12 characters and contain uppercase, lowercase, a number and a special character");
}

async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16);
  const key = Buffer.from(await scrypt(value, salt, 64));
  return salt.toString("base64url") + "." + key.toString("base64url");
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!email || !email.includes("@")) throw new Error("LUNAVO_MASTER_ADMIN_EMAIL is required");
if (!password) throw new Error("LUNAVO_MASTER_ADMIN_PASSWORD is required");
if (!/^[a-z0-9_.-]{3,64}$/.test(username)) throw new Error("LUNAVO_MASTER_ADMIN_USERNAME is invalid");
assertPassword(password);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const hash = await hashPassword(password);
  await pool.query("BEGIN");
  try {
    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM local_auth_users WHERE lower(email)=lower($1) OR lower(username)=lower($2) LIMIT 1 FOR UPDATE",
      [email, username],
    );

    let id: string;
    if (existing.rowCount) {
      id = existing.rows[0]!.id;
      await pool.query(
        "UPDATE local_auth_users SET email=$1, username=$2, password_hash=$3, email_verified=true, role='master_admin', updated_at=now() WHERE id=$4",
        [email, username, hash, id],
      );
      console.log("Master Admin updated:", username);
    } else {
      id = randomUUID();
      await pool.query(
        "INSERT INTO local_auth_users (id,email,username,first_name,last_name,password_hash,email_verified,role) VALUES ($1,$2,$3,$4,$5,$6,true,'master_admin')",
        [id, email, username, "TS", "Admin", hash],
      );
      console.log("Master Admin created:", username);
    }

    const merchant = await pool.query<{ id: number }>(
      "SELECT id FROM merchants WHERE local_auth_user_id=$1 OR clerk_user_id=$1 LIMIT 1 FOR UPDATE",
      [id],
    );
    if (!merchant.rowCount) {
      const created = await pool.query<{ id: number }>(
        "INSERT INTO merchants (local_auth_user_id,clerk_user_id,name,email,store_name,status) VALUES ($1,$1,'TS Admin',$2,'Lunavo Admin Store','active') RETURNING id",
        [id, email],
      );
      merchant.rows = created.rows;
      merchant.rowCount = created.rowCount;
    }

    await pool.query(
      "INSERT INTO subscriptions (merchant_id,amount_due,amount_paid,earnings_held,status,payment_method) VALUES ($1,0,0,0,'active',NULL) ON CONFLICT DO NOTHING",
      [merchant.rows[0]!.id],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
} finally {
  await pool.end();
}
