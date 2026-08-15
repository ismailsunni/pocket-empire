import type { Command } from './Command'

/**
 * Single entry point into the simulation. Input adapters, the AI, and later a
 * network transport all push here; the queue drains once per tick.
 */
export class CommandQueue {
  private pending: Command[] = []

  push(command: Command): void {
    this.pending.push(command)
  }

  /** Returns this tick's commands in submission order and clears the queue. */
  drain(): Command[] {
    if (this.pending.length === 0) return []
    const commands = this.pending
    this.pending = []
    return commands
  }

  get size(): number {
    return this.pending.length
  }
}
