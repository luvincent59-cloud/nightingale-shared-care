import {actorFromRequest,recordDenied} from '../../../lib/auth';
import {readTopCard,refreshTopCards} from '../../../lib/top-card';
export async function GET(request:Request){
 const start=performance.now(),actor=await actorFromRequest(request);
 if(!actor){await recordDenied(null,'read Top Card','top-card',request);return Response.json({error:'Authentication required'},{status:401})}
 let row=await readTopCard(actor);const cold=!row;
 if(!row){await refreshTopCards(actor);row=await readTopCard(actor)}
 if(!row)return Response.json({error:'Priority projection unavailable'},{status:503});
 return Response.json({...JSON.parse(row.payload_json),actorId:actor.id,role:actor.role,updatedAt:row.updated_at,stale:Date.now()-Date.parse(row.updated_at)>60000},{headers:{'Cache-Control':'private, no-store','Server-Timing':`top_card;dur=${(performance.now()-start).toFixed(2)}`, 'X-Top-Card-Path':cold?'cold':'warm'}});
}
