import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLog, getLogs, getRun, getRuns, getTimeline, type LayerState, type SavedLog, type ScenarioCheck, type TimelineEvent } from '../api/twinApi'
import { ScenarioButtons } from '../ui/ScenarioButtons'
import { usePolled } from '../timeline/usePolled'
import { SourcePicker } from './SourcePicker'
import { StepRow } from './StepRow'
import { Summary, type Overview } from './Summary'
import { LAYERS, LAYER_NAMES, applyFilters, buildSteps, everything, incidentsIn, needsAttention, type Filters, type Step } from './narrate'
import { inSegment, liveSegments, runsWithoutLog, searchFor, sourceFromSearch, type Source } from './sources'
import './story.css'

const LIVE_EVENTS = 4000
const LIVE_EVERY_MS = 2000

interface Loaded {
  overview: Omit<Overview, 'live'>
  events: TimelineEvent[]
}

function fromLog(log: SavedLog): Loaded {
  const start = log.events[0]?.ts
  return {
    overview: {
      title: log.meta.title ?? log.meta.name ?? log.name,
      subtitle: log.meta.id ? `${log.meta.id.toUpperCase()} · ${log.name}` : log.name,
      result: log.meta.result ?? null,
      start: log.meta.started_at ?? start,
      end: log.events[log.events.length - 1]?.ts,
      checks: log.checks,
      layers: log.layers,
      facts: log.facts,
    },
    events: log.events,
  }
}

/** The page behind /timeline: what happened between the three layers, in plain words, from the city now or from any saved run.
 * Each line opens into its facts and, below those, the event as the layer wrote it. */
