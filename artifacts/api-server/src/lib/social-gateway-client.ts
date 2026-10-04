import { URL } from "node:url";

export type SocialProvider = "instagram"|"facebook"|"tiktok"|"youtube"|"linkedin"|"pinterest"|"x";
function gatewayUrl(): string {
  const raw=process.env.LUNAVO_SOCIAL_GATEWAY_URL?.trim();
  if(!raw) throw new Error("Self-hosted social gateway is not configured");
  const url=new URL(raw);
  if(!["http:","https:"].includes(url.protocol)) throw new Error("Social gateway must use HTTP(S)");
  return url.toString().replace(/\/$/,"");
}
function gatewayToken(): string {
  const token=process.env.LUNAVO_SOCIAL_GATEWAY_TOKEN?.trim();
  if(!token) throw new Error("Self-hosted social gateway token is not configured");
  return token;
}
export async function socialGatewayRequest<T=Record<string,unknown>>(operation:string,payload:Record<string,unknown>={}):Promise<T>{
  const response=await fetch(gatewayUrl()+"/v1/operation",{method:"POST",headers:{"content-type":"application/json","accept":"application/json","x-lunavo-gateway-token":gatewayToken()},body:JSON.stringify({operation,payload}),signal:AbortSignal.timeout(120_000)});
  const text=await response.text();
  let body:unknown={};try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok){const message=body&&typeof body==="object"&&typeof (body as any).error==="string"?(body as any).error:"Social gateway request failed";throw new Error(message);}
  return body as T;
}
export async function socialGatewayConfigured():Promise<boolean>{
  try{await socialGatewayRequest("health");return true;}catch{return false;}
}