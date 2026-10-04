import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const port=Number(process.env.PORT||"8081");
const ratesFile=process.env.FX_RATES_FILE?.trim()||"/data/lunavo/fx-rates.json";
const supported=/^[A-Z]{3}$/;
const ttlMs=60_000;
let cache:{loadedAt:number;rates:Record<string,Record<string,unknown>>}={loadedAt:0,rates:{}};

function json(res: http.ServerResponse,status:number,payload:unknown){
  const body=JSON.stringify(payload);
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","content-length":Buffer.byteLength(body)});
  res.end(body);
}
async function loadRates(){
  try{
    const raw=await readFile(ratesFile,"utf8");
    const parsed=JSON.parse(raw) as unknown;
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("FX ratebook must be an object");
    const rates=(parsed as {rates?:unknown}).rates;
    if(!rates||typeof rates!=="object"||Array.isArray(rates))throw new Error("FX ratebook is missing a rates object");
    cache={loadedAt:Date.now(),rates:rates as Record<string,Record<string,unknown>>};
  }catch(error){
    if((error as NodeJS.ErrnoException)?.code==="ENOENT"){cache={loadedAt:Date.now(),rates:{}};return;}
    throw error;
  }
}
async function rateFor(base:string,quote:string){
  if(Date.now()-cache.loadedAt>ttlMs)await loadRates();
  const direct=Number(cache.rates[base]?.[quote]);
  if(Number.isFinite(direct)&&direct>0)return direct;
  const inverse=Number(cache.rates[quote]?.[base]);
  if(Number.isFinite(inverse)&&inverse>0)return 1/inverse;
  throw new Error(`No locally configured FX rate for ${base}/${quote}. Configure it in Master Admin → Integrations → Self-hosted FX.`);
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||"/","http://fx-gateway.local");
    if(req.method==="GET"&&url.pathname==="/health"){
      await loadRates();
      json(res,200,{ok:true,service:"self-hosted-fx-gateway",ratesFile,configuredPairs:Object.values(cache.rates).reduce((n,row)=>n+Object.keys(row||{}).length,0)});
      return;
    }
    if(req.method==="GET"&&url.pathname==="/v1/rate"){
      const base=String(url.searchParams.get("base")||"").trim().toUpperCase();
      const quote=String(url.searchParams.get("quote")||"").trim().toUpperCase();
      if(!supported.test(base)||!supported.test(quote)){json(res,400,{error:"base and quote must be ISO 4217 currency codes"});return;}
      if(base===quote){const now=new Date().toISOString();json(res,200,{base,quote,rate:1,source:"self-hosted-admin-ratebook",fetchedAt:now,asOf:now});return;}
      const rate=await rateFor(base,quote);
      const now=new Date().toISOString();
      json(res,200,{base,quote,rate,source:"self-hosted-admin-ratebook",fetchedAt:now,asOf:now});
      return;
    }
    json(res,404,{error:"Not found"});
  }catch(error){
    json(res,503,{error:error instanceof Error?error.message:"Self-hosted FX service unavailable"});
  }
});
void mkdir(path.dirname(ratesFile),{recursive:true}).then(()=>loadRates()).catch(()=>undefined);
server.listen(port,"0.0.0.0",()=>console.log(`Self-hosted FX gateway listening on ${port}; ratebook=${ratesFile}`));
