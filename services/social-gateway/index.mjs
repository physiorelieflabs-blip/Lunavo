import http from "node:http";
import { URL } from "node:url";

const PORT=Number(process.env.PORT||8080);
const TOKEN=(process.env.SOCIAL_GATEWAY_TOKEN||"").trim();
if(!TOKEN) throw new Error("SOCIAL_GATEWAY_TOKEN is required");

const PROVIDERS={
  instagram:{auth:"https://www.facebook.com/v24.0/dialog/oauth",token:"https://graph.facebook.com/v24.0/oauth/access_token",client:"SOCIAL_META_CLIENT_ID",secret:"SOCIAL_META_CLIENT_SECRET",scope:"pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish"},
  facebook:{auth:"https://www.facebook.com/v24.0/dialog/oauth",token:"https://graph.facebook.com/v24.0/oauth/access_token",client:"SOCIAL_META_CLIENT_ID",secret:"SOCIAL_META_CLIENT_SECRET",scope:"pages_show_list,pages_read_engagement,pages_manage_posts"},
  tiktok:{auth:"https://www.tiktok.com/v2/auth/authorize/",token:"https://open.tiktokapis.com/v2/oauth/token/",client:"SOCIAL_TIKTOK_CLIENT_KEY",secret:"SOCIAL_TIKTOK_CLIENT_SECRET",scope:"user.info.basic,video.publish"},
  youtube:{auth:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token",client:"SOCIAL_GOOGLE_CLIENT_ID",secret:"SOCIAL_GOOGLE_CLIENT_SECRET",scope:"https://www.googleapis.com/auth/youtube.upload"},
  linkedin:{auth:"https://www.linkedin.com/oauth/v2/authorization",token:"https://www.linkedin.com/oauth/v2/accessToken",client:"SOCIAL_LINKEDIN_CLIENT_ID",secret:"SOCIAL_LINKEDIN_CLIENT_SECRET",scope:"openid profile w_member_social"},
  pinterest:{auth:"https://www.pinterest.com/oauth/",token:"https://api.pinterest.com/v5/oauth/token",client:"SOCIAL_PINTEREST_CLIENT_ID",secret:"SOCIAL_PINTEREST_CLIENT_SECRET",scope:"boards:read boards:write pins:read pins:write"},
  x:{auth:"https://x.com/i/oauth2/authorize",token:"https://api.x.com/2/oauth2/token",client:"SOCIAL_X_CLIENT_ID",secret:"SOCIAL_X_CLIENT_SECRET",scope:"tweet.read tweet.write users.read offline.access"},
};

function json(res,status,body){const data=Buffer.from(JSON.stringify(body));res.writeHead(status,{"content-type":"application/json","content-length":data.length,"cache-control":"no-store"});res.end(data);}
function enabled(provider){const p=PROVIDERS[provider];return Boolean(p&&process.env[p.client]?.trim());}
function readBody(req){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on("data",c=>{size+=c.length;if(size>25*1024*1024){reject(new Error("Request body too large"));req.destroy();return;}chunks.push(c);});req.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}"));}catch{reject(new Error("Invalid JSON"));}});req.on("error",reject);});}
function cfg(provider){const p=PROVIDERS[provider];if(!p||!enabled(provider))throw new Error(provider+" is not configured in the self-hosted social gateway");return p;}

async function request(url,init={}){const r=await fetch(url,{...init,signal:AbortSignal.timeout(120000)});const text=await r.text();let body={};try{body=text?JSON.parse(text):{};}catch{body={raw:text};}if(!r.ok)throw new Error(typeof body?.error_description==="string"?body.error_description:typeof body?.message==="string"?body.message:"Provider returned HTTP "+r.status);return {response:r,body};}

async function operation(name,payload){
 if(name==="health") return {status:"ok",providers:Object.fromEntries(Object.keys(PROVIDERS).map(k=>[k,enabled(k)]))};
 if(name==="oauth.authorize"){
  const provider=String(payload.provider);const p=cfg(provider);const redirectUri=String(payload.redirectUri||"");const state=String(payload.state||"");if(!redirectUri||!state)throw new Error("redirectUri and state are required");
  const url=new URL(p.auth);url.searchParams.set("response_type","code");url.searchParams.set("client_id",process.env[p.client].trim());url.searchParams.set("redirect_uri",redirectUri);url.searchParams.set("state",state);url.searchParams.set("scope",p.scope);
  if(provider==="youtube"){url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent");}
  if(provider==="tiktok")url.searchParams.set("client_key",process.env[p.client].trim());
  if(provider==="x"){const challenge=String(payload.codeChallenge||"");if(!challenge)throw new Error("X PKCE code challenge is required");url.searchParams.set("code_challenge",challenge);url.searchParams.set("code_challenge_method","S256");}
  return {authorizeUrl:url.toString(),provider};
 }
 if(name==="oauth.exchange"){
  const provider=String(payload.provider);const p=cfg(provider);const code=String(payload.code||""),redirectUri=String(payload.redirectUri||"");if(!code||!redirectUri)throw new Error("OAuth code and redirect URI are required");
  const params={code,redirect_uri:redirectUri,grant_type:"authorization_code"};
  if(provider==="x"){params.client_id=process.env[p.client].trim();params.code_verifier=String(payload.codeVerifier||"");}
  else {params.client_id=process.env[p.client].trim();params.client_secret=process.env[p.secret]?.trim()||"";}
  const headers={"content-type":"application/x-www-form-urlencoded"};if(provider==="x"&&process.env[p.secret]?.trim())headers.authorization="Basic "+Buffer.from(process.env[p.client].trim()+":"+process.env[p.secret].trim()).toString("base64");
  const out=await request(p.token,{method:"POST",headers,body:new URLSearchParams(params)});const token=out.body;if(typeof token?.access_token!=="string")throw new Error("Provider token exchange returned no access token");
  return token;
 }
 if(name==="oauth.refresh"){
  const provider=String(payload.provider);const p=cfg(provider);const refreshToken=String(payload.refreshToken||"");if(!refreshToken)throw new Error("Refresh token is required");
  const params={refresh_token:refreshToken,grant_type:"refresh_token"};if(provider==="x")params.client_id=process.env[p.client].trim();else {params.client_id=process.env[p.client].trim();params.client_secret=process.env[p.secret]?.trim()||"";}
  const headers={"content-type":"application/x-www-form-urlencoded"};if(provider==="x"&&process.env[p.secret]?.trim())headers.authorization="Basic "+Buffer.from(process.env[p.client].trim()+":"+process.env[p.secret].trim()).toString("base64");
  const out=await request(p.token,{method:"POST",headers,body:new URLSearchParams(params)});if(typeof out.body?.access_token!=="string")throw new Error("Provider token refresh returned no access token");return out.body;
 }
 if(name==="profile"){
  const provider=String(payload.provider),token=String(payload.accessToken||"");if(!token)throw new Error("Access token is required");let out;
  if(provider==="x")out=await request("https://api.x.com/2/users/me?user.fields=id,name,username",{headers:{authorization:"Bearer "+token}});
  else if(provider==="linkedin")out=await request("https://api.linkedin.com/v2/me",{headers:{authorization:"Bearer "+token}});
  else if(provider==="youtube")out=await request("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",{headers:{authorization:"Bearer "+token}});
  else if(provider==="tiktok")out=await request("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:"{}"});
  else return {id:null,name:null,metadata:{}};
  return out.body;
 }
 if(name==="publish"){
  const provider=String(payload.provider),token=String(payload.accessToken||""),job=payload.job||{};const media=payload.media||null;
  if(!token)throw new Error("Access token is required");
  if(provider==="x"){if(media)throw new Error("X media publishing is not enabled on this connector");const text=String(job.caption||"").trim();if(!text||[...text].length>280)throw new Error("X text must be 1-280 characters");const out=await request("https://api.x.com/2/tweets",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({text})});return {postId:String(out.body?.data?.id||"")};}
  if(provider==="youtube"){if(!media)throw new Error("YouTube requires video media");const metadata={snippet:{title:String(job.caption||media.filename||"Lunavo").slice(0,100),description:String(job.caption||"").slice(0,5000)},status:{privacyStatus:"public"}};const form=new FormData();form.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}));form.append("media",new Blob([Buffer.from(String(media.base64||""),"base64")],{type:String(media.mimeType||"video/mp4")}),String(media.filename||"lunavo.mp4"));const out=await request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",{method:"POST",headers:{authorization:"Bearer "+token},body:form});return {postId:String(out.body?.id||"")};}
  if(provider==="linkedin"){const author=String(job.authorUrn||"");if(!author)throw new Error("LinkedIn author identity is required");const version=String(job.linkedinApiVersion||process.env.SOCIAL_LINKEDIN_API_VERSION||"");if(!version)throw new Error("LinkedIn API version is required");const out=await request("https://api.linkedin.com/rest/posts",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json","x-restli-protocol-version":"2.0.0","linkedin-version":version},body:JSON.stringify({author,commentary:String(job.caption||"").slice(0,3000),visibility:"PUBLIC",distribution:{feedDistribution:"MAIN_FEED",targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:"PUBLISHED",isReshareDisabledByAuthor:false})});return {postId:String(out.response.headers.get("x-restli-id")||"")};}
  if(provider==="tiktok"){if(!media)throw new Error("TikTok requires video media");const options=job.tiktokOptions||{};const creator=await request("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json; charset=UTF-8"},body:"{}"});const data=creator.body?.data||{};const privacyOptions=Array.isArray(data.privacy_level_options)?data.privacy_level_options:[];if(!privacyOptions.includes(options.privacyLevel))throw new Error("TikTok privacy level is unavailable");if(data.comment_disabled===true&&options.allowComment)throw new Error("TikTok comments are disabled");if(data.duet_disabled===true&&options.allowDuet)throw new Error("TikTok Duet is disabled");if(data.stitch_disabled===true&&options.allowStitch)throw new Error("TikTok Stitch is disabled");const bytes=Buffer.from(String(media.base64||""),"base64");const chunkSize=10_000_000;const init=await request("https://open.tiktokapis.com/v2/post/publish/video/init/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json; charset=UTF-8"},body:JSON.stringify({post_info:{title:String(job.caption||"Lunavo").slice(0,2200),privacy_level:options.privacyLevel,disable_duet:!options.allowDuet,disable_comment:!options.allowComment,disable_stitch:!options.allowStitch,brand_organic_toggle:true,is_aigc:options.isAigc===true},source_info:{source:"FILE_UPLOAD",video_size:bytes.length,chunk_size:chunkSize,total_chunk_count:Math.ceil(bytes.length/chunkSize)}})});const uploadUrl=String(init.body?.data?.upload_url||"");const publishId=String(init.body?.data?.publish_id||"");if(!uploadUrl||!publishId)throw new Error("TikTok did not return upload details");for(let offset=0;offset<bytes.length;offset+=chunkSize){const chunk=bytes.subarray(offset,Math.min(offset+chunkSize,bytes.length));const end=offset+chunk.length-1;const rr=await fetch(uploadUrl,{method:"PUT",headers:{authorization:"Bearer "+token,"content-type":String(media.mimeType||"video/mp4"),"content-length":String(chunk.length),"content-range":"bytes "+offset+"-"+end+"/"+bytes.length},body:chunk,signal:AbortSignal.timeout(120000)});if(!rr.ok)throw new Error("TikTok media upload failed (HTTP "+rr.status+")");}const status=await request("https://open.tiktokapis.com/v2/post/publish/status/fetch/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({publish_id:publishId})});if(status.body?.data?.status==="FAILED")throw new Error("TikTok rejected the publication");return {postId:publishId};}
  throw new Error(provider+" publishing is not implemented in the self-hosted connector");
 }
 throw new Error("Unknown gateway operation");
}

const server=http.createServer(async(req,res)=>{
 if(req.method!=="POST"||req.url!=="/v1/operation"){json(res,404,{error:"Not found"});return;}
 if(req.headers["x-lunavo-gateway-token"]!==TOKEN){json(res,401,{error:"Unauthorized"});return;}
 try{const body=await readBody(req);const result=await operation(String(body.operation||""),body.payload&&typeof body.payload==="object"?body.payload:{});json(res,200,result);}catch(error){json(res,400,{error:error instanceof Error?error.message:"Gateway error"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log("Lunavo social gateway listening on "+PORT));
