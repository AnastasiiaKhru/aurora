const HANDLES = [
  'alisa', 'mina', 'noah', 'sasha', 'leo', 'aria', 'kai', 'luna', 'ivan', 'nora',
  'milo', 'vera', 'eden', 'nika', 'omar', 'jade', 'theo', 'mira', 'enzo', 'yuna',
  'sofia', 'amir', 'cleo', 'ravi', 'ines', 'felix', 'hana', 'luca', 'nina', 'oscar',
  'priya', 'remy', 'sara', 'tomas', 'uma', 'vito', 'willa', 'xavi', 'yasmin', 'zara',
  'adrian', 'bianca', 'casper', 'dalia', 'elio', 'freya', 'gio', 'harper', 'isla', 'jules',
  'kenji', 'leila', 'marco', 'naomi', 'orion', 'paloma', 'quinn', 'rosa', 'selene', 'tariq',
  'ursula', 'vale', 'wesley', 'xia', 'yara', 'zen', 'amara', 'bruno', 'chloe', 'dante',
  'esme', 'farah', 'gita', 'hugo', 'iris', 'juno', 'kian', 'lina', 'mateo', 'noor',
]

const used = new Set<string>()

export function resetNames(): void {
  used.clear()
}

export function takeName(): string {
  for (const name of HANDLES) {
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  let n = used.size + 1
  let candidate = `guest${n}`
  while (used.has(candidate)) {
    n += 1
    candidate = `guest${n}`
  }
  used.add(candidate)
  return candidate
}

export function releaseName(name: string): void {
  used.delete(name)
}
