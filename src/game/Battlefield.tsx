import { useEffect, useRef } from 'react'
import { BattlefieldApp } from './BattlefieldApp.ts'

export function Battlefield() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    const app = new BattlefieldApp()
    let dead = false
    void app.start(host).then(() => {
      if (dead) app.destroy()
    })
    return () => {
      dead = true
      app.destroy()
    }
  }, [])

  return <div className="battlefield" ref={ref} />
}
