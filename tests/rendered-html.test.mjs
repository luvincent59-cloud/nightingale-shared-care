import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build contains the trust UI without bundling transcript text", async () => {
  const assetsUrl = new URL("../dist/client/assets/", import.meta.url);
  const pageAsset = (await readdir(assetsUrl)).find(file => file.startsWith("page-") && file.endsWith(".js"));
  assert.ok(pageAsset, "page client asset is present");
  const client = (await Promise.all((await readdir(assetsUrl)).filter(f=>f.endsWith(".js")).map(f=>readFile(new URL(f,assetsUrl),"utf8")))).join("\n");
  assert.match(client, /AI GENERATED/);
  assert.match(client, /CONSENT INBOX/);
  assert.doesNotMatch(client, /It happened three times this week\. Before this|About five minutes if I walk quickly|I want to know if exercise is safe before the weekend/);
  const server = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(server, /Nightingale Shared Care/);
});


// Component rendering checks exercise disclosure and role-specific actions without a browser.
const { build } = await import("esbuild");
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createRequire } = await import("node:module");
const { pathToFileURL } = await import("node:url");
const require = createRequire(import.meta.url);
const built = await build({entryPoints:["app/priority-overview.tsx"],bundle:true,write:false,platform:"node",format:"esm",plugins:[{name:"shared-react",setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));}}]});
const {PriorityOverview,PriorityDetails} = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const highlight={id:"h-test",entry_id:"entry-test",entity_key:"exertional_chest_pain",label:"Increasing symptoms",severity:"high",safety_pinned:true,status:"pending",resolved_at:null,why:"Detailed importance explanation",provenance_pointer:'{"entry_id":"entry-test","span":"08:21"}',components_json:'{"risk":35,"recency":20}',final_score:80,signal_count:2,model_version:"importance-v2",reviewed_by:null};
const props={highlights:[highlight],history:[],actor:{role:"clinician"},saving:false,selected:"h-test",displayName:id=>id,onSource(){},onAccept(){},onReject(){},onComplete(){}};

test("top cards show concise severity and review information, not full detail",()=>{
 const html=renderToStaticMarkup(createElement(PriorityOverview,props));
 assert.match(html,/FLAG · URGENT/);assert.match(html,/AI SUGGESTION/);assert.match(html,/Review pending/);assert.match(html,/aria-haspopup="dialog"/);assert.match(html,/>View source event<\/button>/);
 assert.doesNotMatch(html,/Detailed importance explanation|Provenance point|Mark completed|<dialog/);
});
test("opened card retains reasons, provenance and clinician actions",()=>{
 const html=renderToStaticMarkup(createElement(PriorityDetails,{...props,highlight,archived:false,onClose(){}}));
 assert.match(html,/<dialog/);assert.match(html,/aria-labelledby="priority-detail-title"/);assert.match(html,/Detailed importance explanation/);assert.match(html,/Provenance point/);assert.match(html,/08:21/);assert.match(html,/>Accept<\/button>/);assert.match(html,/>Reject<\/button>/);assert.match(html,/Full chat still requires consent/);
});
test("staff cannot review or close a clinical risk from the detail view",()=>{
 const html=renderToStaticMarkup(createElement(PriorityDetails,{...props,actor:{role:"staff"},highlight,archived:false,onClose(){}}));
 assert.doesNotMatch(html,/>Accept<\/button>|>Reject<\/button>|>Mark completed<\/button>/);assert.match(html,/View source event/);
});

const voiceBuilt=await build({entryPoints:["app/voice-note.tsx"],bundle:true,write:false,platform:"node",format:"esm",plugins:[{name:"shared-react",setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));}}]});
const {VoiceNote}=await import(`data:text/javascript;base64,${Buffer.from(voiceBuilt.outputFiles[0].text).toString("base64")}`);
test("voice dialog discloses browser processing and starts with microphone and save disabled",()=>{
 const html=renderToStaticMarkup(createElement(VoiceNote,{onClose(){},onSave:async()=>{}}));
 assert.match(html,/NO PAID API/);assert.match(html,/browser may send audio/);assert.match(html,/Microphone off/);assert.match(html,/disabled="">Start listening/);assert.match(html,/disabled="">Save reviewed note/);assert.match(html,/No audio recording is stored/);assert.match(html,/Manual \/ pasted transcript/);
});

const conflictBuilt=await build({entryPoints:["app/top-card-surface.tsx"],bundle:true,write:false,platform:"node",format:"esm",plugins:[{name:"shared-react",setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));}}]});
const {ConflictPanel}=await import(`data:text/javascript;base64,${Buffer.from(conflictBuilt.outputFiles[0].text).toString("base64")}`);
test("conflict flag displays clinician precedence and both provenance points; only clinician can confirm",()=>{
 const conflicts=[{id:"c",claim_key:"medication:aspirin",clinician_entry_id:"doctor-source",other_entry_id:"patient-source",clinician_value:"taking",other_value:"stopped",reason:"Human review required",provenance_json:'{"clinician":{"entry_id":"doctor-source"},"other":{"entry_id":"patient-source"}}'}];
 const props={conflicts,actor:{role:"clinician"},onConflictSource(){},onConfirmConflict(){}};
 const clinician=renderToStaticMarkup(createElement(ConflictPanel,props));assert.match(clinician,/FLAG · RECORD CONFLICT/);assert.match(clinician,/Clinician record takes precedence/);assert.match(clinician,/doctor-source/);assert.match(clinician,/patient-source/);assert.match(clinician,/>Confirm clinician record<\/button>/);
 const staff=renderToStaticMarkup(createElement(ConflictPanel,{...props,actor:{role:"staff"}}));assert.doesNotMatch(staff,/>Confirm clinician record<\/button>/);
});
