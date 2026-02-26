// Minimal Vercel serverless function types (avoids requiring @vercel/node in devDeps)
export interface VercelRequest {
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | string[]>;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
}
