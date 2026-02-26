import { Router } from 'express';
import OpenAI from 'openai';

export const llmRouter = Router();

llmRouter.post('/', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    const { messages, responseFormat, temperature = 0.7 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'messages array required' });
      return;
    }

    const openai = new OpenAI({ apiKey });

    const params: OpenAI.ChatCompletionCreateParams = {
      model: 'gpt-4o-mini',
      messages,
      temperature,
    };

    if (responseFormat) {
      params.response_format = responseFormat;
    }

    const completion = await openai.chat.completions.create(params);
    const content = completion.choices[0]?.message?.content ?? '';

    res.json({
      content,
      usage: completion.usage,
    });
  } catch (err: unknown) {
    console.error('[llm] Error:', err);
    const message = err instanceof Error ? err.message : 'LLM request failed';
    res.status(500).json({ error: message });
  }
});
