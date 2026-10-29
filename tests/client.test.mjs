import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createCatalogHandler} from '../server/catalog-core.mjs';
const run=promisify(execFile);

test('update client reads, writes, verifies persistent records and safely retries a batch',async()=>{
  const seed=JSON.parse(await readFile(new URL('../data/feed-seed.json',import.meta.url),'utf8'));
  const token='test-only-cli-updater-token-at-least-thirty-two-characters';
  const objects=new Map();let serial=0;
  const bucket={async get(key){const x=objects.get(key);return x?{etag:x.etag,json:async()=>JSON.parse(x.body)}:null;},async put(key,body,options={}){const old=objects.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches||options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const x={body,etag:String(++serial)};objects.set(key,x);return x;}};
  const handle=createCatalogHandler({seed,sources:[],guide:{}}),folder=await mkdtemp(join(tmpdir(),'smartmathz-client-'));
  const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const method=req.method||'GET';const result=await handle(new Request('http://127.0.0.1'+req.url,{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})}),{BUCKET:bucket,UPDATE_TOKEN:token});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(error){res.writeHead(500);res.end(error.message);}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const batchFile=join(folder,'reviewed.json'),record={...seed.records[0],title:'Local integration test only',lastVerifiedAt:new Date().toISOString()};
    await writeFile(batchFile,JSON.stringify({runId:'client-integration-test',upserts:[record],run:{status:'success',sourcesChecked:1,notes:'Synthetic local test'}}));
    const env={...process.env,SMARTMATHZ_SITE_URL:'http://127.0.0.1:'+server.address().port,SMARTMATHZ_UPDATE_TOKEN:token};
    const first=await run(process.execPath,['scripts/update-catalog.mjs',batchFile],{env});assert.match(first.stdout,/Saved and verified 1 record/);
    const second=await run(process.execPath,['scripts/update-catalog.mjs',batchFile],{env});assert.match(second.stdout,/already saved and verified/);
    const catalog=JSON.parse(objects.get('smartmathz/catalog-v1.json').body);assert.equal(catalog.revision,seed.revision+1);assert.deepEqual(catalog.records.find(r=>r.id===record.id),record);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(folder,{recursive:true,force:true});}
});
