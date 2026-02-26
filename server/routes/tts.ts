import { Router } from 'express';
import OpenAI from 'openai';

export const ttsRouter = Router();

ttsRouter.post('/', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    const { text, voice = 'nova' } = req.body;
    if (!text) {
      res.status(400).json({ error: 'No text provided' });
      return;
    }

    const openai = new OpenAI({ apiKey });

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice as 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer',
      input: text,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  } catch (err: unknown) {
    console.error('[tts] Error:', err);
    const message = err instanceof Error ? err.message : 'TTS generation failed';
    res.status(500).json({ error: message });
  }
});
