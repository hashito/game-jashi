// The speaker card does not own a speech queue or advance the simulation. The
// controller supplies the remaining time, and explicitly pauses while reading.
// Keeping identity separate from prose also makes old saved dialogue readable.
const SHUJI_PORTRAIT = 'assets/portraits/shuji-v4.webp';

export function speakerProfile(line = {}) {
  const speaker = typeof line.speaker === 'string' ? line.speaker : '記録';
  let profile;
  if (/修司/.test(speaker)) {
    const remote = /無線/.test(speaker) || /無線|混信/.test(line.channel || '');
    const location = line.beat === 'encounter' || line.beat === 'shutter' ? '林道へ移動中'
      : line.beat === 'radioTuned' ? '林道・倒木の手前'
        : line.beat === 'gate' ? '麓・管理棟へ移動中'
          : line.beat === 'engine' ? '麓・管理棟' : '林道・下山路';
    profile = {
      id: 'shuji', name: '修司', role: '叔父', channel: remote ? '無線' : '対面',
      location: remote ? location : '別荘・二階', portrait: SHUJI_PORTRAIT,
      alt: '叔父の修司。作業着を着た五十代の男性', icon: 'person',
    };
  } else if (speaker === '私' || speaker === 'あなた') {
    profile = {
      id: 'player', name: '私', role: 'あなた', channel: '私の声',
      location: 'DVカメラを持つ手元', portrait: '', alt: '', icon: 'camera',
    };
  } else if (/受話器|電話|不明/.test(speaker)) {
    profile = {
      id: 'unknown', name: speaker, role: '声だけが聞こえる', channel: '携帯電話',
      location: '発信元不明', portrait: '', alt: '', icon: 'phone',
    };
  } else {
    profile = {
      id: 'record', name: speaker, role: '記録された声', channel: '記録',
      location: '所在不明', portrait: '', alt: '', icon: 'camera',
    };
  }
  return {
    ...profile,
    ...(typeof line.channel === 'string' && line.channel ? { channel: line.channel } : {}),
    ...(typeof line.location === 'string' && line.location ? { location: line.location } : {}),
  };
}

// Japanese dialogue is measured in visible characters, including punctuation.
// A brief line is still held for six seconds; a longer line gets reading room.
export function dialogueDuration(line = {}) {
  const length = Array.from(typeof line.text === 'string' ? line.text : '').length;
  return Math.min(14, 6 + Math.max(0, length - 20) * .105);
}

export function createDialogueView(doc) {
  const ids = {
    card: 'subtitle', portrait: 'subtitle-portrait', figure: 'subtitle-figure',
    speaker: 'subtitle-speaker', role: 'subtitle-role', channel: 'subtitle-channel',
    location: 'subtitle-location', text: 'subtitle-text', previous: 'subtitle-previous',
    previousSpeaker: 'subtitle-previous-speaker', previousText: 'subtitle-previous-text',
    progress: 'subtitle-progress', count: 'subtitle-count', state: 'subtitle-state',
    next: 'subtitle-next', hold: 'subtitle-hold', holdLabel: 'subtitle-hold-label',
    nextLabel: 'subtitle-next-label',
  };
  const elements = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, doc.getElementById(id)]));
  let current = null, total = 6, queued = 0, manual = false, paused = false;
  const text = (key, value) => { if (elements[key] && elements[key].textContent !== value) elements[key].textContent = value; };
  elements.portrait?.addEventListener?.('error', () => {
    elements.portrait.hidden = true;
    if (elements.figure) elements.figure.dataset.hasPortrait = 'false';
  });

  function tick(remaining, options = {}) {
    manual = options.manual ?? options.manualHold ?? manual;
    paused = options.paused ?? paused;
    if (Number.isFinite(options.queued)) queued = Math.max(0, Math.floor(options.queued));
    const fraction = Math.max(0, Math.min(1, (Number.isFinite(remaining) ? remaining : 0) / total));
    if (elements.progress) {
      elements.progress.style.width = `${fraction * 100}%`;
      elements.progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    }
    const held = !!(manual || paused);
    if (elements.card) elements.card.dataset.held = String(held);
    text('state', held ? '読む間、進行を停止' : '自動送り');
    text('count', queued ? `続き ${queued}` : '会話履歴に記録');
    text('holdLabel', held ? '再開する' : '読む間停止');
    text('nextLabel', queued ? '次へ' : '読み終えた');
    elements.hold?.setAttribute('aria-pressed', String(held));
    elements.hold?.setAttribute('aria-label', held ? '会話とゲームの進行を再開する（T）' : '会話を読む間、ゲームの進行を停止する（T）');
    elements.next?.setAttribute('aria-label', queued ? '次の発言を読む（Enter）' : '読み終えて字幕を閉じる（Enter）');
  }

  function show(line, options = {}) {
    if (!line || typeof line.text !== 'string') { hide(); return; }
    const profile = speakerProfile(line);
    const previous = options.previous ?? current;
    const connected = previous && typeof previous.text === 'string' && previous.text !== line.text &&
      (options.previous || line.beat && previous.beat === line.beat);
    if (elements.previous) elements.previous.hidden = !connected;
    if (connected) {
      text('previousSpeaker', speakerProfile(previous).name);
      text('previousText', previous.text);
    }
    current = { ...line };
    total = Number.isFinite(options.total) && options.total > 0 ? options.total : dialogueDuration(line);
    queued = Math.max(0, Math.floor(options.queued || 0));
    manual = !!(options.manual ?? options.manualHold);
    paused = !!options.paused;
    text('speaker', profile.name);
    text('role', profile.role);
    text('channel', profile.channel);
    text('location', profile.location);
    text('text', line.text);
    if (elements.card) {
      elements.card.dataset.speaker = profile.id;
      elements.card.hidden = false;
    }
    if (elements.figure) {
      elements.figure.dataset.icon = profile.icon;
      elements.figure.dataset.hasPortrait = String(!!profile.portrait);
    }
    if (elements.portrait) {
      elements.portrait.hidden = !profile.portrait;
      if (profile.portrait) elements.portrait.src = profile.portrait;
      elements.portrait.alt = profile.alt;
    }
    tick(options.remaining ?? total, options);
  }

  function hide() {
    if (elements.card) elements.card.hidden = true;
    current = null;
    manual = false;
    paused = false;
  }

  return { show, tick, hide };
}

