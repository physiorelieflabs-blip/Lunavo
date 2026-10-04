import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function ConnectionStatus(){
 const [online,setOnline]=useState(()=>typeof navigator==="undefined"?true:navigator.onLine);
 const [recovered,setRecovered]=useState(false);
 useEffect(()=>{
  const onOffline=()=>{setOnline(false);setRecovered(false);};
  const onOnline=()=>{setOnline(true);setRecovered(true);window.setTimeout(()=>setRecovered(false),3500);};
  window.addEventListener("offline",onOffline);
  window.addEventListener("online",onOnline);
  return()=>{window.removeEventListener("offline",onOffline);window.removeEventListener("online",onOnline);};
 },[]);
 if(!online)return <div className="fixed inset-x-0 top-0 z-[130] border-b border-[#a04b3d]/30 bg-[#fff0ed] px-4 py-2.5 text-center text-xs font-extrabold text-[#8f3c34]" role="status"><span className="inline-flex items-center gap-2"><WifiOff className="h-4 w-4"/>You’re offline. The app shell remains available, but server actions may fail until you reconnect.</span></div>;
 if(!recovered)return null;
 return <div className="fixed inset-x-0 top-0 z-[130] border-b border-[#2f6958]/30 bg-[#eef8f2] px-4 py-2.5 text-center text-xs font-extrabold text-[#2f6958]" role="status"><span className="inline-flex items-center gap-2"><Wifi className="h-4 w-4"/>Back online. Server actions can resume.</span></div>;
}
