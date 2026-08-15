type Cue = 'select' | 'command' | 'attack' | 'built' | 'age' | 'victory' | 'defeat' | 'alert'

const CUES: Record<Cue, { freq: number; to: number; duration: number; type: OscillatorType }> = {
  select: { freq: 620, to: 720, duration: 0.06, type: 'triangle' },
  command: { freq: 420, to: 520, duration: 0.07, type: 'square' },
  attack: { freq: 180, to: 120, duration: 0.09, type: 'sawtooth' },
  built: { freq: 320, to: 480, duration: 0.18, type: 'triangle' },
  age: { freq: 300, to: 700, duration: 0.5, type: 'triangle' },
  victory: { freq: 400, to: 900, duration: 0.8, type: 'triangle' },
  defeat: { freq: 400, to: 120, duration: 0.9, type: 'sawtooth' },
  alert: { freq: 700, to: 400, duration: 0.25, type: 'square' },
}

/**
 * Synthesised cues rather than sampled audio: no asset licensing, no download
 * budget, and it unblocks the §22 audio scope while art is still placeholder.
 * Muted by default — browsers block autoplay and phone players often play muted.
 */
export class Audio {
  private context: AudioContext | null = null
  muted = true

  unlock(): void {
    if (this.context || this.muted) return
    this.context = new AudioContext()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (!muted) this.unlock()
  }

  play(cue: Cue): void {
    if (this.muted) return
    this.unlock()
    const context = this.context
    if (!context) return
    const spec = CUES[cue]
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = spec.type
    oscillator.frequency.setValueAtTime(spec.freq, context.currentTime)
    oscillator.frequency.linearRampToValueAtTime(spec.to, context.currentTime + spec.duration)
    gain.gain.setValueAtTime(0.14, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + spec.duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + spec.duration)
  }
}

export const audio = new Audio()
