import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteHandler} from '../server/site-handler.mjs';
const token='test-only-updater-token-at-least-thirty-two';
const env={UPDATE_TOKEN:token};
const asset={data:Buffer.from('<h1>Smartmathz</h1>').toString('base64'),type:'text/html; charset=utf-8',etag:'"sample"'};
const handle=createSiteHandler({assets:{'/index.html':asset,'/resources/index.html':asset,'/careers/index.html':asset,'/assets/sample.png':{...asset,data:Buffer.from([0,1,255]).toString('base64'),type:'image/png'}},handleCatalog:()=>new Response('catalog')});
const call=(path,auth='',method='GET')=>handle(new Request('https://example.test'+path,{method,headers:auth?{authorization:auth}:{}}),env);

test('page gateway serves pages and assets publicly',async()=>{
  for(const path of ['/','/resources','/resources/','/careers','/careers/','/assets/sample.png']){
    assert.equal((await call(path,'')).status,200);
  }
  assert.equal((await call('/.netlify/functions/site','')).status,404);
  assert.equal((await call('/not-a-page')).status,404);
  assert.equal((await call('/','', 'POST')).status,405);
  assert.equal(await(await call('/')).text(),'<h1>Smartmathz</h1>');
  assert.deepEqual(new Uint8Array(await(await call('/assets/sample.png')).arrayBuffer()),new Uint8Array([0,1,255]));
  assert.equal(await(await call('/careers/','','HEAD')).text(),'');
});

test('catalog routes stay reachable without viewer credentials; updates stay token-gated at the API layer',async()=>{
  assert.equal(await(await call('/api/catalog','')).text(),'catalog');
  assert.equal((await handle(new Request('https://example.test/'),{})).status,200);
});
