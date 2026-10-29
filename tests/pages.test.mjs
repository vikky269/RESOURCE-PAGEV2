import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteHandler} from '../server/site-handler.mjs';
const password='test-only-viewer-password-at-least-sixteen',token='test-only-updater-token-at-least-thirty-two';
const env={VIEWER_PASSWORD:password,UPDATE_TOKEN:token};
const basic='Basic '+Buffer.from('smartmathz:'+password).toString('base64');
const asset={data:Buffer.from('<h1>Private Smartmathz</h1>').toString('base64'),type:'text/html; charset=utf-8',etag:'"sample"'};
const handle=createSiteHandler({assets:{'/index.html':asset,'/resources/index.html':asset,'/careers/index.html':asset,'/assets/sample.png':{...asset,data:Buffer.from([0,1,255]).toString('base64'),type:'image/png'}},handleCatalog:()=>new Response('catalog')});
const call=(path,auth=basic,method='GET')=>handle(new Request('https://example.test'+path,{method,headers:auth?{authorization:auth}:{}}),env);

test('page gateway protects aliases, binary assets and direct function URLs',async()=>{
  for(const path of ['/','/resources','/resources/','/careers','/careers/','/assets/sample.png']){
    assert.equal((await call(path,'')).status,401);assert.equal((await call(path,'Bearer '+token)).status,401);assert.equal((await call(path)).status,200);
  }
  assert.equal((await call('/.netlify/functions/site','')).status,401);
  assert.equal((await call('/not-a-page')).status,404);
  assert.equal((await call('/','', 'POST')).status,401);
  assert.equal((await call('/',basic,'POST')).status,405);
  assert.equal(await(await call('/')).text(),'<h1>Private Smartmathz</h1>');
  assert.deepEqual(new Uint8Array(await(await call('/assets/sample.png')).arrayBuffer()),new Uint8Array([0,1,255]));
  assert.equal(await(await call('/careers/',basic,'HEAD')).text(),'');
});

test('updater bearer reaches only catalog routes and missing viewer configuration remains closed',async()=>{
  assert.equal(await(await call('/api/catalog','Bearer '+token)).text(),'catalog');
  assert.equal((await handle(new Request('https://example.test/'),{})).status,503);
});
