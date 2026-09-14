import { Router } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { createLocalSession, clearSessionCookie, registerLocalUser, revokeCurrentSession, setSessionCookie, verifyLocalCredentials } from "../lib/local-auth";

const router=Router();
router.get("/auth/session",async(req,res,next)=>{try{const userId=getAuth(req).userId;if(!userId){res.json({signedIn:false,user:null});return;}const result=await db.execute(sql`SELECT id,email,username,first_name,last_name,role FROM local_auth_users WHERE id=${userId} LIMIT 1`);const row=result.rows[0] as any;if(!row){clearSessionCookie(res);res.json({signedIn:false,user:null});return;}res.json({signedIn:true,user:{id:String(row.id),email:String(row.email),username:String(row.username),firstName:String(row.first_name),lastName:String(row.last_name),role:String(row.role)}});}catch(e){next(e);}});
router.post("/auth/sign-up",async(req,res,next)=>{try{const email=String(req.body?.email??"");const username=String(req.body?.username??"");const firstName=String(req.body?.firstName??"");const lastName=String(req.body?.lastName??"");const password=String(req.body?.password??"");const user=await registerLocalUser({email,username,firstName,lastName,password});const token=await createLocalSession(user.id);setSessionCookie(res,token);res.status(201).json({signedIn:true,user});}catch(e:any){const message=String(e?.detail||e?.message||"Account creation failed");res.status(400).json({error:message.includes("duplicate")?"That email or username is already in use.":message});}});
router.post("/auth/sign-in",async(req,res,next)=>{try{const user=await verifyLocalCredentials(String(req.body?.email??""),String(req.body?.password??""));const token=await createLocalSession(user.id);setSessionCookie(res,token);res.json({signedIn:true,user});}catch(e:any){res.status(401).json({error:String(e?.message||"Invalid email or password")});}});
router.post("/auth/sign-out",async(req,res,next)=>{try{await revokeCurrentSession(req);clearSessionCookie(res);res.json({signedIn:false});}catch(e){next(e);}});
export default router;
