import type { SavedLogInfo, ScenarioResult } from '../api/twinApi'
import { logLabel, segmentLabel, sourceKey, type Segment, type Source } from './sources'

/** Which log to look at: the city now, a run of it, or a log kept from an earlier run. */
export function SourcePicker({ source, onChange, segments, logs, runs }: { source: Source; onChange: (s: Source) => void; segments: Segment[]; logs: SavedLogInfo[]; runs: ScenarioResult[] }) {
  const scenarioLogs = logs.filter((l) => l.kind === 'scenario')
  const otherLogs = logs.filter((l) => l.kind !== 'scenario')
  return (
    <label className="picker">
      <span>Show</span>
      <select
        value={sourceKey(source)}
        onChange={(e) => {
          const v = e.target.value
          onChange(v.startsWith('log:') ? { kind: 'log', name: v.slice(4) } : v.startsWith('run:') ? { kind: 'run', run: Number(v.slice(4)) } : v.startsWith('live:') ? { kind: 'live', run: Number(v.slice(5)) } : { kind: 'live', run: null })
        }}
        aria-label="Which log to show"
      >
        <option value="live">The city now (live)</option>
        {segments.length > 0 && (
          <optgroup label="Runs of the live city">
            {segments.map((s) => (
              <option key={s.run} value={`live:${s.run}`}>
                {segmentLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
        {scenarioLogs.length > 0 && (
          <optgroup label="Scenario logs">
            {scenarioLogs.map((l) => (
              <option key={l.name} value={`log:${l.name}`}>
                {logLabel(l)}
              </option>
            ))}
          </optgroup>
        )}
        {runs.length > 0 && (
          <optgroup label="Scenario runs without a log file">
            {runs.map((r) => (
              <option key={r.run} value={`run:${r.run}`}>
                Run {r.run}: {r.id.toUpperCase()} {r.result}
              </option>
            ))}
          </optgroup>
        )}
        {otherLogs.length > 0 && (
          <optgroup label="Other logs">
            {otherLogs.map((l) => (
              <option key={l.name} value={`log:${l.name}`}>
                {logLabel(l)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  )
}