export function StoryPage() {
  const [source, setSource] = useState<Source>(() => sourceFromSearch(window.location.search))
  const [filters, setFilters] = useState<Filters>(everything)
  const [showRoutine, setShowRoutine] = useState(false)
  const [follow, setFollow] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const logs = usePolled(useCallback(() => getLogs().then((r) => r.logs), []), 5_000)
  const runs = usePolled(useCallback(() => getRuns().then((r) => r.runs), []), 5_000)

  const live = source.kind === 'live'
  const feed = usePolled(useCallback(() => (live ? getTimeline(LIVE_EVENTS, true) : Promise.resolve(null)), [live]), LIVE_EVERY_MS)
  const segments = useMemo(() => liveSegments(feed.data?.events ?? []), [feed.data])

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (source.kind === 'live') return
    let stale = false
    setLoaded(null)
    setError(null)
    const request = source.kind === 'log' ? getLog(source.name).then(fromLog) : getRun(source.run).then((run): Loaded => ({
      overview: { title: run.name ?? run.id, subtitle: `Run ${run.run ?? ''} · ${run.id.toUpperCase()}`, result: run.result, start: run.started_at, end: run.events[run.events.length - 1]?.ts, checks: run.checks ?? ([] as ScenarioCheck[]), layers: run.layers ?? ({} as Record<string, LayerState>), facts: true },
      events: run.events,
    }))
    request.then((l) => !stale && setLoaded(l)).catch((e: unknown) => !stale && setError(String(e)))
    return () => {
      stale = true
    }
  }, [source])

  const choose = (next: Source) => {
    setSource(next)
    setOpen(null)
    window.history.replaceState(null, '', `/timeline${searchFor(next)}`)
  }

  const current: Loaded | null = useMemo(() => {
    if (source.kind !== 'live') return loaded
    if (!feed.data) return null
    const segment = source.run === null ? segments[0] : segments.find((s) => s.run === source.run)
    const events = inSegment(feed.data.events, segment)
    return {
      overview: {
        title: source.run === null ? 'The city now' : `Run ${source.run} of the live city`,
        subtitle: segment ? `since the restart at ${segment.start.slice(11, 19)}` : 'everything the Twin remembers',
        start: events[0]?.ts,
        end: events[events.length - 1]?.ts,
        checks: [],
        layers: feed.data.layers,
        facts: true,
      },
      events,
    }
  }, [source, loaded, feed.data, segments])

  const built = useMemo(() => (current ? buildSteps(current.events, { routine: showRoutine }) : null), [current, showRoutine])
  const shown = useMemo(() => (built ? applyFilters(built.steps, filters) : []), [built, filters])
  const attention = useMemo(() => (built ? needsAttention(built.steps) : []), [built])
  const incidents = useMemo(() => (built ? incidentsIn(built.steps) : []), [built])
  const start = current?.overview.start ?? shown[0]?.ts ?? ''

  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (live && follow) end.current?.scrollIntoView({ block: 'end' })
  }, [live, follow, shown.length])

  const jump = (step: Step) => {
    const parent = built?.steps.find((s) => s.children.some((c) => c.id === step.id))
    setFollow(false)
    setFilters({ ...filters, problemsOnly: false, incident: null, search: '' })
    setOpen(step.id)
    if (parent) setOpen(parent.id)
    window.setTimeout(() => document.getElementById(parent?.id ?? step.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }

  const toggleLayer = (layer: string) => {
    const layers = new Set(filters.layers)
    if (layers.has(layer)) layers.delete(layer)
    else layers.add(layer)
    setFilters({ ...filters, layers })
  }

  return (
    <main className="story-page">
      <header className="story-top">
        <h1>What happened</h1>
        <a href="/">3D city</a>
        <SourcePicker source={source} onChange={choose} segments={segments} logs={logs.data ?? []} runs={runsWithoutLog(runs.data ?? [], logs.data ?? [])} />
        <details className="runner">
          <summary>Run a scenario</summary>
          <ScenarioButtons />
        </details>
      </header>

      {error && <p className="live-error">Could not open this log: {error}</p>}
      {live && feed.error && <p className="live-error">The Twin is not answering, retrying ({feed.error})</p>}
      {!current && !error && <p className="muted">Loading…</p>}

      {current && built && (
        <>
          <Summary overview={{ ...current.overview, live }} steps={built.steps} attention={attention} jump={jump} />

          <div className="filters" role="toolbar" aria-label="What to show">
            <div className="chips">
              {LAYERS.map((layer) => (
                <button key={layer} type="button" className={`chip ${layer}${filters.layers.has(layer) ? ' on' : ''}`} aria-pressed={filters.layers.has(layer)} onClick={() => toggleLayer(layer)}>
                  {LAYER_NAMES[layer]}
                </button>
              ))}
            </div>
            <label>
              <input type="checkbox" checked={filters.problemsOnly} onChange={(e) => setFilters({ ...filters, problemsOnly: e.target.checked })} /> Problems only
            </label>
            <label>
              <input type="checkbox" checked={filters.truth} onChange={(e) => setFilters({ ...filters, truth: e.target.checked })} /> What really happened in the city
            </label>
            <label>
              <input type="checkbox" checked={showRoutine} onChange={(e) => setShowRoutine(e.target.checked)} /> Routine messages{built.hiddenRoutine > 0 ? ` (${built.hiddenRoutine.toLocaleString()} hidden)` : ''}
            </label>
            {incidents.length > 0 && (
              <select value={filters.incident ?? ''} onChange={(e) => setFilters({ ...filters, incident: e.target.value || null })} aria-label="Only one incident">
                <option value="">All incidents</option>
                {incidents.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            )}
            <input type="search" placeholder="Search the story" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} aria-label="Search the story" />
            {live && (
              <label>
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow the newest
              </label>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="muted empty">{built.steps.length === 0 ? 'Nothing has happened yet. Run a scenario.' : 'Nothing matches these filters.'}</p>
          ) : (
            <ol className="story">
              {shown.map((s) => (
                <StepRow key={s.id} step={s} start={start} open={open} setOpen={setOpen} />
              ))}
            </ol>
          )}
          <div ref={end} />
        </>
      )}
    </main>
  )
}
