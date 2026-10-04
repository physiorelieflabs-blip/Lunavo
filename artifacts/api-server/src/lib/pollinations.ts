type GeneratedImage={model:string;mimeType:string;data:string;bytes:Buffer};

export async function generateImage(prompt:string):Promise<GeneratedImage>{
  const url=process.env.LUNAVO_LOCAL_IMAGE_URL?.trim();
  if(!url) throw new Error("Self-hosted image generation is not configured. Set LUNAVO_LOCAL_IMAGE_URL.");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),120_000);
  try{
    const response=await fetch(url,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({
      model:process.env.LUNAVO_LOCAL_IMAGE_MODEL?.trim()||"flux",
      prompt,size:"1024x1024",width:1024,height:1024,
    }),signal:controller.signal});
    const raw=await response.text();
    let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{}
    if(!response.ok)throw new Error(`Self-hosted image service returned HTTP ${response.status}`);
    const encoded=payload?.data?.[0]?.b64_json || payload?.b64_json || payload?.image_base64 || payload?.image?.data;
    if(typeof encoded!=="string"||!encoded)throw new Error("Self-hosted image service returned no base64 image");
    const mimeType=typeof payload?.data?.[0]?.mime_type==="string"?payload.data[0].mime_type:"image/png";
    const bytes=Buffer.from(encoded,"base64");if(!bytes.length)throw new Error("Self-hosted image service returned an empty image");
    return {model:"self-hosted:"+String(payload?.model||process.env.LUNAVO_LOCAL_IMAGE_MODEL||"local-image"),mimeType,data:"data:"+mimeType+";base64,"+encoded,bytes};
  } finally { clearTimeout(timer); }
}
