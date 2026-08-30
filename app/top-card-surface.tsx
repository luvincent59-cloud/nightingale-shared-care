"use client";
import {useEffect,useRef,useState} from 'react';
import {PriorityOverview,type Highlight} from './priority-overview';
import type {Conflict} from '../lib/conflicts';
type Payload={actorId:string;role:string;kind:string;highlights:Highlight[];conflicts:Conflict[];message?:string;updatedAt:string;stale:boolean};
type Metric={role:string;durationMs:number;path:string;ok:boolean};
type MetricsWindow=Window&{__ngTopCardMetrics?:Metric[]};
type Props={actor:{id:string;role:string};revision?:string;history?:Highlight[];saving:boolean;selected:string;displayName:(id:string)=>string;onSource:(id:string)=>void;onAccept:(id:string)=>void;onReject:(id:string)=>void;onComplete:(id:string)=>void;onConflictSource:(id:string)=>void;onConfirmConflict:(id:string)=>void};
export function TopCardSurface(props:Props){
 const [data,setData]=useState<Payload|null>(null),[error,setError]=useState('');
 const pending=useRef<{start:number;path:string}|null>(null);
 useEffect(()=>{const controller=new AbortController(),start=performance.now();
  fetch('/api/top-card',{cache:'no-store',signal:controller.signal}).then(async r=>({r,payload:await r.json()})).then(({r,payload})=>{
   if(!r.ok)throw new Error('Priority overview unavailable');
   if(payload.actorId!==props.actor.id||payload.role!==props.actor.role)throw new Error('Account changed; refresh this page');
   pending.current={start,path:r.headers.get('X-Top-Card-Path')??'unknown'};setData(payload);setError('');
  }).catch(e=>{if(e.name!=='AbortError')setError(e.message);const w=window as MetricsWindow;w.__ngTopCardMetrics=[...(w.__ngTopCardMetrics??[]),{role:props.actor.role,durationMs:performance.now()-start,path:e.name==='AbortError'?'cancelled':'error',ok:false}].slice(-10000)});
  return()=>controller.abort();
 },[props.actor.id,props.actor.role,props.revision]);
 useEffect(()=>{if(!data||!pending.current)return;const sample=pending.current;pending.current=null;let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{const durationMs=performance.now()-sample.start,w=window as MetricsWindow;w.__ngTopCardMetrics=[...(w.__ngTopCardMetrics??[]),{role:data.role,durationMs,path:sample.path,ok:true}].slice(-10000);performance.measure(`ng.top_card.${data.role}`,{start:sample.start,end:performance.now()})})});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second)}},[data]);
 if(!data)return <section className="glance compact-overview" role="status">{error||'Loading priority overview…'}</section>;
 return <div className="top-card-surface" data-top-card-role={data.role}>
  {error&&<p role="alert">{error} · Last received view retained.</p>}
  {data.stale&&<p role="status">Priority snapshot is over 60 seconds old. Timeline sync refreshes it; check source before acting.</p>}
  {data.kind==='team'?<><PriorityOverview {...props} highlights={data.highlights} history={props.history??[]}/><ConflictPanel conflicts={data.conflicts} actor={props.actor} onConflictSource={props.onConflictSource} onConfirmConflict={props.onConfirmConflict}/></>:<section className="glance compact-overview"><h2>{data.kind==='patient'?'Your care overview':'Account overview'}</h2><p>{data.message}</p></section>}
 </div>;
}

export function ConflictPanel(props:Pick<Props,"actor"|"onConflictSource"|"onConfirmConflict">&{conflicts:Conflict[]}){const {conflicts}=props;return conflicts.length>0&&<section className="conflict-overview"><details><summary><strong>FLAG · RECORD CONFLICT ({conflicts.length})</strong><span>Clinician record takes precedence · human confirmation required</span></summary>{conflicts.map(c=><article key={c.id}><h3>{c.claim_key.replaceAll(':',' · ')}</h3><p>{c.reason}</p><p><strong>Preferred: clinician record</strong> · {c.clinician_value}</p><p>AI / patient source · {c.other_value}</p><div><button className="outline" onClick={()=>props.onConflictSource(c.clinician_entry_id)}>Clinician source</button><button className="outline" onClick={()=>props.onConflictSource(c.other_entry_id)}>Other source</button>{props.actor.role==='clinician'&&<button className="primary" onClick={()=>props.onConfirmConflict(c.id)}>Confirm clinician record</button>}</div><details><summary>Both provenance points</summary><pre>{JSON.stringify(JSON.parse(c.provenance_json),null,2)}</pre></details><small>No source is overwritten. If the clinician record needs correction, add a new clinician note before confirming.</small></article>)}</details></section>}
