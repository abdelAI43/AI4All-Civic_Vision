export interface PlayableAudio {
  audioBase64: string;
  mimeType: string;
}

type QueueItem = {
  payload: PlayableAudio;
  resolve: () => void;
};

export class AudioPlayer {
  private queue: QueueItem[] = [];
  private isRunning = false;
  private currentAudio: HTMLAudioElement | null = null;
  private currentResolve: (() => void) | null = null;
  private generation = 0;

  async enqueue(payload: PlayableAudio): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ payload, resolve });
      void this.pump();
    });
  }

  /** Play a static audio file by URL. Returns true if played, false on error/404. */
  async playUrl(url: string): Promise<boolean> {
    const gen = this.generation;
    return new Promise<boolean>((resolve) => {
      if (gen !== this.generation) {
        resolve(false);
        return;
      }

      const audio = new Audio(url);
      let settled = false;
      const finish = (played: boolean) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        if (this.currentResolve === resolveCancel) this.currentResolve = null;
        if (this.currentAudio === audio) this.currentAudio = null;
        resolve(played);
      };

      const resolveCancel = () => finish(false);
      this.currentAudio = audio;
      this.currentResolve = resolveCancel;

      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);

      audio.play().catch(() => {
        finish(false);
      });
    });
  }

  stopAll(): void {
    this.generation += 1;
    this.queue.forEach((item) => item.resolve());
    this.queue = [];

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.currentResolve?.();
    this.currentResolve = null;
  }

  private async pump(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const runGeneration = this.generation;
    while (this.queue.length > 0 && runGeneration === this.generation) {
      const item = this.queue.shift();
      if (!item) continue;
      await this.playOne(item.payload, runGeneration);
      item.resolve();
    }

    this.isRunning = false;
  }

  private async playOne(payload: PlayableAudio, runGeneration: number): Promise<void> {
    if (runGeneration !== this.generation) return;

    const src = `data:${payload.mimeType};base64,${payload.audioBase64}`;
    const audio = new Audio(src);
    this.currentAudio = audio;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        if (this.currentResolve === finish) this.currentResolve = null;
        resolve();
      };

      this.currentResolve = finish;
      audio.onended = finish;
      audio.onerror = finish;

      void audio.play().catch(() => {
        finish();
      });
    });

    if (this.currentAudio === audio) {
      this.currentAudio = null;
    }
  }
}
