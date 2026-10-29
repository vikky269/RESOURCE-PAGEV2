import {getStore} from '@netlify/blobs';
import seed from '../../data/feed-seed.json' with {type:'json'};
import sources from '../../data/sources.json' with {type:'json'};
import guide from '../../data/updater-guide.json' with {type:'json'};
import assets from '../../data/asset-manifest.json' with {type:'json'};
import {createSiteHandler} from '../../server/site-handler.mjs';
import runtime from '../../data/runtime-config.json' with {type:'json'};
import {createCatalogHandler} from '../../server/catalog-core.mjs';
import {createBucket} from '../../server/netlify-store.mjs';

const handleCatalog = createCatalogHandler({seed,sources,guide});
const handle = createSiteHandler({assets,handleCatalog});
export default async function site(request) {
  // Authorization runs before the store is touched, including direct Function URLs.
  let bucket;
  const lazyBucket = {
    async get(key) { bucket ||= createBucket(getStore({name:runtime.catalogStore,consistency:'strong'})); return bucket.get(key); },
    async put(key,body,options) { bucket ||= createBucket(getStore({name:runtime.catalogStore,consistency:'strong'})); return bucket.put(key,body,options); }
  };
  return handle(request, {BUCKET:lazyBucket,UPDATE_TOKEN:process.env.SMARTMATHZ_UPDATE_TOKEN,VIEWER_PASSWORD:process.env.SMARTMATHZ_VIEWER_PASSWORD});
}
export const config = {
  path: '/*',
  preferStatic: false
};
