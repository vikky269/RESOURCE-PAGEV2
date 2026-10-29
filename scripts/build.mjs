import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const context = process.env.CONTEXT || 'development';
const previewId = createHash('sha256').update(process.env.DEPLOY_ID || context).digest('hex').slice(0, 12);
const runtime = {context, catalogStore: context === 'production' ? 'smartmathz-opportunities' : 'smartmathz-opportunities-preview-' + previewId};
await writeFile('data/runtime-config.json', JSON.stringify(runtime, null, 2) + '\n');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const assets={};
async function scan(dir) {
  for(const item of await readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if(item.isDirectory()) await scan(file);
    else {
      const assetPath='/'+path.relative('public',file).split(path.sep).join('/');
      if(assetPath==='/catalog.json') continue;
      const bytes=await readFile(file);
      assets[assetPath]={data:bytes.toString('base64'),type:types[path.extname(file)]||'application/octet-stream',etag:'"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"'};
    }
  }
}
await scan('public');
for(const file of ['/index.html','/resources/index.html','/careers/index.html'])if(!assets[file])throw new Error('Required page is missing: '+file);
await writeFile('data/asset-manifest.json',JSON.stringify(assets));
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
// Never expose unprotected application assets through a static-only deployment.
const fallback='<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Private deployment setup</title><h1>Private deployment unavailable</h1><p>Deploy the complete Netlify project, including its server function, to open this private preview.</p>';
await writeFile('dist/index.html',fallback);await writeFile('dist/404.html',fallback);
console.log('Built '+Object.keys(assets).length+' private application assets and isolated catalog configuration ('+context+').');
