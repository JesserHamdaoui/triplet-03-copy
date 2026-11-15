import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { factRows } from './facts'
import { LAYERS, LAYER_NAMES, clock, relative, secondsSince, type Step } from './narrate'

/** Who spoke to whom: three lanes, an arrow from the speaker to the one spoken to. */
export function Lanes({ from, to }: { from: string; to: string | null }) {
  const at = (layer: string) => LAYERS.indexOf(layer as (typeof LAYERS)[number])
  const a = at(from)
  const b = to ? at(to) : -1
  const left = Math.min(a, b < 0 ? a : b)
  const width = b < 0 ? 0 : Math.abs(b - a)
  return (
    <span className="lanes" aria-label={to ? `${LAYER_NAMES[from]} to ${LAYER_NAMES[to]}` : `${LAYER_NAMES[from] ?? from}`}>
      {LAYERS.map((layer, i) => (
        <i key={layer} className={`lane-dot ${layer}${i === a || i === b ? ' on' : ''}`} />
      ))}
      {to && width > 0 && <b className={`lane-arrow ${from}${b > a ? ' right' : ' left'}`} style={{ left: `${(left + 0.5) * (100 / 3)}%`, width: `${width * (100 / 3)}%` }} />}
    </span>
  )
}

interface RowProps {
  step: Step
  start: string
  open: string | null
  setOpen: (id: string | null) => void
  depth?: number
}

/** One step of the story: a line you can read at a glance; open it for the facts, the layers' own words and the raw event. */
export function StepRow({ step, start, open, setOpen, depth = 0 }: RowProps) {
  const isOpen = open === step.id
  const group = step.children.length > 0
  return (
    <li id={step.id} className={`step tone-${step.tone} ${step.layer}${isOpen ? ' open' : ''}${step.truth ? ' truth' : ''}`} style={{ marginLeft: depth * 18 }}>
      <button type="button" className="step-line" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : step.id)}>
        <time title={step.ts}>
          <b>{relative(secondsSince(start, step.ts))}</b>
          <small>{clock(step.ts)}</small>
        </time>
        <Lanes from={step.layer} to={step.to} />
        <span className="step-text">
          <span className="step-title">{step.title}</span>
          {step.why && <span className="step-why">{step.why}</span>}
        </span>
        {group && <span className="step-count">{step.children.length} steps</span>}
        {step.subject && <span className="step-subject">{step.subject}</span>}
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isOpen && <Details step={step} start={start} open={open} setOpen={setOpen} depth={depth} />}
    </li>
  )
}

function Details({ step, start, open, setOpen, depth }: RowProps & { depth: number }) {
  const [raw, setRaw] = useState(false)
  if (step.children.length > 0) {
    return (
      <ul className="step-children">
        {step.children.map((c) => (
          <StepRow key={c.id} step={c} start={start} open={open} setOpen={setOpen} depth={depth + 1} />
        ))}
      </ul>
    )
  }
  const event = step.events[0]
  const facts = factRows(event.data)
  return (
    <div className="step-details">
      <p className="step-route">
        <b>{LAYER_NAMES[step.layer] ?? step.layer}</b>
        {step.to ? <> told <b>{LAYER_NAMES[step.to]}</b></> : ' noted'}
        <span> · {event.kind}</span>
        {step.truth && <span className="badge">what really happened in the city</span>}
      </p>
      {event.message && event.message !== step.title && <p className="step-message">{event.message}</p>}
      {facts.length > 0 ? (
        <dl className="facts">
          {facts.map((f) => (
            <div key={f.label} className={f.block ? 'block' : ''}>
              <dt>{f.label}</dt>
              <dd>{f.block ? <pre>{f.value}</pre> : f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="step-none">This log keeps the event's words only, with no further facts.</p>
      )}
      <button type="button" className="link-button" onClick={() => setRaw(!raw)}>
        {raw ? 'Hide' : 'Show'} the raw event
      </button>
      {raw && <pre className="raw">{JSON.stringify(event, null, 2)}</pre>}
    </div>
  )
}
