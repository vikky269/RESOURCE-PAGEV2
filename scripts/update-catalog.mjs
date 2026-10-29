import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const batchFile = process.argv[2];
if (!batchFile) { console.error('Usage: npm run update:catalog -- path/to/reviewed-batch.json'); process.exit(1); }
try {
  const origin = new URL(process.env.SMARTMATHZ_SITE_URL || '');
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname)))) throw new Error('SMARTMATHZ_SITE_URL must be a verified HTTPS site origin (or localhost for development).');
  const token = process.env.SMARTMATHZ_UPDATE_TOKEN;
  if (!token || token.length < 32) throw new Error('Set SMARTMATHZ_UPDATE_TOKEN in your private environment.');
  const text = await readFile(batchFile, 'utf8');
  if (Buffer.byteLength(text) > 1000000) throw new Error('Batch exceeds the 1 MB limit.');
  const batch = JSON.parse(text);
  if (!batch.runId || /^replace-/.test(batch.runId) || !Array.isArray(batch.upserts)) throw new Error('Replace the template with an actual verified batch and a stable runId.');
  const request = async (path, body) => {
    const response = await fetch(new URL(path, origin), {method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
    const value = await response.json();
    if (!response.ok) throw new Error('Catalog returned HTTP '+response.status+': '+(value.error || 'Request failed'));
    return value;
  };
  const verify = actual => {
    const byId = new Map(actual.records.map(record=>[record.id,record]));
    for (const record of batch.upserts) assert.deepEqual(byId.get(record.id),record,'Saved record differs: '+record.id);
    if (actual.lastRun.id !== batch.runId || actual.storage !== 'persisted') throw new Error('Persistent readback did not match this update.');
  };
  const current = await request('/api/catalog');
  if (current.lastRun?.id === batch.runId) {
    verify(current); console.log('This batch is already saved and verified at revision '+current.revision+'.');
  } else {
    if (batch.expectedRevision !== undefined && batch.expectedRevision !== current.revision) throw new Error('Batch revision is stale. Review the current catalog before retrying.');
    const result = await request('/api/catalog/update',{...batch,expectedRevision:current.revision});
    const after = await request('/api/catalog'); verify(after);
    if (after.revision !== result.revision) throw new Error('Another update followed this commit. Read the current catalog before retrying.');
    console.log('Saved and verified '+batch.upserts.length+' record(s) at revision '+after.revision+'.');
  }
} catch(error) {
  console.error(error.message);
  console.error('If a write timed out, rerun the SAME batch/runId; the client checks for an existing commit first.');
  process.exit(1);
}
