import type { TimelineEvent } from '../api/twinApi'

/** Turning the events of the three layers into a story a person can read: who said what to whom, in plain words,
 * with the rest one click away. Pure functions: no screen, no network. */

export type Layer = 'twin' | 'guardian' | 'city_brain'
export type Tone = 'good' | 'info' | 'warn' | 'bad' | 'quiet'

export const LAYERS: readonly Layer[] = ['twin', 'guardian', 'city_brain']
export const LAYER_NAMES: Record<string, string> = { twin: 'Twin', guardian: 'Guardian', city_brain: 'City Brain' }

export interface Step {
  id: string
  ts: string
  /** who speaks */
  layer: string
  /** who it is said to; null is a note about the speaker's own doing */
  to: Layer | null
  tone: Tone
  title: string
  /** the second line: the reason, or the detail that matters most */
  why?: string
  kind: string
  /** the incident (or other thing) it is about */
  subject?: string
  /** the events behind the step: one, or all of a group's */
  events: TimelineEvent[]
  /** a group's steps */
  children: Step[]
  /** periodic chatter, hidden unless asked for */
  routine: boolean
  /** what the engine knows is true, not what a layer reported */
  truth: boolean
}

const isLayer = (x: unknown): x is Layer => typeof x === 'string' && (LAYERS as readonly string[]).includes(x)
const text = (x: unknown): string => (x === undefined || x === null ? '' : String(x))
const clip = (s: string, n = 160): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function humanize(word: string): string {
  const spaced = word.replace(/^sim_/, '').replace(/[._]+/g, ' ').trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : word
}

const STATUS_WORDS: Record<string, string> = { trusted: 'trusted', suspect: 'doubtful', suspicious: 'doubtful', untrusted: 'not trusted', unknown: 'unknown' }
const statusTone = (status: string): Tone => (status === 'trusted' ? 'good' : status === 'untrusted' ? 'bad' : 'warn')

const ACCIDENTS: Record<string, string> = {
  car_pedestrian: 'A car hit a pedestrian',
  car_car: 'Two cars crashed',
  building_fire: 'A building caught fire',
  flooded_car: 'A car stalled in flood water',
  trapped_pedestrian: 'A pedestrian is trapped in flood water',
}

const UNITS: Record<string, string> = { ambulance: 'an ambulance', fire: 'a fire truck', police: 'a police car' }

