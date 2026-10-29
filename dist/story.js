import { DOCUMENTS, LORE, CHAINS, DIALOGUE } from './narrative.js';

// This module exposes only what has actually been observed. The camera records
// each object's surfaces on discovery; later pages are the protagonist's review
// of those frames, not writing that magically appears on a physical prop.
export const STORY_STAGES = Object.freeze([
  { id: 'upstairs', chapter: '一 / 二階の備品', title: '二階のベランダで、望遠鏡を確かめる' },
  { id: 'witnessed', chapter: '二 / 窓の向こう', title: '窓から離れ、階段を下りる' },
  { id: 'downstairs', chapter: '三 / 一階の机', title: '机の無線を調整し、修司の声を拾う' },
  { id: 'preparing', chapter: '四 / 帰る支度', title: '手元の記録から、次の行き先を探す' },
  { id: 'evidence', chapter: '五 / 山道の記録', title: '小屋を調べ、帰るための道具を揃える' },
  { id: 'pursuit', chapter: '六 / 戻る道', title: '足音を避け、駐車場へ戻る' },
  { id: 'exit', chapter: '七 / 最後の数秒', title: '車を始動して、山を下りる' },
]);

const RECORDS = { ...DOCUMENTS, ...LORE };
const RECORD_IDS = Object.keys(RECORDS);
const EVENT_IDS = new Set(['opening', 'sighting', 'downstairs', 'shutter', 'radioTuned', 'bell', 'glasses', 'note', 'bottle', 'bridge', 'crank', 'gate', 'phone', 'firstAttack', 'repel', 'engine', 'nearCabin', 'enemyTurn', 'enemySearch', 'enemyCrawl', 'enemyListen', 'trail']);
const EARLY_TITLES = {
  boots: '物置の長靴', ledger: '古い作業日誌', cassette: '古いカセットケース',
  mirror: '伏せられた手鏡', ribbon: '橋の赤い紐', toy: '布袋に入った鈴',
  tag: '枝の作業札', photo: '古い写真の封筒',
};
const integer = value => Number.isFinite(+value) ? Math.floor(+value) : 0;
const entries = value => Array.isArray(value) ? value : value && typeof value !== 'string' && typeof value[Symbol.iterator] === 'function' ? [...value] : [];
const mapRevisions = input => Object.fromEntries(RECORD_IDS.flatMap(id => {
  const value = integer(input?.[id]);
  return value > 0 ? [[id, Math.min(3, value)]] : [];
}));
const foundSet = context => new Set([
  ...entries(context?.collected),
  ...Object.keys(context?.flags || {}).filter(id => context.flags[id] === true),
]);

export function createStoryState(saved = null) {
  return {
    stage: Math.max(0, Math.min(STORY_STAGES.length - 1, integer(saved?.stage))),
    events: [...new Set(entries(saved?.events).filter(id => typeof id === 'string' && (EVENT_IDS.has(id) || id.startsWith('collect:') && RECORDS[id.slice(8)])))],
    delivered: [...new Set(entries(saved?.delivered).filter(key => typeof key === 'string' && DIALOGUE[key]))],
    readRevisions: mapRevisions(saved?.readRevisions),
    notifiedRevisions: mapRevisions(saved?.notifiedRevisions),
  };
}

function observedStage(state, context = {}) {
  const flags = context.flags || {}, events = new Set(state.events), found = foundSet(context);
  if (!flags.seen && !events.has('sighting')) return 0;
  if (!events.has('downstairs')) return 1;
  // A new run must actually hear the uncle's location and plan before equipment
  // advances the story. Absent flags preserve pre-tuner saves and rule clients.
  if (flags.radioTuned === false) return 2;
  if (flags.gate || events.has('gate')) return 6;
  if (flags.crank || events.has('crank')) return 5;
  if (flags.bottle || events.has('bottle') || events.has('bridge') || found.has('photo') || Object.keys(LORE).filter(id => found.has(id)).length >= 2) return 4;
  if (flags.glasses || flags.note || events.has('glasses') || events.has('note')) return 3;
  return 2;
}

function evidenceRevision(id, context, state) {
  const found = foundSet(context), stage = state?.stage || 0;
  if (!found.has(id)) return 0;
  if (['bottle', 'crank'].includes(id)) return stage >= 4 ? 3 : stage >= 2 ? 2 : 1;
  if (id === 'note') {
    const linked = ['boots', 'ledger', 'tag'].filter(key => found.has(key)).length;
    return stage >= 4 && linked >= 2 ? 3 : stage >= 3 ? 2 : 1;
  }
  const chain = Object.values(CHAINS).find(group => group.ids.includes(id));
  const peers = chain?.ids.filter(key => key !== id && found.has(key)).length || 0;
  const complete = chain && chain.ids.every(key => found.has(key));
  if (stage >= 4 && complete || stage >= 5) return 3;
  if (stage >= 3 && peers > 0 || stage >= 4) return 2;
  return 1;
}

