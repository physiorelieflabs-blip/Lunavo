import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BarChart3, BrainCircuit, Command, CreditCard, FileText, Gauge, Gavel, Globe2, ImagePlus, Landmark, LayoutDashboard, Megaphone, PackageCheck, Route, Search, Settings2, ShoppingCart, Store, UsersRound, WalletCards, Warehouse, X } from "lucide-react";
import { useLocation } from "wouter";

type Item={href:string;label:string;description:string;keywords:string;icon:LucideIcon};

const MERCHANT_ITEMS:Item[]=[
 {href:"/dashboard",label:"Dashboard",description:"Overview, revenue, orders and workspace health",keywords:"home overview sales revenue",icon:LayoutDashboard},
 {href:"/analytics",label:"Analytics",description:"Sales, customers, products and performance",keywords:"reports metrics",icon:BarChart3},
 {href:"/store",label:"Storefront",description:"Build and publish your store",keywords:"theme builder website",icon:Store},
 {href:"/commerce-suite",label:"Commerce Suite",description:"Promotions, fulfillment controls and commerce tools",keywords:"discount fulfillment",icon:ShoppingCart},
 {href:"/orders",label:"Orders",description:"Review and manage customer orders",keywords:"sales purchases",icon:PackageCheck},
 {href:"/customers",label:"Customers",description:"Customer records, history and relationships",keywords:"crm buyers",icon:UsersRound},
 {href:"/invoices",label:"Invoices",description:"Invoices, payments and public links",keywords:"billing receipts",icon:FileText},
 {href:"/pos",label:"POS",description:"Location-aware point of sale",keywords:"cashier retail",icon:ShoppingCart},
 {href:"/marketing",label:"Marketing",description:"Campaigns and promotional tooling",keywords:"growth campaigns",icon:Megaphone},
 {href:"/ad-studio",label:"Ad Studio",description:"Create and manage catalog-grounded advertising media",keywords:"ads video creative",icon:Megaphone},
 {href:"/ai",label:"AI Control Room",description:"Guarded AI planning and commerce intelligence",keywords:"artificial intelligence copilot",icon:BrainCircuit},
 {href:"/autopilot",label:"Autopilot",description:"Automation modes, guardrails and emergency stop",keywords:"automation autonomous",icon:Gauge},
 {href:"/automations",label:"Automation Studio",description:"Event-driven workflows, conditions, approvals and run history",keywords:"workflows rules triggers conditions actions",icon:Gauge},
 {href:"/general-store",label:"General Store",description:"Shopper-facing discovery experience",keywords:"customer marketplace shopping",icon:Globe2},
 {href:"/marketplace/manage",label:"Marketplace",description:"Listings, approvals and marketplace operations",keywords:"seller vendors",icon:Globe2},
 {href:"/auctions/manage",label:"Auctions",description:"Create and manage live auctions",keywords:"bids bidding",icon:Gavel},
 {href:"/inventory",label:"Inventory",description:"Stock, reservations, warehouses and adjustments",keywords:"warehouse products stock",icon:Warehouse},
 {href:"/suppliers",label:"Suppliers & Sourcing",description:"Import and evaluate supplier products",keywords:"dropshipping sourcing",icon:Store},
 {href:"/dropshipping",label:"Fulfillment",description:"Supplier-backed fulfillment and tracking",keywords:"shipping delivery",icon:Route},{href:"/dropship-intelligence",label:"Dropship Intelligence",description:"Supplier passports, profit shield and tracking radar",keywords:"dropshipping supplier profit shipping",icon:BrainCircuit},
 {href:"/finance",label:"Finance / TS Pay",description:"Ledger, refunds, reconciliation and payment links",keywords:"money payments fees ledger",icon:WalletCards},
 {href:"/withdrawals",label:"Withdrawals",description:"Payout requests and KYC",keywords:"payout bank kyc",icon:WalletCards},
 {href:"/ts-pay",label:"TS Pay",description:"First-party payment orchestration and ledger",keywords:"transactions payments",icon:Landmark},
 {href:"/operations",label:"Operations & Advanced",description:"Advanced commerce workflows and developer controls",keywords:"workflows api keys experiments accounting",icon:Route},
 {href:"/team",label:"Team & Locations",description:"Members, permissions and workspace access",keywords:"staff roles rbac",icon:UsersRound},
 {href:"/media",label:"Media Library",description:"Durable merchant media and generated assets",keywords:"images videos files",icon:ImagePlus},
 {href:"/activity",label:"Activity",description:"Audit-facing activity and notifications",keywords:"events logs notifications",icon:BarChart3},
 {href:"/billing",label:"Billing",description:"Subscription and referral billing",keywords:"subscription fee referral",icon:CreditCard},
 {href:"/settings",label:"Settings",description:"Account, privacy and preferences",keywords:"profile security export delete",icon:Settings2}
];

