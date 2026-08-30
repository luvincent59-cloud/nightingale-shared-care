// Run from project root. No credentials or clinical response bodies are written to reports.
import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
const local=process.argv.includes('--local');
const roles=['clinician','staff','nurse','patient','admin'];
const concurrency=Number(process.env.NG_BENCH_CONCURRENCY??30);
const perRole=Number(process.env.NG_BENCH_SAMPLES??1000);
const warmup=Number(process.env.NG_BENCH_WARMUP??100);
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>30||!Number.isInteger(perRole)||perRole<100||perRole>10000)throw new Error('Use concurrency 1–30 and 100–10000 samples per role');
let server,base=process.env.NG_BENCH_URL,sessions;
if(local){
 const harness=await import('../tests/helpers/care-harness.mjs');await harness.reset();
 const db=harness.sqlite;db.exec('BEGIN');const insert=db.prepare('INSERT INTO care_entries (id,clinic_id,patient_id,owner_role,author_id,kind,title,content,source,confidence,patient_visible,raw_ai,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<10000;i++)insert.run(`history-${i}`,'north','patient-1','clinician','dr-samuel-lee','clinician_note','Synthetic historical entry','Historical synthetic record.','Benchmark fixture','synthetic',0,0,'2014-01-01');db.exec('COMMIT');
 const {GET}=await harness.importSource('app/api/top-card/route.ts');
 server=createServer(async(req,res)=>{try{const r=await GET(new Request(`http://bench.test${req.url}`,{headers:{cookie:req.headers.cookie??''}}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text())}catch{res.writeHead(500);res.end('{}')}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 sessions=Object.fromEntries(roles.map(role=>[role,`ng_session=${role==='clinician'?'doctor':role}`]));
}else{
 if(!base||!process.env.NG_BENCH_SESSIONS)throw new Error('Use --local or provide NG_BENCH_URL and NG_BENCH_SESSIONS JSON role-to-Cookie mapping from authorized demo sessions.');
 sessions=JSON.parse(process.env.NG_BENCH_SESSIONS);
 if(!roles.every(role=>typeof sessions[role]==='string'))throw new Error('Provide an authorized cookie string for each role');
 if(new URL(base).protocol!=='https:')throw new Error('Remote measurements require HTTPS');
}
const rows=[];
async function request(role,record=true){
 const start=performance.now();let ok=false,path='error',serverMs=null;
 try{const r=await fetch(`${base}/api/top-card`,{headers:{cookie:sessions[role]},signal:AbortSignal.timeout(5000),redirect:'error'});path=r.headers.get('x-top-card-path')??'unknown';serverMs=Number(r.headers.get('server-timing')?.match(/dur=([\d.]+)/)?.[1]??NaN);const data=await r.json();ok=r.ok&&data.role===role&&Array.isArray(data.highlights)}catch{/* failure remains in recorded sample */}
 if(record)rows.push({role,ok,path,ms:performance.now()-start,serverMs:Number.isFinite(serverMs)?serverMs:null});
}
try{
 for(const role of roles)for(let i=0;i<warmup;i++)await request(role,false);
 const jobs=Array.from({length:perRole},()=>roles).flat();let cursor=0;
 const start=performance.now();await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<jobs.length){const role=jobs[cursor++];await request(role)}}));
 const percentile=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.ceil(p*a.length)-1]:null;
 const summaries=roles.map(role=>{const all=rows.filter(r=>r.role===role),success=all.filter(r=>r.ok),warm=success.filter(r=>r.path==='warm'),cold=success.filter(r=>r.path==='cold');return {role,samples:all.length,failures:all.length-success.length,p50_ms:percentile(success.map(r=>r.ms),.5),p95_ms:percentile(success.map(r=>r.ms),.95),p99_ms:percentile(success.map(r=>r.ms),.99),warm_p95_ms:percentile(warm.map(r=>r.ms),.95),cold_samples:cold.length,cold_p95_ms:percentile(cold.map(r=>r.ms),.95),server_p95_ms:percentile(success.filter(r=>r.serverMs!==null).map(r=>r.serverMs),.95)}});
 const report={measured_at:new Date().toISOString(),environment:local?'Local loopback HTTP + Node SQLite adapter; NOT deployed D1 or browser paint':'Authorized remote HTTP; NOT browser paint',node:process.version,source_fixture:local?'10,005 synthetic entries; precomputed bounded role projections':'Existing authorized synthetic fixture',concurrency,warmup_per_role:warmup,measurement_seconds:(performance.now()-start)/1000,target_ms:300,percentile_method:'Nearest rank: sorted[ceil(0.95*N)-1]. Errors reported separately and fail the gate.',local_or_http_gate:summaries.every(r=>r.failures===0&&r.p95_ms<=300)?'PASS':'FAIL',production_browser_gate:'NOT MEASURED',roles:summaries,samples:rows};
 const file=local?'docs/top-card-local-benchmark.json':'docs/top-card-http-benchmark.json';writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,samples:undefined},null,2));
 if(report.local_or_http_gate==='FAIL')process.exitCode=1;
}finally{if(server)await new Promise(resolve=>server.close(resolve))}
