import http from "node:http";

const port=Number(process.env.PORT||"8081");
const upstream=(process.env.FX_UPSTREAM_URL||"https://open.er-api.com/v6/latest").replace(/\/$/,"");
const ttlMs=5*60*1000;
const cache=new Map();
const supported=/^[A-Z]{3}$/;

function json(res,status,payload){
  const body=JSON.stringify(payload);
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","content-length":Buffer.byteLength(body)});
  res.end(body);
}
async function fetchRate(base,quote){
  const key=base+":"+quote;
  const cached=cache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  if(base===quote){
    const value={base,quote,rate:1,source:"self-hosted-fx-gateway",fetchedAt:new Date().toISOString(),asOf:new Date().toISOString()};
    cache.set(key,{expiresAt:Date.now()+ttlMs,value});
    return value;
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(encodeURI(`${upstream}/${base}`),{headers:{accept:"application/json"},signal:controller.signal});
    if(!response.ok)throw new Error(`FX upstream returned ${response.status}`);
    const body=await response.json();
    const rate=Number(body?.rates?.[quote]);
    if(!Number.isFinite(rate)||rate<=0)throw new Error("FX pair is unavailable");
    const fetchedAt=new Date().toISOString();
    const asOfRaw=body?.time_last_update_utc;
    const asOfDate=asOfRaw?new Date(asOfRaw):null;
    const value={base,quote,rate,source:"self-hosted-fx-gateway",fetchedAt,asOf:asOfDate&&!Number.isNaN(asOfDate.getTime())?asOfDate.toISOString():null};
    cache.set(key,{expiresAt:Date.now()+ttlMs,value});
    return value;
  }finally{clearTimeout(timer);}
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||"/","http://fx-gateway.local");
    if(req.method==="GET"&&url.pathname==="/health"){json(res,200,{ok:true,service:"self-hosted-fx-gateway"});return;}
    if(req.method==="GET"&&url.pathname==="/v1/rate"){
      const base=String(url.searchParams.get("base")||"").trim().toUpperCase();
      const quote=String(url.searchParams.get("quote")||"").trim().toUpperCase();
      if(!supported.test(base)||!supported.test(quote)){json(res,400,{error:"base and quote must be ISO 4217 currency codes"});return;}
      json(res,200,await fetchRate(base,quote));return;
    }
    json(res,404,{error:"Not found"});
  }catch(error){json(res,502,{error:error instanceof Error?error.message:"FX service unavailable"});}
});
server.listen(port,"0.0.0.0",()=>console.log(`Self-hosted FX gateway listening on ${port}`));
