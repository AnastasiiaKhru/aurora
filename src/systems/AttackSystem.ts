import { battleConfig } from '../config/battleConfig.ts'
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

  pull(activeCount: number): AttackCommand[] {
    const out: AttackCommand[] = []
    let heavy = Math.min(4, Math.max(1, battleConfig.maxActiveEffects - Math.min(activeCount, battleConfig.maxActiveEffects)))
    let lights = 40
    let index = 0
    while (index < this.queue.length && (heavy > 0 || lights > 0)) {
      const next = this.queue[index]
      if (!next) break
      if (next.giftName === 'Like') {
        if (lights <= 0) {
          index += 1
          continue
        }
        this.queue.splice(index, 1)
        out.push(next)
        lights -= 1
        continue
      }
      if (heavy <= 0) break
      this.queue.splice(index, 1)
      out.push(next)
      heavy -= 1
    }
    return out
  }

  reset(): void {
    this.queue = []
    this.windup = []
  }

  private insert(command: AttackCommand): void {
    let index = 0
    while (index < this.queue.length && this.queue[index]!.priority >= command.priority) index += 1
    this.queue.splice(index, 0, command)
  }

}
