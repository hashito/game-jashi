import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { INTRO, TELESCOPE_SCENES, DOCUMENTS, LORE, CHAINS, DIALOGUE, ENDINGS, endingParagraphs } from '../dist/narrative.js';
import { createStoryState, advanceStory, getStoryDocument, markStoryRead, canCompleteStoryChain } from '../dist/story.js';

const context = (flags = {}, collected = []) => ({ flags: { ...flags }, collected: new Set(collected), completed: new Set(), time: 0, level: 1 });
function discover(state, ctx, id) {
  ctx.collected.add(id);
  if (['glasses', 'note', 'bottle', 'crank', 'gate', 'phone'].includes(id)) ctx.flags[id] = true;
  return advanceStory(state, id in LORE || id === 'photo' ? 'collect:' + id : id, ctx);
}
function observeAndDescend(state, ctx) {
  ctx.flags.seen = true;
  advanceStory(state, 'sighting', ctx);
  ctx.level = 0;
  return advanceStory(state, 'downstairs', ctx);
}
function settleStory(state, ctx) {
  const beats = [];
  for (let i = 0; i < 20; i++) {
    const next = advanceStory(state, '_progress', ctx);
    beats.push(next);
    if (!next.stageChanged && !next.dialogueKey) return beats;
  }
  assert.fail('Story should settle after all observed beats have played');
}

test('the opening and telescope reveal an ordinary upstairs task before the eye contact', () => {
  const opening = INTRO.paragraphs.join('');
  assert.match(opening, /二階|ベランダ/);
  assert.doesNotMatch(opening, /一つ目|怪異|邪視|尿|死亡|逃走/);
  assert.equal(TELESCOPE_SCENES.length, 3);
  const duration = TELESCOPE_SCENES.reduce((sum, beat) => sum + beat.duration, 0);
  assert.ok(duration >= 15 && duration <= 20);
  assert.doesNotMatch(TELESCOPE_SCENES[0].paragraphs.join(''), /縦の目|邪視/);
  assert.match(TELESCOPE_SCENES[2].paragraphs.join(''), /顔|頭/);
});

test('equipment collected before the encounter gives no supernatural instruction or stage skip', () => {
  const state = createStoryState(), ctx = context();
  for (const [id, key] of [['glasses', 'earlyGlasses'], ['note', 'earlyNote'], ['bottle', 'earlyBottle'], ['crank', 'earlyCrank']]) {
    const result = discover(state, ctx, id);
    assert.equal(result.dialogueKey, key);
    assert.equal(result.stage, 0);
    assert.ok(DIALOGUE[key].length);
  }
  assert.equal(getStoryDocument('bottle', ctx, state).paragraphs.length, 1);
  const sighting = advanceStory(state, 'sighting', { ...ctx, flags: { ...ctx.flags, seen: true } });
  assert.equal(sighting.stage, 1, 'having every tool must not skip the upstairs reveal');
});

test('the encounter does not reveal the downstairs instruction until the player actually descends', () => {
  const state = createStoryState(), ctx = context();
  assert.equal(advanceStory(state, 'opening', ctx).dialogueKey, 'opening');
  ctx.flags.seen = true;
  assert.equal(advanceStory(state, 'sighting', ctx).dialogueKey, 'encounter');
  assert.equal(state.stage, 1);
  assert.equal(advanceStory(state, 'refresh', ctx).stage, 1);
  ctx.level = 0;
  const next = advanceStory(state, 'downstairs', ctx);
  assert.equal(next.stage, 2);
  assert.equal(next.dialogueKey, 'downstairs');
  assert.equal(advanceStory(state, 'downstairs', ctx).dialogueKey, null, 'the same arrival is not repeated');
});

test('pre-collected equipment is explained in order over quiet intervals, including after a reload', () => {
  let state = createStoryState();
  const ctx = context();
  for (const id of ['crank', 'bottle', 'note', 'glasses']) discover(state, ctx, id);
  ctx.flags.seen = true;
  const sighting = advanceStory(state, 'sighting', ctx);
  assert.deepEqual([sighting.stage, sighting.dialogueKey], [1, 'encounter']);
  ctx.level = 0;
  const downstairs = advanceStory(state, 'downstairs', ctx);
  assert.equal(downstairs.stage, 2, 'the first descent never jumps over the desk scene');
  assert.equal(downstairs.dialogueKey, 'downstairs');
  assert.equal(advanceStory(state, 'refresh', ctx).stage, 2, 'journal refresh does not advance a chapter');
  assert.equal(advanceStory(state, 'crank', ctx).stage, 2, 'repeated interactions do not rush the story');
  for (const [stage, key] of [[3, 'glasses'], [3, 'note'], [4, 'bottle'], [5, 'crank']]) {
    const next = advanceStory(state, '_progress', ctx);
    assert.equal(next.stage, stage);
    assert.equal(next.dialogueKey, key);
    state = createStoryState(JSON.parse(JSON.stringify(state)));
  }
  assert.equal(advanceStory(state, '_progress', ctx).dialogueKey, null, 'all deferred equipment lines are one-shot');
  const gate = discover(state, ctx, 'gate');
  assert.equal(gate.stage, 6);
  assert.equal(gate.dialogueKey, 'gate');
});

