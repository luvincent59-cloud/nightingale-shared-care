import { env } from "cloudflare:workers";

export type Role="patient"|"staff"|"nurse"|"clinician"|"admin";
export type Actor={id:string;username:string;name:string;role:Role;clinicId:string;patientId?:string};
export const actors:Actor[]=[
 {id:"maya-chen",username:"maya.patient",name:"Synthetic Patient",role:"patient",clinicId:"north",patientId:"patient-1"},
 {id:"priya-nair",username:"priya.staff",name:"Priya Nair",role:"staff",clinicId:"north"},
 {id:"dr-samuel-lee",username:"samuel.clinician",name:"Dr. Samuel Lee",role:"clinician",clinicId:"north"},
 {id:"mei-tan",username:"mei.nurse",name:"Mei Tan",role:"nurse",clinicId:"north"},
 {id:"alice-wong",username:"alice.admin",name:"Alice Wong",role:"admin",clinicId:"north"},
];
const hashes:Record<string,string>={
 "maya.patient":"743d46469ca3795e42a33c2be54dac00d2e09f4e214e2e730b5bd3ec5889e36d",
 "priya.staff":"204ad7d45df1815086a015f97b85c7dd9ff3929aead2a2dce224982b421cf8f5",
 "samuel.clinician":"d8b1189ef305043bd2c236a506acfa50fbdd6e00a3bc1b8c118e4eb9eacb5f27",
 "mei.nurse":"2dc4efade5eefd8fd594929ae5752ce04cb58a8cbf671b5f0955f452b397c035",
 "alice.admin":"2b172b839071dffa821e778c142e861dfe135aeeb79b909d79314e6561a6126b",
};
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
export async function verifyCredentials(username:string,password:string){
 const actor=actors.find(a=>a.username===username.toLowerCase());if(!actor)return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`nightingale:${password}`));
 return hex(digest)===hashes[actor.username]?actor:null;
}
export function cookieValue(request:Request,name:string){const raw=request.headers.get("cookie")??"";for(const part of raw.split(";")){const [k,...v]=part.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return null}
export async function actorFromRequest(request:Request){
 const sid=cookieValue(request,"ng_session");if(!sid)return null;
 const row=await env.DB.prepare("SELECT actor_id,expires_at FROM auth_sessions WHERE id=?").bind(sid).first<{actor_id:string;expires_at:string}>();
 if(!row||new Date(row.expires_at)<=new Date()){if(row)await env.DB.prepare("DELETE FROM auth_sessions WHERE id=?").bind(sid).run();return null}return actors.find(a=>a.id===row.actor_id)??null;
}
export async function createSession(actor:Actor){const id=crypto.randomUUID(),created=new Date(),expires=new Date(created.getTime()+8*60*60*1000);await env.DB.prepare("INSERT INTO auth_sessions (id,actor_id,clinic_id,expires_at,created_at) VALUES (?,?,?,?,?)").bind(id,actor.id,actor.clinicId,expires.toISOString(),created.toISOString()).run();return {id,expires}}
export async function destroySession(request:Request){const sid=cookieValue(request,"ng_session");if(sid)await env.DB.prepare("DELETE FROM auth_sessions WHERE id=?").bind(sid).run()}
export async function createAlert(target:Actor|null,eventType:string,message:string,request:Request,severity="high"){
 const rawSource=request.headers.get("cf-connecting-ip")??"";const source=/^[0-9a-fA-F:.]{3,45}$/.test(rawSource)?rawSource:"unavailable";const clinic=target?.clinicId??"north",targetId=target?.id??"alice-wong";
 await env.DB.prepare("INSERT INTO security_alerts (id,clinic_id,target_actor_id,severity,event_type,message,source,created_at,read_at) VALUES (?,?,?,?,?,?,?,?,NULL)").bind(`alert-${crypto.randomUUID()}`,clinic,targetId,severity,eventType,message,source,new Date().toISOString()).run();
}
export async function recordDenied(actor:Actor|null,action:string,resource:string,request:Request){
 await createAlert(actor,"unauthorised_action",`${actor?.role??"Unknown user"} attempted a protected action.`,request,"critical");
 await env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)").bind(actor?.clinicId??"north",actor?.role??"unknown",actor?.id??"anonymous","access.denied","protected-resource",JSON.stringify({status:"denied"}),new Date().toISOString()).run();
}
