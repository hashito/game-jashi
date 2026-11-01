/* game-kit 6e0b6f0: js/item-catalog.js — edit in game-kit and run tools/kit-sync.js */
// The standard item kinds as data (standard 1.9: 18 -> 192 kinds). Pure: no THREE, so the schema check, kit-sync and the tools read it in Node.
// js/item-kinds.js builds a model from a recipe; the 18 kinds of 1.7 keep their hand-made models (they are listed here too, with their group).
//   items.json  { "id": "I_LAMP", "kind": "oil-lamp", "room": "KURA", "x": 1, "z": 2, "color": "#8a3a1a" }   (color: the recipe's main colour)
// A recipe: { label, group, main?: '#rrggbb', parts: [part, ...] }. A part (metres; y is the bottom of the part; angles in degrees):
//   ['b', w, h, d, mat, x, y, z, rx, ry, rz]                  box
//   ['c', rTop, rBottom, h, mat, x, y, z, rx, ry, rz, seg]    cylinder / cone (rTop 0)
//   ['s', r, mat, x, y, z, sx, sy, sz, ry]                    sphere (scaled: an egg, a bun; ry turns a texture's middle, which faces +x, e.g. -90 = to the front)
//   ['t', R, tube, mat, x, y, z, rx, ry, rz, arc]              torus (a ring, a handle)
// mat: a name of ITEM_MATERIALS, '#rrggbb', or '$' (the item's colour: items.json "color", else the recipe's main).
// The model is re-centred to rest on its bottom (js/item-kinds.js), so a part's position only matters relative to the others.
// A game's own kind: ext.registerItemKind('my-thing', (o) => THREE.Group) and game.json "itemKinds": ["my-thing"] (the schema check then allows it).

// materials: a colour, roughness / metalness, and an item texture (assets/textures/item/<tex>.webp, made by tools/gen_item_textures.py)
export const ITEM_MATERIALS = {
  wood: { c: '#c8a070', tex: 'wood_light' }, 'wood-dark': { c: '#5a3a24', tex: 'wood_dark' }, 'wood-red': { c: '#8a3a26', tex: 'wood_red' },
  lacquer: { c: '#1c1818', tex: 'lacquer_black', r: 0.3 }, 'lacquer-red': { c: '#962018', tex: 'lacquer_red', r: 0.3 }, bamboo: { c: '#b0a060', tex: 'bamboo' }, straw: { c: '#c4aa68', tex: 'straw', r: 1 },
  paper: { c: '#f2eee4', tex: 'paper_plain', r: 1 }, 'paper-old': { c: '#e0d2ae', tex: 'paper_old', r: 1 }, ruled: { c: '#f6f4ec', tex: 'paper_ruled', r: 1 }, note: { c: '#e8dcc0', tex: 'paper_note', r: 1 },
  news: { c: '#dedcd2', tex: 'newspaper', r: 1 }, ofuda: { c: '#e8dcb8', tex: 'ofuda', r: 1 }, envelope: { c: '#c4a06e', tex: 'envelope', r: 1 }, cardboard: { c: '#b89262', tex: 'cardboard', r: 1 },
  washi: { c: '#ece2ce', tex: 'washi_asanoha', r: 1 }, map: { c: '#e2d6b4', tex: 'map_paper', r: 1 },
  indigo: { c: '#283864', tex: 'cloth_indigo', r: 1 }, 'cloth-red': { c: '#aa2828', tex: 'cloth_red', r: 1 }, cloth: { c: '#ece8de', tex: 'cloth_white', r: 1 }, check: { c: '#a04040', tex: 'cloth_check', r: 1 },
  kimono: { c: '#a01e28', tex: 'kimono_red', r: 1 }, 'kimono-navy': { c: '#1e2850', tex: 'kimono_navy', r: 1 },
  leather: { c: '#6e4628', tex: 'leather_brown', r: 0.7 }, 'leather-black': { c: '#282422', tex: 'leather_black', r: 0.7 }, fur: { c: '#966a42', tex: 'fur_brown', r: 1 }, rope: { c: '#b09260', tex: 'rope', r: 1 },
  steel: { c: '#aaaeb4', tex: 'metal_steel', r: 0.45, m: 0.7 }, 'dark-steel': { c: '#46484c', tex: 'metal_dark', r: 0.5, m: 0.6 }, brass: { c: '#be9646', tex: 'metal_brass', r: 0.4, m: 0.8 },
  copper: { c: '#b0643c', tex: 'metal_copper', r: 0.6, m: 0.5 }, rust: { c: '#6e5040', tex: 'metal_rust', r: 0.9, m: 0.3 }, 'red-metal': { c: '#b42822', tex: 'metal_red', r: 0.6, m: 0.3 },
  'plastic-black': { c: '#222224', tex: 'plastic_black', r: 0.45 }, 'plastic-white': { c: '#e8e8e4', tex: 'plastic_white', r: 0.45 }, rubber: { c: '#1e1e1e', tex: 'rubber', r: 0.95 },
  ceramic: { c: '#eceae2', tex: 'ceramic_white', r: 0.3 }, celadon: { c: '#a0bea8', tex: 'ceramic_celadon', r: 0.3 }, 'ceramic-brown': { c: '#784628', tex: 'ceramic_brown', r: 0.3 }, 'ceramic-blue': { c: '#eceef0', tex: 'ceramic_blue', r: 0.3 },
  stone: { c: '#82807a', tex: 'stone_grey', r: 0.95 }, wax: { c: '#f0e6cc', tex: 'wax', r: 0.6 },
  'label-pill': { c: '#f6f6f2', tex: 'label_pill', r: 0.5 }, 'label-can': { c: '#c42824', tex: 'label_can', r: 0.5, m: 0.3 }, vhs: { c: '#161618', tex: 'vhs', r: 0.5 },
  screen: { c: '#0e1612', tex: 'screen_on', r: 0.2, e: '#0a2a14' }, 'screen-off': { c: '#101214', tex: 'screen_off', r: 0.15 }, circuit: { c: '#1e5c34', tex: 'circuit', r: 0.6 },
  photo: { c: '#b49670', tex: 'photo_old', r: 0.6 }, card: { c: '#aa1e24', tex: 'card_back', r: 0.6 }, banknote: { c: '#c4ccb0', tex: 'banknote', r: 1 },
  gold: { c: '#d4aa46', tex: 'coin_gold', r: 0.35, m: 0.9 }, 'copper-coin': { c: '#a0643c', tex: 'coin_copper', r: 0.4, m: 0.8 },
  fox: { c: '#f2eee6', tex: 'mask_fox', r: 0.5 }, daruma: { c: '#c41e1c', tex: 'daruma', r: 0.4 }, doll: { c: '#f6eee4', tex: 'doll_face', r: 0.6 },
  'book-red': { c: '#8c2824', tex: 'book_red', r: 0.9 }, 'book-blue': { c: '#283c6e', tex: 'book_blue', r: 0.9 }, 'book-green': { c: '#285a3c', tex: 'book_green', r: 0.9 },
  glass: { c: '#a8ccc8', r: 0.08, o: 0.45 }, 'glass-amber': { c: '#8a5a1a', r: 0.1, o: 0.7 }, 'glass-green': { c: '#3a6a3a', r: 0.1, o: 0.7 },
  black: { c: '#1a1a1a' }, white: { c: '#f0f0ee' }, red: { c: '#b02a20' }, gray: { c: '#8a8a88' }, yellow: { c: '#e0b830' }, blue: { c: '#2a5aa0' }, green: { c: '#3a7a3a' },
  flame: { c: '#ffcc66', e: '#ff9a30', r: 1 }, bone: { c: '#e6dcc4', r: 0.8 }, hair: { c: '#141210', r: 1 }, skin: { c: '#e8c8a8', r: 0.8 }, food: { c: '#f4f0e6', r: 0.9 }, nori: { c: '#1a2a1a', r: 0.9 },
};

