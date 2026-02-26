/**
 * AudioRecorder — captures microphone audio with silence detection.
 *
 * For the exhibition: users speak naturally and the recorder auto-stops
 * after a configurable silence duration. No buttons needed.
 */

export interface RecorderOptions {
  /** Silence threshold in dB (0-255 from AnalyserNode). Default: 25 */
  silenceThreshold?: number;
  /** How long silence must last before auto-stop, in ms. Default: 2000 */
  silenceDuration?: number;
  /** Maximum recording length in ms. Default: 30000 */
  maxDuration?: number;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private animationFrame: number | null = null;

  private opts: Required<RecorderOptions>;

  /** Callback for real-time volume level (0-1). Used for waveform visualizer. */
  onVolumeChange: ((level: number) => void) | null = null;

  constructor(options: RecorderOptions = {}) {
    this.opts = {
      silenceThreshold: options.silenceThreshold ?? 25,
      silenceDuration: options.silenceDuration ?? 2000,
      maxDuration: options.maxDuration ?? 30000,
    };
  }

  /** Start recording. Returns a promise that resolves with the audio Blob when done. */
  async start(): Promise<Blob> {
    this.chunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: this.getSupportedMimeType(),
    });

    // Set up audio analysis for silence detection + volume
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    return new Promise<Blob>((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(blob);
      };

      this.mediaRecorder!.start(250); // collect data every 250ms
      this.startSilenceDetection();

      // Hard max duration safety
      this.maxTimer = setTimeout(() => this.stop(), this.opts.maxDuration);
    });
  }

  /** Manually stop recording. */
  stop(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  /** Whether currently recording. */
  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /** Get the AnalyserNode for external visualizations. */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private startSilenceDetection(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let silenceStart: number | null = null;

    const check = () => {
      if (!this.analyser || !this.isRecording) return;

      this.analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Notify volume listeners (normalized 0-1)
      this.onVolumeChange?.(Math.min(average / 128, 1));

      if (average < this.opts.silenceThreshold) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > this.opts.silenceDuration) {
          this.stop();
          return;
        }
      } else {
        silenceStart = null;
      }

      this.animationFrame = requestAnimationFrame(check);
    };

    this.animationFrame = requestAnimationFrame(check);
  }

  private cleanup(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close().catch(() => {});
    this.mediaRecorder = null;
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
  }

  private getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm';
  }
}
