import { describe, expect, it } from 'vitest'
import type { TimelineEvent } from '../api/twinApi'
import { actionPhrase, applyFilters, buildSteps, everything, incidentsIn, narrateEvent, needsAttention, relative, subjectOf } from './narrate'

let n = 0
const ev = (layer: string, kind: string, data: Record<string, unknown> = {}, message = kind, routine = false): TimelineEvent => {
  n += 1
  return { ts: `2026-11-15T03:38:${String(10 + Math.floor(n / 10)).padStart(2, '0')}.${String((n % 10) * 100).padStart(3, '0')}Z`, layer, kind, message, data, routine }
}

describe('what an event says in plain words', () => {
  it('names who judged what and how it went', () => {
    const trusted = narrateEvent(ev('guardian', 'verdict_issued', { sensor_id: 'caller-ped1', status: 'trusted', reasons: [] }))
    expect(trusted).toMatchObject({ layer: 'guardian', to: 'city_brain', tone: 'good', title: 'Guardian judged caller-ped1: trusted' })
    const doubt = narrateEvent(ev('guardian', 'verdict_issued', { sensor_id: 'caller-ped2', status: 'suspect', reasons: ['insufficient_corroboration', 'threat_level_tightened'] }))
    expect(doubt).toMatchObject({ tone: 'warn', title: 'Guardian judged caller-ped2: doubtful', why: 'insufficient corroboration, threat level tightened' })
    expect(narrateEvent(ev('guardian', 'verdict_issued', { sensor_id: 'cam-n2', status: 'untrusted' })).tone).toBe('bad')
  })

  it('says what the safety gate refused and why', () => {
    const blocked = narrateEvent(ev('city_brain', 'action.blocked', { check: 'evidence', reason: 'needs 2 independent trusted sources, found 1', would_have: 'dispatch_unit', params: { unit_type: 'ambulance' } }, 'inc-0003'))
    expect(blocked).toMatchObject({ tone: 'bad', title: 'The safety gate refused: send an ambulance', why: 'evidence: needs 2 independent trusted sources, found 1', subject: 'inc-0003' })
  })

  it('shows calls between layers as arrows from the speaker to the one spoken to', () => {
    expect(narrateEvent(ev('city_brain', 'actuator_called', { action: 'dispatch_unit', params: { unit_type: 'fire' }, actuator_id: 'dispatch-fire-station' }))).toMatchObject({ layer: 'city_brain', to: 'twin', title: 'Brain asked the Twin to send a fire truck' })
    expect(narrateEvent(ev('city_brain', 'action.result', { status: 'dispatched', current_state: { unit_id: 'fire1' } }))).toMatchObject({ layer: 'twin', to: 'city_brain', tone: 'good', why: 'unit fire1' })
    expect(narrateEvent(ev('twin', 'actuator_call_received', { requesting_layer: 'guardian', action: 'isolate_sensor', params: { device_id: 'cam-n2' } }))).toMatchObject({ layer: 'guardian', to: 'twin', title: 'Guardian asked the Twin to isolate cam-n2' })
  })

  it('tells what really happened in the city apart from what a layer reported', () => {
    const step = narrateEvent(ev('twin', 'sim_incident', { accident_kind: 'car_pedestrian', x: 70, y: -2 }))
    expect(step).toMatchObject({ title: 'A car hit a pedestrian', truth: true })
    expect(narrateEvent(ev('twin', 'sim_unit_arrived', {}, 'sim t=12.0: unit_arrived'))).toMatchObject({ truth: true, title: 'Unit arrived', why: 'unit_arrived' })
  })

  it('finds the incident an event is about', () => {
    expect(subjectOf(ev('city_brain', 'incident_reported', {}, 'inc-0007 accident'))).toBe('inc-0007')
    expect(subjectOf(ev('twin', 'unit_dispatched', { result: { incident_id: 'inc-0002' } }))).toBe('inc-0002')
    expect(subjectOf(ev('twin', 'sim_call_started', { incident_id: 'inc-0001' }))).toBe('inc-0001')
    expect(subjectOf(ev('twin', 'startup'))).toBeUndefined()
  })

  it('words an action as a request', () => {
    expect(actionPhrase('set_pump_state', { state: 'on' })).toBe('start the pump')
    expect(actionPhrase('broadcast_alert', { zone_id: 'zone-03' })).toBe('broadcast an alert to zone-03')
    expect(actionPhrase('something_new')).toBe('something new')
  })
})

