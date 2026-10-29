import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createCatalogHandler} from '../server/catalog-core.mjs';
import {createBucket} from '../server/netlify-store.mjs';
import {protectRequest} from '../server/access.mjs';

const seed=JSON.parse(await readFile(new URL('../data/feed-seed.json',import.meta.url),'utf8'));
const updateToken='test-only-updater-token-at-least-thirty-two-characters';
const settings={updateToken};
const bearer='Bearer '+updateToken;
function setup() {
  const map=new Map();
  const store={
    async getWithMetadata(key,options){assert.equal(options.consistency,'strong');const item=map.get(key);return item?{data:item.body,etag:item.etag,metadata:{}}:null;},
    async set(key,body,condition){const old=map.get(key);if(condition.onlyIfMatch&&condition.onlyIfMatch!==old?.etag||condition.onlyIfNew&&old)return {modified:false};const etag='"'+createHash('sha256').update(body).digest('hex')+'"';map.set(key,{etag,body});return {modified:true,etag};}
  };
  const env={BUCKET:createBucket(store),UPDATE_TOKEN:updateToken};
  const handle=createCatalogHandler({seed,sources:[],guide:{name:'test'}});
  const call=(path,{method='GET',auth=bearer,body,origin}={})=>handle(new Request('https://smartmathz.example'+path,{method,headers:{...(auth?{authorization:auth}:{}),...(body?{'content-type':'application/json'}:{}),...(origin?{origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const batch=(runId='test-update',revision=seed.revision,upserts=[{...seed.records[0],lastVerifiedAt:new Date().toISOString()}])=>({runId,expectedRevision:revision,upserts,run:{status:'success',sourcesChecked:1,notes:'Test only'}});
  return {call,env,map,batch,handle};
}

test('public reads are open; only catalog updates require the updater token',async()=>{
  const next=()=>new Response('public content');
  for(const path of ['/','/careers/','/assets/logo.png','/api/catalog','/catalog.json']){
    assert.equal((await protectRequest(new Request('https://example.test'+path),settings,next)).status,200);
    assert.equal((await protectRequest(new Request('https://example.test'+path),{},next)).status,200);
  }
  assert.equal((await protectRequest(new Request('https://example.test/api/catalog/update',{method:'POST'}),settings,next)).status,401);
  assert.equal((await protectRequest(new Request('https://example.test/api/catalog/update',{method:'POST'}),{},next)).status,503);
  assert.equal((await protectRequest(new Request('https://example.test/api/catalog/update',{method:'POST',headers:{authorization:bearer}}),settings,next)).status,200);
});

test('catalog reads are public; viewer-style credentials cannot modify records',async()=>{
  const {call,batch}=setup();
  assert.equal((await call('/api/catalog',{auth:''})).status,200);
  const value=await(await call('/api/catalog',{auth:''})).json();assert.equal(value.records.length,16);assert.equal(value.automation.enabled,false);
  assert.equal((await call('/api/catalog/update',{method:'POST',auth:'',body:batch()})).status,401);
  assert.equal((await call('/api/catalog/update',{method:'POST',auth:'Bearer wrong-token',body:batch()})).status,401);
});

test('verified writes persist through Netlify adapter and duplicate retries do not overwrite',async()=>{
  const {call,batch,map}=setup(),input=batch();
  const write=await call('/api/catalog/update',{method:'POST',body:input});assert.equal(write.status,200);
  const result=await write.json();assert.equal(result.storage,'persisted');assert.equal(result.revision,seed.revision+1);
  const after=await(await call('/api/catalog',{auth:''})).json();assert.deepEqual(after.records.find(r=>r.id===input.upserts[0].id),input.upserts[0]);
  assert.equal((await(await call('/api/catalog/update',{method:'POST',body:input})).json()).alreadyCommitted,true);
  assert.equal((await call('/api/catalog/update',{method:'POST',body:batch('stale')})).status,409);
  assert.equal(map.has('smartmathz/catalog-v1.json'),true);
});

test('concurrent updates preserve a single winning revision and history',async()=>{
  const {call,batch,map}=setup();await call('/api/catalog/update',{method:'POST',body:batch('initial')});
  const revision=seed.revision+1;
  const results=await Promise.all(['a','b'].map(id=>call('/api/catalog/update',{method:'POST',body:batch('race-'+id,revision,[])})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(map.has('smartmathz/history/revision-'+revision+'.json'),true);
});

test('rejects invalid deadlines, stale reviews, non-HTTPS links, cross-origin writes',async()=>{
  const {call,batch}=setup(),record={...seed.records[0],lastVerifiedAt:new Date().toISOString()};
  for(const change of [{deadlineDate:'2026-99-99'},{deadlineKind:'event',deadlineDate:'2027-01-01'},{sourceUrl:'javascript:alert(1)'},{lastVerifiedAt:'2025-01-01T00:00:00Z'},{deadlineAt:'2027-01-01T12:00:00'}]){
    assert.equal((await call('/api/catalog/update',{method:'POST',body:batch('invalid',seed.revision,[{...record,...change}])})).status,400);
  }
  assert.equal((await call('/api/catalog/update',{method:'POST',body:batch(),origin:'https://unrelated.test'})).status,403);
});

test('HEAD reads are bodyless and missing storage cannot silently accept writes',async()=>{
  const {call,handle,batch,env}=setup();
  const head=await call('/catalog.json',{method:'HEAD',auth:''});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const res=await handle(new Request('https://example.test/api/catalog/update',{method:'POST',headers:{authorization:bearer,'content-type':'application/json'},body:JSON.stringify(batch())}),{...env,BUCKET:undefined});assert.equal(res.status,503);
});