export function getStoryDocument(id, context = {}, state = createStoryState()) {
  const source = RECORDS[id];
  if (!source) return null;
  const revision = evidenceRevision(id, context, state);
  if (revision === 0) return null;
  // Required equipment always explains its physical use on the first page.
  const initial = ['note', 'crank'].includes(id) ? 2 : 1;
  const count = revision === 1 ? initial : revision === 2 ? Math.min(source.paragraphs.length, initial + 1) : source.paragraphs.length;
  const previous = Math.max(0, state.readRevisions?.[id] || 0);
  const oldCount = previous === 0 ? 0 : previous === 1 ? initial : previous === 2 ? Math.min(source.paragraphs.length, initial + 1) : source.paragraphs.length;
  return {
    ...source,
    title: revision === 1 ? EARLY_TITLES[id] || source.title : source.title,
    image: (state.stage || 0) >= 1 ? source.image : undefined,
    paragraphs: source.paragraphs.slice(0, count),
    additions: previous > 0 && count > oldCount ? [{ heading: '撮影した記録を見返して、追記', paragraphs: source.paragraphs.slice(oldCount, count) }] : [],
    revision,
    pending: count < source.paragraphs.length,
    unread: previous > 0 && revision > previous,
    after: (state.stage || 0) >= 2 && context.flags?.radioTuned !== false ? source.after || [] : [{ speaker: '私', text: '向きを変えずに撮っておく。細かい字は、後で記録を見返そう。' }],
  };
}

export function markStoryRead(state, id, revision) {
  if (!RECORDS[id]) return;
  const value = Math.max(0, Math.min(3, integer(revision)));
  state.readRevisions[id] = Math.max(state.readRevisions[id] || 0, value);
  state.notifiedRevisions[id] = Math.max(state.notifiedRevisions[id] || 0, value);
}

export function canCompleteStoryChain(id, context = {}, state = createStoryState()) {
  const chain = CHAINS[id];
  if (!chain || state.stage < 4) return false;
  const found = foundSet(context);
  return chain.ids.every(key => found.has(key) && evidenceRevision(key, context, state) === 3);
}

const CORE_BEATS = [
  { key: 'encounter', stage: 1, ready: (state, ctx) => state.events.includes('sighting') || !!ctx.flags?.seen },
  { key: 'downstairs', stage: 2, ready: state => state.events.includes('downstairs') },
  { key: 'radioTuned', stage: 2, ready: state => state.events.includes('radioTuned') },
  { key: 'glasses', stage: 3, ready: (state, ctx) => !!ctx.flags?.glasses || state.events.includes('glasses') },
  { key: 'note', stage: 3, ready: (state, ctx) => !!ctx.flags?.note || state.events.includes('note') },
  { key: 'bottle', stage: 4, ready: (state, ctx) => !!ctx.flags?.bottle || state.events.includes('bottle') },
  { key: 'bridge', stage: 4, ready: state => state.events.includes('bridge') },
  { key: 'crank', stage: 5, ready: (state, ctx) => !!ctx.flags?.crank || state.events.includes('crank') },
  { key: 'gate', stage: 6, ready: (state, ctx) => !!ctx.flags?.gate || state.events.includes('gate') },
];
const EARLY_BEATS = { glasses: 'earlyGlasses', note: 'earlyNote', bottle: 'earlyBottle', crank: 'earlyCrank' };
const URGENT_BEATS = new Set(['firstAttack', 'repel', 'engine', 'phone', 'nearCabin', 'enemyTurn', 'enemySearch', 'enemyCrawl', 'enemyListen', 'shutter', 'bell']);
function pendingCore(state, context) {
  return CORE_BEATS.find(beat => beat.stage <= state.stage && beat.ready(state, context) && !state.delivered.includes(beat.key))?.key || null;
}
function takeDialogue(state, key) {
  if (!key || !DIALOGUE[key] || state.delivered.includes(key)) return null;
  state.delivered.push(key);
  return key;
}

export function advanceStory(state, event, context = {}) {
  if (!state.delivered) state.delivered = [];
  const known = EVENT_IDS.has(event) || typeof event === 'string' && event.startsWith('collect:') && !!RECORDS[event.slice(8)];
  const first = known && !state.events.includes(event);
  if (first) state.events.push(event);
  const before = state.stage;
  const pending = pendingCore(state, context);
  const progressEvent = event === '_progress';
  const observedEvent = first && (['sighting', 'downstairs', 'glasses', 'note', 'bottle', 'bridge', 'crank', 'gate'].includes(event) || event.startsWith('collect:'));
  // Pre-collected equipment records knowledge, but never jumps over a floor or
  // several story beats. The caller advances _progress only in quiet intervals.
  if ((progressEvent && !pending) || observedEvent) {
    state.stage = Math.max(state.stage, Math.min(state.stage + 1, observedStage(state, context)));
  }
  let dialogueKey = null;
  if (first && event === 'opening') dialogueKey = takeDialogue(state, 'opening');
  else if (first && EARLY_BEATS[event] && state.stage < 2) dialogueKey = takeDialogue(state, EARLY_BEATS[event]);
  else if (first && URGENT_BEATS.has(event) && state.stage >= 1) dialogueKey = takeDialogue(state, event);
  else if (first && event === 'radioTuned' && state.stage >= 2) dialogueKey = takeDialogue(state, pendingCore(state, context));
  else if (first && event === 'trail' && state.stage >= 3) dialogueKey = takeDialogue(state, 'trail');
  else if (progressEvent || observedEvent) {
    dialogueKey = takeDialogue(state, pendingCore(state, context));
    if (!dialogueKey && state.stage !== before) {
      if (state.stage === 3) dialogueKey = takeDialogue(state, 'preparing');
      if (state.stage === 4) dialogueKey = takeDialogue(state, 'records');
    }
  }
  const updates = [];
  for (const id of RECORD_IDS) {
    const read = state.readRevisions[id] || 0;
    if (!read) continue;
    const revision = evidenceRevision(id, context, state);
    if (revision > Math.max(read, state.notifiedRevisions[id] || 0)) {
      state.notifiedRevisions[id] = revision;
      updates.push({ id, title: RECORDS[id].title, revision });
    }
  }
  return { stage: state.stage, stageChanged: before !== state.stage, dialogueKey, updates };
}
