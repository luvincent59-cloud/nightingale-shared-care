"use client";

import { useEffect, useRef, useState } from "react";

export type Highlight={id:string;entry_id:string;entity_key:string;label:string;meta:string;severity:"high"|"medium"|"low";risk_reason:string;why:string;provenance_pointer:string;components_json:string;learned_boost:number;signal_count:number;final_score:number;status:"pending"|"accepted"|"rejected";model_version:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;resolved_at:string|null;safety_pinned:boolean};

type Props = {
 highlights: Highlight[]; history: Highlight[]; actor: {role:string}; saving:boolean; selected:string;
 displayName:(id:string)=>string; onSource:(id:string)=>void; onAccept:(id:string)=>void;
 onReject:(id:string)=>void; onComplete:(id:string)=>void;
};
const severityLabel=(h:Highlight)=>h.resolved_at?"RESOLVED":h.safety_pinned?"FLAG · URGENT":h.severity==="high"?"HIGH RISK":h.severity==="medium"?"ELEVATED":"LOW RISK";
const reviewLabel=(h:Highlight)=>h.status==="pending"?"Review pending":h.status==="accepted"?"Accepted":"Rejected";

export function PriorityOverview(props:Props) {
 const {highlights,history,actor,selected}=props;
 const [openId,setOpenId]=useState<string|null>(null);
 const active=[...highlights,...history].find(h=>h.id===openId);
 const card=(h:Highlight)=><div key={h.id} className="compact-card-wrap"><button type="button" className={`compact-priority-card ${h.resolved_at?"resolved":h.severity} ${selected===h.id?"selected":""}`} onClick={()=>setOpenId(h.id)} aria-haspopup="dialog" aria-label={`${h.label}. ${severityLabel(h)}. ${reviewLabel(h)}. Open details`}>
  <span className="compact-card-top"><span className="priority-severity">{severityLabel(h)}</span><span className="compact-ai">AI SUGGESTION</span></span>
  <span className="compact-card-title">{h.label}</span>
  <span className="compact-card-reason">{h.risk_reason}</span>
  <span className="compact-card-bottom"><span>{reviewLabel(h)}</span><span>View details <span aria-hidden="true">↗</span></span></span>
 </button><button type="button" className="compact-source" onClick={()=>props.onSource(h.id)}>View source event</button></div>;
 return <section className="glance compact-overview"><div className="section-title"><div><h2>Priority overview</h2><em>Most important first · select a card for details</em></div><div className="freshness"><i/> {actor.role} view</div></div>
  <div className="compact-priority-grid">{highlights.slice(0,3).map(card)}</div>
  {!highlights.length&&<p>No open priority suggestions.</p>}
  {(highlights.length>3||history.length>0)&&<div className="compact-more">
   {highlights.length>3&&<details><summary>{highlights.length-3} more open</summary><div className="compact-priority-grid">{highlights.slice(3).map(card)}</div></details>}
   {history.length>0&&<details><summary>Completed / rejected ({history.length})</summary><div className="compact-priority-grid">{history.map(card)}</div></details>}
  </div>}
  {active&&<PriorityDetails {...props} highlight={active} archived={Boolean(active.resolved_at)||history.some(h=>h.id===active.id)} onClose={()=>setOpenId(null)}/>}
 </section>;
}

export function PriorityDetails({highlight:h,archived,onClose,...props}:Props&{highlight:Highlight;archived:boolean;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(dialog.current&&!dialog.current.open)dialog.current.showModal()},[]);
 const close=()=>{dialog.current?.close();onClose()};
 const act=(callback:(id:string)=>void)=>{close();callback(h.id)};
 return <dialog ref={dialog} className="priority-dialog" aria-labelledby="priority-detail-title" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)close()}}>
  <div className="priority-detail-shell">
   <header><div><span className={`detail-severity ${h.resolved_at?"resolved":h.severity}`}>{severityLabel(h)}</span><span className="detail-ai">AI SUGGESTION · {reviewLabel(h)}</span><h2 id="priority-detail-title">{h.label}</h2></div><button type="button" aria-label="Close highlight details" onClick={close}>×</button></header>
   <div className="priority-detail-body">
    <section><h3>Why important</h3><p>{h.why}</p>{h.safety_pinned&&h.status==="rejected"&&<p className="risk-warning">Suggestion rejected. The urgent flag remains open until a clinician records resolution.</p>}</section>
    <section><h3>Provenance point</h3><pre>{JSON.stringify(JSON.parse(h.provenance_pointer),null,2)}</pre><button type="button" className="outline" onClick={()=>act(props.onSource)}>View source event</button><small>Full chat still requires consent from all human participants.</small></section>
    <details className="ranking-details"><summary>How this was ranked · {h.final_score}/100</summary><dl>{Object.entries(JSON.parse(h.components_json) as Record<string,number>).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value>0?"+":""}{value}</dd></div>)}</dl><p>Ranking score, not diagnostic confidence. {h.signal_count} saved signals · {h.model_version}.</p><p>Synthetic prototype · rule-assisted candidates. Recent, open items rank higher; urgent open risks stay first.</p></details>
    {h.reviewed_by&&<p className="priority-review-record">Reviewed by {props.displayName(h.reviewed_by)} · {h.review_reason??"accepted"}{h.reviewed_at&&` · ${new Date(h.reviewed_at).toLocaleString("en-SG")}`}</p>}
   </div>
   {!archived&&<footer><small>Accept confirms the suggestion; Complete closes the work.</small><div>
    {props.actor.role==="clinician"&&h.status==="pending"&&<><button type="button" className="primary" disabled={props.saving} onClick={()=>act(props.onAccept)}>{props.saving?"Saving…":"Accept"}</button><button type="button" className="outline" disabled={props.saving} onClick={()=>act(props.onReject)}>Reject</button></>}
    {(props.actor.role==="clinician"||h.severity!=="high"&&!["exertional_chest_pain","cardiac_testing"].includes(h.entity_key))&&<button type="button" className="outline" disabled={props.saving} onClick={()=>act(props.onComplete)}>Mark completed</button>}
   </div></footer>}
  </div>
 </dialog>;
}