test('new evidence revises a previously read prop once and preserves an unread addition', () => {
  const state = createStoryState(), ctx = context();
  observeAndDescend(state, ctx);
  discover(state, ctx, 'glasses');
  discover(state, ctx, 'boots');
  const initial = getStoryDocument('boots', ctx, state);
  assert.equal(initial.revision, 1);
  assert.equal(initial.paragraphs.length, 1);
  assert.equal(initial.title, '物置の長靴');
  markStoryRead(state, 'boots', initial.revision);
  const update = discover(state, ctx, 'ledger');
  assert.deepEqual(update.updates.map(item => item.id), ['boots']);
  const revised = getStoryDocument('boots', ctx, state);
  assert.equal(revised.revision, 2);
  assert.equal(revised.unread, true);
  assert.equal(revised.additions.length, 1);
  assert.ok(revised.paragraphs.length > initial.paragraphs.length);
  assert.equal(advanceStory(state, 'refresh', ctx).updates.length, 0, 'notifications do not spam every frame');
  assert.equal(getStoryDocument('boots', ctx, state).unread, true, 'notification is not the same as reading');
  markStoryRead(state, 'boots', revised.revision);
  assert.equal(getStoryDocument('boots', ctx, state).unread, false);
});

test('a completed set and late pursuit reveal the remainder without changing old evidence', () => {
  const state = createStoryState(), ctx = context();
  observeAndDescend(state, ctx);
  discover(state, ctx, 'glasses');
  discover(state, ctx, 'cassette');
  const first = getStoryDocument('cassette', ctx, state);
  markStoryRead(state, 'cassette', first.revision);
  discover(state, ctx, 'mirror');
  discover(state, ctx, 'toy');
  const full = getStoryDocument('cassette', ctx, state);
  assert.equal(full.revision, 3);
  assert.equal(full.pending, false);
  assert.deepEqual(full.paragraphs.slice(0, first.paragraphs.length), first.paragraphs);
  assert.equal(canCompleteStoryChain('voices', ctx, state), true);
  const isolated = createStoryState(), isolatedCtx = context();
  observeAndDescend(isolated, isolatedCtx);
  discover(isolated, isolatedCtx, 'glasses');
  discover(isolated, isolatedCtx, 'tag');
  markStoryRead(isolated, 'tag', 1);
  const preparation = discover(isolated, isolatedCtx, 'crank');
  assert.equal(preparation.stage, 4, 'finding a late tool still allows an evidence beat');
  const pursuit = advanceStory(isolated, '_progress', isolatedCtx);
  assert.equal(pursuit.stage, 5);
  assert.equal(pursuit.updates.find(item => item.id === 'tag').revision, 3);
  assert.equal(canCompleteStoryChain('attendance', isolatedCtx, isolated), false, 'one late object is not a completed story');
});

test('unfound records and all chain answers remain hidden before an encounter', () => {
  const state = createStoryState(), ctx = context({}, ['boots', 'ledger', 'tag', 'photo', 'ribbon']);
  assert.equal(getStoryDocument('cassette', ctx, state), null);
  assert.equal(getStoryDocument('unknown', ctx, state), null);
  assert.equal(getStoryDocument('photo', ctx, state).image, undefined);
  assert.equal(getStoryDocument('ledger', ctx, state).paragraphs.length, 1);
  for (const id of Object.keys(CHAINS)) assert.equal(canCompleteStoryChain(id, ctx, state), false);
  observeAndDescend(state, ctx);
  assert.equal(canCompleteStoryChain('attendance', ctx, state), false, 'the first descent does not dump all recorded conclusions');
  settleStory(state, ctx);
  assert.equal(canCompleteStoryChain('attendance', ctx, state), true);
  assert.equal(canCompleteStoryChain('return', ctx, state), true);
  assert.equal(getStoryDocument('photo', ctx, state).image, DOCUMENTS.photo.image);
});

