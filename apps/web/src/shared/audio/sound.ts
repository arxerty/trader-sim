/**
 * Procedural sound effects via the Web Audio API – no audio files needed.
 * The AudioContext is created lazily on first use (browsers require a user gesture).
 */
export type SoundName =
  'buy' | 'sell' | 'profit' | 'loss' | 'liquidation' | 'achievement' | 'news' | 'click';

interface Note {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<SoundName, Note[]> = {
  buy: [
    { freq: 660, start: 0, duration: 0.08 },
    { freq: 880, start: 0.07, duration: 0.1 },
  ],
  sell: [
    { freq: 520, start: 0, duration: 0.08 },
    { freq: 390, start: 0.07, duration: 0.1 },
  ],
  profit: [
    { freq: 523, start: 0, duration: 0.09, type: 'triangle' },
    { freq: 659, start: 0.08, duration: 0.09, type: 'triangle' },
    { freq: 784, start: 0.16, duration: 0.16, type: 'triangle' },
  ],
  loss: [
    { freq: 330, start: 0, duration: 0.12, type: 'sawtooth', gain: 0.5 },
    { freq: 247, start: 0.11, duration: 0.18, type: 'sawtooth', gain: 0.5 },
  ],
  liquidation: [
    { freq: 220, start: 0, duration: 0.2, type: 'square', gain: 0.5 },
    { freq: 165, start: 0.18, duration: 0.2, type: 'square', gain: 0.5 },
    { freq: 110, start: 0.36, duration: 0.35, type: 'square', gain: 0.5 },
  ],
  achievement: [
    { freq: 784, start: 0, duration: 0.1, type: 'triangle' },
    { freq: 988, start: 0.09, duration: 0.1, type: 'triangle' },
    { freq: 1175, start: 0.18, duration: 0.1, type: 'triangle' },
    { freq: 1568, start: 0.27, duration: 0.25, type: 'triangle' },
  ],
  news: [{ freq: 1046, start: 0, duration: 0.06, gain: 0.4 }],
  click: [{ freq: 1400, start: 0, duration: 0.02, gain: 0.25 }],
};

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.5;

  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.min(1, Math.max(0, volume));
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    return this.ctx;
  }

  play(name: SoundName): void {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const master = ctx.createGain();
    master.gain.value = this.volume * 0.2;
    master.connect(ctx.destination);
    const now = ctx.currentTime;

    for (const note of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = note.type ?? 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      const peak = note.gain ?? 1;
      env.gain.setValueAtTime(0.0001, now + note.start);
      env.gain.exponentialRampToValueAtTime(peak, now + note.start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      osc.connect(env).connect(master);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
  }
}

export const sound = new SoundEngine();
