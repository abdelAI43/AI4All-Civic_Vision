import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { whisperRouter } from './routes/whisper.js';
import { ttsRouter } from './routes/tts.js';
import { llmRouter } from './routes/llm.js';
import { replicateRouter } from './routes/replicate.js';

// Load .env from project root
dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
app.use(express.json({ limit: '25mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API routes
app.use('/api/stt', whisperRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/llm', llmRouter);
app.use('/api/image', replicateRouter);

app.listen(PORT, () => {
  console.log(`[server] Civic Vision API proxy running on http://localhost:${PORT}`);
});
