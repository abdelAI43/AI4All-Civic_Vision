import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const replicateRouter = Router();

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NanoBanana is an official model — uses the models API, not versioned predictions
const NANO_BANANA_URL = 'https://api.replicate.com/v1/models/google/nano-banana/predictions';
const PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';

/** Read a local image file and return a base64 data URI that Replicate accepts. */
function localImageToDataUri(imageName: string): string | null {
  const imagesDir = path.resolve(__dirname, '..', '..', 'public', 'images');
  const filePath = path.join(imagesDir, imageName);
  if (!fs.existsSync(filePath)) {
    console.warn('[replicate] Local image not found:', filePath);
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(imageName).toLowerCase().replace('.', '');
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

replicateRouter.post('/generate', async (req, res) => {
  try {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured' });
      return;
    }

    const {
      prompt,
      sourceImageUrl,
      sourceImagePath,
      aspectRatio = 'match_input_image',
      outputFormat = 'jpg',
    } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'prompt required' });
      return;
    }

    // Build input for NanoBanana
    const input: Record<string, unknown> = {
      prompt,
      output_format: outputFormat,
      aspect_ratio: aspectRatio,
    };

    // Resolve image: local file (base64 data URI) or external URL
    if (sourceImagePath) {
      const dataUri = localImageToDataUri(sourceImagePath);
      if (dataUri) {
        input.image_input = [dataUri];
        console.log('[replicate] Using local image:', sourceImagePath, '(base64 data URI)');
      } else {
        console.warn('[replicate] Could not load local image, proceeding without source image');
      }
    } else if (sourceImageUrl) {
      input.image_input = [sourceImageUrl];
    }

    console.log('[replicate] Starting NanoBanana prediction:', { prompt: prompt.slice(0, 80) + '...', hasImage: !!input.image_input });

    const response = await fetch(NANO_BANANA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
        Prefer: 'wait',  // Wait for result (up to 60s) instead of polling
      },
      body: JSON.stringify({ input }),
    });

    const prediction = await response.json();

    if (!response.ok) {
      console.error('[replicate] API error:', prediction);
      res.status(response.status).json({ error: prediction.detail || prediction.error || 'Replicate API error' });
      return;
    }

    console.log('[replicate] Prediction status:', prediction.status, 'id:', prediction.id);

    res.json({
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
    });
  } catch (err: unknown) {
    console.error('[replicate] Error:', err);
    const message = err instanceof Error ? err.message : 'Image generation failed';
    res.status(500).json({ error: message });
  }
});

// Poll prediction status (fallback if Prefer: wait doesn't complete)
replicateRouter.get('/status/:id', async (req, res) => {
  try {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured' });
      return;
    }

    const response = await fetch(`${PREDICTIONS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    const prediction = await response.json();

    res.json({
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
    });
  } catch (err: unknown) {
    console.error('[replicate] Poll error:', err);
    const message = err instanceof Error ? err.message : 'Status check failed';
    res.status(500).json({ error: message });
  }
});