// v4.0.2: the speech queue no longer grows without limit. Each line carries a
// kind. Story-critical lines (the uncle's plan, discoveries, the phone) are
// never dropped. Context lines (a place, an item just read) belong to where
// they were triggered and expire once the player has walked away or they are
// too old. Ambient reactions (the creature turned, it is listening) only make
// sense for a few seconds. Dropped context lines are still kept in the log.
export const SPEECH_RULES = Object.freeze({ maxPending: 2, ambientTtl: 6, contextTtl: 24, contextRadius: 14, catchUpPending: 2, catchUpScale: .6, catchUpMin: 3.5 });
const AMBIENT_BEATS = new Set(['enemyTurn', 'enemySearch', 'enemyCrawl', 'enemyListen', 'firstAttack', 'repel', 'stamina']);
const CONTEXT_BEATS = new Set(['bridge', 'nearCabin', 'bell', 'shutter', 'earlyGlasses', 'earlyNote', 'earlyBottle', 'earlyCrank']);
const KINDS = new Set(['critical', 'context', 'ambient']);

export function speechKind(line = {}) {
  if (KINDS.has(line.kind)) return line.kind;
  if (typeof line.beat === 'string') return AMBIENT_BEATS.has(line.beat) ? 'ambient' : CONTEXT_BEATS.has(line.beat) ? 'context' : 'critical';
  return 'context';
}

/** Stamps lines with their kind, the game time and the place they were triggered. */
export function tagSpeech(lines = [], { time = 0, origin = null, radius } = {}) {
  return lines.map(line => {
    const kind = speechKind(line), tagged = { ...line, kind, at: Number.isFinite(line.at) ? line.at : time };
    if (kind === 'context' && origin && !line.origin) tagged.origin = { x: origin.x, z: origin.z, level: origin.level || 0 };
    if (Number.isFinite(radius) && !Number.isFinite(line.radius)) tagged.radius = radius;
    return tagged;
  });
}

function stale(line, time, player) {
  const kind = speechKind(line), age = time - (Number.isFinite(line.at) ? line.at : time);
  if (kind === 'ambient') return age > (line.ttl ?? SPEECH_RULES.ambientTtl) ? 'expired' : null;
  if (kind !== 'context') return null;
  if (age > (line.ttl ?? SPEECH_RULES.contextTtl)) return 'expired';
  const o = line.origin;
  if (o && player && ((o.level || 0) !== (player.level || 0) || Math.hypot(player.x - o.x, player.z - o.z) > (line.radius ?? SPEECH_RULES.contextRadius))) return 'left';
  return null;
}

/**
 * Removes stale lines and caps the backlog. Returns the kept queue and the
 * dropped lines with a reason. Critical lines are never dropped and do not count
 * toward the cap; at most maxPending place/ambient lines wait (reactions go first).
 */
export function pruneSpeechQueue(queue = [], { time = 0, player = null, maxPending = SPEECH_RULES.maxPending } = {}) {
  const kept = [], dropped = [];
  for (const line of queue) {
    const reason = stale(line, time, player);
    if (reason) dropped.push({ line, reason }); else kept.push(line);
  }
  while (kept.filter(line => speechKind(line) !== 'critical').length > maxPending) {
    // Reactions go before place lines; within a kind, the oldest goes first.
    const ambient = kept.findIndex(line => speechKind(line) === 'ambient');
    const index = ambient >= 0 ? ambient : kept.findIndex(line => speechKind(line) !== 'critical');
    dropped.push({ line: kept.splice(index, 1)[0], reason: 'backlog' });
  }
  return { queue: kept, dropped };
}

/** Adds lines to the queue. A priority line goes first and supersedes waiting non-critical lines. */
export function enqueueSpeechLines(queue = [], lines = [], { priority = false, interrupted = null } = {}) {
  const pendingTexts = new Set(queue.map(line => line.text));
  const fresh = lines.filter(line => !pendingTexts.has(line.text));
  if (!priority) return { queue: [...queue, ...fresh], dropped: [] };
  const dropped = [], kept = [];
  for (const line of queue) (speechKind(line) === 'critical' ? kept : dropped).push(line);
  const resumed = interrupted && speechKind(interrupted) === 'critical' ? [{ ...interrupted, logged: true }] : [];
  return { queue: [...fresh, ...resumed, ...kept], dropped: dropped.map(line => ({ line, reason: 'superseded' })) };
}

/** Display time, shortened while a backlog is waiting so the player catches up. */
export function speechDuration(line = {}, pending = 0) {
  const base = dialogueDuration(line);
  return pending >= SPEECH_RULES.catchUpPending ? Math.max(SPEECH_RULES.catchUpMin, base * SPEECH_RULES.catchUpScale) : base;
}
