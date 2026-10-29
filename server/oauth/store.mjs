/** In-memory OAuth persistence for tests. */
export function createMemoryOAuthStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async put(key, value) {
      map.set(key, structuredClone(value));
    },
    async del(key) {
      map.delete(key);
    }
  };
}

/** Netlify Blobs-backed OAuth persistence. */
export function createBlobOAuthStore(blobs) {
  return {
    async get(key) {
      const raw = await blobs.get(key, { type: 'text', consistency: 'strong' });
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    async put(key, value) {
      await blobs.set(key, JSON.stringify(value));
    },
    async del(key) {
      await blobs.delete(key);
    }
  };
}
