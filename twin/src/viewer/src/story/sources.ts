import type { SavedLogInfo, ScenarioResult, TimelineEvent } from '../api/twinApi'

/** What the screen can show: the city now, one run of it, or a log kept from an earlier run. */
export type Source = { kind: 'live'; run: number | null } | { kind: 'log'; name: string } | { kind: 'run'; run: number }

export const sourceKey = (s: Source): string => (s.kind === 'live' ? (s.run === null ? 'live' : `live:${s.run}`) : s.kind === 'log' ? `log:${s.name}` : `run:${s.run}`)

export function parseKey(key: string): Source {
  if (key.startsWith('log:')) return { kind: 'log', name: key.slice(4) }
  if (key.startsWith('run:') && Number.isInteger(Number(key.slice(4)))) return { kind: 'run', run: Number(key.slice(4)) }
  if (key.startsWith('live:') && Number.isInteger(Number(key.slice(5)))) return { kind: 'live', run: Number(key.slice(5)) }
  return { kind: 'live', run: null }
}

/** The address of a source: `/timeline?log=...`, kept so a link can be shared. Older links (`?run=N`) still open. */
export function sourceFromSearch(search: string): Source {
  const q = new URLSearchParams(search)
  if (q.get('log')) return { kind: 'log', name: q.get('log') as string }
  const run = Number(q.get('run'))
  if (Number.isInteger(run) && run > 0) return { kind: 'run', run }
  const live = Number(q.get('live'))
  if (Number.isInteger(live) && live > 0) return { kind: 'live', run: live }
  return { kind: 'live', run: null }
}

export function searchFor(s: Source): string {
  if (s.kind === 'log') return `?log=${encodeURIComponent(s.name)}`
  if (s.kind === 'run') return `?run=${s.run}`
  return s.run === null ? '' : `?live=${s.run}`
}

export interface Segment {
  run: number
  scenario: string
  start: string
  end: string | null
}

/** The runs inside the live feed: a new one begins whenever the city restarts (`live_reset`). Newest first. */
export function liveSegments(events: TimelineEvent[]): Segment[] {
  const resets = events.filter((e) => e.layer === 'twin' && e.kind === 'live_reset').sort((a, b) => (a.ts < b.ts ? -1 : 1))
  return resets
    .map((e, i) => ({
      run: Number(e.data?.run_id ?? i + 1),
      scenario: String(e.data?.scenario ?? ''),
      start: e.ts,
      end: resets[i + 1]?.ts ?? null,
    }))
    .reverse()
}

/** The events of one run of the live feed (the part before the first restart belongs to the run that was already going). */
export function inSegment(events: TimelineEvent[], segment: Segment | undefined): TimelineEvent[] {
  if (!segment) return events
  return events.filter((e) => e.ts >= segment.start && (segment.end === null || e.ts < segment.end))
}

const SCENARIOS: Record<string, string> = { 'car-crash': 'car crash', 'ped-hit': 'pedestrian hit', 'building-fire': 'building fire', flood: 'flood', city: 'free-running city' }

export function segmentLabel(s: Segment): string {
  return `Run ${s.run} · ${SCENARIOS[s.scenario] ?? s.scenario} · ${/T(\d\d:\d\d:\d\d)/.exec(s.start)?.[1] ?? s.start}${s.end === null ? ' · now' : ''}`
}

const stampTime = (stamp: string | null, started: string | null): string => {
  const iso = started ?? (stamp ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z` : '')
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d)/.exec(iso)
  return m ? `${m[3]}/${m[2]} ${m[4]}` : ''
}

export function logLabel(l: SavedLogInfo): string {
  const result = l.result ? ` · ${l.result}` : ''
  const title = l.title && l.title !== l.name ? ` ${l.title}` : ''
  return `${(l.scenario ?? l.name).toUpperCase()}${title}${result} · ${stampTime(l.stamp, l.started_at)}${l.rich ? '' : ' · text only'}`.trim()
}

/** Runs the Twin still holds in memory that left no log file (no log folder set). */
export function runsWithoutLog(runs: ScenarioResult[], logs: SavedLogInfo[]): ScenarioResult[] {
  const names = new Set(logs.map((l) => l.name))
  return runs.filter((r) => r.run !== undefined && (!r.log || !names.has(r.log)))
}
