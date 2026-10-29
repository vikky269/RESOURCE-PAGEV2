import {protectRequest, isUpdater} from './access.mjs';

export function createCatalogHandler({seed:SEED,sources:SOURCES,guide:UPDATE_GUIDE}) {
const CATALOG_KEY='smartmathz/catalog-v1.json';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Authorization'}});
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const validDate=value=>{if(value===null)return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;};
function httpsUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443');}catch{return false;}}
function validateRecord(r){
 if(!r||typeof r!=='object'||Array.isArray(r))fail('Each record must be an object.');
 for(const key of ['id','title','category','provider','region','location','summary','audience','sourceUrl','applyUrl','deadlineKind','status','cycle','verificationNote'])if(typeof r[key]!=='string'||!r[key].trim()||r[key].length>2000)fail('Invalid record field: '+key);
 if(!/^[a-zA-Z0-9-]{1,150}$/.test(r.id))fail('Invalid record ID.');
 if(!['NY','MD','National'].includes(r.region))fail('Records must target New York, Maryland or nationwide U.S. opportunities.');
 if(!['internships','college-applications','scholarship-applications','conferences','competitions','jobs','other-resources'].includes(r.category))fail('Invalid category.');
 if(!['open','upcoming','watch','closed'].includes(r.status))fail('Invalid application status.');
 if(!['application','registration','nomination','promotion','varies','unannounced','event','rolling'].includes(r.deadlineKind))fail('Invalid deadline kind.');
 if(!httpsUrl(r.sourceUrl)||!httpsUrl(r.applyUrl))fail('Official HTTPS source and application links are required.');
 for(const key of ['deadlineDate','opensOn','eventDate'])if(!validDate(r[key]??null))fail('Invalid date: '+key);
 if(r.deadlineAt&&(!/(?:Z|[+-]\d{2}:\d{2})$/.test(r.deadlineAt)||!Number.isFinite(Date.parse(r.deadlineAt))))fail('Invalid exact deadline.');
 if(r.deadlineDate&&['varies','unannounced','event','rolling'].includes(r.deadlineKind))fail('Do not put event dates or estimated dates in the application deadline.');
 if(r.verified!==true||!Number.isFinite(Date.parse(r.lastVerifiedAt)))fail('A verified source review timestamp is required.');
 if(Math.abs(Date.now()-Date.parse(r.lastVerifiedAt))>72*3600000)fail('Updated records need a source review from the last 72 hours.');
 for(const key of ['description','eligibility','howToApply'])if(!Array.isArray(r[key])||!r[key].length||r[key].length>15||r[key].some(s=>typeof s!=='string'||s.length>2500))fail('Invalid list: '+key);
 return r;
}
async function state(env){if(!env.BUCKET)return {data:structuredClone(SEED),object:null,bound:false};const object=await env.BUCKET.get(CATALOG_KEY);return {data:object?await object.json():structuredClone(SEED),object,bound:true};}
function status(data,bound,object){return {revision:data.revision,updatedAt:data.updatedAt,lastRun:data.lastRun,automation:data.automation,recordCount:data.records.length,regionalCount:data.records.filter(r=>r.region!=='National').length,storage:bound?(object?'persisted':'seed'):'unavailable'};}
async function update(request,env){
 if(!env.UPDATE_TOKEN || env.UPDATE_TOKEN.length<32)fail('Configure SMARTMATHZ_UPDATE_TOKEN (at least 32 characters) before accepting updates.',503);
 if(!await isUpdater(request,{updateToken:env.UPDATE_TOKEN}))fail('A valid updater bearer token is required.',401);
 if(!env.BUCKET)fail('Persistent storage is unavailable.',503);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)fail('Cross-origin writes are not allowed.',403);
 if(request.headers.get('sec-fetch-site')==='cross-site')fail('Cross-site writes are not allowed.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))fail('Use application/json.',415);
 const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>1000000)fail('Update is too large.',413);
 let input;try{input=JSON.parse(raw);}catch{fail('Invalid JSON.');}
 if(typeof input.runId!=='string'||!/^[a-zA-Z0-9._-]{1,160}$/.test(input.runId))fail('A stable run ID is required.');
 const current=await state(env);if(current.data.lastRun?.id===input.runId)return json({...status(current.data,true,current.object),alreadyCommitted:true});
 if(!Number.isInteger(input.expectedRevision)||input.expectedRevision!==current.data.revision)fail('Revision conflict. Read the latest catalog and retry the merge.',409);
 if(!Array.isArray(input.upserts)||input.upserts.length>100)fail('Provide up to 100 record upserts.');
 const ids=new Set();input.upserts.forEach(r=>{validateRecord(r);if(ids.has(r.id))fail('Duplicate ID in this update.');ids.add(r.id);});
 if(!input.run||!['success','partial','failed'].includes(input.run.status)||!Number.isInteger(input.run.sourcesChecked)||input.run.sourcesChecked<0)fail('Source-check results are required.');
 const records=new Map(current.data.records.map(r=>[r.id,r]));for(const r of input.upserts)records.set(r.id,r);
 if(records.size>2500)fail('Catalog capacity reached. Archive older cycles deliberately before adding more.');
 const now=new Date().toISOString();const next={...current.data,revision:current.data.revision+1,updatedAt:now,records:[...records.values()],lastRun:{id:input.runId,completedAt:now,status:input.run.status,sourcesChecked:input.run.sourcesChecked,notes:String(input.run.notes||'').slice(0,1200)}};
 if(input.automation){if(typeof input.automation.enabled!=='boolean')fail('Invalid automation setting.');next.automation={enabled:input.automation.enabled,timezone:String(input.automation.timezone||'Africa/Lagos'),schedule:String(input.automation.schedule||''),id:String(input.automation.id||'')};}
 if(current.object)await env.BUCKET.put('smartmathz/history/revision-'+current.data.revision+'.json',JSON.stringify(current.data),{httpMetadata:{contentType:'application/json'}});
 const written=await env.BUCKET.put(CATALOG_KEY,JSON.stringify(next),{onlyIf:current.object?{etagMatches:current.object.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
 if(!written)fail('Another update completed first. Read the latest revision and retry.',409);
 return json({...status(next,true,written),upserted:input.upserts.length});
}

return async function handle(request, env) {
  return protectRequest(request, {viewerPassword:env.VIEWER_PASSWORD, updateToken:env.UPDATE_TOKEN}, async () => {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/api/catalog/update') {
        if (request.method !== 'POST') return json({error:'Use POST.'},405);
        return await update(request,env);
      }
      if (!['GET','HEAD'].includes(request.method)) return json({error:'Method not allowed.'},405);
      let response;
      if (path === '/api/updater-guide') response = json({...UPDATE_GUIDE,sources:SOURCES});
      else if (['/catalog.json','/api/catalog','/api/feed-status'].includes(path)) {
        const current = await state(env);
        response = path === '/catalog.json' ? json(current.data.records) : path === '/api/feed-status' ? json(status(current.data,current.bound,current.object)) : json({...current.data,storage:current.bound?(current.object?'persisted':'seed'):'unavailable'});
      } else response = json({error:'Not found.'},404);
      return request.method === 'HEAD' ? new Response(null,{status:response.status,headers:response.headers}) : response;
    } catch(error) { return json({error:error.status?error.message:'The catalog request could not be completed.'},error.status||500); }
  });
};
}
