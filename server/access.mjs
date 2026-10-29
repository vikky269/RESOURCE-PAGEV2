export const API_PATHS = new Set(['/catalog.json', '/api/catalog', '/api/feed-status', '/api/updater-guide', '/api/catalog/update']);

// Shared by the page gateway and catalog API. No secrets enter browser assets.
export async function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length > 4096 || b.length > 4096) return false;
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

export async function isUpdater(request, settings) {
  if (typeof settings.updateToken !== 'string' || settings.updateToken.length < 32) return false;
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return !!match && await safeEqual(match[1], settings.updateToken);
}

export async function isViewer(request, settings) {
  if (typeof settings.viewerPassword !== 'string' || settings.viewerPassword.length < 16) return false;
  const match = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return false;
  try {
    const bytes = Uint8Array.from(atob(match[1]), c => c.charCodeAt(0));
    const credentials = new TextDecoder().decode(bytes), colon = credentials.indexOf(':');
    return colon > 0 && credentials.slice(0, colon) === 'smartmathz' && await safeEqual(credentials.slice(colon + 1), settings.viewerPassword);
  } catch { return false; }
}

export function accessDenied(configured) {
  return new Response(configured ? 'This Smartmathz preview is private. Sign in with the shared preview credentials.' : 'Private preview setup is incomplete. Configure SMARTMATHZ_VIEWER_PASSWORD in Netlify and redeploy.', {
    status: configured ? 401 : 503,
    headers: {'content-type':'text/plain; charset=utf-8','cache-control':'private, no-store','vary':'Authorization',...(configured ? {'www-authenticate':'Basic realm="Smartmathz private preview", charset="UTF-8"'} : {})}
  });
}

export async function protectRequest(request, settings, next) {
  const path = new URL(request.url).pathname;
  if (API_PATHS.has(path) && await isUpdater(request, settings)) return next();
  if (await isViewer(request, settings)) return next();
  return accessDenied(typeof settings.viewerPassword === 'string' && settings.viewerPassword.length >= 16);
}
