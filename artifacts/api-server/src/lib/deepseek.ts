import { completeLocalChat, completeLocalVisionJson, selfHostedAiConfigured } from "./self-hosted-ai";

type Message={role:"system"|"user"|"assistant";content:string};
export async function completeDeepSeekChat(messages: Message[], options: {json?:boolean;maxTokens?:number;reasoningEffort?:"low"|"high"|"max"}={}): Promise<{model:string;content:string}> {
  return completeLocalChat(messages,{json:options.json,maxTokens:options.maxTokens,temperature:options.reasoningEffort==="max"?0.1:options.reasoningEffort==="low"?0.3:0.2});
}
export async function completeDeepSeekVisionJson(prompt:string,imageUrl:string,options:{maxTokens?:number}={}):Promise<{model:string;content:string}> {
  return completeLocalVisionJson(prompt,imageUrl,{maxTokens:options.maxTokens});
}
export function deepSeekConfigured(){return selfHostedAiConfigured();}
