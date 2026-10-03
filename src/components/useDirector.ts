import { useSyncExternalStore } from 'react'
import { director } from '../systems/GameDirector.ts'
import type { HudSnapshot } from '../types/Battle.ts'

export function useDirector(): HudSnapshot {
  return useSyncExternalStore(director.subscribe, director.getSnapshot, director.getSnapshot)
}
