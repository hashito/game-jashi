/* game-kit 1b8c7db: js/mg-library.js — edit in game-kit and run tools/kit-sync.js */
// The mini game LIBRARY: the mini games a game made for itself, kept in the kit so the next game can use them as they are
// (a game is not stuck with the standard set of js/task-minigames.js; each one it adds stays reusable).
//   import pour from './kit/mg-pour.js';
//   import turnDials from './kit/mg-turn-dials.js';
//   import { useMinigames } from './kit/mg-library.js';
//   useMinigames(ext, [pour, [turnDials, { type: 'gate', hooks: { get: () => st.gate, set: (v) => (st.gate = v) } }]]);
//   // a task then says { minigame: { type: 'pour', cfg: { title, lo, hi, ... } } } and game-core opens it (ext.registerMinigame)
// Each library module js/mg-<type>.js exports default { type, about, mount(host, cfg, ctx, hooks) -> Promise<boolean> } and draws in
// js/mg-frame.js (one look, top-anchored, Esc / close = no penalty, ctx.qa = done at once). To add one: `node tools/new-minigame.mjs <name>`
// writes js/mg-<name>.js, its test and the LIBRARY / docs rows; `node tools/check-minigames.mjs` mounts every entry headless (qa, Esc,
// close, top-anchored, keyboard focus, no errors). Hands-on parts (drums, knobs, levers, cranks ...) are js/mg-widgets.js.
// A game takes one with `node tools/kit-sync.js <game> mg-<name>`.
import { mgSoundHook } from './mg-sound.js';

