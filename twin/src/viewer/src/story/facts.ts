import { humanize } from './narrate'

export interface Fact {
  label: string
  value: string
  /** a nested object or list, shown in a box of its own */
  block?: boolean
}

const HIDDEN = new Set(['message'])

function plain(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return String(v)
}

/** An event's facts as rows a person can read: what each is called and what it says; nested things in a block. */
export function factRows(data: Record<string, unknown> | undefined, limit = 30): Fact[] {
  if (!data) return []
  const rows: Fact[] = []
  for (const [key, value] of Object.entries(data)) {
    if (HIDDEN.has(key) || value === null || value === undefined || value === '') continue
    if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) rows.push({ label: humanize(key), value: value.map(plain).join(', ') })
    else if (typeof value === 'object') rows.push({ label: humanize(key), value: JSON.stringify(value, null, 2), block: true })
    else rows.push({ label: humanize(key), value: plain(value) })
    if (rows.length >= limit) break
  }
  return rows
}
