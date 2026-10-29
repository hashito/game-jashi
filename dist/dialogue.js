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
