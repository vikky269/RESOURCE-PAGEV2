import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createCatalogHandler } from './catalog-core.mjs';

const INSTRUCTIONS = [
  'Smartmathz catalog publisher for New York and Maryland student opportunities.',
  'Workflow: get_updater_guide → get_catalog → research official HTTPS sources → apply_catalog_update → get_catalog or get_feed_status for readback.',
  'Never invent SMARTMATHZ_UPDATE_TOKEN or ask the user to paste it. Writes use a server-held token.',
  'Preserve stable record IDs. Mark lastVerifiedAt only after reviewing the official page. Prefer upserts over duplicates.',
  'After a verified scheduled write, set automation.enabled true with timezone Africa/Lagos.'
].join(' ');

function textResult(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

async function catalogCall(handleCatalog, env, path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers.authorization = 'Bearer ' + env.UPDATE_TOKEN;
  }
  const request = new Request('https://smartmathz.internal' + path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const response = await handleCatalog(request, env);
  const raw = await response.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  if (!response.ok) {
    const message = parsed?.error || raw || ('HTTP ' + response.status);
    throw new Error(message);
  }
  return parsed;
}

export function buildMcpServer({ seed, sources, guide, env }) {
  const handleCatalog = createCatalogHandler({ seed, sources, guide });
  const server = new McpServer(
    { name: 'smartmathz-catalog', version: '1.0.0' },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool(
    'get_updater_guide',
    {
      title: 'Get updater guide',
      description: 'Return the official-source research checklist, record schema, and write protocol. Use this before reviewing sources or applying updates.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => textResult(await catalogCall(handleCatalog, env, '/api/updater-guide'))
  );

  server.registerTool(
    'get_catalog',
    {
      title: 'Get catalog',
      description: 'Return the live opportunity catalog including revision, records, lastRun, automation, and storage status. Retain expectedRevision from this response before apply_catalog_update.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => textResult(await catalogCall(handleCatalog, env, '/api/catalog'))
  );

  server.registerTool(
    'get_feed_status',
    {
      title: 'Get feed status',
      description: 'Return compact catalog status (revision, lastRun, automation, storage) without full record bodies.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => textResult(await catalogCall(handleCatalog, env, '/api/feed-status'))
  );

  server.registerTool(
    'apply_catalog_update',
    {
      title: 'Apply catalog update',
      description: 'Commit a reviewed catalog batch. Requires runId, expectedRevision from get_catalog, upserts (0-100 verified records), and run status. Optional automation metadata. Server applies the write with the Netlify-held update token. On 409, re-read catalog and merge.',
      inputSchema: {
        runId: z.string().min(1).max(160).describe('Stable id for this reviewed batch; retries reuse the same id'),
        expectedRevision: z.number().int().describe('Catalog revision from the latest get_catalog'),
        upserts: z.array(z.record(z.string(), z.any())).max(100).describe('Complete verified records to upsert by stable id'),
        run: z.object({
          status: z.enum(['success', 'partial', 'failed']),
          sourcesChecked: z.number().int().min(0),
          notes: z.string().max(1200).optional()
        }),
        automation: z.object({
          enabled: z.boolean(),
          timezone: z.string().optional(),
          schedule: z.string().optional(),
          id: z.string().optional()
        }).optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async (args) => {
      if (!env.UPDATE_TOKEN || env.UPDATE_TOKEN.length < 32) {
        throw new Error('SMARTMATHZ_UPDATE_TOKEN is not configured on the server.');
      }
      const body = {
        runId: args.runId,
        expectedRevision: args.expectedRevision,
        upserts: args.upserts,
        run: args.run,
        ...(args.automation ? { automation: args.automation } : {})
      };
      return textResult(await catalogCall(handleCatalog, env, '/api/catalog/update', { method: 'POST', body }));
    }
  );

  return server;
}
