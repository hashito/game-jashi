// data/plan.json for 邪視 5.0 (standard). The 4.x map (dist/layout.js) on the standard plan: the two-storey villa, the shed, the
// evacuation hut and the parking lot as rooms; the trails as outdoor strips that touch along open edges (no walls outdoors).
// x east, z north, metres; (x, z) of a room is its lowest corner. Run: node tools/authoring/make-plan.mjs
import fs from 'node:fs';

const R = (id, name, x, z, w, d, o = {}) => ({ id, name, x, z, w, d, kind: 'room', ...o });
const O = (id, name, x, z, w, d, floorTex, o = {}) => ({ id, name, x, z, w, d, kind: 'outdoor', floorTex, edge: 'none', ...o });
const rooms = [
  // the villa: ground floor (hall with the radio desk, bedroom, stairwell) and upper floor (workroom, store, stairwell, balcony)
  R('CAB_HALL', '別荘・玄関と無線机', -6, 19, 12, 6.9, { floorTex: 'planks_dark', wallTex: 'panel_wood_wall', step: 'wood' }),
  R('CAB_BED', '別荘・寝室', -3.4, 25.9, 9.4, 3.1, { floorTex: 'planks_dark', wallTex: 'panel_wood_wall', step: 'wood' }),
  R('CAB_ST0', '別荘・梯子（一階）', -6, 25.9, 2.6, 3.1, { kind: 'stairs', floorTex: 'planks_dark', wallTex: 'panel_wood_wall' }),
  R('CAB_UP', '別荘・二階の作業室', -6, 19, 12, 6.9, { floor: 1, floorTex: 'planks_dark', wallTex: 'panel_wood_wall', step: 'wood' }),
  R('CAB_STORE', '別荘・二階の納戸', -3.4, 25.9, 9.4, 3.1, { floor: 1, floorTex: 'planks_dark', wallTex: 'panel_wood_wall', step: 'wood' }),
  R('CAB_ST1', '別荘・梯子（二階）', -6, 25.9, 2.6, 3.1, { floor: 1, kind: 'stairs', floorTex: 'planks_dark', wallTex: 'panel_wood_wall' }),
  R('CAB_BALC', '二階のベランダ', -3, 17, 6, 2, { floor: 1, floorTex: 'planks_dark', wallTex: 'panel_wood_wall', step: 'wood' }),
  // the shed (timber yard) and the evacuation hut (creek)
  R('SHED', '物置', -22, -5.5, 5, 4.5, { floorTex: 'planks_grey_old', wallTex: 'panel_wood_wall', step: 'wood' }),
  R('SHELTER', '避難小屋', 13, -18, 6, 5, { floorTex: 'planks_grey_old', wallTex: 'panel_wood_wall', step: 'wood' }),
  // outdoors: the forest road in front of the villa, the parking lot, the middle trail, the timber yard, the creek and bridge, the east loop, the south end
  O('O_FRONT', '別荘前の林道', -16, 8, 24, 11, 'gravel'),
  O('O_PARK', '駐車場', -34, 12, 18, 17, 'gravel'),
  O('O_MID', '林道（中ほど）', -6, -4, 12, 12, 'soil'),
  O('O_TIMBER_N', '伐採跡（北）', -26, -1, 20, 9, 'soil'),
  O('O_TIMBER_W', '伐採跡（西）', -26, -16, 4, 15, 'moss'),
  O('O_TIMBER_S', '伐採跡（物置の裏）', -22, -16, 5, 10.5, 'moss'),
  O('O_TIMBER_E', '伐採跡（呼び鐘）', -17, -16, 11, 15, 'soil'),
  O('O_BRIDGE', '沢と橋', -6, -16, 12, 12, 'soil'),
  O('O_EAST_RET', '沢沿いの戻り道', 6, -4, 8, 12, 'moss'),
  O('O_EAST_N', '沢沿い（避難小屋の前）', 6, -13, 18, 9, 'soil'),
  O('O_SOUTH', '林道の奥', -6, -30, 19, 14, 'soil'),
  O('O_EAST_SM', '避難小屋の裏', 13, -30, 6, 12, 'moss'),
  O('O_EAST_S', '沢の下手', 19, -30, 7, 17, 'moss'),
];
const D = (id, a, b, x, z, width, o = {}) => ({ id, a, b, x, z, width, ...o });
const OPEN = (id, a, b, x, z, width) => D(id, a, b, x, z, width, { open: true, reason: 'outdoors: the trail goes on (no wall between the strips)' });
const doors = [
  D('D_ENTRY', 'CAB_HALL', 'O_FRONT', 0, 19, 2.4, { label: '別荘の玄関戸', unlock: 'outside', hint: '修司の声を聞くまで、外に出ない方がいい。机の無線を先に。' }),
  D('D_BED', 'CAB_HALL', 'CAB_BED', 1.5, 25.9, 1.4, { label: '寝室の引戸', reason: 'a small villa: the bedroom opens off the hall' }),
  D('D_ST0', 'CAB_HALL', 'CAB_ST0', -4.7, 25.9, 1.4, { label: '梯子の下' }),
  D('D_STORE', 'CAB_UP', 'CAB_STORE', 4.3, 25.9, 1.4, { label: '二階の納戸の引戸', reason: 'a small villa: the store opens off the workroom' }),
  D('D_ST1', 'CAB_UP', 'CAB_ST1', -4.7, 25.9, 1.4, { label: '梯子の上' }),
  D('D_BALC', 'CAB_UP', 'CAB_BALC', 0, 19, 1.6, { label: 'ベランダの戸', look: 'none', reason: 'the balcony opens off the workroom' }),
  { id: 'ST_CABIN', a: 'CAB_ST0', b: 'CAB_ST1', width: 1.4, kind: 'stairs', unlock: 'downstairs', hint: '下りる前に、二階でやることが残っている。ベランダの望遠鏡を撮って、外から見えないように雨戸を閉めてから下りよう。',
    ends: { a: { x: -4.7, z: 28.55, arrive: [-4.7, 26.8], yaw: 0 }, b: { x: -4.7, z: 28.55, arrive: [-4.7, 26.8], yaw: 0 } } },   // the stair block against the back wall: room in front of it to stand and select (W18)
  D('D_SHED', 'SHED', 'O_TIMBER_N', -19.5, -1, 1.6, { look: 'slide', label: '物置の引戸', unlock: 'shed', hint: '物置の鍵は、書き置きと一緒に机にあるはずだ。' }),
  D('D_SHELTER', 'SHELTER', 'O_EAST_N', 16, -13, 1.6, { look: 'slide', label: '避難小屋の引戸', unlock: 'shelter', hint: '小屋の戸は閉まっている。先に物置の支度を。' }),
  D('D_GATE', 'O_FRONT', 'O_PARK', -16, 16, 3.6, { label: '林道ゲート', look: 'none', unlock: 'gate', hint: '鎖のゲートが下りている。巻上げの箱にハンドルを差して上げる。', reason: 'the forest road gate (a chain bar, lifted by the crank)' }),
  OPEN('G_FRONT_MID', 'O_FRONT', 'O_MID', 0, 8, 8),
  OPEN('G_FRONT_TIMBER', 'O_FRONT', 'O_TIMBER_N', -11, 8, 6),
  OPEN('G_MID_TIMBER', 'O_MID', 'O_TIMBER_N', -6, 3, 6),
  OPEN('G_MID_BRIDGE', 'O_MID', 'O_BRIDGE', 0, -4, 6),
  OPEN('G_MID_EAST', 'O_MID', 'O_EAST_RET', 6, 2, 6),
  OPEN('G_TN_TW', 'O_TIMBER_N', 'O_TIMBER_W', -24, -1, 4),
  OPEN('G_TN_TE', 'O_TIMBER_N', 'O_TIMBER_E', -11, -1, 8),
  OPEN('G_TW_TS', 'O_TIMBER_W', 'O_TIMBER_S', -22, -11, 6),
  OPEN('G_TS_TE', 'O_TIMBER_S', 'O_TIMBER_E', -17, -11, 6),
  OPEN('G_TE_BRIDGE', 'O_TIMBER_E', 'O_BRIDGE', -6, -12, 6),
  OPEN('G_BRIDGE_EAST', 'O_BRIDGE', 'O_EAST_N', 6, -8, 6),
  OPEN('G_EASTRET_N', 'O_EAST_RET', 'O_EAST_N', 10, -4, 6),
  OPEN('G_BRIDGE_SOUTH', 'O_BRIDGE', 'O_SOUTH', 0, -16, 8),
  OPEN('G_SOUTH_SM', 'O_SOUTH', 'O_EAST_SM', 13, -24, 6),
  OPEN('G_SM_S', 'O_EAST_SM', 'O_EAST_S', 19, -24, 6),
  OPEN('G_EN_ES', 'O_EAST_N', 'O_EAST_S', 22, -13, 4),
];
const stations = [
  { id: 'S_TELESCOPE', room: 'CAB_BALC', x: -1.9, z: 17.6, label: '望遠鏡' },
  { id: 'S_SHUTTER', room: 'CAB_UP', x: 1.4, z: 19.5, label: '雨戸の引手' },
  { id: 'S_RADIO', room: 'CAB_HALL', x: 2.7, z: 24.6, label: '机の無線' },
  { id: 'S_SHELF', room: 'SHED', x: -20.4, z: -4.9, label: '物置の棚' },
  { id: 'S_BELL', room: 'O_TIMBER_E', x: -12.7, z: -6, label: '林業用の呼び鐘' },
  { id: 'S_CRANK', room: 'SHELTER', x: 15.4, z: -17.2, label: '小屋の床' },
  { id: 'S_PHONE', room: 'O_EAST_SM', x: 17.6, z: -23, label: '泥の中の携帯電話' },
  { id: 'S_GATE', room: 'O_FRONT', x: -14.6, z: 13.6, label: 'ゲートの巻上げ箱' },
  { id: 'S_CAR', room: 'O_PARK', x: -25.6, z: 22.6, label: '叔父の車' },
];
const hides = [
  { id: 'H_LOGS', room: 'O_TIMBER_E', x: -15.2, z: -8.6, label: '材木の陰' },
  { id: 'H_STONES', room: 'O_SOUTH', x: 9.7, z: -20, label: '沢の大岩の陰' },
  { id: 'H_SHELF', room: 'SHED', x: -18.2, z: -4.6, label: '物置の棚の陰' },
  { id: 'H_HUT', room: 'SHELTER', x: 17.8, z: -17.2, label: '小屋の隅の毛布' },
  { id: 'H_CLOSET', room: 'CAB_BED', x: 5.2, z: 28.2, label: '寝室の押入れ' },
  { id: 'H_CAR', room: 'O_PARK', x: -21, z: 26.5, label: '車の陰' },
];
const plan = {
  rooms, doors, stations, hides,
  routes: [{ id: 'mountain_loop', path: ['O_SOUTH', 'O_BRIDGE', 'O_TIMBER_E', 'O_TIMBER_N', 'O_MID', 'O_EAST_RET', 'O_EAST_N', 'O_EAST_S', 'O_EAST_SM', 'O_SOUTH'] }],
  start: 'CAB_UP', spawn: { x: 0.65, z: 23.2, yaw: 0 }, exits: ['O_PARK'],
  checks: { ignore: ['direct-total', 'no-corridor', 'direct-per-room', 'exits-few'], why: 'a villa and huts on a mountain: rooms open on the trail and on each other, there are no hallways; the only way off the mountain is the car in the parking lot' },
};
fs.writeFileSync(new URL('../../data/plan.json', import.meta.url), JSON.stringify(plan, null, 1) + '\n');
console.log(`plan.json: ${rooms.length} rooms, ${doors.length} doors, ${stations.length} stations, ${hides.length} hides`);
