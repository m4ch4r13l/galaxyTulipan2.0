interface ChordMeasure {
  name: string;
  bass: number;
  pad: number[];
  arpeggio: number[];
  melody: Array<{ beat: number; freq: number; duration: number }>;
}

// Progresión romántica en Do Mayor: Cmaj7 -> Am9 -> Fmaj7 -> G6
const CHORD_PROGRESSION: ChordMeasure[] = [
  {
    name: 'Cmaj7',
    bass: 130.81, // C3
    pad: [261.63, 329.63, 392.0, 493.88], // C4, E4, G4, B4
    arpeggio: [261.63, 329.63, 392.0, 493.88, 523.25, 493.88, 392.0, 329.63],
    melody: [
      { beat: 0, freq: 659.25, duration: 1.6 }, // E5
      { beat: 2, freq: 587.33, duration: 0.9 }, // D5
      { beat: 3, freq: 523.25, duration: 1.4 }, // C5
    ],
  },
  {
    name: 'Am9',
    bass: 110.0, // A2
    pad: [220.0, 329.63, 392.0, 493.88], // A3, E4, G4, B4
    arpeggio: [220.0, 329.63, 392.0, 493.88, 523.25, 493.88, 392.0, 329.63],
    melody: [
      { beat: 0, freq: 659.25, duration: 1.3 }, // E5
      { beat: 1.5, freq: 783.99, duration: 1.3 }, // G5
      { beat: 3, freq: 659.25, duration: 1.4 }, // E5
    ],
  },
  {
    name: 'Fmaj7',
    bass: 87.31, // F2
    pad: [174.61, 261.63, 329.63, 440.0], // F3, C4, E4, A4
    arpeggio: [174.61, 261.63, 329.63, 440.0, 523.25, 440.0, 329.63, 261.63],
    melody: [
      { beat: 0, freq: 523.25, duration: 1.5 }, // C5
      { beat: 2, freq: 587.33, duration: 0.9 }, // D5
      { beat: 3, freq: 659.25, duration: 1.4 }, // E5
    ],
  },
  {
    name: 'G6',
    bass: 98.0, // G2
    pad: [196.0, 293.66, 329.63, 493.88], // G3, D4, E4, B4
    arpeggio: [196.0, 293.66, 329.63, 493.88, 587.33, 493.88, 392.0, 293.66],
    melody: [
      { beat: 0, freq: 587.33, duration: 1.6 }, // D5
      { beat: 2, freq: 493.88, duration: 0.9 }, // B4
      { beat: 3, freq: 587.33, duration: 1.5 }, // D5
    ],
  },
];

const BEAT_SECONDS = 0.85; // ~70.5 BPM suave
const MEASURE_SECONDS = BEAT_SECONDS * 4;

export class AmbientChimeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private wetDelay: DelayNode | null = null;
  private measureTimerId: number | null = null;
  private stepTimers: number[] = [];
  private isPlaying = false;
  private measureIndex = 0;

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
        this.masterGain.gain.value = 0.0001;
        this.masterGain.connect(this.ctx.destination);

        // Eco espacial suave para dar profundidad cósmica
        const delay = this.ctx.createDelay(1.0);
        delay.delayTime.value = 0.42;

        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.34;

        const delayFilter = this.ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.value = 1800;

        delay.connect(delayFilter);
        delayFilter.connect(feedback);
        feedback.connect(delay);
        delayFilter.connect(this.masterGain);

        this.wetDelay = delay;
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      if (this.masterGain) {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(
          Math.max(0.0001, this.masterGain.gain.value),
          now,
        );
        this.masterGain.gain.linearRampToValueAtTime(0.32, now + 0.6);
      }

      this.isPlaying = true;
      this.measureIndex = 0;
      this.scheduleMeasure();
      return true;
    } catch {
      this.isPlaying = false;
      return false;
    }
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.measureTimerId !== null) {
      window.clearTimeout(this.measureTimerId);
      this.measureTimerId = null;
    }
    this.stepTimers.forEach((id) => window.clearTimeout(id));
    this.stepTimers = [];

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(
        Math.max(0.0001, this.masterGain.gain.value),
        now,
      );
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    }
  }

  public playSelectionSpark(): void {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;
    try {
      const chord =
        CHORD_PROGRESSION[
          (this.measureIndex - 1 + CHORD_PROGRESSION.length) %
            CHORD_PROGRESSION.length
        ];
      const now = this.ctx.currentTime;
      const sparkNotes = [
        chord.pad[1] * 2,
        chord.pad[2] * 2,
        chord.pad[3] * 2,
      ];
      sparkNotes.forEach((freq, idx) => {
        this.triggerBellNote(freq, now + idx * 0.065, 2.2, 0.11);
      });
    } catch {
      // Ignore audio scheduling errors
    }
  }

  private scheduleMeasure(): void {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;

    const chord =
      CHORD_PROGRESSION[this.measureIndex % CHORD_PROGRESSION.length];
    this.measureIndex = (this.measureIndex + 1) % CHORD_PROGRESSION.length;

    const now = this.ctx.currentTime;

    // 1. Bajo cálido y colchón armónico (pad) durante todo el compás
    this.triggerPadVoice(chord.bass, now, MEASURE_SECONDS, 0.14, 'sine');
    chord.pad.forEach((freq) => {
      this.triggerPadVoice(freq, now, MEASURE_SECONDS, 0.055, 'triangle');
    });

    // 2. Arpegio cristalino en corcheas suaves (8 notas por compás)
    const eighthSec = BEAT_SECONDS * 0.5;
    chord.arpeggio.forEach((freq, step) => {
      const t = now + step * eighthSec;
      this.triggerBellNote(freq, t, 1.85, 0.065);
    });

    // 3. Línea melódica principal expresiva sobre el acorde actual
    chord.melody.forEach((note) => {
      const t = now + note.beat * BEAT_SECONDS;
      this.triggerBellNote(note.freq, t, note.duration + 0.8, 0.125);
    });

    this.measureTimerId = window.setTimeout(() => {
      this.scheduleMeasure();
    }, MEASURE_SECONDS * 1000);
  }

  private triggerPadVoice(
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
    type: OscillatorType,
  ): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.75);
    gain.gain.setValueAtTime(peakGain, startTime + duration - 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.25);
  }

  private triggerBellNote(
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const harmonic = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const harmonicGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    // Armónico en octava muy sutil para brillo tipo celesta estelar
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(freq * 2, startTime);
    harmonicGain.gain.setValueAtTime(0.22, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(gain);

    gain.connect(this.masterGain);
    if (this.wetDelay) {
      gain.connect(this.wetDelay);
    }

    osc.start(startTime);
    harmonic.start(startTime);
    osc.stop(startTime + duration + 0.05);
    harmonic.stop(startTime + duration + 0.05);
  }

  public dispose(): void {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
    this.wetDelay = null;
  }
}
