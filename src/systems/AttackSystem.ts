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
    return this.windup.length > 0
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
    let budget = Math.min(3, Math.max(0, battleConfig.maxActiveEffects - activeCount))
    while (this.queue.length > 0 && budget > 0) {
      const next = this.queue[0]
      if (!next) break
      const highWaiting = this.queue.some((item) => item.priority >= 4)
      if (next.priority < 4 && highWaiting && activeCount + out.length >= battleConfig.maxActiveEffects - 3) break
      this.queue.shift()
      out.push(next)
      budget -= 1
    }
    if (this.queue.length > 18) this.collapse()
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

  private collapse(): void {
    const kept: AttackCommand[] = []
    const merged = new Map<string, AttackCommand>()
    for (const command of this.queue) {
      if (command.priority > 2) {
        kept.push(command)
        continue
      }
      const key = command.team
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, {
          ...command,
          attackType: 'energy_bullet',
          damage: command.damage,
          intensity: Math.min(1.6, command.intensity + 0.25),
          giftName: 'Barrage',
          priority: 2,
        })
      } else {
        existing.damage += command.damage
        existing.intensity = Math.min(1.8, existing.intensity + 0.05)
      }
    }
    this.queue = [...merged.values(), ...kept].sort((a, b) => b.priority - a.priority)
  }
}
