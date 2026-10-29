import { getStore } from '@netlify/blobs';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import seed from '../../data/feed-seed.json' with { type: 'json' };
import sources from '../../data/sources.json' with { type: 'json' };
import guide from '../../data/updater-guide.json' with { type: 'json' };
import runtime from '../../data/runtime-config.json' with { type: 'json' };
import { createBucket } from '../../server/netlify-store.mjs';
import { buildMcpServer } from '../../server/mcp-tools.mjs';
import { validateAccessToken } from '../../server/oauth/handler.mjs';
import { siteOrigin, mcpResource, unauthorizedMcp } from '../../server/oauth/metadata.mjs';

function catalogEnv() {
  let bucket;
  const lazyBucket = {
    async get(key) {
      bucket ||= createBucket(getStore({ name: runtime.catalogStore, consistency: 'strong' }));
      return bucket.get(key);
    },
    async put(key, body, options) {
      bucket ||= createBucket(getStore({ name: runtime.catalogStore, consistency: 'strong' }));
      return bucket.put(key, body, options);
    }
  };
  return {
    BUCKET: lazyBucket,
    UPDATE_TOKEN: process.env.SMARTMATHZ_UPDATE_TOKEN,
    VIEWER_PASSWORD: process.env.SMARTMATHZ_VIEWER_PASSWORD,
    OAUTH_SECRET: process.env.SMARTMATHZ_OAUTH_JWE_SECRET,
    SITE_URL: process.env.SMARTMATHZ_SITE_URL
  };
}

export default async function mcp(request) {
  const env = catalogEnv();
  const origin = siteOrigin(env, request);
  const resource = mcpResource(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed. Use POST for Streamable HTTP MCP.', {
      status: 405,
      headers: { 'cache-control': 'private, no-store', allow: 'POST, OPTIONS' }
    });
  }

  const access = await validateAccessToken(env, request, resource);
  if (!access) return unauthorizedMcp(origin);

  const server = buildMcpServer({ seed, sources, guide, env });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const config = {
  path: '/mcp',
  rateLimit: {
    windowSize: 60,
    windowLimit: 120,
    aggregateBy: ['ip', 'domain']
  }
};