describe('the story', () => {
  it('hides the periodic chatter and counts it, or folds it into one step when asked for', () => {
    const events = [ev('twin', 'sim_incident', { accident_kind: 'car_car' }), ev('city_brain', 'reading.received', {}, 'cam-n2#1'), ev('guardian', 'verdict_routine', { status: 'trusted', sensor_id: 'x' }), ev('twin', 'reading_emitted', { count: 3 })]
    const quiet = buildSteps(events, { routine: false })
    expect(quiet.steps.map((s) => s.kind)).toEqual(['sim_incident'])
    expect(quiet.hiddenRoutine).toBe(3)
    const loud = buildSteps(events, { routine: true })
    expect(loud.steps.map((s) => s.kind)).toEqual(['sim_incident', 'routine'])
    expect(loud.steps[1].children).toHaveLength(3)
    expect(loud.steps[1].title).toBe('3 routine messages')
  })

  it('folds a run of the Brain thinking into one step that opens into its parts', () => {
    const events = [
      ev('city_brain', 'incident_reported', { type: 'accident', zone_id: 'zone-03', evidence: ['caller-ped1#1'], evidence_verdict: 'trusted' }, 'inc-0003 accident'),
      ev('city_brain', 'deliberation.started', {}, 'inc-0003 desk'),
      ev('city_brain', 'desk.assessed', { department: 'MEDICAL', severity: 'medium', summary: 'only one independent source so far' }, 'inc-0003'),
      ev('city_brain', 'desk.decided', { send_advisory: false, justification: 'Not serious enough to alert neighbours.' }, 'inc-0003'),
      ev('city_brain', 'deliberation.finished', { status: 'completed', recommendation: 'medium' }, 'inc-0003 desk'),
      ev('city_brain', 'action.blocked', { check: 'evidence', reason: 'found 1', would_have: 'dispatch_unit', params: { unit_type: 'ambulance' } }, 'inc-0003'),
    ]
    const { steps } = buildSteps(events, { routine: false })
    expect(steps.map((s) => s.kind)).toEqual(['incident_reported', 'thinking', 'action.blocked'])
    expect(steps[1]).toMatchObject({ title: 'Brain thought about inc-0003', why: 'only one independent source so far', subject: 'inc-0003' })
    expect(steps[1].children).toHaveLength(4)
  })

  it('marks thinking that failed as a warning and lists it for attention, with the refusals', () => {
    const events = [
      ev('city_brain', 'deliberation.started', {}, 'inc-0003 desk'),
      ev('city_brain', 'deliberation.finished', { status: 'failed', error: 'ValidationError: advise_zones\nmore' }, 'inc-0003 desk'),
      ev('guardian', 'verdict_issued', { sensor_id: 'a', status: 'untrusted' }),
      ev('guardian', 'verdict_issued', { sensor_id: 'b', status: 'trusted' }),
    ]
    const { steps } = buildSteps(events, { routine: false })
    expect(steps[0].tone).toBe('warn')
    expect(needsAttention(steps).map((s) => s.title)).toEqual(["The Brain's thinking failed", 'Guardian judged a: not trusted'])
  })

  it('filters by layer, problems, incident and words', () => {
    const { steps } = buildSteps(
      [ev('twin', 'sim_incident', { accident_kind: 'car_car' }), ev('guardian', 'verdict_issued', { sensor_id: 'a', status: 'untrusted' }), ev('city_brain', 'incident_reported', { type: 'accident' }, 'inc-0001 accident'), ev('city_brain', 'action.blocked', { check: 'evidence', reason: 'r', would_have: 'dispatch_unit' }, 'inc-0001')],
      { routine: false },
    )
    expect(incidentsIn(steps)).toEqual(['inc-0001'])
    expect(applyFilters(steps, { ...everything(), problemsOnly: true }).map((s) => s.kind)).toEqual(['verdict_issued', 'action.blocked'])
    expect(applyFilters(steps, { ...everything(), incident: 'inc-0001' })).toHaveLength(2)
    expect(applyFilters(steps, { ...everything(), truth: false }).some((s) => s.truth)).toBe(false)
    expect(applyFilters(steps, { ...everything(), search: 'crashed' }).map((s) => s.kind)).toEqual(['sim_incident'])
    const noBrain = applyFilters(steps, { ...everything(), layers: new Set(['twin']) })
    expect(noBrain.map((s) => s.kind)).toEqual(['sim_incident'])
  })

  it('keeps a layer\'s steps that are said to it', () => {
    const { steps } = buildSteps([ev('guardian', 'verdict_issued', { sensor_id: 'a', status: 'trusted' })], { routine: false })
    expect(applyFilters(steps, { ...everything(), layers: new Set(['city_brain']) })).toHaveLength(1)
  })
})

describe('time', () => {
  it('reads seconds from the first event', () => {
    expect(relative(12.34)).toBe('+12.3 s')
    expect(relative(-1)).toBe('-1.0 s')
    expect(relative(185)).toBe('+3 min 5 s')
  })
})
