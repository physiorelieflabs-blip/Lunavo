import { ReactNode } from "react";
import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { LunavoApplicationShell } from "../components/lunavo-application-shell";

const areas: Record<string, {title:string; subtitle:string; columns:string[]; empty:string; actions:string[]}> = {
  orders: {title:"Orders", subtitle:"Every order, status and customer touchpoint in one operational queue.", columns:["Order","Customer","Status","Total","Updated"], empty:"Orders will appear here when verified commerce activity exists.", actions:["Create order","Export"]},
  products: {title:"Products", subtitle:"Build a catalogue that can serve physical, digital and service commerce.", columns:["Product","Type","Price","Inventory","Status"], empty:"No products are available yet. Add your first product or ingest a product URL.", actions:["Add product","Import URL"]},
  inventory: {title:"Inventory", subtitle:"Understand stock, reservations and availability across every store.", columns:["SKU","Product","On hand","Reserved","Available"], empty:"Inventory records will appear as catalogue items are configured.", actions:["Adjust stock","Import"]},
  customers: {title:"Customers", subtitle:"A unified customer record across stores, orders and engagement.", columns:["Customer","Orders","Spend","Last activity","Status"], empty:"Customer records will appear from real storefront activity.", actions:["Add customer","Import"]},
};

export function LunavoOperationsPage({area}:{area:keyof typeof areas}) {
 const data=areas[area];
 return <LunavoApplicationShell title={data.title} subtitle={data.subtitle}>
  <div className="lunavo-page-toolbar"><div className="lunavo-search"><Search size={17}/><input placeholder={`Search ${data.title.toLowerCase()}…`} /></div><div className="lunavo-toolbar-actions"><button className="lunavo-control"><SlidersHorizontal size={15}/> Filters</button>{data.actions.map((a,i)=><button key={a} className={`lunavo-button ${i===0?"lunavo-button-primary":"lunavo-button-secondary"}`}>{a}<ArrowUpRight size={15}/></button>)}</div></div>
  <section className="lunavo-panel lunavo-table-panel"><div className="lunavo-table-wrap"><table><thead><tr>{data.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody><tr><td colSpan={data.columns.length}><div className="lunavo-table-empty"><strong>{data.empty}</strong><span>Live records are never fabricated for presentation.</span></div></td></tr></tbody></table></div></section>
 </LunavoApplicationShell>
}

export function LunavoLedgerPage({title,subtitle}:{title:string;subtitle:string}) { return <LunavoApplicationShell title={title} subtitle={subtitle}><section className="lunavo-panel"><div className="lunavo-panel-heading"><div><span className="lunavo-kicker">FINANCIAL CONTROL</span><h3>Verified records only</h3></div><span className="lunavo-status-pill">Reconciliation protected</span></div><div className="lunavo-table-wrap"><table><thead><tr>{["Reference","Store","State","Transaction currency","Settlement currency","Provider fee","Lunavo fee","Net"].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody><tr><td colSpan={8}><div className="lunavo-table-empty"><strong>No financial records to display.</strong><span>TS Pay must receive authenticated provider evidence before a transaction can become financially effective.</span></div></td></tr></tbody></table></div></section></LunavoApplicationShell> }

export const operationsPageMap: Record<string, ReactNode> = {};