const ADMIN_ITEMS:Item[]=[
 {href:"/admin",label:"Admin Overview",description:"Master Admin control room and operational diagnostics",keywords:"health financial trace system",icon:BarChart3},
 {href:"/admin/merchants",label:"Merchant Management",description:"Platform merchant oversight",keywords:"accounts stores tenants",icon:UsersRound},
 {href:"/admin/withdrawals",label:"Withdrawal Oversight",description:"Provider-backed withdrawal review",keywords:"payout finance",icon:WalletCards},
 {href:"/admin/integrations",label:"Integrations",description:"Configure Flutterwave and Master Admin security",keywords:"flutterwave provider webhook mfa",icon:Landmark}
];

export function GlobalCommandPalette({admin=false}:{admin?:boolean}){
 const [,setLocation]=useLocation();
 const [open,setOpen]=useState(false);
 const [query,setQuery]=useState("");
 const inputRef=useRef<HTMLInputElement>(null);
 const items=admin?ADMIN_ITEMS:MERCHANT_ITEMS;
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return items;return items.filter(i=>`${i.label} ${i.description} ${i.keywords}`.toLowerCase().includes(q));},[items,query]);

 useEffect(()=>{
   const toggle=()=>setOpen(v=>!v);
   const close=()=>setOpen(false);
   const onKey=(event:KeyboardEvent)=>{
     if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();toggle();}
     else if(event.key==="Escape")close();
   };
   window.addEventListener("keydown",onKey);
   window.addEventListener("lunavo:open-command-palette",toggle);
   return()=>{window.removeEventListener("keydown",onKey);window.removeEventListener("lunavo:open-command-palette",toggle);};
 },[]);
 useEffect(()=>{if(open){setQuery("");requestAnimationFrame(()=>inputRef.current?.focus());}},[open]);
 if(!open)return null;
 return <div className="fixed inset-0 z-[120] bg-black/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
   <section role="dialog" aria-modal="true" aria-label="Lunavo command palette" className="mx-auto mt-[10vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fcfbf7] shadow-[0_30px_100px_rgba(16,28,42,.24)]">
     <div className="flex items-center gap-3 border-b border-[#e2ddd2] px-4"><Search className="h-5 w-5 shrink-0 text-[#7d8997]"/><input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Lunavo features…" className="h-14 min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#182333] outline-none placeholder:text-[#8a94a0]"/><button type="button" onClick={()=>setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-[#6f7c8b] hover:bg-[#f0ece3]" aria-label="Close command palette"><X className="h-4 w-4"/></button></div>
     <div className="max-h-[60vh] overflow-y-auto p-2">
       {filtered.length?filtered.map(item=><button key={item.href} type="button" onClick={()=>{setOpen(false);setLocation(item.href);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#f3efe6] focus-visible:bg-[#f3efe6]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e7e0d1] text-[#315e6c]"><item.icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-[#182333]">{item.label}</span><span className="mt-0.5 block truncate text-xs text-[#718096]">{item.description}</span></span><ArrowRight className="h-4 w-4 text-[#a58b55]"/></button>):<div className="px-5 py-12 text-center"><Command className="mx-auto h-8 w-8 text-[#a58b55]"/><p className="mt-3 text-sm font-extrabold text-[#182333]">No matching feature</p><p className="mt-1 text-xs text-[#718096]">Try a feature name, workflow, or business term.</p></div>}
     </div>
     <div className="flex items-center justify-between border-t border-[#e2ddd2] px-4 py-3 text-[10px] font-bold uppercase tracking-[.1em] text-[#8893a0]"><span>Command navigation</span><span className="font-mono">Esc · Ctrl/⌘ K</span></div>
   </section>
 </div>;
}
