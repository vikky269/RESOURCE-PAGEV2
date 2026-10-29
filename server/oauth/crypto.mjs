function b64url(bytes) {
  const buf = bytes instanceof ArrayBuffer ? Buffer.from(bytes) : Buffer.from(bytes);
  return buf.toString('base64url');
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function seal(secret, payload) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('OAuth sealing secret is not configured.');
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function unseal(secret, token, maxAgeMs = null) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, Buffer.from(sig, 'base64url'), new TextEncoder().encode(body));
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null;
  if (maxAgeMs != null && typeof payload.iat === 'number' && Date.now() - payload.iat > maxAgeMs) return null;
  return payload;
}

export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return b64url(digest);
}

export async function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length > 4096 || b.length > 4096) return false;
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
