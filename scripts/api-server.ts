/**
 * Local development API server.
 * Wraps the Vercel serverless function handlers in a plain Node HTTP server
 * so you can run `npm run api` without the Vercel CLI.
 *
 * Usage:
 *   Terminal 1 ? npm run dev   (Vite frontend on :5173)
 *   Terminal 2 ? npm run api   (this server on :3001)
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// —— Load .env before handlers are called —————————————————————————————————————
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env');
try {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
  console.log('? Loaded .env');
} catch {
  console.warn('??  No .env file found — make sure env vars are set manually');
}

// —— Import handlers (env vars are now set before any handler is called) ———————
import createHandler from '../api/proposals/create.ts';
import publishHandler from '../api/proposals/publish.ts';
import heatmapHandler from '../api/proposals/heatmap.ts';
import voteCandidatesHandler from '../api/proposals/vote-candidates.ts';
import voteHandler from '../api/proposals/vote.ts';
import validateHandler from '../api/generate/validate-prompt.ts';
import suggestPromptHandler from '../api/generate/suggest-prompt.ts';
import transcribeHandler from '../api/voice/transcribe.ts';
import speakHandler from '../api/voice/speak.ts';
import agentHandler from '../api/voice/agent.ts';

// —— Minimal VercelRequest / VercelResponse shims ———————————————————————————————
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
    req.on('end', () => {
      try { resolveBody(JSON.parse(raw || '{}')); }
      catch { resolveBody({}); }
    });
  });
}

function makeRes(nodeRes: ServerResponse) {
  let code = 200;
  const shim = {
    status(c: number) { code = c; return shim; },
    json(data: unknown) {
      nodeRes.writeHead(code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      nodeRes.end(JSON.stringify(data));
    },
  };
  return shim;
}

// —— Route table ———————————————————————————————————————————————————————————————————
type Handler = typeof createHandler;
const ROUTES: Record<string, Handler> = {
  '/api/proposals/create':          createHandler,
  '/api/proposals/publish':         publishHandler,
  '/api/proposals/heatmap':         heatmapHandler,
  '/api/proposals/vote-candidates': voteCandidatesHandler,
  '/api/proposals/vote':            voteHandler,
  '/api/generate/validate-prompt':  validateHandler,
  '/api/generate/suggest-prompt':   suggestPromptHandler,
  '/api/voice/transcribe':          transcribeHandler,
  '/api/voice/speak':               speakHandler,
  '/api/voice/agent':               agentHandler,
};

// —— Server ———————————————————————————————————————————————————————————————————————
const PORT = Number(process.env.PORT) || 3001;

createServer(async (req: IncomingMessage, nodeRes: ServerResponse) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    nodeRes.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    nodeRes.end();
    return;
  }

  const path = req.url?.split('?')[0] ?? '/';

  // Liveness probe for Docker healthchecks / the Pi kiosk readiness wait.
  if (path === '/health' || path === '/api/health') {
    nodeRes.writeHead(200, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ ok: true }));
    return;
  }

  const handler = ROUTES[path];

  if (!handler) {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ error: 'API route not found', path }));
    return;
  }

  try {
    const body = await readBody(req);
    const mockReq = { method: req.method, body, query: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(mockReq as any, makeRes(nodeRes) as any);
  } catch (err) {
    makeRes(nodeRes)
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unknown server error' });
  }
}).listen(PORT, () => {
  console.log(`\n??  API server ready at http://localhost:${PORT}`);
  console.log('    Routes:');
  Object.keys(ROUTES).forEach((r) => console.log(`      ${r}`));
  console.log('');
});

