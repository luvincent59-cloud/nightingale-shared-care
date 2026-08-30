import { env } from "cloudflare:workers";
import { actorFromRequest, actors, createAlert, createSession, destroySession, verifyCredentials } from "../../../lib/auth";

const safe=(a:NonNullable<Awaited<ReturnType<typeof actorFromRequest>>>)=>({id:a.id,username:a.username,name:a.name,role:a.role,clinicId:a.clinicId,patientId:a.patientId});
async function alertsFor(actor:NonNullable<Awaited<ReturnType<typeof actorFromRequest>>>){
 const sql=actor.role==="admin"?"SELECT * FROM security_alerts WHERE clinic_id=? ORDER BY created_at DESC LIMIT 100":"SELECT * FROM security_alerts WHERE clinic_id=? AND target_actor_id=? ORDER BY created_at DESC LIMIT 30";
 const r=actor.role==="admin"?await env.DB.prepare(sql).bind(actor.clinicId).all():await env.DB.prepare(sql).bind(actor.clinicId,actor.id).all();return r.results;
}
export async function GET(request:Request){const actor=await actorFromRequest(request);if(!actor)return Response.json({authenticated:false},{status:401});return Response.json({authenticated:true,actor:safe(actor),alerts:await alertsFor(actor)});}
export async function POST(request:Request){
 const body=await request.json() as {username?:string;password?:string};const username=(body.username??"").trim().toLowerCase();const target=actors.find(a=>a.username===username)??null;
 const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM security_alerts WHERE target_actor_id=? AND event_type='failed_login' AND created_at>?").bind(target?.id??"alice-wong",new Date(Date.now()-10*60*1000).toISOString()).first<{n:number}>();
 if(Number(recent?.n??0)>=5){await createAlert(target,"account_lockout","Login blocked after repeated failed attempts.",request,"critical");return Response.json({error:"Account temporarily locked. The account holder and administrator have been alerted."},{status:429});}
 const actor=await verifyCredentials(username,body.password??"");
 if(!actor){await createAlert(target,"failed_login",`Failed login attempt for ${target?.role??"unknown"} account.`,request,"high");return Response.json({error:"Invalid username or password. This attempt has been recorded."},{status:401});}
 const session=await createSession(actor);await env.DB.prepare("INSERT INTO audit_events (clinic_id,actor_role,actor_id,action,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)").bind(actor.clinicId,actor.role,actor.id,"session.created",actor.id,"{}",new Date().toISOString()).run();
 return new Response(JSON.stringify({authenticated:true,actor:safe(actor),alerts:await alertsFor(actor)}),{headers:{"content-type":"application/json","set-cookie":`ng_session=${encodeURIComponent(session.id)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`}});
}
export async function DELETE(request:Request){await destroySession(request);return new Response(null,{status:204,headers:{"set-cookie":"ng_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"}})}
export async function PATCH(request:Request){const actor=await actorFromRequest(request);if(!actor)return Response.json({error:"unauthenticated"},{status:401});const body=await request.json() as {alertId?:string};const sql=actor.role==="admin"?"UPDATE security_alerts SET read_at=? WHERE id=? AND clinic_id=?":"UPDATE security_alerts SET read_at=? WHERE id=? AND clinic_id=? AND target_actor_id=?";const stmt=env.DB.prepare(sql);if(actor.role==="admin")await stmt.bind(new Date().toISOString(),body.alertId,actor.clinicId).run();else await stmt.bind(new Date().toISOString(),body.alertId,actor.clinicId,actor.id).run();return Response.json({ok:true});}
