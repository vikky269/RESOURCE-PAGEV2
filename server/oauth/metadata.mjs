export function siteOrigin(env, request) {
  const configured = typeof env.SITE_URL === 'string' ? env.SITE_URL.trim().replace(/\/$/, '') : '';
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function mcpResource(origin) {
  return `${origin}/mcp`;
}

export function protectedResourceMetadata(origin) {
  return {
    resource: mcpResource(origin),
    authorization_servers: [origin],
    scopes_supported: ['smartmathz:catalog', 'offline_access'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/api/updater-guide`
  };
}

export function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['smartmathz:catalog', 'offline_access'],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: false,
    service_documentation: `${origin}/`
  };
}

export function unauthorizedMcp(origin) {
  const metadata = `${origin}/.well-known/oauth-protected-resource`;
  return new Response('Unauthorized. Connect with OAuth to use Smartmathz MCP tools.', {
    status: 401,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
      'www-authenticate': `Bearer realm="Smartmathz MCP", resource_metadata="${metadata}", scope="smartmathz:catalog offline_access"`
    }
  });
}
