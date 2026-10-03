export type TeamId = 'red' | 'blue'

export type TeamAssignMode = 'explicit' | 'random' | 'alternate'

export interface TeamState {
  id: TeamId
  name: string
  score: number
  health: number
  maxHealth: number
  playerCount: number
  momentum: number
  likesTotal: number
  likeBank: number
}
