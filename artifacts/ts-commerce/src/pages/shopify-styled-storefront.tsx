import { useMemo, useState } from 'react';
import { StorefrontSection } from '@/components/storefront-section';
import type { StoreSection } from '@/lib/assistant-types';

const templates: Record<string, StoreSection[]> = {
  fashion: [
    { id:'announce',type:'announcement',visible:true,settings:{title:'Free shipping over $75'} },
    { id:'header',type:'header',visible:true,settings:{title:'Atelier'} },
    { id:'hero',type:'hero',visible:true,settings:{title:'Designed for your everyday',subtitle:'New season',body:'Curated essentials with a polished point of view.',buttonText:'Shop the collection'} },
    { id:'featured',type:'featured_collection',visible:true,settings:{title:'New arrivals',subtitle:'Fresh pieces this week'} },
    { id:'benefits',type:'benefits',visible:true,settings:{} },
    { id:'story',type:'image_with_text',visible:true,settings:{title:'Our point of view',subtitle:'Made with intention',body:'Tell the story behind the collection.'} },
    { id:'newsletter',type:'newsletter',visible:true,settings:{title:'Get the edit',subtitle:'Drops, stories and private offers.'} },
    { id:'footer',type:'footer',visible:true,settings:{title:'Atelier',subtitle:'A store by TS Commerce.'} },
  ],
  digital: [
    { id:'announce',type:'announcement',visible:true,settings:{title:'Instant access after verified payment'} },
    { id:'header',type:'header',visible:true,settings:{title:'Creator Studio'} },
    { id:'hero',type:'hero',visible:true,settings:{title:'Learn at your pace',subtitle:'Digital library',body:'Courses, resources and memberships in one place.',buttonText:'Explore products'} },
    { id:'featured',type:'product_grid',visible:true,settings:{title:'Featured resources',subtitle:'Start with the most useful picks'} },
    { id:'benefits',type:'benefits',visible:true,settings:{} },
    { id:'newsletter',type:'newsletter',visible:true,settings:{title:'Join the creator list',subtitle:'New lessons and releases.'} },
    { id:'footer',type:'footer',visible:true,settings:{title:'Creator Studio'} },
  ],
  services: [
    { id:'announce',type:'announcement',visible:true,settings:{title:'Book your next session online'} },
    { id:'header',type:'header',visible:true,settings:{title:'Studio' } },
    { id:'hero',type:'hero',visible:true,settings:{title:'A better way to book',subtitle:'Appointments & services',body:'Clear availability, simple checkout and reminders.',buttonText:'Book now'} },
    { id:'featured',type:'product_grid',visible:true,settings:{title:'Popular services'} },
    { id:'story',type:'image_with_text',visible:true,settings:{title:'Meet the team',body:'Introduce your people and your process.'} },
    { id:'benefits',type:'benefits',visible:true,settings:{} },
    { id:'newsletter',type:'newsletter',visible:true,settings:{title:'Stay connected'} },
    { id:'footer',type:'footer',visible:true,settings:{title:'Studio'} },
  ],
};

export function ShopifyStyledStorefront({products=[]}:{products?:Array<{id:number;title:string;imageUrl?:string|null;sellingPrice?:number|null;currency?:string|null}>}) {
  const [template,setTemplate]=useState('fashion');
  const [sections,setSections]=useState(templates.fashion);
  const active=useMemo(()=>sections.filter(s=>s.visible),[sections]);
  return <div className="min-h-screen bg-white text-[#182333]"><div className="sticky top-0 z-40 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur"><div><p className="text-[10px] font-mono uppercase tracking-[.18em] text-[#a2772e]">TS Commerce Store OS</p><p className="text-sm font-extrabold">Shopify-style, TS-native</p></div><select value={template} onChange={e=>{setTemplate(e.target.value);setSections(templates[e.target.value] ?? templates.fashion);}} className="rounded-lg border px-3 py-2 text-sm"><option value="fashion">Fashion</option><option value="digital">Digital</option><option value="services">Services</option></select></div>{active.map(s=><StorefrontSection key={s.id} section={s} products={products}/>)}</div>;
}
