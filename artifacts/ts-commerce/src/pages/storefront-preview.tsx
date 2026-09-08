import { useEffect, useState } from 'react';
import { StorefrontSection } from '@/components/storefront-section';
import type { StoreSection } from '@/lib/assistant-types';

export default function StorefrontPreview() {
  const [store, setStore] = useState<{ name:string; sections:StoreSection[]; products:Array<{id:number;title:string;imageUrl?:string|null;sellingPrice?:number|null;currency?:string|null}> } | null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{fetch('/api/storefront/public/me',{credentials:'include'}).then(async r=>{if(!r.ok) throw new Error('Unable to load storefront');return r.json();}).then(setStore).catch(e=>setError(e instanceof Error?e.message:'Unable to load storefront')).finally(()=>setLoading(false));},[]);
  if(loading)return <div className="grid min-h-screen place-items-center bg-[#f5f1e9] text-sm font-bold">Loading storefront…</div>;
  if(error||!store)return <div className="grid min-h-screen place-items-center bg-[#f5f1e9] text-sm font-bold">{error||'Storefront not found'}</div>;
  return <div className="min-h-screen bg-white text-[#182333]">{store.sections.filter(s=>s.visible).map(s=><StorefrontSection key={s.id} section={s} products={store.products}/>)}</div>;
}
