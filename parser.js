// data
// so much guesswork T.T

const expected_evtc_version = "EVTC20180109"
const ignored_skills =
  ["0"
  ,"Protection"
  ,"Swiftness"
  ,"Blinded"
  ,"Chilled"
  ,"Poisoned"
  ,"Fury"
  ,"Vigor"
  ,"Bleeding"
  ,"Burning"
  ,"Might"
  ,"Confusion"
  ,"Torment"
  ,"Slow"
  ,"38134"
  ,"40926"
  ,"41692"
  ,"42756"
  ,"42811"
  ,"43229"
  ,"43470"
  ,"43740"
  ,"44822"
  ,"45162"
  ,"Lesser Fiery Eruption"
  ,"Elements of Rage"
  ,"Lightning Strike"
  ]

// request

const pageurl = new URL(window.location.href)
const qparam = pageurl.searchParams.get('q')
const logurl = 'logs/' + qparam
const logrequest = new XMLHttpRequest()
logrequest.open('GET', logurl, true)
logrequest.responseType = 'arraybuffer'

// global variables

var logbytes
var header
var agents
var skills
var events
var report

// execution

logrequest.onload = function (logevent) {
  logbytes = new Uint8Array(logrequest.response)
  main(logbytes)
}

if (qparam) {
  logrequest.send()
}

function main(logbytes) {
  header = parse_header(logbytes)
  agents = parse_agents(logbytes, 16)
  skills = parse_skills(logbytes, agents.next_block)
  events = parse_events(logbytes, skills.next_block)
  report = process_events(events, skills.skills)
}

// toolbox

const decoder = new TextDecoder("utf-8")

function to_int(input_array, start, end) {
  var bytearray = input_array
  if (start && end) {
    bytearray = bytearray.slice(start, end)
  }
  if (bytearray.length <= 0)
    return 0
  else if (bytearray.length === 1)
    return bytearray[0]
  else {
    const index = bytearray.length - 1
    const exp = 8 * index
    return (bytearray[index] << exp) + to_int(bytearray.slice(0, -1))
  }
}

function get_nullterminator(bytes, start) {
  const index = bytes.indexOf(0, start)
  return index < 0 ? bytes.length : index
}

// parser logic

function parse_header(logbytes) {
  const headerbytes = logbytes.slice(0, 16)
  const versionbytes = headerbytes.slice(0, 12)
  const evtc_version = decoder.decode(versionbytes)
  const target_species_id = to_int(headerbytes.slice(13, 15))
  return {
    evtc_version: evtc_version,
    target_species_id: target_species_id, // what is this?
  }
}

function parse_agents(logbytes, start) {
  const table_start = start + 4
  const agent_count = to_int(logbytes, start, start + 4)
  const bytes_per_agent = 32 + 64 // xxd ._.
  const next_block = table_start + bytes_per_agent * agent_count
  const agents = []
  for (i = table_start; i < next_block; i += bytes_per_agent)
    agents.push(parse_agent(logbytes, i))
  return {
    agent_count: agent_count,
    next_block: next_block,
    agents: agents,
  }
}

function parse_agent(logbytes, start) {
  // TODO: make fields & field sizes configurable
  var i = start;
  const name_length_guess = 68 // xxd ._.
  const addr = to_int(logbytes, i, i += 8)
  const prof = to_int(logbytes, i, i += 4)
  const is_elite = to_int(logbytes, i, i += 4)
  const toughness = to_int(logbytes, i, i += 2)
  const concentration = to_int(logbytes, i, i += 2)
  const healing = to_int(logbytes, i, i += 2)
  const pad1 = to_int(logbytes, i, i += 2)
  const condition = to_int(logbytes, i, i += 2)
  const pad2 = to_int(logbytes, i, i += 2)
  const namebytes = logbytes.slice(i, i + name_length_guess)
  const nullterminator = get_nullterminator(namebytes)
  const name = decoder.decode(namebytes.slice(0, nullterminator))
  const colon = nullterminator + 1
  const has_account = colon < name_length_guess && namebytes[colon] === 0x3a
  var account = null
  if (has_account) {
    const next_nullterminator = get_nullterminator(namebytes, colon)
    account =
      decoder.decode(namebytes.slice(colon + 1, next_nullterminator))
  }
  return {
    name: name,
    account: account,
    addr: addr,
    prof: prof,
    is_elite: is_elite,
    toughness: toughness,
    concentration: concentration,
    healing: healing,
    condition: condition,
  }
}

function parse_skills(logbytes, start) {
  const table_start = start + 4 // xxd ._.
  const skill_count = to_int(logbytes, start, table_start)
  const bytes_per_skill = 4 + 64
  const next_block = table_start + bytes_per_skill * skill_count
  const skills = {}
  for (i = table_start; i < next_block; i += bytes_per_skill) {
    skill = parse_skill(logbytes, i)
    skills[skill.id] = skill.name
  }
  return {
    skill_count: skill_count,
    next_block: next_block,
    skills: skills
  }
}

function parse_skill(logbytes, start) {
  const namestart = start + 4
  const id_bytes = logbytes.slice(start, namestart)
  const name_bytes = logbytes.slice(namestart, namestart + 64)
  const id = to_int(id_bytes)
  const nullterminator = get_nullterminator(name_bytes)
  const name = decoder.decode(name_bytes.slice(0, nullterminator))
  return {
    id: id,
    name: name,
  }
}

function parse_events(logbytes, start) {
  const events = []
  const bytes_per_event = 64
  for (i = start; i + bytes_per_event <= logbytes.length; i += bytes_per_event)
    events.push(parse_event(logbytes.slice(i, i + bytes_per_event)))
  return events
}

function parse_event(bytes) {
  var i = 0
  const read = function (n) { return to_int(bytes.slice(i, i += n)) }
  const time = read(8)
  const src_agent = read(8)
  const dst_agent = read(8)
  const value = read(4)
  const buff_dmg = read(4)
  const overstack_value = read(2)
  const skill_id = read(2)
  const src_instid = read(2)
  const src_master_instid = read(2)
  const internal_tracking_garbage = read(9)
  const iff = read(1)
  const buff = read(1)
  const result = read(1)
  const is_activation = read(1)
  return {
    time: time,
    skill_id: skill_id,
    is_activation: is_activation,
    buff: buff,
    src_agent: src_agent,
    dst_agent: dst_agent,
    value: value,
    buff_dmg: buff_dmg,
    overstack_value: overstack_value,
    result: result,
  }
}

// processing

function process_events(events, skills) {
  const result = []
  var last_time = null
  var last_skill = null
  for (var i in events) {
    const e = events[i]
    const skill_name = skills[e.skill_id]

    const should_skip =
      !skill_name ||
      skill_name.length <= 0 ||
      ignored_skills.indexOf(skill_name) >= 0 ||
      skill_name === "Primordial Stance" && e.is_activation === 0 ||
      skill_name === last_skill && e.time === last_time

    last_time = e.time
    last_skill = skill_name

    if (should_skip)
      continue

    result.push({
      time: e.time,
      skill: skill_name,
      activation: e.is_activation,
      result: e.result,
    })
  }
  if (result.length <= 0)
    return result
  const start_time = result[0].time
  for (var i in result)
    result[i].time -= start_time
  return result
}
