/**
 * AudioPlayer — plays audio blobs (TTS responses) and signals when done.
 *
 * Used to play AI speech. The conversation flow waits for playback to finish
 * before starting to listen for the user's next response.
 */

export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;

  /** Whether audio is currently playing. */
  get isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused && !this.audio.ended;
  }

  /** Play an audio blob. Returns a promise that resolves when playback ends. */
  async play(blob: Blob): Promise<void> {
    this.stop(); // stop any current playback

    this.currentUrl = URL.createObjectURL(blob);
    this.audio = new Audio(this.currentUrl);

    return new Promise<void>((resolve, reject) => {
      if (!this.audio) return resolve();

      this.audio.onended = () => {
        this.cleanup();
        resolve();
      };

      this.audio.onerror = () => {
        this.cleanup();
        reject(new Error('Audio playback failed'));
      };

      this.audio.play().catch((err) => {
        this.cleanup();
        reject(err);
      });
    });
  }

  /** Stop current playback immediately. */
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
    this.audio = null;
  }
}
