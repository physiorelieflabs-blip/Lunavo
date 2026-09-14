import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export const MASTER_ADMIN_EMAIL = "ifeoluwaolowu4@gmail.com";

export async function isMasterAdmin(localUserId: string): Promise<boolean> {
  const pinnedId=process.env.LUNAVO_MASTER_ADMIN_USER_ID?.trim();
  if(pinnedId&&pinnedId===localUserId)return true;
  const result=await db.execute(sql`SELECT 1 FROM local_auth_users WHERE id=${localUserId} AND lower(email)=lower(${MASTER_ADMIN_EMAIL}) AND email_verified=true AND role='master_admin' LIMIT 1`);
  return result.rows.length>0;
}

export async function requireMasterAdmin(localUserId:string):Promise<void>{if(!(await isMasterAdmin(localUserId))){const error=new Error("Master admin access required");(error as Error&{statusCode?:number}).statusCode=403;throw error;}}
export const MASTER_ADMIN_ROLE="master_admin" as const;
