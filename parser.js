// data
// so much guesswork T.T

const skill_delay = // milliseconds between cast and hit
  { "Lava Font": 0
  , "Pyroclastic Blast": 1000
  , "Eruption": 200
  , "Primordial Stance": 1300
  , "Lightning Storm": 800
  , "Fireball": 0
  , "Stoning": 0
  , "Lightning Swing": 750
  , "Static Swing": 1000
  , "Thunderclap": 1500
  , "Flame Burst": 500
  , "Firestorm": 1000
  }

const skill_threshold = // milliseconds between duration and minimal cooldown
  { "Lava Font": 4400
  , "Meteor Shower": 11000
  , "Lightning Hammer Storm": 5000
  , "Lightning Storm": 11000
  , "Firestorm": 11000
  , "Fire Attunement": 1000
  , "Air Attunement": 1000
  , "Water Attunement": 1000
  , "Earth Attunement": 1000
  , "Lightning Swing": 1000
  , "Static Swing": 1000
  , "Thunderclap": 1000
  , "Primordial Stance": 1000
  , "Flame Burst": 1000
  , "Plasma Blast": 3000
  , "Pyroclastic Blast": 8000
  , "Fireball": 650
  , "Stoning": 500
  , "Flame Wave": 1350
  , "Conjure Fiery Greatsword": 3000
  , "Conjure Lightning Hammer": 3000
  , "Lightning Surge": 3000
  , "Fiery Rush": 5000
  , "Eruption": 5000
  }

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
  ,"Fire Shield"
  ,"Conjure Lightning Attributes"
  ,"Conjure Fire Attributes"
  // these autos mess timestamps up
  ,"Fireball"
  ,"Stoning"
  ,"Chain Lightning"
  ,"Flame Wave"
  ]

const skill_activation_only = // ignore hits not from activation
  [ "Primordial Stance"
  , "Air Attunement"
  , "Fire Attunement"
  , "Earth Attunement"
  , "Water Attunement"
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
  const filtered_events = filter_events(events, skills.skills)
  const no_double_attune = remove_previous_attunement(filtered_events)
  const adjusted_events = adjust_by_cast_time(no_double_attune)
  const sorted_events = sort_by_time(adjusted_events)
  const relativized_events = relativize_time(sorted_events)
  const agent_by_addr = index_agents(agents.agents)
  const named_events = name_agents(relativized_events, agent_by_addr)
  report = named_events
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
  // idea: specify fields & field sizes by prototype object
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
  var name = decoder.decode(name_bytes.slice(0, nullterminator))
  if (id === 5725)
    name = "Lightning Hammer Storm"
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

function filter_events(events, skills) {
  const result = []
  const last_hit_by_name = {}
  var last_time = null
  var last_skill = null
  for (var i in events) {
    const e = events[i]
    const skill_name = skills[e.skill_id]

    const should_skip =
      !skill_name ||
      skill_name.length <= 0 ||
      ignored_skills.indexOf(skill_name) >= 0 ||
      skill_activation_only.indexOf(skill_name) >= 0 && e.is_activation === 0 ||
      is_repeated_hit(skill_name, e.time, last_hit_by_name)

    last_time = e.time
    last_skill = skill_name

    if (should_skip)
      continue

    result.push({
      time: e.time,
      skill: skill_name,
      agent: e.src_agent,
    })
  }
  return result
}

function is_repeated_hit(skill_name, time, last_hit_by_name) {
  const last_hit = last_hit_by_name[skill_name]
  const threshold = skill_threshold[skill_name]
  const is_repeated = last_hit && threshold && threshold > time - last_hit
  if (!is_repeated)
    last_hit_by_name[skill_name] = time
  return is_repeated
}

function remove_previous_attunement(events) {
  const result = []
  for (var i = 0; i < events.length; ++i) {
    const is_previous_attunement =
      events[i].skill.endsWith('Attunement') &&
      i + 1 < events.length &&
      events[i + 1].skill.endsWith('Attunement')

    if (!is_previous_attunement)
      result.push(events[i])
  }
  return result
}

function adjust_by_cast_time(events) {
  var first_eruption = true
  var first_lavafont = true
  for (var i in events) {
    var delay = skill_delay[events[i].skill] || 0
    if (first_eruption && events[i].skill === 'Eruption') {
      delay += 4000
      first_eruption = false
    }
    if (first_lavafont && events[i].skill === 'Lava Font') {
      delay += 1000
      first_lavafont = false
    }
    events[i].hit_time = events[i].time
    events[i].time = events[i].time - delay
  }
  return events
}

function sort_by_time(events) {
  return events.sort(function(e1, e2) {
    return e1.time - e2.time
  })
}

function relativize_time(events) {
  if (events.length <= 0)
    return events
  const start_time = events[0].time
  for (var i in events) {
    events[i].time -= start_time
    events[i].hit_time -= start_time
  }
  return events
}

function index_agents(agents) {
  const result = {}
  for (var i in agents) {
    const a = agents[i]
    result[a.addr] = a.name
  }
  return result
}

function name_agents(events, agent_by_addr) {
  for (var i in events) {
    events[i].agent = agent_by_addr[events[i].agent]
  }
  return events
}
