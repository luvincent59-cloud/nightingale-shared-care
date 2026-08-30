"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {extractMedicalMentions,voiceLanguages} from "../lib/voice";

type Result={isFinal:boolean;length:number;[index:number]:{transcript:string;confidence:number}};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;maxAlternatives:number;onstart:(()=>void)|null;onend:(()=>void)|null;onerror:((e:{error:string})=>void)|null;onresult:((e:{results:{length:number;[index:number]:Result}})=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
type SaveBody=Record<string,string|boolean>;
const errors:Record<string,string>={"not-allowed":"Microphone access was denied. Allow it in your browser settings, or use manual text.","service-not-allowed":"This browser has blocked its speech service. Use manual text or another supported browser.","audio-capture":"No usable microphone was found.","network":"The browser speech service could not connect. Your existing draft is still here.","no-speech":"No speech was recognised. Move closer to the microphone and try again.","language-not-supported":"This language is unavailable in this browser. Choose another language or use manual text."};
export function VoiceNote({onClose,onSave}:{onClose:()=>void;onSave:(body:SaveBody)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),engine=useRef<Recognition|null>(null),timeout=useRef<ReturnType<typeof setTimeout>|null>(null),alive=useRef(true);
 const [supported]=useState(()=>typeof window!=="undefined"&&Boolean((window as SpeechWindow).SpeechRecognition||(window as SpeechWindow).webkitSpeechRecognition)),[mode,setMode]=useState<"browser_speech"|"manual_transcript">("browser_speech");
 const [language,setLanguage]=useState("en-SG"),[consent,setConsent]=useState(false),[reviewed,setReviewed]=useState(false),[title,setTitle]=useState("");
 const [original,setOriginal]=useState(""),[text,setText]=useState(""),[interim,setInterim]=useState(""),[phase,setPhase]=useState("idle"),[error,setError]=useState(""),[busy,setBusy]=useState(false),[lowConfidence,setLowConfidence]=useState(false);
 const mentions=useMemo(()=>extractMedicalMentions(text),[text]);
 const active=phase!=="idle";
 useEffect(()=>{alive.current=true;if(dialog.current&&!dialog.current.open)dialog.current.showModal();return()=>{alive.current=false;if(timeout.current)clearTimeout(timeout.current);engine.current?.abort();engine.current=null}},[]);
 const close=()=>{if(busy)return;if((original||active)&&!window.confirm("Discard this unsaved voice draft?"))return;engine.current?.abort();dialog.current?.close();onClose()};
 const start=()=>{
  const w=window as SpeechWindow,Constructor=w.SpeechRecognition||w.webkitSpeechRecognition;if(!Constructor||!consent||active)return;
  setError("");setReviewed(false);setPhase("starting");const recognition=new Constructor();engine.current=recognition;
  recognition.lang=language;recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
  const originalPrefix=original.trim(),editedPrefix=text.trim();
  recognition.onstart=()=>{if(alive.current&&engine.current===recognition)setPhase("listening")};
  recognition.onresult=e=>{
   if(!alive.current||engine.current!==recognition)return;
   const final:string[]=[],partial:string[]=[];let uncertain=false;
   for(let i=0;i<e.results.length;i++){const result=e.results[i];if(result.isFinal){final.push(result[0].transcript);if(result[0].confidence>0&&result[0].confidence<.8)uncertain=true}else partial.push(result[0].transcript)}
   const captured=[originalPrefix,...final].filter(Boolean).join(" ");
   setOriginal(captured);setText([editedPrefix,...final].filter(Boolean).join(" "));setInterim(partial.join(" "));if(uncertain)setLowConfidence(true);
   if(captured.length>=10000){setError("Long note: dictation is pausing. Review and save this note before starting another. If over 12,000 characters, copy the draft and split it using manual input; text has not been truncated.");stop()}
  };
  recognition.onerror=e=>{if(alive.current&&engine.current===recognition&&e.error!=="aborted")setError(errors[e.error]??`Speech recognition stopped (${e.error}). Review the draft or try manual text.`)};
  recognition.onend=()=>{if(!alive.current||engine.current!==recognition)return;if(timeout.current)clearTimeout(timeout.current);engine.current=null;setPhase("idle");setInterim("")};
  try{recognition.start()}catch{engine.current=null;setPhase("idle");setError("Could not start speech recognition. Try manual text instead.")}
 };
 const stop=()=>{if(!engine.current)return;setPhase("stopping");engine.current.stop();if(timeout.current)clearTimeout(timeout.current);timeout.current=setTimeout(()=>{engine.current?.abort();engine.current=null;if(alive.current){setPhase("idle");setInterim("")}},3000)};
 const save=async()=>{if(active||!reviewed||!consent||!text.trim()||!original.trim()||original.length>12000||text.length>12000)return;setBusy(true);setError("");try{await onSave({action:"save_voice_note",originalText:original,reviewedText:text,title:title.trim()||"Voice-assisted care note",method:mode,language,consent,reviewed});onClose()}catch(e){setError(e instanceof Error?e.message:"Save failed; your draft is retained")}finally{if(alive.current)setBusy(false)}};
 return <dialog ref={dialog} className="voice-dialog" aria-labelledby="voice-title" onCancel={e=>{e.preventDefault();close()}}><div>
  <header><div><span>NO PAID API · SYNTHETIC DEMO</span><h2 id="voice-title">Voice note</h2></div><button type="button" aria-label="Close voice note" disabled={busy} onClick={close}>×</button></header>
  <div className="voice-body">
   <p className="voice-notice">Single speaker only. The browser may send audio to its own speech service. This is not guaranteed offline, noise-isolated or medically accurate. Use simulated patient information only.</p>
   {supported===false&&<p role="status" className="voice-error">Speech recognition is unavailable in this browser. Use the manual transcript option below; no recognition result will be simulated.</p>}
   <div className="voice-settings"><label>Input mode<select value={mode} disabled={active||busy||Boolean(original)} onChange={e=>setMode(e.target.value as typeof mode)}><option value="browser_speech">Browser speech recognition</option><option value="manual_transcript">Manual / pasted transcript</option></select></label><label>Spoken language<select value={language} disabled={active||busy||Boolean(original)} onChange={e=>setLanguage(e.target.value)}>{voiceLanguages.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}</select></label></div>
   <small>Language availability depends on your browser. Select one primary language; automatic language switching is not provided.</small>
   <label className="voice-check"><input type="checkbox" checked={consent} disabled={active||busy} onChange={e=>setConsent(e.target.checked)}/> I am dictating my own simulated note and consent to browser speech processing and saving the reviewed text. Do not record other people.</label>
   {mode==="browser_speech"&&<div className="voice-controls"><button type="button" className="primary" disabled={!supported||!consent||active||busy||original.length>=10000} onClick={start}>{original?"Continue dictation":"Start listening"}</button><button type="button" className="outline" disabled={!active||phase==="stopping"} onClick={stop}>Stop</button><span role="status" aria-live="polite">{phase==="listening"?"Microphone active":phase==="starting"?"Opening microphone…":phase==="stopping"?"Finalising…":"Microphone off"}</span></div>}
   <p className="voice-help">For noise: use a headset or close microphone, avoid overlapping speech, and repeat unclear phrases. Browser-managed audio processing varies; this app does not isolate a target speaker.</p>
   {error&&<p role="alert" className="voice-error">{error}</p>}{lowConfidence&&<p className="voice-warning">The browser flagged some words as uncertain. Check the whole transcript; this is not a calibrated medical confidence score.</p>}
   <label className="voice-field">Original {mode==="browser_speech"?"automatic transcript · AI GENERATED":"pasted transcript"}<textarea value={original} readOnly={mode==="browser_speech"} disabled={busy} maxLength={12000} placeholder={mode==="browser_speech"?"Final recognised text appears here…":"Paste a simulated transcript here…"} onChange={e=>{setOriginal(e.target.value);setText(e.target.value);setReviewed(false)}}/></label>
   {interim&&<p className="voice-interim" aria-live="polite">In progress (not saved): {interim}</p>}
   <label className="voice-field">Review and correct<textarea value={text} disabled={active||busy} maxLength={12000} onChange={e=>{setText(e.target.value);setReviewed(false)}} placeholder="Correct drug names, units, numbers and negations before saving."/></label>
   <section className="voice-extraction"><h3>Medical keywords <span>LOCAL RULES · REVIEW REQUIRED</span></h3><p>English / Mandarin glossary only; other languages retain their full text. Mentions are not diagnoses and numbers are not automatically linked to a medication.</p>{mentions.length?<ul>{mentions.map((m,i)=><li key={`${m.start}-${i}`}><div><strong>{m.term}</strong><span>{m.category}</span></div><blockquote>“{m.quote}”</blockquote><small>{m.context} · source characters {m.start}–{m.end}</small></li>)}</ul>:<p>No glossary matches. This does not mean there is no relevant medical information.</p>}</section>
   <label className="voice-field">Note title<input value={title} maxLength={160} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="Brief description of this note"/></label>
   <label className="voice-check"><input type="checkbox" checked={reviewed} disabled={active||busy||!text.trim()} onChange={e=>setReviewed(e.target.checked)}/> I checked the text, including medications, doses, timing and “no / not / 没有”. This is author review, not clinician confirmation.</label>
   <p className="voice-help">Up to 12,000 characters per note. Dictation pauses near 10,000 characters. Original and corrected text are retained separately. No audio recording is stored, and source positions refer to text, not audio timestamps. Other users need your consent to view the original draft.</p>
  </div><footer><button type="button" className="outline" disabled={busy} onClick={close}>Cancel</button><button type="button" className="primary" disabled={active||busy||!reviewed||!consent||!original.trim()||!text.trim()||original.length>12000||text.length>12000} onClick={save}>{busy?"Saving…":"Save reviewed note"}</button></footer>
 </div></dialog>;
}
