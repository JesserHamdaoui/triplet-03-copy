import type { LayerState, ScenarioCheck } from '../api/twinApi'
import { LAYER_NAMES, relative, secondsSince, type Step } from './narrate'

export interface Overview {
  title: string
  subtitle?: string
  result?: string | null
  start?: string
  end?: string
  checks: ScenarioCheck[]
  layers: Record<string, LayerState>
  facts: boolean
  live: boolean
}

/** The top of the page: what this log is, how it ended, and the few things worth a look first. */
export function Summary({ overview, steps, attention, jump }: { overview: Overview; steps: Step[]; attention: Step[]; jump: (s: Step) => void }) {
  const missing = overview.checks.filter((c) => !c.seen)
  const duration = overview.start && overview.end ? relative(secondsSince(overview.start, overview.end)).replace('+', '') : ''
  return (
    <section className="summary">
      <div className="summary-head">
        <h2>{overview.title}</h2>
        {overview.result && <span className={`badge result ${overview.result.toLowerCase()}`}>{overview.result}</span>}
        {overview.live && <span className="badge live">live</span>}
        <span className="muted">
          {steps.length} steps{duration ? ` · ${duration}` : ''}
          {overview.subtitle ? ` · ${overview.subtitle}` : ''}
        </span>
        <ul className="layer-chips">
          {Object.entries(overview.layers).map(([layer, state]) => (
            <li key={layer} className={state.reachable ? 'up' : 'down'} title={state.error ?? undefined}>
              {LAYER_NAMES[layer] ?? layer}: {state.reachable ? 'connected' : 'not reachable'}
            </li>
          ))}
        </ul>
      </div>
      {!overview.facts && <p className="note">This is an older text log: it has every event's words but not their facts, so opening a step shows less.</p>}
      {overview.checks.length > 0 && (
        <ul className="checks" aria-label="What the scenario expected to see">
          {overview.checks.map((c) => (
            <li key={`${c.layer}:${c.kind}`} className={c.seen ? 'seen' : 'missing'} title={`${LAYER_NAMES[c.layer] ?? c.layer}: ${c.kind}`}>
              {c.seen ? '✓' : '✗'} {c.meaning}
            </li>
          ))}
        </ul>
      )}
      {(attention.length > 0 || missing.length > 0) && (
        <div className="attention">
          <h3>Worth a look first</h3>
          <ul>
            {missing.map((c) => (
              <li key={`m-${c.layer}:${c.kind}`} className="tone-bad plain">
                Never happened: {c.meaning}
              </li>
            ))}
            {attention.slice(0, 8).map((s) => (
              <li key={s.id} className={`tone-${s.tone}`}>
                <button type="button" onClick={() => jump(s)}>
                  <b>{relative(secondsSince(overview.start ?? s.ts, s.ts))}</b> {s.title}
                  {s.why ? <small> {s.why}</small> : null}
                </button>
              </li>
            ))}
          </ul>
          {attention.length > 8 && <p className="muted">and {attention.length - 8} more: switch on "Problems only" to see them all.</p>}
        </div>
      )}
    </section>
  )
}
