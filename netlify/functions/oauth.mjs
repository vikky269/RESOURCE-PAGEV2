import { getStore } from '@netlify/blobs';
import { createOAuthHandler } from '../../server/oauth/handler.mjs';
import { createBlobOAuthStore } from '../../server/oauth/store.mjs';
import runtime from '../../data/runtime-config.json' with { type: 'json' };

function envFromProcess() {
  return {
    OPERATOR_PASSWORD: process.env.SMARTMATHZ_OPERATOR_PASSWORD,
    OAUTH_SECRET: process.env.SMARTMATHZ_OAUTH_JWE_SECRET,
    SITE_URL: process.env.SMARTMATHZ_SITE_URL
  };
}

export default async function oauth(request) {
  const store = createBlobOAuthStore(getStore({ name: runtime.catalogStore + '-oauth', consistency: 'strong' }));
  const handle = createOAuthHandler({ store });
  return handle(request, envFromProcess());
}

export const config = {
  path: [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-authorization-server',
    '/oauth/*'
  ]
};
