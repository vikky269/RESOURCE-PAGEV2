import {API_PATHS, protectRequest} from './access.mjs';

export function createSiteHandler({assets, handleCatalog}) {
  const decoded=new Map();
  return (request,env) => protectRequest(request,{viewerPassword:env.VIEWER_PASSWORD,updateToken:env.UPDATE_TOKEN},async()=>{
    const path=new URL(request.url).pathname;
    if(API_PATHS.has(path))return handleCatalog(request,env);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{'cache-control':'private, no-store'}});
    const assetPath=path==='/'?'/index.html':['/resources','/resources/'].includes(path)?'/resources/index.html':['/careers','/careers/'].includes(path)?'/careers/index.html':path;
    const asset=assets[assetPath];
    if(!asset)return new Response('Not found',{status:404,headers:{'cache-control':'private, no-store'}});
    const headers={'content-type':asset.type,'cache-control':'private, no-store','vary':'Authorization','etag':asset.etag,'x-content-type-options':'nosniff'};
    if(request.headers.get('if-none-match')===asset.etag)return new Response(null,{status:304,headers});
    if(!decoded.has(assetPath))decoded.set(assetPath,Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)));
    return new Response(request.method==='HEAD'?null:decoded.get(assetPath),{headers});
  });
}
