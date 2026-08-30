import {actorFromRequest,recordDenied} from '../../../lib/auth';
import {noteHistory} from '../../../lib/revisions';
export async function GET(request:Request){
 const actor=await actorFromRequest(request);if(!actor)return Response.json({error:'Authentication required'},{status:401});
 const result=await noteHistory(actor,new URL(request.url).searchParams.get('entryId')??'');
 if(result.status===403)await recordDenied(actor,'read internal note versions','entry-history',request);
 return Response.json(result,{status:result.status,headers:{'Cache-Control':'private, no-store'}});
}
