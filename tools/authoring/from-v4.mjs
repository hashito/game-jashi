// One-off (5.0.0): converts the 4.x story text (dist/narrative.js, dist/scene-art.js) into the standard data
// (data/talk.json, data/docs.json, data/endings.json). Kept for the record; the JSON files are the source from now on.
import fs from 'node:fs';
const N = await import(new URL('../../dist/narrative.js', import.meta.url));
const A = await import(new URL('../../dist/scene-art.js', import.meta.url));
const out = (f, v) => fs.writeFileSync(new URL(`../../data/${f}`, import.meta.url), JSON.stringify(v, null, 2) + '\n');
const P = 'assets/photos/';
const line = (l) => { const m = /^(.+)（(.+)）$/.exec(l.speaker || ''); const o = { who: m ? m[1] : l.speaker || '私' }; const where = m ? m[2] : l.channel && l.channel !== '対面' ? l.channel : null; if (where) o.where = where; o.text = l.text; return o; };

// talk.json: the opening (intro + the uncle face to face, a picture on every line), the telescope, every dialogue key, the records' after-lines
const talk = {};
talk.opening = [
  ...N.INTRO.paragraphs.map((t, i) => ({ img: P + (i ? 'cabin-memory-v4-2.webp' : 'arrival-v4-1.webp'), who: '私', text: t })),
  ...N.DIALOGUE.opening.map((l) => ({ img: P + 'cabin-memory-v4-2.webp', ...line(l) })),
];
talk.telescope = N.TELESCOPE_SCENES.map((s) => ({ img: P + 'mountain-v4-1.webp', who: '私', text: s.paragraphs.join('') }));
for (const [k, ls] of Object.entries(N.DIALOGUE)) if (k !== 'opening') talk[k] = ls.map(line);
for (const [id, d] of Object.entries(N.LORE)) if (d.after && d.after.length) talk[`after_${id}`] = d.after.map(line);
for (const [id, c] of Object.entries(N.CHAINS)) talk[`chain_${id}`] = [{ who: '私', text: c.paragraphs.join('') }];
out('talk.json', talk);

// docs.json: the records (lore, documents) where 4.x put them, and the wall pictures / notices of the scene art
const ROOM_AT = [
  ['SHED', -22, -5.5, 5, 4.5], ['SHELTER', 13, -18, 6, 5], ['CAB_BED', -3.4, 25.9, 9.4, 3.1], ['CAB_HALL', -6, 19, 12, 6.9],
  ['O_BRIDGE', -6, -16, 12, 12], ['O_EAST_SM', 13, -30, 6, 12], ['O_TIMBER_E', -17, -16, 11, 15], ['O_TIMBER_N', -26, -1, 20, 9], ['O_FRONT', -16, 8, 24, 11],
];
// a record is out from the stage its room opens (CAB_* L3: downstairs; outdoors and the shed L4; the hut L5)
const OPENS = (r) => (r === 'SHELTER' ? 'L5' : r.startsWith('CAB_') ? 'L3' : 'L4');
const roomAt = (x, z) => (ROOM_AT.find(([, rx, rz, w, d]) => x >= rx && x <= rx + w && z >= rz && z <= rz + d) || ['O_FRONT'])[0];
const STAGE = { note: 'L3', photo: 'L5', boots: 'L4', ledger: 'L5', cassette: 'L2', mirror: 'L2', ribbon: 'L5', toy: 'L5', tag: 'L4' };
const KIND = { boots: 'rubber-boots', ledger: 'book', cassette: 'cassette', mirror: 'hand-mirror', ribbon: 'red-string', toy: 'bell', tag: 'tag', note: 'paper', photo: 'photo' };
const POS = { note: [-2.2, 24, 0.8], photo: [17.1, -16.1, 0.8], ...Object.fromEntries(N.LORE_PLACEMENTS ? [] : []) };
const L = { boots: [-20, -2, 0.02], ledger: [14.5, -16, 0.9], cassette: [-2.25, 27, 0.86], mirror: [3.6, 27, 0.82], ribbon: [3, -9, 1.0], toy: [18, -25.5, 0.02], tag: [-10, -13, 1.4] };
// a record without its own picture shows the 4.2 close-up of it, else the 3D model's item photo
const DOC_PHOTO = { boots: P + 'boots-detail-v4-2.webp', ledger: P + 'ledger-detail-v4-2.webp', mirror: P + 'mirror-detail-v4-2.webp', note: 'assets/items/note.webp', cassette: 'assets/items/cassette.webp', ribbon: 'assets/items/ribbon.webp', toy: 'assets/items/toy.webp', tag: 'assets/items/tag.webp' };
const docs = [];
for (const [id, d] of Object.entries({ note: N.DOCUMENTS.note, photo: N.DOCUMENTS.photo, ...N.LORE })) {
  const [x, z, y] = POS[id] || L[id];
  const chain = Object.entries(N.CHAINS).find(([, c]) => c.ids.includes(id));
  const after = (d.after || []).find((l) => l.speaker === '私');
  docs.push({ id: `N_${id.toUpperCase()}`, title: d.title, room: roomAt(x, z), stage: [STAGE[id], OPENS(roomAt(x, z))].sort().pop(), x, z, y, kind: KIND[id], record: true,
    photo: d.image || DOC_PHOTO[id], text: d.paragraphs.join('\n'), ...(after ? { feeling: after.text } : {}), ...(chain ? { chain: chain[0] } : {}) });
}
for (const s of A.SCENE_ART) docs.push({ id: `W_${s.id.replace(/-/g, '_').toUpperCase()}`, title: s.title, room: roomAt(s.x, s.z), stage: OPENS(roomAt(s.x, s.z)), x: s.x, z: s.z, y: s.y, wall: { rot: s.rotation, w: s.width, h: s.height, type: s.type },
  photo: s.image.replace('./', ''), text: s.text, feeling: s.caption });
out('docs.json', docs);

// endings.json: the file order is the order of the checks (the phone first, then two related records, else the plain return)
const E = N.ENDINGS;
out('endings.json', [
  { id: 'E_VOICE', title: E.voice.title, kind: 'good', kicker: E.voice.eyebrow, photo: P + 'ending-voice.webp', requires: { tasks: ['T_ENGINE'], flags: ['phone'] }, text: E.voice.paragraphs.join('\n') },
  { id: 'E_WITNESS', title: E.witness.title, kind: 'good', kicker: E.witness.eyebrow, photo: P + 'ending-witness.webp', requires: { tasks: ['T_ENGINE'], flags: ['records2'] }, text: E.witness.paragraphs.join('\n') },
  { id: 'E_RETURN', title: E.return.title, kind: 'good', kicker: E.return.eyebrow, photo: P + 'return-v4-1.webp', requires: { tasks: ['T_ENGINE'] }, text: E.return.paragraphs.join('\n') },
]);
console.log('talk', Object.keys(talk).length, 'docs', docs.length);
