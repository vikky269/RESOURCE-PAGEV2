import { randomToken, seal, unseal, sha256Base64Url, safeEqual } from './crypto.mjs';
import { siteOrigin, mcpResource, protectedResourceMetadata, authorizationServerMetadata } from './metadata.mjs';

const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function oauthError(error, description, status = 400) {
  return json({ error, error_description: description }, status);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function authorizeForm({ query, error }) {
  const fields = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource']
    .map(name => `<input type="hidden" name="${name}" value="${escapeHtml(query.get(name) || '')}">`)
    .join('');
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize Smartmathz MCP</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.45;color:#122}
  label{display:block;font-weight:600;margin:.75rem 0 .35rem}
  input[type=password]{width:100%;padding:.65rem;border:1px solid #ccd;border-radius:8px}
  button{margin-top:1rem;padding:.7rem 1rem;border:0;border-radius:8px;background:#0b5;color:#fff;font-weight:600;cursor:pointer}
  .err{color:#a10;background:#fee;padding:.75rem;border-radius:8px}
  .meta{color:#456;font-size:.95rem}
</style>
<h1>Authorize Smartmathz MCP</h1>
<p class="meta">ChatGPT is requesting catalog tools for this Smartmathz Netlify deployment. Enter the operator password configured in Netlify. The catalog update token is never shown here.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize">
  ${fields}
  <label for="password">Operator password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required minlength="16">
  <button type="submit">Authorize</button>
</form>`;
}

function parseForm(body) {
  return new URLSearchParams(body);
}

function requestedScopes(scope) {
  const parts = String(scope || 'smartmathz:catalog offline_access').split(/\s+/).filter(Boolean);
  const allowed = new Set(['smartmathz:catalog', 'offline_access']);
  return parts.filter(s => allowed.has(s)).join(' ') || 'smartmathz:catalog offline_access';
}

export function createOAuthHandler({ store }) {
  return async function handleOAuth(request, env) {
    const origin = siteOrigin(env, request);
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/.well-known/oauth-protected-resource') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return oauthError('invalid_request', 'Use GET.', 405);
      const body = protectedResourceMetadata(origin);
      return request.method === 'HEAD' ? new Response(null, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json(body);
    }

    if (path === '/.well-known/oauth-authorization-server') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return oauthError('invalid_request', 'Use GET.', 405);
      const body = authorizationServerMetadata(origin);
      return request.method === 'HEAD' ? new Response(null, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json(body);
    }

    if (path === '/oauth/register') {
      if (request.method !== 'POST') return oauthError('invalid_request', 'Use POST.', 405);
      let input;
      try { input = await request.json(); } catch { return oauthError('invalid_client_metadata', 'Invalid JSON.'); }
      const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter(u => typeof u === 'string' && /^https:\/\//.test(u)) : [];
      if (!redirectUris.length) return oauthError('invalid_redirect_uri', 'At least one https redirect_uri is required.');
      const clientId = 'smz_' + randomToken(18);
      const record = {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: typeof input.client_name === 'string' ? input.client_name.slice(0, 200) : 'Smartmathz MCP client'
      };
      await store.put('client:' + clientId, record);
      return json(record, 201);
    }

    if (path === '/oauth/authorize') {
      if (!env.OPERATOR_PASSWORD || env.OPERATOR_PASSWORD.length < 16) {
        return html('<!doctype html><h1>OAuth unavailable</h1><p>Configure SMARTMATHZ_OPERATOR_PASSWORD in Netlify and redeploy.</p>', 503);
      }
      if (request.method === 'GET') {
        if (url.searchParams.get('response_type') !== 'code') return html(authorizeForm({ query: url.searchParams, error: 'response_type must be code' }), 400);
        if (!url.searchParams.get('client_id') || !url.searchParams.get('redirect_uri')) return html(authorizeForm({ query: url.searchParams, error: 'client_id and redirect_uri are required' }), 400);
        if (url.searchParams.get('code_challenge_method') !== 'S256' || !url.searchParams.get('code_challenge')) {
          return html(authorizeForm({ query: url.searchParams, error: 'PKCE S256 code_challenge is required' }), 400);
        }
        return html(authorizeForm({ query: url.searchParams, error: null }));
      }
      if (request.method !== 'POST') return oauthError('invalid_request', 'Use GET or POST.', 405);
      const form = parseForm(await request.text());
      const clientId = form.get('client_id') || '';
      const redirectUri = form.get('redirect_uri') || '';
      const client = await store.get('client:' + clientId);
      if (!client || !client.redirect_uris.includes(redirectUri)) {
        return html(authorizeForm({ query: form, error: 'Unknown client or redirect_uri. Complete Dynamic Client Registration first.' }), 400);
      }
      if (!(await safeEqual(form.get('password') || '', env.OPERATOR_PASSWORD))) {
        return html(authorizeForm({ query: form, error: 'Incorrect operator password.' }), 401);
      }
      const resource = form.get('resource') || mcpResource(origin);
      if (resource !== mcpResource(origin)) {
        return html(authorizeForm({ query: form, error: 'resource must be this deployment MCP URL.' }), 400);
      }
      const now = Date.now();
      const codePayload = {
        typ: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: form.get('code_challenge'),
        code_challenge_method: 'S256',
        scope: requestedScopes(form.get('scope')),
        resource,
        iat: now,
        exp: now + CODE_TTL_MS
      };
      const code = await seal(env.OAUTH_SECRET, codePayload);
      const target = new URL(redirectUri);
      target.searchParams.set('code', code);
      if (form.get('state')) target.searchParams.set('state', form.get('state'));
      target.searchParams.set('iss', origin);
      return Response.redirect(target.toString(), 302);
    }

    if (path === '/oauth/token') {
      if (request.method !== 'POST') return oauthError('invalid_request', 'Use POST.', 405);
      if (!env.OAUTH_SECRET || env.OAUTH_SECRET.length < 32) return oauthError('server_error', 'OAuth sealing secret is not configured.', 503);
      const contentType = request.headers.get('content-type') || '';
      let params;
      if (contentType.includes('application/json')) {
        const body = await request.json();
        params = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
      } else {
        params = parseForm(await request.text());
      }
      const grant = params.get('grant_type');
      if (grant === 'authorization_code') {
        const code = params.get('code') || '';
        const verifier = params.get('code_verifier') || '';
        const redirectUri = params.get('redirect_uri') || '';
        const clientId = params.get('client_id') || '';
        const payload = await unseal(env.OAUTH_SECRET, code);
        if (!payload || payload.typ !== 'code') return oauthError('invalid_grant', 'Invalid or expired authorization code.');
        if (payload.client_id !== clientId || payload.redirect_uri !== redirectUri) return oauthError('invalid_grant', 'Code does not match client or redirect_uri.');
        const challenge = await sha256Base64Url(verifier);
        if (!(await safeEqual(challenge, payload.code_challenge))) return oauthError('invalid_grant', 'PKCE verification failed.');
        return issueTokens(env, store, { clientId, scope: payload.scope, resource: payload.resource, origin });
      }
      if (grant === 'refresh_token') {
        const refresh = params.get('refresh_token') || '';
        const clientId = params.get('client_id') || '';
        const record = await store.get('refresh:' + refresh);
        if (!record || record.client_id !== clientId || Date.now() > record.exp) return oauthError('invalid_grant', 'Invalid or expired refresh token.');
        await store.del('refresh:' + refresh);
        return issueTokens(env, store, { clientId, scope: record.scope, resource: record.resource || mcpResource(origin), origin });
      }
      return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
    }

    return json({ error: 'not_found' }, 404);
  };
}

async function issueTokens(env, store, { clientId, scope, resource, origin }) {
  const now = Date.now();
  const access = await seal(env.OAUTH_SECRET, {
    typ: 'access',
    sub: 'operator',
    client_id: clientId,
    scope,
    resource: resource || mcpResource(origin),
    iat: now,
    exp: now + ACCESS_TTL_MS
  });
  const refresh = randomToken(32);
  await store.put('refresh:' + refresh, {
    client_id: clientId,
    scope,
    resource: resource || mcpResource(origin),
    exp: now + REFRESH_TTL_MS
  });
  return json({
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refresh,
    scope,
    resource: resource || mcpResource(origin)
  });
}

export async function validateAccessToken(env, request, expectedResource) {
  if (!env.OAUTH_SECRET || env.OAUTH_SECRET.length < 32) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  const payload = await unseal(env.OAUTH_SECRET, match[1]);
  if (!payload || payload.typ !== 'access') return null;
  if (expectedResource && payload.resource && payload.resource !== expectedResource) return null;
  return payload;
}