function recordOf(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

/** "send a fire truck", "broadcast an alert": what an actuator call asks for. */
export function actionPhrase(action: string, params: Record<string, unknown> = {}): string {
  switch (action) {
    case 'dispatch_unit':
      return `send ${UNITS[text(params.unit_type)] ?? 'a unit'}`
    case 'broadcast_alert':
      return `broadcast an alert${params.zone_id ? ` to ${text(params.zone_id)}` : ''}`
    case 'set_pump_state':
      return `${params.state === 'off' ? 'stop' : 'start'} the pump`
    case 'set_valve_state':
      return `${params.state === 'open' ? 'open' : 'close'} a valve`
    case 'set_signal_phase':
      return 'change a traffic signal'
    case 'recall_unit':
      return 'call a unit back'
    case 'isolate_sensor':
      return `isolate ${text(params.device_id) || 'a sensor'}`
    case 'clear_quarantine':
      return `release ${text(params.device_id) || 'a device'}`
    default:
      return humanize(action).toLowerCase()
  }
}

const INCIDENT = /\binc-\d{4}\b/

export function subjectOf(e: TimelineEvent): string | undefined {
  const data = recordOf(e.data)
  const params = recordOf(data.params)
  const direct = text(data.incident_id) || text(params.incident_id) || text(recordOf(data.result).incident_id) || text(data.entity_id)
  if (direct && INCIDENT.test(direct)) return direct.match(INCIDENT)?.[0]
  return e.message.match(INCIDENT)?.[0] ?? (text(e.data?.subject).match(INCIDENT)?.[0] || undefined)
}

const THINKING = new Set([
  'deliberation.started', 'deliberation.finished', 'desk.assessed', 'desk.decided', 'solver.started', 'solver.solved', 'pack.bid',
  'pack.uncovered', 'workspace.ignited', 'workspace.released', 'plan.reconciled', 'plan.rejected', 'math.estimated', 'case.reviewed',
  'options.prepared', 'plan.verified', 'corridor.opened',
])

export const ROUTINE_KINDS = new Set(['reading_emitted', 'readings_verified', 'verdict_routine', 'brain_notified', 'reading.received', 'verdict.received'])

interface Said {
  to?: Layer | null
  tone: Tone
  title: string
  why?: string
  from?: string
}

/** The sentence for one event, from what the event itself carries. */
function say(e: TimelineEvent): Said {
  const d = recordOf(e.data)
  const layer = e.layer
  const who = text(d.sensor_id) || e.message.split(/[ #]/)[0]
  switch (`${layer}:${e.kind}`) {
    case 'twin:startup':
      return { tone: 'quiet', title: 'The Twin started', why: e.message }
    case 'twin:live_reset':
      return { tone: 'info', title: `The city restarted: run ${text(d.run_id)}`, why: text(d.scenario) ? `scenario ${text(d.scenario)}` : e.message }
    case 'twin:scenario_started':
      return { tone: 'info', title: `Scenario started: ${e.message}` }
    case 'twin:scenario_finished':
      return { tone: d.result === 'PASS' ? 'good' : 'bad', title: `Scenario ${text(d.id)} finished: ${text(d.result)}`, why: text(d.ended) ? `ended: ${text(d.ended)}` : undefined }
    case 'twin:sim_incident':
      return { tone: 'info', title: ACCIDENTS[text(d.accident_kind)] ?? humanize(text(d.accident_kind) || 'incident'), why: `in the city at (${text(d.x)}, ${text(d.y)})` }
    case 'twin:sim_call_started':
      return { to: 'guardian', tone: 'info', title: `${text(d.reporter_id)} (${text(d.reporter_kind)}) phoned in: ${text(d.category)}`, why: text(d.incident_id) ? `call centre incident ${text(d.incident_id)}` : undefined }
    case 'twin:sim_camera_anomaly':
      return { tone: 'info', title: `Camera ${text(d.camera_id)} saw ${text(d.anomaly_type).replace(/_/g, ' ')}`, why: text(d.confidence) ? `confidence ${text(d.confidence)}` : undefined }
    case 'twin:sim_unit_dispatched':
      return { tone: 'good', title: `${text(d.unit_id)} left its station`, why: d.eta_s !== undefined ? `arrives in about ${Math.round(Number(d.eta_s))} s` : undefined }
    case 'twin:emergency_call_reading':
      return { to: 'guardian', tone: 'info', title: `Twin sent the call of ${text(d.caller_id) || who} (${text(d.category)}) to the Guardian`, why: text(d.zone_id) ? `zone ${text(d.zone_id)}` : undefined }
    case 'twin:reading_emitted':
      return { to: 'guardian', tone: 'quiet', title: `${text(d.count)} readings sent to the Guardian` }
    case 'twin:brain_notified':
      return { to: 'city_brain', tone: 'quiet', title: 'The Twin told the Brain new readings are ready' }
    case 'twin:actuator_call_received': {
      const from = isLayer(d.requesting_layer) ? d.requesting_layer : undefined
      return { from, to: 'twin', tone: 'info', title: `${LAYER_NAMES[from ?? ''] ?? 'A layer'} asked the Twin to ${actionPhrase(text(d.action), recordOf(d.params))}`, why: text(recordOf(d.params).reason) || undefined }
    }
    case 'twin:unit_dispatched': {
      const result = recordOf(d.result)
      return { tone: 'good', title: `The Twin sent ${text(result.unit_id) || 'a unit'}`, why: result.eta_minutes !== undefined ? `arrives in about ${Math.round(Number(result.eta_minutes) * 60)} s` : undefined }
    }
    case 'twin:alert_broadcast':
      return { tone: 'good', title: `The Twin broadcast an alert to ${text(recordOf(d.result).zone_id) || 'a zone'}` }
    case 'twin:pump_started':
      return { tone: 'good', title: `The Twin started pump ${text(recordOf(d.result).pump_id)}` }
    case 'twin:device_isolated':
      return { tone: 'warn', title: `The Twin cut off ${text(recordOf(d.result).device_id) || 'a device'}`, why: 'at the Guardian\'s request' }
    case 'twin:actuator_duplicate':
      return { tone: 'quiet', title: `Already done: ${e.message}` }
    case 'twin:actuator_rejected':
      return { tone: 'warn', title: 'The Twin refused a call', why: e.message }
    case 'twin:delivery_failed':
      return { to: isLayer(d.target) ? d.target : null, tone: 'bad', title: 'The Twin could not deliver its events', why: text(d.error) || e.message }
    case 'twin:tick_error':
      return { tone: 'bad', title: 'The Twin\'s feed hit an error', why: text(d.error) || e.message }
    case 'guardian:verdict_issued': {
      const status = text(d.status)
      const reasons = Array.isArray(d.reasons) ? d.reasons.map((r) => humanize(text(r)).toLowerCase()).join(', ') : ''
      return { to: 'city_brain', tone: statusTone(status), title: `Guardian judged ${text(d.sensor_id) || who}: ${STATUS_WORDS[status] ?? status}`, why: reasons || undefined }
    }
    case 'guardian:verdict_routine':
      return { to: 'city_brain', tone: 'quiet', title: `Guardian judged ${text(d.sensor_id) || who}: ${STATUS_WORDS[text(d.status)] ?? text(d.status)}` }
    case 'guardian:guardian_alert': {
      const alert = recordOf(d.alert)
      return { tone: 'bad', title: `Guardian raised an alert: ${text(alert.type)}${alert.zone_id ? ` in ${text(alert.zone_id)}` : ''}`, why: e.message }
    }
    case 'guardian:guardian_containment':
      return { to: 'twin', tone: 'warn', title: `Guardian: ${e.message}` }
    case 'guardian:guardian_system':
      return { tone: 'quiet', title: `Guardian: ${e.message}` }
    case 'city_brain:reading.received':
      return { from: 'twin', to: 'city_brain', tone: 'quiet', title: `Brain received ${e.message}` }
    case 'city_brain:verdict.received': {
      const status = text(d.status)
      return { from: 'guardian', to: 'city_brain', tone: 'quiet', title: `Brain received the verdict on ${e.message}${status ? `: ${STATUS_WORDS[status] ?? status}` : ''}` }
    }
    case 'city_brain:incident_reported': {
      const evidence = Array.isArray(d.evidence) ? text(d.evidence[0]) : ''
      return { tone: 'info', title: `Brain opened incident ${subjectOf(e) ?? ''}: ${text(d.type)}${d.zone_id ? ` in ${text(d.zone_id)}` : ''}`.replace('  ', ' '), why: evidence ? `first evidence: ${evidence}, ${STATUS_WORDS[text(d.evidence_verdict)] ?? text(d.evidence_verdict)}` : e.message }
    }
    case 'city_brain:incident.closed':
      return { tone: 'good', title: `Brain closed incident ${subjectOf(e) ?? ''}`.trim(), why: text(d.outcome) ? `outcome: ${text(d.outcome).replace(/_/g, ' ')}` : undefined }
    case 'city_brain:deliberation.started':
      return { tone: 'quiet', title: `Brain started to think about ${subjectOf(e) ?? 'an incident'}` }
    case 'city_brain:deliberation.finished':
      return d.status === 'failed'
        ? { tone: 'warn', title: 'The Brain\'s thinking failed', why: clip(text(d.error).split('\n')[0]) }
        : { tone: 'quiet', title: 'Brain finished thinking', why: text(d.recommendation) ? `recommendation: ${text(d.recommendation)}` : undefined }
    case 'city_brain:desk.assessed':
      return { tone: 'info', title: `${humanize(text(d.department).toLowerCase())} desk: severity ${text(d.severity)}`, why: clip(text(d.summary)) }
    case 'city_brain:desk.decided':
      return { tone: 'info', title: d.send_advisory ? 'Desk will warn neighbouring zones' : 'Desk: no warning to neighbours', why: clip(text(d.justification)) }
    case 'city_brain:decision.made':
      return { tone: 'info', title: `Brain decided to ${actionPhrase(text(d.action), recordOf(d.params))}`, why: `${text(d.department)} · ${text(d.tier)}` }
    case 'city_brain:actuator_called':
    case 'city_brain:action.requested':
      return { to: 'twin', tone: 'info', title: `Brain asked the Twin to ${actionPhrase(text(d.action), recordOf(d.params))}`, why: text(d.actuator_id) ? `through ${text(d.actuator_id)}` : e.message }
    case 'city_brain:action.result': {
      const status = text(d.status)
      const good = ['dispatched', 'on', 'off', 'broadcast', 'closed', 'open', 'ok'].includes(status)
      return { from: 'twin', to: 'city_brain', tone: good ? 'good' : status === 'rejected' ? 'bad' : 'info', title: `The Twin answered: ${status || e.message}`, why: text(recordOf(d.current_state).unit_id) ? `unit ${text(recordOf(d.current_state).unit_id)}` : undefined }
    }
    case 'city_brain:action.blocked':
      return { tone: 'bad', title: `The safety gate refused: ${actionPhrase(text(d.would_have), recordOf(d.params))}`, why: `${text(d.check)}: ${text(d.reason)}` }
    case 'city_brain:human.needed':
      return { tone: 'warn', title: 'The Brain asks for a person', why: text(d.detail) || text(d.why) }
    case 'city_brain:unit.status':
      return { from: 'twin', to: 'city_brain', tone: 'info', title: `${text(d.unit_id)} is ${text(d.state).replace(/_/g, ' ')}`, why: text(d.verdict) ? `its report was judged ${STATUS_WORDS[text(d.verdict)] ?? text(d.verdict)}` : undefined }
    case 'city_brain:units.released':
      return { tone: 'info', title: 'Units were released', why: e.message }
    default:
      if (layer === 'twin' && e.kind.startsWith('sim_')) return { tone: 'info', title: humanize(e.kind), why: e.message && e.message !== e.kind ? e.message.replace(/^sim t=[\d.]+: /, '') : undefined }
      return { tone: THINKING.has(e.kind) ? 'quiet' : 'info', title: humanize(e.kind), why: e.message && e.message !== e.kind ? clip(e.message) : undefined }
  }
}

let counter = 0

/** One event as one step. */
export function narrateEvent(e: TimelineEvent): Step {
  const said = say(e)
  const routine = Boolean(e.routine) || ROUTINE_KINDS.has(e.kind)
  return {
    id: `s${(counter += 1)}`,
    ts: e.ts,
    layer: said.from ?? e.layer,
    to: said.to ?? null,
    tone: said.tone,
    title: said.title,
    why: said.why,
    kind: e.kind,
    subject: subjectOf(e),
    events: [e],
    children: [],
    routine,
    truth: e.kind.startsWith('sim_'),
  }
}

const worst = (tones: Tone[]): Tone => (['bad', 'warn', 'good', 'info', 'quiet'] as Tone[]).find((t) => tones.includes(t)) ?? 'quiet'

function group(children: Step[], title: string, why: string | undefined, tone: Tone, kind: string, layer: string): Step {
  return {
    id: `g${(counter += 1)}`,
    ts: children[0].ts,
    layer,
    to: null,
    tone,
    title,
    why,
    kind,
    subject: children.find((c) => c.subject)?.subject,
    events: children.flatMap((c) => c.events),
    children,
    routine: children.every((c) => c.routine),
    truth: false,
  }
}

/** The whole story, oldest first. A run of the Brain's thinking (desk, solver, bids...) becomes one step that opens into its parts,
 * and a run of periodic chatter becomes one step that says how many. */
export function buildSteps(events: TimelineEvent[], options: { routine: boolean }): { steps: Step[]; hiddenRoutine: number } {
  const sorted = [...events].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  const all = sorted.map(narrateEvent)
  const hiddenRoutine = options.routine ? 0 : all.filter((s) => s.routine).length
  const visible = all.filter((s) => options.routine || !s.routine)

  const out: Step[] = []
  let thinking: Step[] = []
  let chatter: Step[] = []
  const flushThinking = () => {
    if (thinking.length === 1) out.push(thinking[0])
    else if (thinking.length > 1) {
      const subject = thinking.find((s) => s.subject)?.subject
      const assessed = thinking.find((s) => s.kind === 'desk.assessed')
      const failed = thinking.find((s) => s.tone === 'warn')
      out.push(group(thinking, `Brain thought about ${subject ?? 'an incident'}`, failed?.why ?? assessed?.why, failed ? 'warn' : 'info', 'thinking', 'city_brain'))
    }
    thinking = []
  }
  const flushChatter = () => {
    if (chatter.length === 1) out.push(chatter[0])
    else if (chatter.length > 1) out.push(group(chatter, `${chatter.length} routine messages`, 'readings and verdicts that nobody needs to read one by one', 'quiet', 'routine', chatter[0].layer))
    chatter = []
  }
  for (const step of visible) {
    if (step.routine) {
      flushThinking()
      chatter.push(step)
    } else if (step.layer === 'city_brain' && step.to === null && THINKING.has(step.kind)) {
      flushChatter()
      thinking.push(step)
    } else {
      flushThinking()
      flushChatter()
      out.push(step)
    }
  }
  flushThinking()
  flushChatter()
  for (const g of out) if (g.children.length > 0 && g.kind === 'thinking') g.tone = worst([g.tone, ...g.children.map((c) => c.tone).filter((t) => t === 'bad')])
  return { steps: out, hiddenRoutine }
}

export interface Filters {
  layers: Set<string>
  problemsOnly: boolean
  incident: string | null
  search: string
  truth: boolean
}

export const everything = (): Filters => ({ layers: new Set(LAYERS), problemsOnly: false, incident: null, search: '', truth: true })

const searchable = (s: Step): string => `${s.title} ${s.why ?? ''} ${s.kind} ${s.subject ?? ''}`.toLowerCase()

/** Which steps stay on screen. A layer is kept when it speaks or is spoken to. */
export function applyFilters(steps: Step[], f: Filters): Step[] {
  const needle = f.search.trim().toLowerCase()
  return steps.filter((s) => {
    if (!f.truth && s.truth) return false
    if (!f.layers.has(s.layer) && !(s.to && f.layers.has(s.to))) return false
    if (f.problemsOnly && s.tone !== 'bad' && s.tone !== 'warn') return false
    if (f.incident && s.subject !== f.incident) return false
    if (needle && !searchable(s).includes(needle) && !s.children.some((c) => searchable(c).includes(needle))) return false
    return true
  })
}

/** The steps that went wrong or need a look, for the panel at the top. */
export function needsAttention(steps: Step[]): Step[] {
  return steps.flatMap((s) => (s.kind === 'thinking' ? s.children : [s])).filter((s) => s.tone === 'bad' || s.tone === 'warn')
}

export function incidentsIn(steps: Step[]): string[] {
  return [...new Set(steps.flatMap((s) => (s.kind === 'thinking' ? [s, ...s.children] : [s])).map((s) => s.subject).filter((x): x is string => Boolean(x)))].sort()
}

/** Seconds from the first event, for "+12.4 s". */
export function secondsSince(start: string, ts: string): number {
  return (Date.parse(ts) - Date.parse(start)) / 1000
}

export function relative(seconds: number): string {
  if (!Number.isFinite(seconds)) return ''
  const sign = seconds < 0 ? '-' : '+'
  const s = Math.abs(seconds)
  return s >= 120 ? `${sign}${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${sign}${s.toFixed(1)} s`
}

export function clock(ts: string): string {
  return /T(\d\d:\d\d:\d\d)/.exec(ts)?.[1] ?? ts
}