export const LIBRARY = [
  { module: 'mg-pour', type: 'pour', from: '八尺様 ― 境の夜（塩を盛る）', about: '押している間だけ注ぎ、線の高さで離す' },
  { module: 'mg-turn-dials', type: 'turn-dials', from: '八尺様 ― 境の夜（車止めの回し金）', about: '一段ずつ回る金具を手がかりの向きにそろえる' },
  { module: 'mg-match-mark', type: 'match-mark', from: 'ことりばこ（役場の鍵束）', about: '手がかりの印と同じ印の札がついたものを選ぶ' },
  { module: 'mg-timing', type: 'timing', from: 'ことりばこ（結び目に封を貼る）', about: '揺れる印が的の上に来たときに押す' },
  { module: 'mg-code-drums', type: 'code-drums', from: '撤去通知・浦川（パネルのめくりドラム）', about: 'ダイヤル錠を見つけた番号にそろえて開ける' },
  { module: 'mg-tune-radio', type: 'tune-radio', from: '標準 1.8.2（無線・ラジオ・古い受信機）', about: 'つまみを回して雑音の奥の声を探し、合ったところで少し止める' },
  { module: 'mg-trace-path', type: 'trace-path', from: '標準 1.8.2（札の筆・切り取り線・封の糸）', about: '線からはみ出さずに、始めから終わりまでなぞる' },
  { module: 'mg-slide-tiles', type: 'slide-tiles', from: '標準 1.8.2（破れた写真・札の継ぎ合わせ）', about: 'ばらばらの絵を、空いた一枡に滑らせて元に戻す' },
  { module: 'mg-search-dark', type: 'search-dark', from: '標準 1.8.2（懐中電灯で暗がりを探す）', about: '暗い絵を灯りで照らし、隠れた印をすべて見つける' },
  { module: 'mg-rotate-pipes', type: 'rotate-pipes', from: '標準 1.8.2（配管・水路・導線）', about: '管の向きを回して、始めから終わりまで一本につなぐ' },
  { module: 'mg-sort-items', type: 'sort-items', from: '標準 1.8.2（仕分け・棚戻し・供え物）', about: '物を、正しい置き場へ運んで仕分ける' },
  { module: 'mg-memory-pairs', type: 'memory-pairs', from: '標準 1.8.3（札合わせ・写真の組・鍵と錠）', about: '伏せた札をめくって、同じ絵の組をすべてそろえる' },
  { module: 'mg-lock-pick', type: 'lock-pick', from: '標準 1.8.3（古い錠前・南京錠）', about: '錠のピンを一本ずつ、手応えのある高さで止めて開ける' },
  { module: 'mg-photo-focus', type: 'photo-focus', from: '標準 1.8.3（写真機・望遠鏡・心霊写真）', about: 'ピントと構図を合わせて、写るべきものを撮る' },
  { module: 'mg-rhythm-taps', type: 'rhythm-taps', from: '標準 1.8.3（鈴・太鼓・念仏の拍子）', about: '鳴る拍子に合わせて叩き、決まった回数そろえる' },
  { module: 'mg-connect-dots', type: 'connect-dots', from: '標準 1.8.3（星座・結界の印・紋の線）', about: '番号の順に点を結び、印を描き上げる' },
  { module: 'mg-balance-scale', type: 'balance-scale', from: '標準 1.8.4（天秤・量り売り・薬の秤）', about: '分銅を皿に載せて、天秤をまっすぐにする' },
  { module: 'mg-echo-bells', type: 'echo-bells', from: '標準 1.8.4（鈴・風鈴・壁を叩く音）', about: '鳴った鈴の順番を覚えて、同じ順に鳴らす' },
  { module: 'mg-switch-panel', type: 'switch-panel', from: '標準 1.8.4（配電盤・参道の灯籠・制御盤）', about: 'となりの灯りも一緒に切り替わるスイッチで、すべての灯りをつける' },
  { module: 'mg-rotate-pieces', type: 'rotate-pieces', from: '標準 1.8.4（破れた写真・割れた皿・切られた札）', about: '回ってしまった絵の片を、押して正しい向きに戻す' },
  { module: 'mg-count-shadows', type: 'count-shadows', from: '標準 1.8.4（障子の影・窓を横切る人・電線の鴉）', about: '窓の向こうを横切る影の数を数えて答える' },
  { module: 'mg-spot-difference', type: 'spot-difference', from: '標準 1.8.4（昔と今の写真・前後の部屋・帳簿の写し）', about: '二枚の絵を見比べて、違うところをすべて見つける' },
  { module: 'mg-maze-path', type: 'maze-path', from: '標準 1.8.4（暗い廊下の図・からくり箱・地図の道）', about: '迷路の壁にそって灯りを動かし、出口まで連れていく' },
  { module: 'mg-cipher-wheel', type: 'cipher-wheel', from: '標準 1.8.4（ずらし文字の手紙・暗号の円盤）', about: '暗号の円盤を回して、ずらされた文を読める文に戻す' },
  { module: 'mg-steady-hand', type: 'steady-hand', from: '標準 1.8.4（すきま風の灯・振り子・動く人影を追うレンズ）', about: 'ゆっくり動く輪の中に、指先（印）を保ち続ける' },
  { module: 'mg-pump-gauge', type: 'pump-gauge', from: '標準 1.8.4（井戸の手押しポンプ・鞴・古いボイラー）', about: '押して圧を上げ、針を緑の帯に保ち続ける' },
  { module: 'mg-order-steps', type: 'order-steps', from: '標準 1.8.4（儀式の順・手引きの手順・破れた日記）', about: '手順の札を並べ替えて、正しい順番にする' },
  { module: 'mg-compass-bearing', type: 'compass-bearing', from: '標準 1.8.4（羅針盤・地図の方位・手紙の方角）', about: '羅針盤の針を回して、手がかりの方角に合わせる' },
  { module: 'mg-mirror-beam', type: 'mirror-beam', from: '標準 1.8.4（神社の鏡・灯台の光・封を開ける光）', about: '鏡の向きを変えて、光を目印まで届ける' },
  { module: 'mg-kana-word', type: 'kana-word', from: '標準 1.8.4（謎かけ・墓石の名・錠の合言葉）', about: '手がかりを読んで、文字の札で答えの言葉をつづる' },
  { module: 'mg-jug-measure', type: 'jug-measure', from: '標準 1.8.4（御神水・お神酒・灯油）', about: '目盛りのない二つの器で、決まった量をはかり取る' },
  { module: 'mg-hold-breath', type: 'hold-breath', from: '標準 1.8.4（押入れ・床下・屏風の陰に隠れる）', about: '近づいてくる気配のあいだ息を止め、通り過ぎるのを待つ' },
  { module: 'mg-layer-board', type: 'layer-board', from: '標準 1.10.19（検案台の層・報告書の三欄・現場の盤）', about: '層や部品の向き・順番・位置をそろえて照合する' },
];

/** register library mini games with the game's ext: an entry is a module's default, or [default, { type, hooks, sound }] to rename / hook it
 *  (without hooks.sound the mini game plays the kit's default sounds, js/mg-sound.js; { sound: false } keeps it silent) */
export function useMinigames(ext, list) {
  const out = {};
  for (const e of list) {
    const [m, o = {}] = Array.isArray(e) ? e : [e];
    const type = o.type || m.type, hooks = { ...(o.hooks || {}) };
    if (!hooks.sound && o.sound !== false) hooks.sound = mgSoundHook(m.type);   // standard 1.10.18: the default sounds (js/mg-sound.js); sound: false = silent
    const def = { mount: (host, cfg, ctx) => m.mount(host, cfg, ctx, hooks) };
    ext.registerMinigame(type, def);
    out[type] = def;
  }
  return out;
}