test('saving and reloading preserves seen dialogue and unread notifications', () => {
  const state = createStoryState(), ctx = context();
  observeAndDescend(state, ctx);
  discover(state, ctx, 'glasses');
  discover(state, ctx, 'boots');
  markStoryRead(state, 'boots', 1);
  discover(state, ctx, 'ledger');
  const loaded = createStoryState(JSON.parse(JSON.stringify(state)));
  assert.equal(advanceStory(loaded, 'downstairs', ctx).dialogueKey, null);
  assert.equal(advanceStory(loaded, 'refresh', ctx).updates.length, 0);
  assert.equal(getStoryDocument('boots', ctx, loaded).unread, true);
  assert.equal(getStoryDocument('boots', ctx, loaded).revision, 2);
});

test('cross-realm collections are usable and corrupt saved metadata is bounded', () => {
  const foreign = vm.runInNewContext('new Set(["boots"])');
  const state = createStoryState();
  assert.equal(getStoryDocument('boots', { collected: foreign }, state).revision, 1);
  const bad = createStoryState({ stage: Infinity, events: [null, 7, 'unknown', 'collect:boots'], readRevisions: { boots: 999, nope: 2 }, notifiedRevisions: { boots: -1 } });
  assert.equal(bad.stage, 0);
  assert.deepEqual(bad.events, ['collect:boots']);
  assert.deepEqual(bad.readRevisions, { boots: 3 });
  assert.deepEqual(bad.notifiedRevisions, {});
});

test('story events are one-shot while late flags cannot erase a previously reached phase', () => {
  const state = createStoryState(), ctx = context();
  observeAndDescend(state, ctx);
  discover(state, ctx, 'crank');
  settleStory(state, ctx);
  assert.equal(state.stage, 5);
  discover(state, ctx, 'gate');
  assert.equal(state.stage, 6);
  const duplicate = advanceStory(state, 'gate', ctx);
  assert.equal(duplicate.dialogueKey, null);
  assert.equal(advanceStory(state, 'refresh', context()).stage, 6);
  assert.equal(canCompleteStoryChain('not-a-chain', ctx, state), false);
});

test('narrative integration keeps the two bottles, actual road clearance, and upstairs return memory', () => {
  assert.match(DOCUMENTS.bottle.paragraphs.join(''), /二本/);
  assert.match(DIALOGUE.gate[0].text, /倒木.*どけた/);
  assert.match(ENDINGS.return.paragraphs.join(''), /二階の窓/);
  for (const group of Object.values(CHAINS)) for (const id of group.ids) assert.ok(LORE[id] || DOCUMENTS[id]);
  for (const lines of Object.values(DIALOGUE)) for (const line of lines) assert.ok(line.text.length <= 60, line.text);
});

test('the uncle starts visibly upstairs, then reports a concrete location and an achievable rescue role', () => {
  assert.match(INTRO.paragraphs.join(''), /同じ二階の部屋/);
  assert.equal(DIALOGUE.opening[0].speaker, '修司');
  assert.equal(DIALOGUE.opening[0].channel, '対面');
  assert.equal(DIALOGUE.opening[0].location, '別荘・二階');
  assert.match(DIALOGUE.opening[0].text, /林道/);
  assert.ok(DIALOGUE.encounter.some(line => /雨戸/.test(line.text)));
  assert.match(DIALOGUE.downstairs.map(line => line.text).join(''), /机の無線/);
  assert.match(DIALOGUE.radioTuned.map(line => line.text).join(''), /倒木.*戻れない.*道は俺が開ける/);
  assert.match(DIALOGUE.note.map(line => line.text).join(''), /救助/);
  assert.doesNotMatch(DIALOGUE.radioTuned.map(line => line.text).join(''), /72|正解/);
});

test('new runs must tune the radio before equipment can advance beyond the first-floor scene', () => {
  const state = createStoryState(), ctx = context({ radioTuned: false });
  for (const id of ['crank', 'bottle', 'note', 'glasses']) discover(state, ctx, id);
  observeAndDescend(state, ctx);
  for (let i = 0; i < 3; i++) {
    const waiting = advanceStory(state, '_progress', ctx);
    assert.equal(waiting.stage, 2);
    assert.equal(waiting.dialogueKey, null);
  }
  ctx.flags.radioTuned = true;
  const tuned = advanceStory(state, 'radioTuned', ctx);
  assert.equal(tuned.stage, 2, 'tuning resolves the existing scene rather than skipping to later records');
  assert.equal(tuned.dialogueKey, 'radioTuned');
  assert.equal(advanceStory(state, 'radioTuned', ctx).dialogueKey, null);
  const ready = advanceStory(state, '_progress', ctx);
  assert.deepEqual([ready.stage, ready.dialogueKey], [3, 'glasses']);
  assert.equal(advanceStory(state, '_progress', ctx).dialogueKey, 'note');
});

