/**
 * Standalone API server for Barcelona Civic Vision
 * Aggregates all /api/* handlers from ../api/ directory
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Load environment variables from root .env
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });
dotenv.config({ path: new URL('../.env.local', import.meta.url).pathname });

console.log('[api-server] Loaded .env');

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001', 10);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Dynamic route registration ──────────────────────────────────────────────
const routes: Array<{ method: string; path: string; handler: string }> = [
  { method: 'POST', path: '/api/proposals/create', handler: '../api/proposals/create' },
  { method: 'POST', path: '/api/proposals/heatmap', handler: '../api/proposals/heatmap' },
  { method: 'POST', path: '/api/generate/evaluate', handler: '../api/generate/evaluate' },
  { method: 'POST', path: '/api/generate/image', handler: '../api/generate/image' },
  { method: 'POST', path: '/api/generate/validate-prompt', handler: '../api/generate/validate-prompt' },
  { method: 'POST', path: '/api/voice/agent', handler: '../api/voice/agent' },
  { method: 'POST', path: '/api/voice/speak', handler: '../api/voice/speak' },
  { method: 'POST', path: '/api/voice/transcribe', handler: '../api/voice/transcribe' },
];

// Register all routes
for (const route of routes) {
  try {
    // Dynamic import for each handler
    const module = await import(route.handler);
    const handler = module.default;
    
    if (typeof handler !== 'function') {
      console.warn(`[api-server] Route ${route.path}: handler is not a function`);
      continue;
    }

    // Wrap handler to work with Express
    const expressHandler = (req: Request, res: Response, next: NextFunction) => {
      const vercelReq = {
        body: req.body,
        query: req.query,
        headers: req.headers,
        method: req.method,
      };
      const vercelRes = {
        status: (code: number) => ({ json: (data: any) => res.status(code).json(data) }),
        json: (data: any) => res.json(data),
        send: (data: any) => res.send(data),
        end: () => res.end(),
      };
      
      return handler(vercelReq, vercelRes);
    };

    app[route.method.toLowerCase() as keyof typeof app](route.path, expressHandler);
    console.log(`[api-server] Registered ${route.method} ${route.path}`);
  } catch (err) {
    console.error(`[api-server] Failed to load route ${route.path}:`, err);
  }
}

console.log(`[api-server] Routes loaded: ${routes.length}`);

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api-server] Listening on http://localhost:${PORT}`);
});
