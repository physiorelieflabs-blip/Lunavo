import { useMemo, useState } from 'react';
import { StorefrontSection } from '@/components/storefront-section';
import type { StoreSection } from '@/lib/assistant-types';

type Product={id:number;title:string;imageUrl?:string|null;sellingPrice?:number|null;currency?:string|null};
const makeTemplate=(name:string):StoreSection[]=>[
 {id:'announcement',type:'announcement',visible:true,settings:{title:name+' · Free shipping on qualifying orders'}},
 {id:'header',type:'header',visible:true,settings:{title:name}},
 {id:'hero',type:'hero',visible:true,settings:{title:'A storefront that feels like your brand',subtitle:'Built with TS Commerce',body:'Sell products, digital goods and services with one polished customer experience.',buttonText:'Shop now'}},
 {id:'featured',type:'featured_collection',visible:true,settings:{title:'Featured products',subtitle:'Curated for your customers'}},
 {id:'benefits',type:'benefits',visible:true,settings:{}},
 {id:'story',type:'image_with_text',visible:true,settings:{title:'Why shop with us?',subtitle:'Brand story',body:'Use this space for your story, values, process and proof.'}},
 {id:'newsletter',type:'newsletter',visible:true,settings:{title:'Stay in the loop',subtitle:'Get product drops, stories and offers.'}},
 {id:'footer',type:'footer',visible:true,settings:{title:name,subtitle:'Powered by TS Commerce'}}
];
export function StorefrontShowcase({name='Your Store',products=[]}:{name?:string;products?:Product[]}){
 const [mode,setMode]=useState<'desktop'|'mobile'>('desktop');
 const sections=useMemo(()=>makeTemplate(name),[name]);
 return <div className="min-h-screen bg-[#e9e4d9] p-4 md:p-6"><div className="mx-auto max-w-[1440px] overflow-hidden rounded-2xl border border-[#d9d2c4] bg-white shadow-2xl"><div className="flex items-center justify-between border-b bg-[#fbfaf6] px-4 py-3"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Store Preview</p><p className="text-sm font-extrabold">Live customer experience</p></div><div className="flex rounded-lg bg-[#eeeae2] p-1"><button onClick={()=>setMode('desktop')} className={`rounded-md px-3 py-1.5 text-xs ${mode==='desktop'?'bg-white shadow':''}`}>Desktop</button><button onClick={()=>setMode('mobile')} className={`rounded-md px-3 py-1.5 text-xs ${mode==='mobile'?'bg-white shadow':''}`}>Mobile</button></div></div><div className="flex justify-center bg-[#e9e4d9] p-4 md:p-6"><div className={mode==='mobile'?'w-[390px]':'w-full'}>{sections.map(section=><StorefrontSection key={section.id} section={section} products={products}/>)}</div></div></div></div>;
}
