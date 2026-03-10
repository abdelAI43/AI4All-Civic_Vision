export interface RecordedAudio {
  audioBase64: string;
  mimeType: string;
}

export interface RecordAudioOptions {
  silenceThreshold?: number;
  silenceDurationMs?: number;
  maxDurationMs?: number;
  onVolume?: (level: number) => void;
  signal?: AbortSignal;
}

const DEFAULTS = {
  silenceThreshold: 0.025,
  silenceDurationMs: 1400,
  maxDurationMs: 10000,
  /** Silence detection is ignored for this long after recording starts,
   *  giving the user time to begin speaking. */
  gracePeriodMs: 2000,
};

function chooseMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode recorded audio'));
        return;
      }
      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function rmsFromTimeDomain(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const centered = (data[i] - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / data.length);
}

export async function recordAudioOnce(options: RecordAudioOptions = {}): Promise<RecordedAudio | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser');
  }

  const silenceThreshold = options.silenceThreshold ?? DEFAULTS.silenceThreshold;
  const silenceDurationMs = options.silenceDurationMs ?? DEFAULTS.silenceDurationMs;
  const maxDurationMs = options.maxDurationMs ?? DEFAULTS.maxDurationMs;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  return new Promise<RecordedAudio | null>((resolve, reject) => {
    const mimeType = chooseMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    const chunks: BlobPart[] = [];
    let finished = false;
    let silentForMs = 0;
    let monitorInterval: number | null = null;
    let maxTimer: number | null = null;
    let audioContext: AudioContext | null = null;
    let abortListener: (() => void) | null = null;

    const finish = (value: RecordedAudio | null, error?: Error) => {
      if (finished) return;
      finished = true;

      if (monitorInterval !== null) {
        window.clearInterval(monitorInterval);
      }
      if (maxTimer !== null) {
        window.clearTimeout(maxTimer);
      }
      if (abortListener && options.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }

      stream.getTracks().forEach((track) => track.stop());
      if (audioContext) {
        void audioContext.close();
      }

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = () => {
      finish(null, new Error('Audio recording failed'));
    };

    recorder.onstop = async () => {
      try {
        if (chunks.length === 0 || options.signal?.aborted) {
          finish(null);
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        const audioBase64 = await blobToBase64(blob);
        finish({
          audioBase64,
          mimeType: blob.type || 'audio/webm',
        });
      } catch (err) {
        finish(null, err instanceof Error ? err : new Error('Failed to encode recording'));
      }
    };

    const stopRecorder = () => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    };

    if (options.signal) {
      abortListener = () => {
        stopRecorder();
      };
      options.signal.addEventListener('abort', abortListener);
      if (options.signal.aborted) {
        stopRecorder();
      }
    }

    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      const recordingStartedAt = Date.now();
      let hasHeardSpeech = false;
      monitorInterval = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        const level = rmsFromTimeDomain(data);
        options.onVolume?.(Math.min(1, level * 4));

        const elapsed = Date.now() - recordingStartedAt;
        const pastGrace = elapsed > DEFAULTS.gracePeriodMs;

        if (level >= silenceThreshold) {
          hasHeardSpeech = true;
          silentForMs = 0;
        } else if (hasHeardSpeech && pastGrace) {
          // Only stop after the user has spoken AND paused
          silentForMs += 120;
          if (silentForMs >= silenceDurationMs) {
            stopRecorder();
          }
        }
        // During grace period or before any speech: keep recording
      }, 120);
    } catch {
      // If AudioContext fails, recording still proceeds without silence detection.
    }

    maxTimer = window.setTimeout(() => {
      stopRecorder();
    }, maxDurationMs);

    recorder.start(200);
  });
}
