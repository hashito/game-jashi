import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { speakerProfile, dialogueDuration, createDialogueView } from '../dist/dialogue.js';
import { DIALOGUE } from '../dist/narrative.js';

// Read the shipped IDs, so a renamed or omitted view element is observable.
const markup = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
function documentHarness() {
  const nodes = new Map();
  for (const match of markup.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="(subtitle[\w-]*)"[^>]*)>/gi)) {
    const [, tag, attributes, id] = match;
    const node = {
      tagName: tag, textContent: '', hidden: /\bhidden\b/.test(attributes),
      dataset: {}, style: {}, attributes: {}, events: new Map(),
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { this.events.set(name, callback); },
    };
    nodes.set(id, node);
  }
  return { doc: { getElementById: id => nodes.get(id) || null }, node: id => nodes.get(id) };
}

test('the same uncle has a visible identity but different channels and locations in person and over radio', () => {
  const opening = speakerProfile({ ...DIALOGUE.opening[0], beat: 'opening' });
  const remote = speakerProfile({ speaker: '修司（無線）', beat: 'radioTuned' });
  assert.equal(opening.id, 'shuji');
  assert.equal(opening.name, '修司');
  assert.equal(opening.role, '叔父');
  assert.equal(opening.channel, '対面');
  assert.equal(opening.location, '別荘・二階');
  assert.equal(remote.channel, '無線');
  assert.equal(remote.location, '林道・倒木の手前');
  assert.equal(opening.portrait, remote.portrait);
  assert.ok(fs.existsSync(new URL('../dist/' + remote.portrait, import.meta.url)));
  const legacy = speakerProfile({ speaker: '修司（無線）', text: '古い記録からの続き' });
  assert.equal(legacy.channel, '無線');
  assert.notEqual(legacy.location, opening.location);
  assert.equal(speakerProfile({ speaker: '修司（無線）', beat: 'engine' }).location, '麓・管理棟');
});

test('first person and the unexplained telephone never inherit a fictional person portrait', () => {
  const player = speakerProfile({ speaker: '私' });
  const phone = speakerProfile({ speaker: '受話器の声' });
  assert.equal(player.role, 'あなた');
  assert.equal(player.icon, 'camera');
  assert.equal(player.portrait, '');
  assert.equal(phone.channel, '携帯電話');
  assert.equal(phone.location, '発信元不明');
  assert.equal(phone.portrait, '');
  assert.notEqual(player.id, phone.id);
  const interrupted = speakerProfile(DIALOGUE.downstairs[1]);
  assert.equal(interrupted.channel, '無線 / 混信');
});

test('a complete line has a readable minimum duration and longer Japanese text earns more time', () => {
  assert.equal(dialogueDuration({ text: 'ここにいる。' }), 6);
  const long = dialogueDuration({ text: 'あ'.repeat(60) });
  assert.ok(long >= 9 && long <= 12);
  assert.ok(dialogueDuration({ text: 'あ'.repeat(35) }) < long);
  assert.equal(dialogueDuration({ text: 'あ'.repeat(1000) }), 14);
  for (const lines of Object.values(DIALOGUE)) for (const line of lines) assert.ok(dialogueDuration(line) >= 6);
});

test('the actual card shows who, where, and which channel while retaining one connected previous reply', () => {
  const { doc, node } = documentHarness(), view = createDialogueView(doc);
  view.show({ ...DIALOGUE.opening[0], beat: 'opening' }, { remaining: 7, total: 7, queued: 1 });
  assert.equal(node('subtitle').hidden, false);
  assert.equal(node('subtitle-speaker').textContent, '修司');
  assert.equal(node('subtitle-role').textContent, '叔父');
  assert.equal(node('subtitle-channel').textContent, '対面');
  assert.equal(node('subtitle-location').textContent, '別荘・二階');
  assert.equal(node('subtitle-portrait').hidden, false);
  assert.equal(node('subtitle-text').textContent, DIALOGUE.opening[0].text);
  assert.equal(node('subtitle-previous').hidden, true);
  view.show({ ...DIALOGUE.opening[1], beat: 'opening' }, { queued: 0 });
  assert.equal(node('subtitle').dataset.speaker, 'player');
  assert.equal(node('subtitle-portrait').hidden, true);
  assert.equal(node('subtitle-figure').dataset.icon, 'camera');
  assert.equal(node('subtitle-previous').hidden, false);
  assert.equal(node('subtitle-previous-speaker').textContent, '修司');
  assert.equal(node('subtitle-previous-text').textContent, DIALOGUE.opening[0].text);
  view.show({ ...DIALOGUE.encounter[0], beat: 'encounter' });
  assert.equal(node('subtitle-previous').hidden, true, 'an earlier conversation must not appear to answer this one');
});

test('reading pause is explicit, progress is bounded, and a paused tick never changes the displayed utterance', () => {
  const { doc, node } = documentHarness(), view = createDialogueView(doc);
  const line = { ...DIALOGUE.radioTuned[0], beat: 'radioTuned' };
  view.show(line, { remaining: 5, total: 10, queued: 2, manualHold: true });
  assert.equal(node('subtitle-progress').style.width, '50%');
  assert.equal(node('subtitle-hold').attributes['aria-pressed'], 'true');
  assert.match(node('subtitle-state').textContent, /進行を停止/);
  assert.equal(node('subtitle-hold-label').textContent, '再開する');
  assert.equal(node('subtitle-count').textContent, '続き 2');
  view.tick(5, { paused: true });
  assert.equal(node('subtitle-text').textContent, line.text);
  assert.equal(node('subtitle-progress').style.width, '50%');
  view.tick(25, { paused: false, manual: false });
  assert.equal(node('subtitle-progress').style.width, '100%');
  assert.equal(node('subtitle-hold').attributes['aria-pressed'], 'false');
  view.tick(-2, { queued: 0 });
  assert.equal(node('subtitle-progress').style.width, '0%');
  assert.equal(node('subtitle-next-label').textContent, '読み終えた');
  assert.equal(node('subtitle').hidden, false, 'only the controller may advance or dismiss a line');
});

test('portrait failure and a later conversation do not leak the previous speaker or unfinished context', () => {
  const { doc, node } = documentHarness(), view = createDialogueView(doc);
  view.show({ speaker: '修司（無線）', text: '聞こえるか。', beat: 'radioTuned' });
  node('subtitle-portrait').events.get('error')();
  assert.equal(node('subtitle-portrait').hidden, true);
  assert.equal(node('subtitle-figure').dataset.hasPortrait, 'false');
  assert.equal(node('subtitle-speaker').textContent, '修司');
  view.hide();
  assert.equal(node('subtitle').hidden, true);
  view.show({ speaker: '受話器の声', text: '<script>声</script>', beat: 'phone' });
  assert.equal(node('subtitle-previous').hidden, true);
  assert.equal(node('subtitle-channel').textContent, '携帯電話');
  assert.equal(node('subtitle-text').textContent, '<script>声</script>');
  assert.equal(node('subtitle-portrait').hidden, true);
  assert.equal(node('subtitle-figure').dataset.icon, 'phone');
});
