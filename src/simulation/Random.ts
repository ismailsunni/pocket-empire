/**
 * Seeded PRNG (mulberry32). State is a single integer so it lives inside the
 * serializable GameState (§19.2 Rule 5) and replays identically from a save.
 */
export interface Rng {
  s: number
}

export const createRng = (seed: number): Rng => ({ s: seed >>> 0 })

export const nextUint = (rng: Rng): number => {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0
  let t = rng.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return (t ^ (t >>> 14)) >>> 0
}

/** [0, 1) */
export const nextFloat = (rng: Rng): number => nextUint(rng) / 4294967296

/** [0, n) */
export const nextInt = (rng: Rng, n: number): number => Math.floor(nextFloat(rng) * n)

/** [min, max] inclusive */
export const nextRange = (rng: Rng, min: number, max: number): number =>
  min + nextInt(rng, max - min + 1)

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[nextInt(rng, items.length)]

export const hashSeed = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
