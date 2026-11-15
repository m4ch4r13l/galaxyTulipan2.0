const PENTATONIC_FREQS = [329.63, 392.0, 440.0, 523.25, 659.25, 783.99, 880.0];

export class AmbientChimeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private timerId: number | null = null;
  private isPlaying = false;
  private lastNoteIndex = -1;

  public start(): boolean {
    if (this.isPlaying) return true;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return false;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.25;
        this.masterGain.connect(this.ctx.destination);
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      this.isPlaying = true;
      this.scheduleNextNote();
      return true;
    } catch {
      this.isPlaying = false;
      return false;
    }
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public playSelectionSpark(): void {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const chord = [523.25, 659.25, 783.99];
      chord.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.06);
        gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.06 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 2.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 2.45);
      });
    } catch {
      // Ignore audio scheduling errors
    }
  }

  private scheduleNextNote(): void {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;
      let idx = Math.floor(Math.random() * PENTATONIC_FREQS.length);
      if (idx === this.lastNoteIndex) {
        idx = (idx + 1) % PENTATONIC_FREQS.length;
      }
      this.lastNoteIndex = idx;
      const baseFreq = PENTATONIC_FREQS[idx];

      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(baseFreq, now);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.18, now + 0.06);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 4.25);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.linearRampToValueAtTime(0.035, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now);
      osc2.stop(now + 3.45);
    } catch {
      // Ignore audio errors
    }

    const nextDelay = 1900 + Math.random() * 1700;
    this.timerId = window.setTimeout(() => this.scheduleNextNote(), nextDelay);
  }

  public dispose(): void {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
  }
}
