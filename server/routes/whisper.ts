import { Router } from 'express';
import multer from 'multer';
import OpenAI from 'openai';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const whisperRouter = Router();

whisperRouter.post('/', upload.single('audio'), async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const openai = new OpenAI({ apiKey });

    // Convert buffer to a File-like object for the SDK
    const audioFile = new File([req.file.buffer], 'recording.webm', {
      type: req.file.mimetype || 'audio/webm',
    });

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      language: req.body.language || 'en',
      response_format: 'verbose_json',
    });

    res.json({
      text: transcription.text,
      language: transcription.language,
      segments: transcription.segments,
    });
  } catch (err: unknown) {
    console.error('[whisper] Error:', err);
    const message = err instanceof Error ? err.message : 'Transcription failed';
    res.status(500).json({ error: message });
  }
});