test('a radio adjusted early is explained only after the encounter and physical descent, including a reload', () => {
  let state = createStoryState();
  const ctx = context({ radioTuned: true });
  assert.equal(advanceStory(state, 'radioTuned', ctx).dialogueKey, null);
  assert.equal(state.stage, 0);
  state = createStoryState(JSON.parse(JSON.stringify(state)));
  const descent = observeAndDescend(state, ctx);
  assert.equal(descent.dialogueKey, 'downstairs');
  const tuned = advanceStory(state, '_progress', ctx);
  assert.equal(tuned.stage, 2);
  assert.equal(tuned.dialogueKey, 'radioTuned');
  assert.equal(advanceStory(state, '_progress', ctx).dialogueKey, null);
});

test('the shutter and call bell react once without advancing chapters or replacing deferred core dialogue', () => {
  const state = createStoryState(), ctx = context({ radioTuned: false });
  ctx.flags.seen = true;
  advanceStory(state, 'sighting', ctx);
  const shutter = advanceStory(state, 'shutter', ctx);
  assert.deepEqual([shutter.stage, shutter.dialogueKey], [1, 'shutter']);
  assert.equal(advanceStory(state, 'shutter', ctx).dialogueKey, null);
  advanceStory(state, 'downstairs', ctx);
  const bell = advanceStory(state, 'bell', ctx);
  assert.deepEqual([bell.stage, bell.dialogueKey], [2, 'bell']);
  const loaded = createStoryState(JSON.parse(JSON.stringify(state)));
  assert.equal(advanceStory(loaded, 'bell', ctx).dialogueKey, null);
  ctx.flags.radioTuned = true;
  assert.equal(advanceStory(loaded, 'radioTuned', ctx).dialogueKey, 'radioTuned');
  assert.match(LORE.toy.paragraphs.join(''), /呼び鐘とは違う/);
  assert.match(DIALOGUE.bell.map(line => line.text).join(''), /見失えば/);
});

test('a migrated older save does not invent a completed tuning conversation or regress its chapter', () => {
  const state = createStoryState({ stage: 5, events: ['sighting', 'downstairs', 'crank'], delivered: ['encounter', 'downstairs', 'crank'] });
  const ctx = context({ seen: true, crank: true, radioTuned: true });
  assert.equal(advanceStory(state, '_progress', ctx).dialogueKey, null);
  assert.equal(state.stage, 5);
  assert.equal(state.delivered.includes('radioTuned'), false);
});

test('prop conversations cannot contradict the weak reception before tuning succeeds', () => {
  const state = createStoryState(), ctx = context({ radioTuned: false }, ['boots']);
  observeAndDescend(state, ctx);
  assert.ok(getStoryDocument('boots', ctx, state).after.every(line => line.speaker === '私'));
  ctx.flags.radioTuned = true;
  advanceStory(state, 'radioTuned', ctx);
  assert.ok(getStoryDocument('boots', ctx, state).after.some(line => line.speaker === '修司（無線）'));
});

test('gimmick choices leave a short ending memory without changing the three conclusions or their final lines', () => {
  for (const id of Object.keys(ENDINGS)) {
    const original = [...ENDINGS[id].paragraphs];
    assert.deepEqual(endingParagraphs(id), original);
    const bell = endingParagraphs(id, { bellUsed: true });
    assert.equal(bell.length, original.length + 1);
    assert.match(bell[2], /呼び鐘.*無線の電源/);
    assert.equal(bell.at(-1), original.at(-1));
    const closed = endingParagraphs(id, { shutterUsed: true, shutterClosed: true });
    const reopened = endingParagraphs(id, { shutterUsed: true, shutterClosed: false });
    assert.match(closed[2], /閉めてきた雨戸/);
    assert.match(reopened[2], /開け直した/);
    assert.deepEqual(ENDINGS[id].paragraphs, original, 'a second playthrough must not inherit the first one’s recollection');
  }
  assert.deepEqual(endingParagraphs('unknown'), []);
  assert.match(ENDINGS.voice.paragraphs.at(-1), /空の後部座席.*うん/);
  assert.match(LORE.cassette.paragraphs.join(''), /もう一度「うん」/);
});
