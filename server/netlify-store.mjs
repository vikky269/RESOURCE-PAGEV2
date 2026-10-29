// Adapt the original R2-style catalog operations to Netlify Blobs.
export function createBucket(store) {
  return {
    async get(key) {
      const entry = await store.getWithMetadata(key, {type:'text', consistency:'strong'});
      return entry ? {etag:entry.etag, json:async()=>JSON.parse(entry.data)} : null;
    },
    async put(key, body, options = {}) {
      const condition = options.onlyIf?.etagMatches ? {onlyIfMatch:options.onlyIf.etagMatches} : options.onlyIf?.etagDoesNotMatch === '*' ? {onlyIfNew:true} : {};
      const result = await store.set(key, body, condition);
      return result.modified ? {etag:result.etag} : null;
    }
  };
}
