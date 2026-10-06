import type { AttackCommand } from '../types/Battle.ts'

interface Windup {
  command: AttackCommand
  releaseAt: number
}

export class AttackSystem {
  queue: AttackCommand[] = []
  private windup: Windup[] = []
  private nextId = 1

  get winding(): boolean {
    return this.windup.some((item) => item.command.rarity === 'legendary')
  }

  get pending(): number {
    return this.queue.length + this.windup.length
  }

  private readonly known = new Set<number>()
  /**
   * Visual spawn for a command that is ready right now.
   * Return true when the projectile was created in this same call.
   */
  spawnNow: ((command: AttackCommand) => boolean) | null = null

  adopt(command: AttackCommand, delayMs = 0): void {
    if (this.known.has(command.id)) return
    this.known.add(command.id)
    if (this.known.size > 240) {
      const oldest = this.known.values().next().value
      if (oldest != null) this.known.delete(oldest)
    }
    this.nextId = Math.max(this.nextId, command.id + 1)
    if (delayMs > 0) this.windup.push({ command, releaseAt: performance.now() + delayMs })
    else this.insert(command)
  }

  enqueue(command: Omit<AttackCommand, 'id'>, delayMs = 0): AttackCommand {
    const full: AttackCommand = { ...command, id: this.nextId++ }
    if (delayMs > 0) {
      this.windup.push({ command: full, releaseAt: performance.now() + delayMs })
    } else {
      this.insert(full)
    }
    return full
  }

  release(now: number): AttackCommand[] {
    const ready: AttackCommand[] = []
    this.windup = this.windup.filter((item) => {
      if (now < item.releaseAt) return true
      ready.push(item.command)
      return false
    })
    for (const command of ready) this.insert(command)
    return ready
  }

  /**
   * Hands every viewer attack to the renderer at once so nothing waits for an earlier animation.
   * Only big ambient dummy shots hold back while a major viewer attack is on screen.
   */
  pull(majorsPlaying = 0): AttackCommand[] {
    if (this.queue.length === 0) return []
    const out: AttackCommand[] = []
    const held: AttackCommand[] = []
    for (const next of this.queue) {
      const quietAmbient = next.ambient && majorsPlaying > 0 && next.rarity !== 'micro' && next.rarity !== 'small'
      if (quietAmbient) held.push(next)
      else out.push(next)
    }
    this.queue = held
    return out
  }

  reset(): void {
    this.queue = []
    this.windup = []
  }

  private insert(command: AttackCommand): void {
    if (this.spawnNow?.(command)) return
    this.defer(command)
  }

  /** Puts a command back in line without creating another id. Used when a shot must wait. */
  defer(command: AttackCommand): void {
    let index = 0
    while (index < this.queue.length && this.queue[index]!.priority >= command.priority) index += 1
    this.queue.splice(index, 0, command)
  }
}
