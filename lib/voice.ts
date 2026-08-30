// Transparent local matching, not a medical NER model or a diagnosis engine.
export const voiceLanguages = [
 {code:"en-SG",label:"English (Singapore)"},{code:"zh-CN",label:"普通话 Mandarin"},
 {code:"en-US",label:"English (US)"},{code:"ms-MY",label:"Bahasa Melayu"},
 {code:"ta-IN",label:"தமிழ் Tamil"},{code:"es-ES",label:"Español"},{code:"fr-FR",label:"Français"},
];
export type MedicalMention={category:string;term:string;matched:string;start:number;end:number;quote:string;context:string};
const glossary:[string,string,RegExp][]=[
 ["Symptom","Chest pain / 胸痛",/\bchest (?:pain|pressure|discomfort)\b|胸痛|胸闷|胸部压迫/gi],
 ["Symptom","Breathlessness / 呼吸困难",/\b(?:shortness of breath|breathless(?:ness)?|dyspn(?:o)?ea)\b|呼吸困难|气短|喘不过气/gi],
 ["Symptom","Fever / 发热",/\bfever\b|发热|发烧/gi],
 ["Symptom","Dizziness / 头晕",/\bdizz(?:y|iness)\b|头晕/gi],
 ["Medication","Metformin / 二甲双胍",/\bmetformin\b|二甲双胍/gi],
 ["Medication","Aspirin / 阿司匹林",/\baspirin\b|阿司匹林/gi],
 ["Medication","Penicillin / 青霉素",/\bpenicillin\b|青霉素/gi],
 ["Medication","Insulin / 胰岛素",/\binsulin\b|胰岛素/gi],
 ["Test","Electrocardiogram / 心电图",/\b(?:ECG|EKG|electrocardiogram)\b|心电图/gi],
 ["Test","Troponin / 肌钙蛋白",/\btroponin\b|肌钙蛋白/gi],
 ["Allergy mention","Allergy / 过敏",/\ballerg(?:y|ies|ic)\b|过敏/gi],
 ["Dose / measurement","Check number and unit",/\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|mL|units?|mmHg|mmol\/L)\b|[\d一二三四五六七八九十百]+(?:\.\d+)?\s*(?:毫克|微克|毫升|单位)/gi],
 ["Duration / frequency","Check timing",/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minutes?|hours?|days?|weeks?|months?|times?)\b|\b(?:once|twice) (?:daily|a day)\b|[\d一二三四五六七八九十]+\s*(?:分钟|小时|天|周|个月|次)|每天|每日/gi],
];
export function extractMedicalMentions(text:string):MedicalMention[]{
 const results:MedicalMention[]=[];
 for(const [category,term,pattern] of glossary){
  for(const match of text.matchAll(new RegExp(pattern.source,pattern.flags))){
   const start=match.index!,end=start+match[0].length;
   const before=text.slice(0,start),last=Math.max(before.lastIndexOf("."),before.lastIndexOf("。"),before.lastIndexOf("\n"),before.lastIndexOf("!"),before.lastIndexOf("?"));
   const tail=text.slice(end),next=tail.search(/[.!?。！？\n]/),clause=text.slice(last+1,next<0?text.length:end+next+1);
   const context=/\b(no|not|denies|denied|without|never|negative)\b|没有|否认|无|不伴/.test(clause.toLowerCase())?"Negation cue in sentence — verify scope":/\b(maybe|possible|possibly|unsure)\b|可能|不确定/.test(clause.toLowerCase())?"Uncertainty cue — verify":"Mention only — verify meaning";
   results.push({category,term,matched:match[0],start,end,quote:clause.trim(),context});
  }
 }
 return results.sort((a,b)=>a.start-b.start).slice(0,60);
}
export function validateVoiceInput(body:Record<string,unknown>){
 if(body.consent!==true||body.reviewed!==true)return "Recording consent and transcript review are required";
 if(!voiceLanguages.some(l=>l.code===body.language))return "Unsupported language selection";
 if(!["browser_speech","manual_transcript"].includes(String(body.method)))return "Invalid capture method";
 if(typeof body.originalText!=="string"||typeof body.reviewedText!=="string"||!body.originalText.trim()||!body.reviewedText.trim())return "Original and reviewed text are required";
 if(body.originalText.length>12000||body.reviewedText.length>12000)return "Please save shorter notes (maximum 12,000 characters)";
 return null;
}
