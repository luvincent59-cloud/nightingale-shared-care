import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
async function importSource(path) {
 const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'test-d1',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare:workers',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const env = globalThis.__careTestEnv;'}));}}]});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
let sqlite;
function statement(sql,params=[]) {
 return {bind(...args){return statement(sql,args)},async first(){return sqlite.prepare(sql).get(...params)??null},async all(){return {results:sqlite.prepare(sql).all(...params)}},async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}}};
}
let batchQueue=Promise.resolve();
globalThis.__careTestEnv={DB:{prepare:statement,batch(statements){const task=batchQueue.then(async()=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}});batchQueue=task.catch(()=>{});return task}}};
const {GET,POST}=await importSource('app/api/care/route.ts');
const identities={'doctor':'dr-samuel-lee','staff':'priya-nair','nurse':'mei-tan','patient':'maya-chen','admin':'alice-wong'};
async function reset(){
 sqlite?.close();sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
 for(const [token,id] of Object.entries(identities))sqlite.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?,?)').run(token,id,'north','2099-01-01','2026-01-01');
 await get();
}
async function get(role='doctor'){const r=await GET(new Request('https://care.test/api/care',{headers:{cookie:`ng_session=${role}`}}));assert.equal(r.status,200);return r.json()}
async function post(body,role='doctor'){return POST(new Request('https://care.test/api/care',{method:'POST',headers:{cookie:`ng_session=${role}`,'content-type':'application/json'},body:JSON.stringify(body)}))}

export {importSource,sqlite,GET,POST,identities,reset,get,post};
