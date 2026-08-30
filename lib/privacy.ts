export const REDACTION_VERSION='phi-rules-v1';
// Conservative demo boundary, not exhaustive clinical NER. Only synthetic data is permitted.
export function redactText(input:string,knownNames:string[]=[]){
 let text=input,count=0;
 const replace=(pattern:RegExp,token:string)=>{text=text.replace(pattern,()=>{count++;return token})};
 // Synthetic fixture tokens are always removed before the model boundary.
 replace(/\bSYNTHETIC_ID\b/g,'[REDACTED_ID]');
 replace(/\bSYNTHETIC_PHONE\b/g,'[REDACTED_PHONE]');
 replace(/\bSYNTHETIC_EMAIL\b/g,'[REDACTED_EMAIL]');
 for(const name of knownNames.filter(n=>n.length>2))replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'[REDACTED_NAME]');
 replace(/\b[STFGM]\d{7}[A-Z]\b/gi,'[REDACTED_ID]');
 replace(/\b\d{17}[\dX]\b/gi,'[REDACTED_ID]');
 replace(/(?:\+65[ -]?)?[689]\d{3}[ -]?\d{4}\b/g,'[REDACTED_PHONE]');
 replace(/(?:\+86[ -]?)?\b1[3-9]\d{9}\b/g,'[REDACTED_PHONE]');
 replace(/\+\d[\d ()-]{8,18}\d/g,'[REDACTED_PHONE]');
 replace(/\b(?:patient name|name)\s*[:：]\s*[A-Za-z][A-Za-z '-]{1,70}(?=[,;\n.]|$)/gi,'Name: [REDACTED_NAME]');
 replace(/(?:姓名|患者姓名)\s*[:：]\s*[\p{Script=Han}·]{2,12}/gu,'姓名：[REDACTED_NAME]');
 replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[REDACTED_EMAIL]');
 return {text,count,version:REDACTION_VERSION};
}
export function prepareModelInput(text:string,knownNames:string[]=[]){return {...redactText(text,knownNames),requiresHumanReview:true as const}}
export function safeAuditMetadata(metadata:Record<string,unknown>){
 const result:Record<string,unknown>={};
 for(const [key,value] of Object.entries(metadata)){
  if(['from_version','to_version','target_version','new_version','version','redaction_count','mention_count'].includes(key)&&typeof value==='number')result[key]=value;
  if(['audio_retained','author_reviewed','consent_attested'].includes(key)&&typeof value==='boolean')result[key]=value;
  if(['kind','method','language','model','signal','extraction','status','request_id','source_id','entry_id','highlight_id','clinician_entry_id','other_entry_id'].includes(key)&&typeof value==='string'&&/^[a-zA-Z0-9_:.-]{1,180}$/.test(value))result[key]=value;
 }
 return result;
}
export async function fingerprint(value:unknown){return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('')}
