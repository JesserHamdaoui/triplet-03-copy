import { describe, expect, it } from 'vitest'
import type { SavedLogInfo, TimelineEvent } from '../api/twinApi'
import { inSegment, liveSegments, logLabel, parseKey, runsWithoutLog, searchFor, sourceFromSearch, sourceKey } from './sources'

const reset = (ts: string, run: number, scenario: string): TimelineEvent => ({ ts, layer: 'twin', kind: 'live_reset', message: '', data: { run_id: run, scenario } })
const other = (ts: string): TimelineEvent => ({ ts, layer: 'twin', kind: 'x', message: '' })

describe('which log is shown', () => {
  it('goes through the address and back', () => {
    for (const key of ['live', 'live:3', 'log:t2-20261115T033846Z.log', 'run:4']) expect(sourceKey(parseKey(key))).toBe(key)
    expect(sourceFromSearch('')).toEqual({ kind: 'live', run: null })
    expect(sourceFromSearch('?run=5')).toEqual({ kind: 'run', run: 5 })               // the link the run banner has always made
    expect(sourceFromSearch('?log=t1-1.log')).toEqual({ kind: 'log', name: 't1-1.log' })
    expect(searchFor({ kind: 'log', name: 'a b.log' })).toBe('?log=a%20b.log')
    expect(searchFor({ kind: 'live', run: null })).toBe('')
  })

  it('cuts the live feed into the runs between restarts, newest first', () => {
    const feed = [other('2026-11-15T03:00:00.000Z'), reset('2026-11-15T03:01:00.000Z', 1, 'city'), other('2026-11-15T03:02:00.000Z'), reset('2026-11-15T03:05:00.000Z', 2, 'car-crash'), other('2026-11-15T03:06:00.000Z')]
    const segments = liveSegments(feed)
    expect(segments.map((s) => [s.run, s.scenario, s.end === null])).toEqual([[2, 'car-crash', true], [1, 'city', false]])
    expect(inSegment(feed, segments[1]).map((e) => e.ts.slice(11, 16))).toEqual(['03:01', '03:02'])
    expect(inSegment(feed, segments[0]).map((e) => e.ts.slice(11, 16))).toEqual(['03:05', '03:06'])
    expect(inSegment(feed, undefined)).toHaveLength(5)
  })

  it('labels a saved log by its scenario, result and time', () => {
    const log: SavedLogInfo = { name: 't2-20261115T033846Z.log', kind: 'scenario', scenario: 't2', stamp: '20261115T033846Z', title: 'Car crash at a junction', result: 'FAIL', started_at: '2026-11-15T03:37:39.527Z', ended: 'timeout', bytes: 1, rich: false }
    expect(logLabel(log)).toBe('T2 Car crash at a junction · FAIL · 15/11 03:37 · text only')
    expect(logLabel({ ...log, rich: true, started_at: null })).toBe('T2 Car crash at a junction · FAIL · 15/11 03:38')
  })

  it('offers a run held in memory only when no log file has it', () => {
    const runs = [{ run: 1, id: 't1', result: 'PASS' as const, log: 'a.log' }, { run: 2, id: 't2', result: 'FAIL' as const, log: null }]
    expect(runsWithoutLog(runs, [{ name: 'a.log' } as SavedLogInfo]).map((r) => r.run)).toEqual([2])
  })
})
