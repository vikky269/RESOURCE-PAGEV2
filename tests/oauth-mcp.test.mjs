import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createOAuthHandler, validateAccessToken } from '../server/oauth/handler.mjs';
import { createMemoryOAuthStore } from '../server/oauth/store.mjs';
import { mcpResource, unauthorizedMcp } from '../server/oauth/metadata.mjs';
import { createBucket } from '../server/netlify-store.mjs';
import { buildMcpServer } from '../server/mcp-tools.mjs';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { sha256Base64Url } from '../server/oauth/crypto.mjs';

const seed = JSON.parse(await readFile(new URL('../data/feed-seed.json', import.meta.url), 'utf8'));
const operatorPassword = 'test-only-operator-password-16+';
const oauthSecret = 'test-only-oauth-jwe-secret-at-least-thirty-two';
const updateToken = 'test-only-updater-token-at-least-thirty-two-characters';
const siteUrl = 'https://resource-page-v2.netlify.app';

function setup() {
  const store = createMemoryOAuthStore();
  const handleOAuth = createOAuthHandler({ store });
  const map = new Map();
  const blobs = {
    async getWithMetadata(key, options) {
      assert.equal(options.consistency, 'strong');
      const item = map.get(key);
      return item ? { data: item.body, etag: item.etag, metadata: {} } : null;
    },
    async set(key, body, condition) {
      const old = map.get(key);
      if (condition.onlyIfMatch && condition.onlyIfMatch !== old?.etag || condition.onlyIfNew && old) return { modified: false };
      const etag = '"' + createHash('sha256').update(body).digest('hex') + '"';
      map.set(key, { etag, body });
      return { modified: true, etag };
    }
  };
  const env = {
    OPERATOR_PASSWORD: operatorPassword,
    OAUTH_SECRET: oauthSecret,
    SITE_URL: siteUrl,
    UPDATE_TOKEN: updateToken,
    BUCKET: createBucket(blobs)
  };
  const oauth = (path, init = {}) => handleOAuth(new Request(siteUrl + path, init), env);
  return { store, env, oauth, map };
}

async function pkce() {
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge };
}

async function completeOAuth(oauth) {
  const { verifier, challenge } = await pkce();
  const reg = await oauth('/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'test',
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
      token_endpoint_auth_method: 'none'
    })
  });
  assert.equal(reg.status, 201);
  const client = await reg.json();
  const authorize = await oauth('/oauth/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: 'code',
      scope: 'smartmathz:catalog offline_access',
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: mcpResource(siteUrl),
      password: operatorPassword
    }).toString()
  });
  assert.equal(authorize.status, 302);
  const location = new URL(authorize.headers.get('location'));
  assert.equal(location.searchParams.get('iss'), siteUrl);
  const code = location.searchParams.get('code');
  assert.ok(code);
  const tokenRes = await oauth('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: client.redirect_uris[0],
      client_id: client.client_id,
      code_verifier: verifier
    }).toString()
  });
  assert.equal(tokenRes.status, 200);
  const tokens = await tokenRes.json();
  assert.equal(tokens.token_type, 'Bearer');
  assert.ok(tokens.access_token);
  assert.ok(tokens.refresh_token);
  return { client, tokens };
}

test('oauth metadata and unauthorized MCP challenge are discoverable', async () => {
  const { oauth } = setup();
  const resource = await (await oauth('/.well-known/oauth-protected-resource')).json();
  assert.equal(resource.resource, siteUrl + '/mcp');
  assert.deepEqual(resource.authorization_servers, [siteUrl]);
  const as = await (await oauth('/.well-known/oauth-authorization-server')).json();
  assert.equal(as.issuer, siteUrl);
  assert.ok(as.code_challenge_methods_supported.includes('S256'));
  assert.ok(as.grant_types_supported.includes('refresh_token'));
  const denied = unauthorizedMcp(siteUrl);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate') || '', /resource_metadata=/);
});

test('oauth authorize → token → refresh issues usable access tokens', async () => {
  const { oauth, env } = setup();
  const { client, tokens } = await completeOAuth(oauth);
  const access = await validateAccessToken(env, new Request(siteUrl + '/mcp', {
    headers: { authorization: 'Bearer ' + tokens.access_token }
  }), mcpResource(siteUrl));
  assert.equal(access.sub, 'operator');
  assert.equal(access.client_id, client.client_id);

  const refreshed = await oauth('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: client.client_id
    }).toString()
  });
  assert.equal(refreshed.status, 200);
  const next = await refreshed.json();
  assert.ok(next.access_token);
  assert.notEqual(next.refresh_token, tokens.refresh_token);
});

test('wrong operator password cannot authorize', async () => {
  const { oauth } = setup();
  const { challenge } = await pkce();
  const reg = await (await oauth('/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['https://chatgpt.com/connector/oauth/callback'] })
  })).json();
  const res = await oauth('/oauth/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: reg.client_id,
      redirect_uri: reg.redirect_uris[0],
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: mcpResource(siteUrl),
      password: 'definitely-not-the-operator-password'
    }).toString()
  });
  assert.equal(res.status, 401);
});

test('MCP rejects unauthenticated posts and serves get_catalog with OAuth access token', async () => {
  const { oauth, env } = setup();
  const { tokens } = await completeOAuth(oauth);

  const unauthTransport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const denied = unauthorizedMcp(siteUrl);
  assert.equal(denied.status, 401);

  async function mcpCall(token, message) {
    const server = buildMcpServer({ seed, sources: [], guide: { name: 'test' }, env });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(new Request(siteUrl + '/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json'
      },
      body: JSON.stringify(message)
    }));
    assert.equal(response.status, 200);
    return response.json();
  }

  await mcpCall(tokens.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } });
  const listed = await mcpCall(tokens.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const names = (listed.result?.tools || []).map(t => t.name);
  assert.ok(names.includes('get_catalog'));
  assert.ok(names.includes('apply_catalog_update'));

  const catalog = await mcpCall(tokens.access_token, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_catalog', arguments: {} }
  });
  const text = catalog.result?.content?.[0]?.text || '';
  assert.match(text, /"revision"/);
  assert.match(text, /"records"/);
  void unauthTransport;
});

test('apply_catalog_update persists through MCP without exposing the update token in tool output', async () => {
  const { oauth, env } = setup();
  const { tokens } = await completeOAuth(oauth);

  async function mcpCall(message) {
    const server = buildMcpServer({ seed, sources: [], guide: { name: 'test' }, env });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(new Request(siteUrl + '/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + tokens.access_token,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json'
      },
      body: JSON.stringify(message)
    }));
    return response.json();
  }

  const record = { ...seed.records[0], title: 'MCP integration test only', lastVerifiedAt: new Date().toISOString() };
  const result = await mcpCall({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'apply_catalog_update',
      arguments: {
        runId: 'mcp-oauth-test-run',
        expectedRevision: seed.revision,
        upserts: [record],
        run: { status: 'success', sourcesChecked: 1, notes: 'Test only' }
      }
    }
  });
  const text = result.result?.content?.[0]?.text || '';
  assert.match(text, /"persisted"/);
  assert.match(text, /"revision":\s*3/);
  assert.doesNotMatch(text, new RegExp(updateToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