const b = (w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => ['b', w, h, d, m, x, y, z, rx, ry, rz];
const c = (r0, r1, h, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 16) => ['c', r0, r1, h, m, x, y, z, rx, ry, rz, seg];
const s = (r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0) => ['s', r, m, x, y, z, sx, sy, sz, ry];
const t = (R, r, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, arc = 360) => ['t', R, r, m, x, y, z, rx, ry, rz, arc];
const lie = (r0, r1, h, m, x = 0, y = 0, z = 0, ry = 0, seg = 16) => c(r0, r1, h, m, x, y, z, 0, ry, 90, seg);   // a cylinder lying along x

export const ITEM_GROUPS = {
  stationery: '文具・書類', light: '灯り', device: '機械・電子', tool: '道具', medical: '医療', kitchen: '台所・食べ物', shrine: '和・祈り', personal: '身の回り',
  money: 'お金・切符', toy: '玩具', occult: '怪異・証拠', nature: '自然', container: '入れ物', parts: '部品', basic: '基本（1.7）',
};

// the 18 kinds of standard 1.7 (hand-made models in js/item-models.js / js/item-kinds.js)
export const BASIC_KINDS = { key: '鍵', card: 'カード・社員証', paper: '紙・メモ・手紙', clipboard: '書類ばさみ', book: '本・帳面・日誌', photo: '写真立て', tag: '札・タグ', tape: 'テープ・ロール', talisman: 'お札', bag: '袋（塩・米）', bottle: '瓶', box: '箱', phone: '携帯電話', flashlight: '懐中電灯', tool: '工具', cloth: '布', jar: '壺・缶', battery: '電池' };

export const ITEM_RECIPES = {
  // ---- 文具・書類 ----
  pen: { label: 'ボールペン', group: 'stationery', main: '#2a4a8a', parts: [lie(0.006, 0.006, 0.14, '$'), lie(0.003, 0.006, 0.02, 'steel', 0.08), lie(0.0065, 0.0065, 0.03, 'black', -0.06)] },
  pencil: { label: '鉛筆', group: 'stationery', main: '#e0b830', parts: [lie(0.0045, 0.0045, 0.16, '$', 0, 0, 0, 0, 6), lie(0, 0.0045, 0.02, 'wood', 0.09, 0, 0, 0, 6), lie(0.0047, 0.0047, 0.012, 'brass', -0.086)] },
  'fountain-pen': { label: '万年筆', group: 'stationery', main: '#1a1a1a', parts: [lie(0.008, 0.008, 0.13, '$'), lie(0.002, 0.007, 0.03, 'gold', 0.08), b(0.04, 0.002, 0.004, 'gold', -0.03, 0.008, 0.008)] },
  brush: { label: '筆', group: 'stationery', parts: [lie(0.005, 0.005, 0.18, 'bamboo'), lie(0.001, 0.007, 0.04, 'hair', 0.11)] },
  inkstone: { label: '硯', group: 'stationery', parts: [b(0.1, 0.02, 0.16, 'stone'), b(0.08, 0.004, 0.08, 'black', 0, 0.02, 0.02), b(0.02, 0.012, 0.06, 'black', 0.03, 0.02, -0.05)] },
  seal: { label: '判子', group: 'stationery', main: '#c8a070', parts: [c(0.009, 0.009, 0.06, '$'), c(0.0095, 0.0095, 0.003, 'red')] },
  envelope: { label: '封筒', group: 'stationery', parts: [b(0.22, 0.004, 0.11, 'envelope')] },
  postcard: { label: '葉書', group: 'stationery', parts: [b(0.1, 0.002, 0.148, 'note')] },
  'letter-bundle': { label: '手紙の束', group: 'stationery', parts: [b(0.18, 0.03, 0.1, 'paper-old'), b(0.006, 0.032, 0.102, 'red')] },
  newspaper: { label: '新聞', group: 'stationery', parts: [b(0.3, 0.012, 0.2, 'news')] },
  scroll: { label: '巻物', group: 'stationery', parts: [lie(0.02, 0.02, 0.24, 'washi'), lie(0.006, 0.006, 0.28, 'lacquer'), lie(0.021, 0.021, 0.01, 'cloth-red')] },
  map: { label: '地図', group: 'stationery', parts: [b(0.3, 0.003, 0.22, 'map')] },
  notebook: { label: 'ノート', group: 'stationery', main: '#3a6aa0', parts: [b(0.18, 0.008, 0.25, '$'), b(0.17, 0.006, 0.24, 'ruled', 0.004, 0.001)] },
  folder: { label: 'ファイル', group: 'stationery', main: '#3a7a5a', parts: [b(0.23, 0.012, 0.31, '$'), b(0.21, 0.008, 0.29, 'paper', 0.006, 0.002)] },
  scissors: { label: 'はさみ', group: 'stationery', main: '#c03020', parts: [b(0.1, 0.004, 0.012, 'steel', 0.05, 0, 0.004, 0, 6), b(0.1, 0.004, 0.012, 'steel', 0.05, 0.004, -0.004, 0, -6), t(0.018, 0.005, '$', -0.02, 0.002, 0.02, 90), t(0.018, 0.005, '$', -0.02, 0.002, -0.02, 90)] },
  ruler: { label: '物差し', group: 'stationery', parts: [b(0.3, 0.003, 0.03, 'bamboo')] },
  // ---- 灯り ----
  candle: { label: '蝋燭', group: 'light', parts: [c(0.012, 0.012, 0.12, 'wax'), c(0.001, 0.001, 0.012, 'black', 0, 0.12), s(0.006, 'flame', 0, 0.134, 0, 1, 2, 1)] },
  candlestick: { label: '燭台', group: 'light', parts: [c(0.04, 0.05, 0.01, 'brass'), c(0.006, 0.008, 0.16, 'brass', 0, 0.01), c(0.03, 0.02, 0.012, 'brass', 0, 0.17), c(0.011, 0.011, 0.08, 'wax', 0, 0.182)] },
  lantern: { label: '提灯', group: 'light', main: '#c03020', parts: [c(0.05, 0.05, 0.02, 'lacquer'), s(0.08, 'washi', 0, 0.02, 0, 1, 1.3, 1), c(0.05, 0.05, 0.02, 'lacquer', 0, 0.22), t(0.03, 0.003, 'black', 0, 0.26, 0, 90)] },
  'oil-lamp': { label: 'ランプ', group: 'light', parts: [c(0.05, 0.06, 0.06, 'brass'), s(0.045, 'glass', 0, 0.06, 0, 1, 1.4, 1), c(0.02, 0.025, 0.06, 'glass', 0, 0.17), t(0.035, 0.004, 'dark-steel', 0, 0.2, 0, 90)] },
  matchbox: { label: 'マッチ箱', group: 'light', main: '#c03020', parts: [b(0.055, 0.016, 0.036, '$'), b(0.05, 0.004, 0.034, 'cardboard', 0.01, 0.006)] },
  lighter: { label: 'ライター', group: 'light', main: '#2a5aa0', parts: [b(0.024, 0.07, 0.012, '$'), b(0.022, 0.012, 0.011, 'steel', 0, 0.07)] },
  bulb: { label: '電球', group: 'light', parts: [c(0.012, 0.012, 0.025, 'brass'), s(0.03, 'glass', 0, 0.025, 0, 1, 1.25, 1)] },
  'glow-stick': { label: 'ケミカルライト', group: 'light', main: '#6aff8a', parts: [lie(0.007, 0.007, 0.15, 'glass'), lie(0.006, 0.006, 0.14, 'flame')] },
  headlamp: { label: 'ヘッドライト', group: 'light', parts: [t(0.07, 0.01, 'black', 0, 0, 0, 90), b(0.05, 0.035, 0.03, 'plastic-black', 0, 0, 0.075), c(0.014, 0.014, 0.004, 'glass', 0, 0.004, 0.092, 90)] },
  andon: { label: '行灯', group: 'light', parts: [b(0.14, 0.01, 0.14, 'wood-dark'), b(0.12, 0.22, 0.12, 'washi', 0, 0.01), b(0.14, 0.012, 0.14, 'wood-dark', 0, 0.23)] },
  // ---- 機械・電子 ----
  radio: { label: 'ラジオ', group: 'device', main: '#8a5a3a', parts: [b(0.22, 0.13, 0.07, '$'), b(0.1, 0.08, 0.002, 'cloth', -0.04, 0.025, 0.036), c(0.015, 0.015, 0.01, 'brass', 0.07, 0.07, 0.036, 90), c(0.003, 0.003, 0.2, 'steel', 0.09, 0.13, 0)] },
  'walkie-talkie': { label: 'トランシーバー', group: 'device', parts: [b(0.06, 0.15, 0.035, 'plastic-black'), c(0.006, 0.006, 0.08, 'rubber', 0.018, 0.15), b(0.04, 0.03, 0.002, 'screen', 0, 0.1, 0.018)] },
  cassette: { label: 'カセットテープ', group: 'device', parts: [b(0.1, 0.012, 0.064, 'plastic-black'), b(0.08, 0.002, 0.03, 'paper', 0, 0.012, -0.01)] },
  'tape-recorder': { label: 'テープレコーダー', group: 'device', main: '#5a5a5a', parts: [b(0.2, 0.05, 0.12, '$'), b(0.1, 0.002, 0.065, 'plastic-black', -0.03, 0.05, 0.01), b(0.03, 0.012, 0.02, 'gray', 0.06, 0.05, -0.03), b(0.03, 0.012, 0.02, 'red', 0.06, 0.05, 0.01)] },
  camera: { label: 'カメラ', group: 'device', parts: [b(0.13, 0.08, 0.06, 'leather-black'), c(0.03, 0.03, 0.05, 'dark-steel', 0, 0.035, 0.05, 90), c(0.022, 0.022, 0.002, 'glass', 0, 0.035, 0.076, 90), b(0.03, 0.015, 0.03, 'steel', -0.035, 0.08)] },
  'instant-photo': { label: 'インスタント写真', group: 'device', parts: [b(0.088, 0.002, 0.107, 'white'), b(0.078, 0.002, 0.078, 'photo', 0, 0.001, -0.008)] },
  vhs: { label: 'ビデオテープ', group: 'device', parts: [b(0.188, 0.025, 0.104, 'vhs')] },
  floppy: { label: 'フロッピー', group: 'device', main: '#2a2a2a', parts: [b(0.09, 0.003, 0.094, '$'), b(0.05, 0.002, 0.025, 'steel', 0, 0.003, -0.034), b(0.07, 0.002, 0.05, 'paper', 0, 0.003, 0.02)] },
  'usb-stick': { label: 'USBメモリ', group: 'device', main: '#2a5aa0', parts: [b(0.05, 0.01, 0.018, '$'), b(0.012, 0.005, 0.012, 'steel', 0.031, 0.0025)] },
  'sd-card': { label: 'SDカード', group: 'device', parts: [b(0.024, 0.002, 0.032, 'plastic-black'), b(0.02, 0.0005, 0.012, 'paper', 0, 0.002, 0.006)] },
  calculator: { label: '電卓', group: 'device', main: '#3a3a3c', parts: [b(0.08, 0.012, 0.14, '$'), b(0.06, 0.002, 0.025, 'screen', 0, 0.012, -0.045), ...[0, 1, 2, 3].flatMap((r) => [0, 1, 2].map((q) => b(0.014, 0.004, 0.012, 'plastic-white', (q - 1) * 0.02, 0.012, -0.01 + r * 0.018)))] },
  'pocket-watch': { label: '懐中時計', group: 'device', parts: [c(0.025, 0.025, 0.01, 'brass'), c(0.022, 0.022, 0.002, 'paper', 0, 0.01), t(0.008, 0.002, 'brass', 0.03, 0.005, 0, 0, 90)] },
  'alarm-clock': { label: '目覚まし時計', group: 'device', main: '#c03020', parts: [c(0.05, 0.05, 0.04, '$', 0, 0.015, 0, 90), c(0.044, 0.044, 0.002, 'paper', 0, 0.021, 0.021, 90), s(0.016, 'brass', -0.03, 0.105), s(0.016, 'brass', 0.03, 0.105), b(0.008, 0.02, 0.008, 'black', -0.03, 0), b(0.008, 0.02, 0.008, 'black', 0.03, 0)] },
  earphones: { label: 'イヤホン', group: 'device', parts: [s(0.009, 'white', -0.02), s(0.009, 'white', 0.02), t(0.03, 0.0015, 'white', 0, 0.002, 0.03, 90, 0, 0, 200)] },
  remote: { label: 'リモコン', group: 'device', parts: [b(0.045, 0.018, 0.17, 'plastic-black'), b(0.012, 0.004, 0.012, 'red', 0, 0.018, -0.065), ...[0, 1, 2, 3].map((r) => b(0.03, 0.003, 0.01, 'gray', 0, 0.018, -0.03 + r * 0.025))] },
  'rotary-phone': { label: '黒電話', group: 'device', parts: [b(0.2, 0.09, 0.22, 'plastic-black'), c(0.055, 0.055, 0.006, 'plastic-white', 0, 0.09, 0.05), c(0.02, 0.02, 0.008, 'paper', 0, 0.092, 0.05), b(0.24, 0.035, 0.05, 'plastic-black', 0, 0.1, -0.06), c(0.008, 0.008, 0.14, 'black', 0.12, 0.02, 0, 0, 0, 90)] },
  handheld: { label: '携帯ゲーム機', group: 'device', main: '#a0a4a8', parts: [b(0.09, 0.02, 0.145, '$'), b(0.06, 0.002, 0.05, 'screen-off', 0, 0.02, -0.03), c(0.009, 0.009, 0.004, 'red', 0.025, 0.02, 0.04), b(0.022, 0.004, 0.007, 'black', -0.022, 0.02, 0.04), b(0.007, 0.004, 0.022, 'black', -0.022, 0.02, 0.04)] },
  'small-tv': { label: '小型テレビ', group: 'device', main: '#5a4a3a', parts: [b(0.3, 0.24, 0.24, '$'), b(0.22, 0.17, 0.004, 'screen-off', -0.03, 0.04, 0.12), c(0.012, 0.012, 0.01, 'gray', 0.11, 0.18, 0.12, 90), c(0.002, 0.002, 0.2, 'steel', -0.04, 0.24, 0, 0, 0, 25), c(0.002, 0.002, 0.2, 'steel', 0.04, 0.24, 0, 0, 0, -25)] },
  // ---- 道具 ----
  hammer: { label: '金槌', group: 'tool', parts: [lie(0.012, 0.012, 0.28, 'wood'), b(0.03, 0.03, 0.1, 'dark-steel', 0.14, -0.015, 0)] },
  screwdriver: { label: 'ドライバー', group: 'tool', main: '#e0b830', parts: [lie(0.014, 0.014, 0.1, '$'), lie(0.003, 0.003, 0.12, 'steel', 0.11)] },
  wrench: { label: 'スパナ', group: 'tool', parts: [b(0.2, 0.006, 0.02, 'steel'), t(0.018, 0.006, 'steel', 0.11, 0.003, 0, 90, 0, 0, 280), t(0.016, 0.006, 'steel', -0.11, 0.003, 0, 90)] },
  pliers: { label: 'ペンチ', group: 'tool', main: '#c03020', parts: [b(0.1, 0.012, 0.012, '$', -0.03, 0, 0.012, 0, 8), b(0.1, 0.012, 0.012, '$', -0.03, 0, -0.012, 0, -8), b(0.06, 0.014, 0.024, 'dark-steel', 0.06)] },
  crowbar: { label: 'バール', group: 'tool', main: '#b02a20', parts: [lie(0.01, 0.01, 0.5, '$'), t(0.03, 0.01, '$', 0.25, 0.03, 0, 0, 0, 0, 180)] },
  saw: { label: 'のこぎり', group: 'tool', parts: [b(0.32, 0.002, 0.08, 'steel', 0.06), lie(0.014, 0.014, 0.14, 'wood', -0.16)] },
  cutter: { label: 'カッター', group: 'tool', main: '#e0b830', parts: [b(0.14, 0.012, 0.02, '$'), b(0.04, 0.002, 0.012, 'steel', 0.088, 0.005)] },
  axe: { label: '斧', group: 'tool', parts: [lie(0.016, 0.016, 0.4, 'wood'), b(0.04, 0.14, 0.02, 'dark-steel', 0.17, -0.02), b(0.006, 0.14, 0.022, 'steel', 0.19, -0.02)] },
  'rope-coil': { label: '縄の束', group: 'tool', parts: [t(0.08, 0.018, 'rope', 0, 0.018, 0, 90), t(0.06, 0.018, 'rope', 0, 0.05, 0, 90)] },
  'tape-measure': { label: '巻き尺', group: 'tool', main: '#e0b830', parts: [c(0.035, 0.035, 0.025, '$', 0, 0, 0, 90), b(0.02, 0.004, 0.018, 'steel', 0.04, 0)] },
  'oil-can': { label: '油差し', group: 'tool', main: '#b02a20', parts: [c(0.045, 0.05, 0.07, '$'), c(0.004, 0.01, 0.12, 'steel', 0.03, 0.07, 0, 0, 0, -40)] },
  'wire-cutter': { label: '針金切り', group: 'tool', main: '#2a5aa0', parts: [b(0.12, 0.012, 0.012, '$', -0.04, 0, 0.014, 0, 6), b(0.12, 0.012, 0.012, '$', -0.04, 0, -0.014, 0, -6), b(0.05, 0.012, 0.03, 'dark-steel', 0.06)] },
  chisel: { label: 'のみ', group: 'tool', parts: [lie(0.012, 0.014, 0.1, 'wood'), b(0.12, 0.006, 0.014, 'steel', 0.11)] },
  'nail-box': { label: '釘の箱', group: 'tool', parts: [b(0.1, 0.04, 0.06, 'cardboard'), ...[0, 1, 2].map((i) => c(0.002, 0.002, 0.05, 'steel', -0.02 + i * 0.02, 0.0, 0.034, 70))] },
  glue: { label: '接着剤', group: 'tool', main: '#e8e8e4', parts: [c(0.02, 0.02, 0.08, '$'), c(0.008, 0.02, 0.025, 'yellow', 0, 0.08)] },
  sickle: { label: '鎌', group: 'tool', parts: [lie(0.012, 0.012, 0.25, 'wood'), t(0.08, 0.004, 'steel', 0.045, 0.004, 0, 90, 0, 0, 160)] },
  // ---- 医療 ----
  'pill-bottle': { label: '薬の瓶', group: 'medical', parts: [c(0.025, 0.025, 0.07, 'label-pill'), c(0.027, 0.027, 0.02, 'white', 0, 0.07)] },
  'medicine-box': { label: '薬箱（小）', group: 'medical', parts: [b(0.1, 0.03, 0.06, 'label-pill')] },
  syringe: { label: '注射器', group: 'medical', parts: [lie(0.008, 0.008, 0.08, 'glass'), lie(0.0008, 0.0008, 0.035, 'steel', 0.055), b(0.004, 0.02, 0.02, 'plastic-white', -0.045, -0.01), lie(0.003, 0.003, 0.04, 'plastic-white', -0.06)] },
  bandage: { label: '包帯', group: 'medical', parts: [c(0.03, 0.03, 0.06, 'cloth', 0, 0.03, 0, 90), c(0.01, 0.01, 0.062, 'white', 0, 0.03, 0, 90)] },
  'first-aid-kit': { label: '救急箱', group: 'medical', main: '#e8e8e4', parts: [b(0.26, 0.12, 0.16, '$'), b(0.06, 0.002, 0.02, 'red', 0, 0.12), b(0.02, 0.002, 0.06, 'red', 0, 0.12), b(0.08, 0.015, 0.012, 'gray', 0, 0.12, -0.05)] },
  thermometer: { label: '体温計', group: 'medical', parts: [lie(0.005, 0.005, 0.12, 'plastic-white'), lie(0.003, 0.003, 0.015, 'steel', 0.067), b(0.03, 0.001, 0.008, 'screen-off', -0.02, 0.005)] },
  ampoule: { label: 'アンプル', group: 'medical', parts: [c(0.008, 0.008, 0.04, 'glass-amber'), c(0.003, 0.008, 0.015, 'glass-amber', 0, 0.04), c(0.004, 0.003, 0.012, 'glass-amber', 0, 0.055)] },
  'iv-bag': { label: '点滴の袋', group: 'medical', parts: [b(0.12, 0.02, 0.18, 'glass'), b(0.06, 0.002, 0.06, 'label-pill', 0, 0.02), c(0.004, 0.004, 0.05, 'plastic-white', 0, 0.01, 0.1, 90)] },
  'face-mask': { label: 'マスク', group: 'medical', parts: [b(0.17, 0.012, 0.09, 'cloth', 0, 0, 0, 0, 0, 0), t(0.03, 0.002, 'white', -0.09, 0.006, 0, 90), t(0.03, 0.002, 'white', 0.09, 0.006, 0, 90)] },
  stethoscope: { label: '聴診器', group: 'medical', parts: [t(0.08, 0.004, 'rubber', 0, 0.004, 0, 90, 0, 0, 300), c(0.02, 0.02, 0.012, 'steel', 0.08, 0, 0.03), t(0.03, 0.003, 'steel', -0.04, 0.004, -0.06, 90, 0, 0, 180)] },
  // ---- 台所・食べ物 ----
  yunomi: { label: '湯呑', group: 'kitchen', parts: [c(0.035, 0.03, 0.09, 'ceramic-brown')] },
  mug: { label: 'マグカップ', group: 'kitchen', main: '#eceae2', parts: [c(0.04, 0.04, 0.09, 'ceramic'), t(0.025, 0.007, 'ceramic', 0.045, 0.045, 0, 0, 0, 0, 180)] },
  teapot: { label: '急須', group: 'kitchen', parts: [s(0.06, 'ceramic-brown', 0, 0, 0, 1, 0.8, 1), c(0.025, 0.03, 0.01, 'ceramic-brown', 0, 0.095), c(0.008, 0.014, 0.07, 'ceramic-brown', 0.07, 0.04, 0, 0, 0, -55), lie(0.012, 0.014, 0.07, 'ceramic-brown', -0.06, 0.05, 0, 30)] },
  'rice-bowl': { label: '茶碗', group: 'kitchen', parts: [c(0.06, 0.03, 0.06, 'ceramic-blue', 0, 0.008), c(0.025, 0.025, 0.008, 'ceramic-blue')] },
  chopsticks: { label: '箸', group: 'kitchen', parts: [lie(0.003, 0.004, 0.22, 'lacquer-red', 0, 0, 0.006), lie(0.003, 0.004, 0.22, 'lacquer-red', 0, 0, -0.006)] },
  plate: { label: '皿', group: 'kitchen', parts: [c(0.1, 0.07, 0.02, 'ceramic-blue')] },
  'canned-food': { label: '缶詰', group: 'kitchen', parts: [c(0.038, 0.038, 0.06, 'label-can'), c(0.036, 0.036, 0.003, 'steel', 0, 0.06)] },
  bento: { label: '弁当箱', group: 'kitchen', main: '#2a5aa0', parts: [b(0.18, 0.05, 0.11, '$'), b(0.182, 0.012, 0.112, 'plastic-white', 0, 0.05), b(0.008, 0.064, 0.114, 'cloth-red')] },
  onigiri: { label: 'おにぎり', group: 'kitchen', parts: [c(0.05, 0.05, 0.035, 'food', 0, 0, 0, -90, 0, 0, 3), b(0.042, 0.028, 0.037, 'nori', 0, 0, 0)] },
  apple: { label: 'りんご', group: 'kitchen', main: '#b02a20', parts: [s(0.04, '$', 0, 0, 0, 1, 0.9, 1), c(0.002, 0.002, 0.02, 'wood-dark', 0, 0.07)] },
  bread: { label: 'パン', group: 'kitchen', parts: [s(0.07, 'envelope', 0, 0, 0, 1.3, 0.5, 0.8)] },
  kettle: { label: 'やかん', group: 'kitchen', parts: [c(0.07, 0.09, 0.1, 'steel'), s(0.07, 'steel', 0, 0.06, 0, 1, 0.5, 1), t(0.05, 0.006, 'black', 0, 0.16, 0, 0, 0, 0, 180), c(0.01, 0.018, 0.08, 'steel', 0.09, 0.03, 0, 0, 0, -50)] },
  ladle: { label: '柄杓', group: 'kitchen', parts: [c(0.035, 0.035, 0.05, 'wood'), lie(0.006, 0.006, 0.28, 'bamboo', 0.16, 0.04)] },
  tokkuri: { label: '徳利', group: 'kitchen', parts: [s(0.045, 'ceramic', 0, 0, 0, 1, 1.1, 1), c(0.012, 0.02, 0.06, 'ceramic', 0, 0.08), c(0.016, 0.012, 0.01, 'ceramic', 0, 0.14)] },
  sakazuki: { label: '盃', group: 'kitchen', parts: [c(0.035, 0.015, 0.015, 'lacquer-red', 0, 0.008), c(0.018, 0.02, 0.008, 'lacquer-red')] },
  'salt-mound': { label: '盛り塩', group: 'kitchen', parts: [c(0.05, 0.05, 0.008, 'ceramic'), c(0, 0.03, 0.05, 'white', 0, 0.008, 0, 0, 0, 0, 8)] },
  'pet-bottle': { label: 'ペットボトル', group: 'kitchen', parts: [c(0.032, 0.032, 0.17, 'glass'), c(0.033, 0.033, 0.06, 'label-can', 0, 0.05), c(0.013, 0.032, 0.03, 'glass', 0, 0.17), c(0.014, 0.014, 0.015, 'white', 0, 0.2)] },
  'cup-noodle': { label: 'カップ麺', group: 'kitchen', parts: [c(0.05, 0.04, 0.1, 'label-can'), c(0.05, 0.05, 0.003, 'paper', 0, 0.1)] },
  // ---- 和・祈り ----
  omamori: { label: 'お守り', group: 'shrine', main: '#a01e28', parts: [b(0.045, 0.008, 0.07, 'kimono'), t(0.008, 0.002, 'yellow', 0, 0.004, -0.04, 90)] },
  juzu: { label: '数珠', group: 'shrine', parts: [t(0.06, 0.007, 'wood-dark', 0, 0.007, 0, 90, 0, 0, 360), s(0.012, 'wood-dark', 0, 0, 0.065), c(0.003, 0.008, 0.03, 'cloth-red', 0, 0, 0.08, 90)] },
  bell: { label: '鈴', group: 'shrine', parts: [s(0.025, 'brass'), b(0.03, 0.002, 0.004, 'black', 0, 0.022, 0), t(0.008, 0.002, 'brass', 0, 0.05, 0, 0, 0, 0)] },
  'hand-mirror': { label: '手鏡', group: 'shrine', parts: [c(0.06, 0.06, 0.008, 'lacquer-red'), c(0.054, 0.054, 0.002, 'steel', 0, 0.008), b(0.1, 0.01, 0.024, 'lacquer-red', 0.1)] },
  comb: { label: '櫛', group: 'shrine', parts: [b(0.09, 0.006, 0.02, 'lacquer', 0, 0, 0.01), ...Array.from({ length: 12 }, (_, i) => b(0.003, 0.004, 0.025, 'lacquer', -0.04 + i * 0.0073, 0, -0.012))] },
  kanzashi: { label: '簪', group: 'shrine', parts: [lie(0.002, 0.003, 0.16, 'lacquer'), s(0.016, 'red', 0.085), s(0.008, 'gold', 0.1, 0, 0.012)] },
  kokeshi: { label: 'こけし', group: 'shrine', parts: [c(0.025, 0.03, 0.12, 'kimono'), s(0.032, 'doll', 0, 0.12, 0, 1, 1, 1, -90)] },
  daruma: { label: 'だるま', group: 'shrine', parts: [s(0.06, 'daruma', 0, 0, 0, 1, 1.05, 1, -90)] },
  'fox-mask': { label: '狐の面', group: 'shrine', parts: [s(0.08, 'fox', 0, 0, 0, 0.35, 1.1, 0.9, -90), c(0, 0.02, 0.06, 'fox', -0.05, 0.1, 0, 0, 0, 20), c(0, 0.02, 0.06, 'fox', 0.05, 0.1, 0, 0, 0, -20)] },
  ihai: { label: '位牌', group: 'shrine', parts: [b(0.08, 0.03, 0.05, 'lacquer'), b(0.05, 0.18, 0.012, 'lacquer', 0, 0.03), b(0.06, 0.02, 0.016, 'gold', 0, 0.2)] },
  incense: { label: '線香の束', group: 'shrine', main: '#3a6a3a', parts: [...Array.from({ length: 8 }, (_, i) => lie(0.0015, 0.0015, 0.14, '$', 0, 0, (i - 4) * 0.004)), b(0.012, 0.012, 0.04, 'paper', 0, -0.004)] },
  'incense-burner': { label: '香炉', group: 'shrine', parts: [c(0.05, 0.04, 0.05, 'brass', 0, 0.015), ...[0, 120, 240].map((a) => c(0.006, 0.004, 0.02, 'brass', 0.035 * Math.cos((a * Math.PI) / 180), 0, 0.035 * Math.sin((a * Math.PI) / 180))), c(0.001, 0.001, 0.1, 'green', 0, 0.06)] },
  gohei: { label: '御幣', group: 'shrine', parts: [lie(0.005, 0.005, 0.3, 'wood'), ...[0, 1, 2, 3].map((i) => b(0.025, 0.002, 0.05, 'paper', 0.1 + i * 0.02, 0.006, i % 2 ? 0.03 : -0.03, 0, 0, i % 2 ? 10 : -10))] },
  ema: { label: '絵馬', group: 'shrine', parts: [b(0.15, 0.01, 0.1, 'wood'), b(0.1, 0.002, 0.04, 'note', 0, 0.01, 0.01)] },
  omikuji: { label: 'おみくじ', group: 'shrine', parts: [b(0.025, 0.005, 0.12, 'paper', 0, 0, 0, 0, 0, 0), b(0.02, 0.006, 0.03, 'red', 0, 0, 0.03)] },
  sensu: { label: '扇子', group: 'shrine', parts: [...Array.from({ length: 9 }, (_, i) => b(0.18, 0.002, 0.012, 'washi', 0.09 * Math.cos(((i - 4) * 12 * Math.PI) / 180) - 0.09, i * 0.001, 0.09 * Math.sin(((i - 4) * 12 * Math.PI) / 180), 0, (i - 4) * 12, 0)), c(0.006, 0.006, 0.012, 'black', -0.18 + 0.18, 0, 0)] },
  kiseru: { label: '煙管', group: 'shrine', parts: [lie(0.004, 0.004, 0.2, 'bamboo'), lie(0.005, 0.005, 0.03, 'brass', 0.1), c(0.008, 0.005, 0.015, 'brass', 0.115, 0.004), lie(0.004, 0.005, 0.03, 'brass', -0.1)] },
  abacus: { label: '算盤', group: 'shrine', parts: [b(0.3, 0.02, 0.09, 'wood-dark'), b(0.28, 0.022, 0.006, 'wood-dark', 0, 0, -0.012), ...Array.from({ length: 13 }, (_, i) => s(0.007, 'black', -0.13 + i * 0.0217, 0.016, 0.02, 1, 0.6, 1))] },
  // ---- 身の回り ----
  wallet: { label: '財布', group: 'personal', parts: [b(0.11, 0.018, 0.09, 'leather')] },
  glasses: { label: '眼鏡', group: 'personal', parts: [t(0.022, 0.0025, 'black', -0.027, 0.02, 0), t(0.022, 0.0025, 'black', 0.027, 0.02, 0), c(0.02, 0.02, 0.001, 'glass', -0.027, 0.02, 0, 90), c(0.02, 0.02, 0.001, 'glass', 0.027, 0.02, 0, 90), b(0.004, 0.003, 0.12, 'black', -0.05, 0.02, -0.06), b(0.004, 0.003, 0.12, 'black', 0.05, 0.02, -0.06)] },
  wristwatch: { label: '腕時計', group: 'personal', parts: [t(0.03, 0.006, 'leather-black', 0, 0.03, 0, 0, 0, 0), c(0.018, 0.018, 0.01, 'steel', 0, 0.056, 0, 90), c(0.015, 0.015, 0.002, 'paper', 0, 0.056, 0.006, 90)] },
  hat: { label: '帽子', group: 'personal', main: '#f0f0ee', parts: [c(0.16, 0.16, 0.008, '$'), c(0.08, 0.09, 0.09, '$', 0, 0.008), b(0.18, 0.02, 0.012, 'cloth-red', 0, 0.02, 0, 0, 0, 0)] },
  umbrella: { label: '傘（たたんだ）', group: 'personal', main: '#2a2a2a', parts: [lie(0.03, 0.006, 0.6, '$'), lie(0.004, 0.004, 0.66, 'steel'), t(0.03, 0.006, 'wood', -0.33, 0.03, 0, 0, 0, 0, 200)] },
  handkerchief: { label: 'ハンカチ', group: 'personal', parts: [b(0.12, 0.006, 0.12, 'check')] },
  ring: { label: '指輪', group: 'personal', parts: [t(0.01, 0.002, 'gold', 0, 0.012, 0), s(0.004, 'glass', 0, 0.024)] },
  necklace: { label: '首飾り', group: 'personal', parts: [t(0.06, 0.0015, 'gold', 0, 0.002, 0, 90, 0, 0, 340), s(0.008, 'red', 0, 0, 0.065)] },
  lipstick: { label: '口紅', group: 'personal', parts: [c(0.009, 0.009, 0.05, 'gold'), c(0.0075, 0.0075, 0.02, 'red', 0, 0.05)] },
  compact: { label: 'コンパクト', group: 'personal', parts: [c(0.035, 0.035, 0.012, 'gold'), c(0.03, 0.03, 0.001, 'steel', 0, 0.012)] },
  toothbrush: { label: '歯ブラシ', group: 'personal', main: '#3a8ac0', parts: [b(0.17, 0.008, 0.012, '$'), b(0.025, 0.012, 0.01, 'white', 0.07, 0.008)] },
  towel: { label: 'タオル', group: 'personal', main: '#f0f0ee', parts: [b(0.2, 0.04, 0.12, 'cloth')] },
  'name-badge': { label: '名札', group: 'personal', parts: [b(0.07, 0.004, 0.04, 'plastic-white'), b(0.06, 0.001, 0.025, 'note', 0, 0.004), b(0.04, 0.003, 0.006, 'steel', 0, -0.002, -0.015)] },
  shoe: { label: '靴', group: 'personal', main: '#3a2a1e', parts: [b(0.09, 0.03, 0.26, 'leather'), b(0.08, 0.06, 0.12, 'leather', 0, 0.03, 0.06), b(0.092, 0.012, 0.262, 'rubber', 0, -0.01)] },
  glove: { label: '軍手', group: 'personal', parts: [b(0.09, 0.012, 0.11, 'cloth'), ...[0, 1, 2, 3].map((i) => b(0.016, 0.012, 0.06, 'cloth', -0.033 + i * 0.022, 0, -0.08)), b(0.018, 0.012, 0.05, 'cloth', 0.06, 0, -0.02, 0, -35)] },
  hairpin: { label: 'ヘアピン', group: 'personal', parts: [b(0.05, 0.002, 0.003, 'black', 0, 0, 0.002), b(0.05, 0.002, 0.003, 'black', 0, 0, -0.002, 0, 3), s(0.006, 'red', -0.02, 0.002, 0)] },
  // ---- お金・切符 ----
  coins: { label: '小銭', group: 'money', parts: [c(0.011, 0.011, 0.002, 'copper-coin', 0, 0), c(0.012, 0.012, 0.002, 'steel', 0.02, 0), c(0.011, 0.011, 0.002, 'gold', 0.01, 0.002, 0.018)] },
  banknote: { label: 'お札（紙幣）', group: 'money', parts: [b(0.15, 0.003, 0.076, 'banknote')] },
  'old-coin': { label: '古銭', group: 'money', parts: [c(0.012, 0.012, 0.002, 'copper-coin', 0, 0, 0, 0, 0, 0, 24)] },
  koban: { label: '小判', group: 'money', parts: [s(0.03, 'gold', 0, 0, 0, 0.6, 0.06, 1)] },
  ticket: { label: '切符', group: 'money', parts: [b(0.057, 0.001, 0.03, 'note')] },
  receipt: { label: 'レシート', group: 'money', parts: [b(0.058, 0.001, 0.15, 'ruled')] },
  // ---- 玩具 ----
  ball: { label: 'まり', group: 'toy', main: '#c03020', parts: [s(0.05, 'kimono'), t(0.05, 0.003, 'yellow', 0, 0.05, 0, 90)] },
  'teddy-bear': { label: 'くまのぬいぐるみ', group: 'toy', parts: [s(0.06, 'fur', 0, 0, 0, 1, 1.1, 0.9), s(0.045, 'fur', 0, 0.12), s(0.015, 'fur', -0.035, 0.16), s(0.015, 'fur', 0.035, 0.16), s(0.006, 'black', -0.015, 0.13, 0.04), s(0.006, 'black', 0.015, 0.13, 0.04), s(0.022, 'fur', -0.06, 0.02, 0.02), s(0.022, 'fur', 0.06, 0.02, 0.02)] },
  'toy-car': { label: 'ミニカー', group: 'toy', main: '#c03020', parts: [b(0.08, 0.02, 0.035, '$', 0, 0.01), b(0.04, 0.016, 0.032, 'glass', -0.005, 0.03), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => c(0.009, 0.009, 0.006, 'rubber', sx * 0.025, 0.009, sz * 0.018, 90)))] },
  'spinning-top': { label: '独楽', group: 'toy', parts: [c(0.04, 0.0, 0.04, 'wood-red'), c(0.006, 0.006, 0.03, 'wood', 0, 0.04)] },
  kendama: { label: 'けん玉', group: 'toy', parts: [c(0.008, 0.008, 0.14, 'wood'), lie(0.016, 0.016, 0.07, 'wood', 0, 0.09), s(0.03, 'lacquer-red', 0.06, 0)] },
  'origami-crane': { label: '折り鶴', group: 'toy', main: '#c03020', parts: [b(0.05, 0.03, 0.02, '$', 0, 0, 0, 0, 45, 0), b(0.06, 0.002, 0.03, '$', -0.03, 0.03, 0, 0, 0, 20), b(0.06, 0.002, 0.03, '$', 0.03, 0.03, 0, 0, 0, -20), b(0.004, 0.05, 0.004, '$', 0.03, 0.01, 0, 0, 0, -30)] },
  marbles: { label: 'ビー玉', group: 'toy', parts: [s(0.008, 'glass', 0, 0, 0), s(0.008, 'glass-green', 0.018, 0, 0.005), s(0.008, 'glass-amber', 0.008, 0, -0.016), s(0.008, 'glass', -0.015, 0, 0.012)] },
  dice: { label: 'さいころ', group: 'toy', parts: [b(0.02, 0.02, 0.02, 'white'), s(0.003, 'red', 0, 0.02, 0, 1, 0.3, 1)] },
  'playing-cards': { label: 'トランプ', group: 'toy', parts: [b(0.063, 0.018, 0.088, 'card')] },
  'music-box': { label: 'オルゴール', group: 'toy', parts: [b(0.12, 0.06, 0.08, 'wood-red'), b(0.122, 0.012, 0.082, 'wood-dark', 0, 0.06), c(0.005, 0.005, 0.02, 'brass', 0.065, 0.03, 0, 0, 0, 90)] },
  crayons: { label: 'クレヨン', group: 'toy', parts: [b(0.1, 0.012, 0.07, 'cardboard'), ...['red', 'blue', 'yellow', 'green', 'black'].map((m, i) => lie(0.004, 0.004, 0.07, m, 0, 0.012, -0.024 + i * 0.012))] },
  ohajiki: { label: 'おはじき', group: 'toy', parts: [...[['glass', 0, 0], ['glass-green', 0.022, 0.01], ['glass-amber', -0.012, 0.02], ['glass', 0.01, -0.02]].map(([m, x, z]) => c(0.009, 0.009, 0.003, m, x, 0, z))] },
  // ---- 怪異・証拠 ----
  'straw-doll': { label: '藁人形', group: 'occult', parts: [c(0.014, 0.014, 0.12, 'straw'), s(0.022, 'straw', 0, 0.13), lie(0.01, 0.01, 0.1, 'straw', 0, 0.09), c(0.002, 0.002, 0.08, 'steel', 0, 0.07, 0.02, 90)] },
  'nail-bundle': { label: '五寸釘', group: 'occult', parts: [...[0, 1, 2].map((i) => lie(0.003, 0.003, 0.15, 'rust', 0, 0, (i - 1) * 0.01)), b(0.02, 0.012, 0.035, 'paper', 0, -0.003)] },
  'hair-bundle': { label: '髪の束', group: 'occult', parts: [lie(0.012, 0.004, 0.2, 'hair'), lie(0.013, 0.013, 0.012, 'paper', -0.06)] },
  'puzzle-box': { label: '寄木の箱', group: 'occult', parts: [b(0.12, 0.08, 0.12, 'wood-dark'), b(0.124, 0.02, 0.124, 'wood', 0, 0.02), b(0.124, 0.01, 0.124, 'wood-red', 0, 0.05)] },
  'mirror-shard': { label: '鏡の破片', group: 'occult', parts: [c(0.0, 0.06, 0.003, 'steel', 0, 0, 0, 0, 20, 0, 3)] },
  'burnt-paper': { label: '焼けた紙', group: 'occult', parts: [b(0.14, 0.002, 0.1, 'paper-old'), b(0.05, 0.003, 0.1, 'black', 0.06, 0, 0, 0, 10)] },
  'red-string': { label: '赤い紐', group: 'occult', parts: [t(0.04, 0.0025, 'red', 0, 0.003, 0, 90, 0, 0, 330), t(0.025, 0.0025, 'red', 0.02, 0.006, 0.02, 90, 0, 0, 270)] },
  hokora: { label: '小さな祠', group: 'occult', parts: [b(0.16, 0.03, 0.12, 'stone'), b(0.12, 0.12, 0.09, 'wood-dark', 0, 0.03), b(0.18, 0.02, 0.14, 'wood-dark', 0, 0.15, 0, 0, 0, 0), b(0.03, 0.06, 0.002, 'ofuda', 0, 0.06, 0.046)] },
  bone: { label: '骨', group: 'occult', parts: [lie(0.008, 0.008, 0.12, 'bone'), s(0.012, 'bone', 0.06, 0, 0.006), s(0.012, 'bone', 0.06, 0, -0.006), s(0.012, 'bone', -0.06, 0, 0.006), s(0.012, 'bone', -0.06, 0, -0.006)] },
  'animal-skull': { label: '獣の頭骨', group: 'occult', parts: [s(0.045, 'bone', 0, 0, -0.01, 1, 0.75, 1.1), s(0.03, 'bone', 0, 0.004, 0.05, 0.75, 0.55, 1.5), s(0.011, 'black', -0.024, 0.042, 0.032), s(0.011, 'black', 0.024, 0.042, 0.032), s(0.006, 'black', -0.008, 0.02, 0.095), s(0.006, 'black', 0.008, 0.02, 0.095)] },
  'crystal-ball': { label: '水晶玉', group: 'occult', parts: [c(0.04, 0.05, 0.03, 'wood-dark'), s(0.05, 'glass', 0, 0.03)] },
  'kokkuri-sheet': { label: '文字の紙（こっくりさん）', group: 'occult', parts: [b(0.3, 0.002, 0.22, 'note'), t(0.03, 0.003, 'red', 0, 0.003, -0.06, 90), c(0.012, 0.012, 0.003, 'copper-coin', 0.05, 0.003, 0.02)] },
  // ---- 自然 ----
  stone: { label: '石', group: 'nature', parts: [s(0.04, 'stone', 0, 0, 0, 1.2, 0.6, 0.9)] },
  shell: { label: '貝殻', group: 'nature', parts: [s(0.03, 'ceramic', 0, 0, 0, 1, 0.35, 0.85), b(0.016, 0.01, 0.01, 'ceramic', 0, 0, -0.026)] },
  feather: { label: '羽根', group: 'nature', main: '#f0f0ee', parts: [s(0.06, '$', 0, 0, 0, 0.25, 0.04, 1), lie(0.0015, 0.0015, 0.15, 'gray', 0, 0.002, 0, 90)] },
  flower: { label: '花', group: 'nature', main: '#e0e0f0', parts: [lie(0.002, 0.002, 0.18, 'green'), ...[0, 72, 144, 216, 288].map((a) => s(0.014, '$', 0.09 + 0.014 * Math.cos((a * Math.PI) / 180), 0.002, 0.014 * Math.sin((a * Math.PI) / 180), 1, 0.3, 1)), s(0.007, 'yellow', 0.09, 0.006)] },
  pinecone: { label: '松ぼっくり', group: 'nature', parts: [s(0.025, 'wood-dark', 0, 0, 0, 1, 1.4, 1), c(0.0, 0.02, 0.025, 'wood-dark', 0, 0.035)] },
  crystal: { label: '水晶の原石', group: 'nature', parts: [c(0.0, 0.015, 0.06, 'glass', 0, 0, 0, 0, 0, 0, 6), c(0.0, 0.012, 0.045, 'glass', 0.018, 0, 0.004, 0, 0, -20, 6), c(0.0, 0.01, 0.04, 'glass', -0.015, 0, -0.008, 0, 0, 22, 6)] },
  // ---- 入れ物 ----
  crate: { label: '木箱', group: 'container', parts: [b(0.4, 0.3, 0.3, 'wood'), b(0.42, 0.04, 0.02, 'wood-dark', 0, 0.13, 0.155), b(0.42, 0.04, 0.02, 'wood-dark', 0, 0.13, -0.155)] },
  'tin-box': { label: '缶の箱', group: 'container', main: '#3a6aa0', parts: [b(0.18, 0.06, 0.12, '$'), b(0.184, 0.015, 0.124, 'steel', 0, 0.06)] },
  'jewelry-box': { label: '宝石箱', group: 'container', parts: [b(0.12, 0.06, 0.08, 'lacquer-red'), b(0.124, 0.025, 0.084, 'lacquer-red', 0, 0.06), b(0.014, 0.014, 0.004, 'gold', 0, 0.05, 0.042)] },
  kinchaku: { label: '巾着', group: 'container', parts: [s(0.06, 'kimono-navy', 0, 0, 0, 1, 1.1, 1), c(0.02, 0.035, 0.03, 'kimono-navy', 0, 0.11), t(0.025, 0.003, 'red', 0, 0.115, 0, 90)] },
  basket: { label: '籠', group: 'container', parts: [c(0.12, 0.09, 0.12, 'straw', 0, 0, 0, 0, 0, 0, 20), t(0.11, 0.008, 'bamboo', 0, 0.12, 0, 0, 0, 0, 180)] },
  backpack: { label: 'リュック', group: 'container', main: '#3a4a3a', parts: [b(0.3, 0.4, 0.15, 'indigo'), b(0.24, 0.16, 0.06, 'indigo', 0, 0.06, 0.1), b(0.3, 0.06, 0.16, 'indigo', 0, 0.36)] },
  suitcase: { label: 'トランク', group: 'container', parts: [b(0.5, 0.2, 0.34, 'leather'), t(0.04, 0.008, 'leather-black', 0, 0.22, 0, 0, 0, 0, 180), b(0.52, 0.02, 0.02, 'brass', 0, 0.1, 0.17)] },
  briefcase: { label: '書類鞄', group: 'container', parts: [b(0.42, 0.08, 0.3, 'leather-black'), t(0.04, 0.008, 'leather-black', 0, 0.08, 0.15, 90, 0, 0, 180), b(0.03, 0.02, 0.01, 'brass', -0.1, 0.06, 0.15), b(0.03, 0.02, 0.01, 'brass', 0.1, 0.06, 0.15)] },
  'paper-bag': { label: '紙袋', group: 'container', parts: [b(0.24, 0.3, 0.12, 'cardboard'), t(0.05, 0.004, 'rope', 0, 0.3, 0.04, 0, 0, 0, 180), t(0.05, 0.004, 'rope', 0, 0.3, -0.04, 0, 0, 0, 180)] },
  'cash-box': { label: '手提げ金庫', group: 'container', main: '#3a5a4a', parts: [b(0.26, 0.09, 0.18, '$'), b(0.264, 0.02, 0.184, '$', 0, 0.09), c(0.012, 0.012, 0.01, 'steel', 0, 0.05, 0.095, 90), t(0.04, 0.006, 'black', 0, 0.11, 0, 0, 0, 0, 180)] },
  // ---- 部品 ----
  gear: { label: '歯車', group: 'parts', parts: [c(0.05, 0.05, 0.012, 'brass', 0, 0, 0, 0, 0, 0, 24), ...Array.from({ length: 12 }, (_, i) => b(0.014, 0.012, 0.014, 'brass', 0.055 * Math.cos((i * 30 * Math.PI) / 180), 0, 0.055 * Math.sin((i * 30 * Math.PI) / 180), 0, -i * 30, 0)), c(0.012, 0.012, 0.014, 'black')] },
  fuse: { label: 'ヒューズ', group: 'parts', parts: [lie(0.006, 0.006, 0.03, 'glass'), lie(0.0065, 0.0065, 0.008, 'steel', 0.017), lie(0.0065, 0.0065, 0.008, 'steel', -0.017), lie(0.0008, 0.0008, 0.03, 'gray')] },
  'valve-handle': { label: 'バルブの取っ手', group: 'parts', main: '#b02a20', parts: [t(0.06, 0.008, '$', 0, 0.008, 0, 90), b(0.12, 0.012, 0.012, '$', 0, 0.002), b(0.012, 0.012, 0.12, '$', 0, 0.002), c(0.014, 0.014, 0.02, 'steel')] },
  'film-reel': { label: 'フィルムのリール', group: 'parts', parts: [c(0.09, 0.09, 0.004, 'steel'), c(0.07, 0.07, 0.016, 'black', 0, 0.004), c(0.09, 0.09, 0.004, 'steel', 0, 0.02), c(0.015, 0.015, 0.026, 'dark-steel')] },
  'vinyl-record': { label: 'レコード盤', group: 'parts', parts: [c(0.15, 0.15, 0.002, 'black', 0, 0, 0, 0, 0, 0, 32), c(0.045, 0.045, 0.0025, 'red', 0, 0)] },
  'circuit-board': { label: '基板', group: 'parts', parts: [b(0.12, 0.003, 0.08, 'circuit'), b(0.02, 0.008, 0.015, 'black', 0.02, 0.003, 0.01), c(0.005, 0.005, 0.015, 'blue', -0.03, 0.003, -0.02)] },
};

/** every standard kind name (the 18 of 1.7 first) */
export const ITEM_KIND_LIST = [...Object.keys(BASIC_KINDS), ...Object.keys(ITEM_RECIPES)];
/** the label of a kind */
export const itemLabel = (k) => BASIC_KINDS[k] || (ITEM_RECIPES[k] && ITEM_RECIPES[k].label) || null;
/** the group of a kind */
export const itemGroup = (k) => (BASIC_KINDS[k] ? 'basic' : ITEM_RECIPES[k] ? ITEM_RECIPES[k].group : null);
/** the item textures (catalog ids) the given kinds need: kit-sync copies them into a game */
export function itemTextures(kinds) {
  const out = new Set();
  for (const k of kinds || []) {
    const r = ITEM_RECIPES[k]; if (!r) continue;
    for (const p of r.parts) { const m = ITEM_MATERIALS[p[p[0] === 'b' ? 4 : p[0] === 'c' ? 4 : p[0] === 's' ? 2 : 3]]; if (m && m.tex) out.add(`item_${m.tex}`); }
  }
  return [...out].sort();
}
