import {env} from 'cloudflare:workers';
import type {Actor,Role} from './auth';
import {importanceData} from './learning-store';
import {conflictData} from './conflicts';
const projectionId=(a:Actor)=>`${a.clinicId}:${a.patientId??'patient-1'}:${a.role}`;
export async function refreshTopCards(actor:Actor){
 const updated=new Date().toISOString();
 const roles:Role[]=['clinician','nurse','staff','patient','admin'];
 const conflictActor={...actor,role:'clinician' as Role},conflicts=await conflictData(conflictActor);
 const projections=await Promise.all(roles.map(async role=>{
  const a={...actor,role},importance=await importanceData(a);
  // Never include internal suggestions, conflict text or comments in patient/admin projections.
  const payload=role==='patient'?{kind:'patient',message:'Your reviewed care summary is in the Timeline. Contact your care team about changes.',highlights:[],conflicts:[]}
   :role==='admin'?{kind:'admin',message:'Clinic security and access oversight. No clinical suggestions in this view.',highlights:[],conflicts:[]}
   :{kind:'team',highlights:importance.highlights.slice(0,12),conflicts:conflicts.filter(c=>c.status==='open').slice(0,12)};
  return env.DB.prepare('INSERT INTO top_card_projections (id,clinic_id,patient_id,audience_role,payload_json,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at WHERE excluded.updated_at>=top_card_projections.updated_at').bind(projectionId(a),a.clinicId,a.patientId??'patient-1',role,JSON.stringify(payload),updated);
 }));
 await env.DB.batch(projections);
}
export async function readTopCard(actor:Actor){
 return env.DB.prepare('SELECT payload_json,updated_at FROM top_card_projections WHERE id=? AND clinic_id=? AND patient_id=? AND audience_role=?').bind(projectionId(actor),actor.clinicId,actor.patientId??'patient-1',actor.role).first<{payload_json:string;updated_at:string}>();
}
