// data/stages.json, tasks.json, items.json, monsters.json for 邪視 5.0 (standard). The seven chapters of 4.x (dist/story.js STORY_STAGES)
// are the seven levels; the 4.x gimmicks are the kit library's mini games. Run: node tools/authoring/make-data.mjs
import fs from 'node:fs';
const out = (f, v) => fs.writeFileSync(new URL(`../../data/${f}`, import.meta.url), JSON.stringify(v, null, 1) + '\n');

out('stages.json', {
  goal: { title: '日が暮れる前に、山を下りる', short: '山を下りる', sub: '別荘から駐車場の車まで戻り、林道ゲートを上げて山を下りる。', meter: '帰り道' },
  levels: [
    { id: 'L1', name: '二階の備品', title: '二階のベランダで、望遠鏡を確かめる', unlocks: ['upstairs'], look: { fog: '#8b938a', density: 0.018, light: 1, background: 'fog' } },
    { id: 'L2', name: '窓の向こう', title: '窓から離れ、雨戸を閉める', unlocks: ['window'], look: { fog: '#7c837b', density: 0.021, light: 0.92 } },
    { id: 'L3', name: '一階の机', title: '机の無線を合わせ、修司の声を拾う', unlocks: ['downstairs'], look: { fog: '#717870', density: 0.023, light: 0.86 } },
    { id: 'L4', name: '帰る支度', title: '西の物置で、ボトルを二本持ち出す', unlocks: ['outside', 'shed'], look: { fog: '#636a63', density: 0.026, light: 0.78 } },
    { id: 'L5', name: '山道の記録', title: '東の避難小屋で、巻上げハンドルを探す', unlocks: ['shelter'], look: { fog: '#545a55', density: 0.029, light: 0.68 } },
    { id: 'L6', name: '戻る道', title: '林道ゲートを、巻き上げる', unlocks: ['road'], look: { fog: '#424844', density: 0.032, light: 0.58, exposure: 0.92 } },
    { id: 'L7', name: '最後の数秒', title: '車を始動して、山を下りる', unlocks: ['gate'], look: { fog: '#323734', density: 0.034, light: 0.5, exposure: 0.88 } },
  ],
  unlocks: {
    upstairs: { name: '別荘の二階', icon: 'building', desc: '最初から歩けます。地図は手帳（Tab）の「地図」でいつでも見られます。' },
    window: { name: '二階の雨戸', icon: 'door', desc: '窓から離れて、雨戸を引く。視線を切れば、胸の苦しさは引いていく。' },
    downstairs: { name: '別荘の一階', icon: 'door', desc: '階段を下りて、一階の机へ。無線と書き置きがある。' },
    outside: { name: '林道', icon: 'map', desc: '修司の声を聞いたら、外へ出られる。目が合わないように、木の陰を選んで歩く。' },
    shed: { name: '西の物置', icon: 'door', desc: '伐採跡の奥。机にあった鍵で開く。' },
    shelter: { name: '東の避難小屋', icon: 'door', desc: '沢沿いの小屋。巻上げハンドルは赤い握りが目印。' },
    road: { name: '林道ゲート', icon: 'map', desc: 'ハンドルを、ゲートの巻上げ箱に差す。' },
    gate: { name: '駐車場', icon: 'flag', desc: 'ゲートが上がった。車まで走る。' },
  },
  show: [
    { name: 'uncle', until: 'L1', notDone: 'T_TELESCOPE' },
    { name: 'gate_bar_down', notDone: 'T_GATE' },
    { name: 'gate_bar_up', done: 'T_GATE' },
    { name: 'car_cue', done: 'T_GATE' },
    { name: 'bottles_shelf', notDone: 'T_BOTTLE' },
    { name: 'crank_floor', notDone: 'T_CRANK' },
    { name: 'phone_mud', notDone: 'T_PHONE' },
  ],
});

const S = (text, body, done, emphasis) => ({ text, body, done, ...(emphasis ? { emphasis } : {}) });
out('tasks.json', [
  { id: 'T_TELESCOPE', title: '望遠鏡を撮る', stage: 'L1', room: 'CAB_BALC', station: 'S_TELESCOPE',
    meaning: '片付けで持ち帰る備品を、一つずつ撮っている。航と取り合いになった望遠鏡も、その一つ。',
    hint: '二階の作業室から、南のベランダへ。望遠鏡は手すりの前にある。',
    minigame: { type: 'photo-focus', cfg: { title: '望遠鏡：レンズを合わせて撮る', help: 'ピント環とズームを合わせて、シャッターを押してください。', image: 'assets/photos/mountain-v4-1.webp' } },
    steps: [S('ベランダへ出る', '作業室の南の戸から、ベランダへ出ます。', 'look', 'station:S_TELESCOPE'), S('望遠鏡を撮る', '望遠鏡を調べると、修司が出かける前に一言かけていきます。', 'task')] },
  { id: 'T_SHUTTER', title: '二階の雨戸を引く', stage: 'L2', room: 'CAB_UP', station: 'S_SHUTTER', needs: ['T_TELESCOPE'],
    meaning: '窓の外の白い姿と目が合うと、胸が苦しくなる。雨戸を引けば視線が切れる。',
    hint: '雨戸の引手は、ベランダの戸のすぐ右。目を閉じる（Q）と、苦しさが引く。',
    minigame: { type: 'steady-hand', cfg: { title: '雨戸：引手を押さえて、ゆっくり引く', help: '動く輪の中に、指先を保ってください。外れても、少し戻るだけです。', sec: 6 } },
    steps: [S('窓から離れる', '白い姿を見続けないでください。目を閉じる（Q、タッチは目のボタン）と歩くのは遅くなりますが、苦しさが引きます。', 'look'), S('雨戸を引く', '戸のすぐ右の引手を調べます。', 'task', 'station:S_SHUTTER')] },
  { id: 'T_RADIO', title: '机の無線を合わせる', stage: 'L3', room: 'CAB_HALL', station: 'S_RADIO', needs: ['T_SHUTTER'],
    meaning: '修司は林道の車へ荷物を積みに出た。無線で、今どこにいるかを聞く。',
    hint: '階段を下りて、一階の机。無線機は窓際の端にある。',
    minigame: { type: 'tune-radio', cfg: { title: '携帯無線：同調つまみ', help: 'つまみを回して、雑音の奥の声を探してください。声が聞こえたら、少し止めます。', target: 63, lo: 0, hi: 100, unit: '', width: 5, hold: 1.2 } },
    steps: [S('階段を下りる', '二階の奥の階段から、一階へ。', 'look'), S('無線を合わせる', '机の無線を調べ、つまみで声を探します。', 'task', 'station:S_RADIO')] },
  { id: 'T_BOTTLE', title: '物置でボトルを二本持ち出す', stage: 'L4', room: 'SHED', station: 'S_SHELF', needs: ['T_RADIO'],
    meaning: '書き置きに、帰り道に備えて持ち出すようにとあった。蓋つきのボトルは、白い姿にかけると怯ませられる。',
    hint: '別荘を出て林道を少し下り、西の伐採跡へ。物置は材木の山の向こう。',
    minigame: { type: 'sort-items', cfg: { title: '物置の棚：持ち出す物を分ける', help: '蓋つきのボトルを二本だけ、袋へ入れてください。ほかの物は棚に残します。',
      bins: [{ id: 'bag', label: '持ち出す袋' }, { id: 'shelf', label: '棚に残す' }],
      items: [{ id: 'b1', label: '蓋つきのボトル', bin: 'bag', why: '書き置きのとおり、これを二本。' }, { id: 'b2', label: '蓋つきのボトル', bin: 'bag', why: '書き置きのとおり、これを二本。' },
        { id: 'boots', label: '揃えた長靴', bin: 'shelf', why: '「揃えてある物は崩さない」と書いてあった。' }, { id: 'oil', label: '空の油缶', bin: 'shelf', why: '空だ。持っていっても役に立たない。' }] } },
    steps: [S('別荘を出る', '玄関から林道へ。白い姿が見えたら、目を閉じるか木の陰へ。', 'look'), S('西の物置へ', '伐採跡の奥、材木の山の向こうです。', 'look', 'station:S_SHELF'), S('棚のボトルを持ち出す', '棚を調べます。', 'task')] },
  { id: 'T_BELL', title: '呼び鐘の音止めを戻す', stage: 'L4', room: 'O_TIMBER_E', station: 'S_BELL', optional: true, needs: ['T_RADIO'],
    meaning: '書き置きの余白に「帰る前に、音止めを戻すこと」とあった。鳴らせば、白い姿はその音へ向かう。',
    hint: '伐採跡の東、材木の山のそばの木枠に吊ってある。',
    minigame: { type: 'timing', cfg: { title: '呼び鐘：音止めを差し戻す', help: '揺れる印が的に重なったときに押してください。', look: 'hammer' } },
    steps: [S('呼び鐘を調べる', '音止めを戻すと、鐘はもう鳴りません。戻す前に一度だけ鳴らして、白い姿を引き寄せることもできます。', 'task', 'station:S_BELL')] },
  { id: 'T_CRANK', title: '避難小屋で巻上げハンドルを探す', stage: 'L5', room: 'SHELTER', station: 'S_CRANK', needs: ['T_BOTTLE'],
    meaning: 'ゲートを上げる鉄のハンドルは、避難小屋の床にある、と書き置きにあった。',
    hint: '林道を南へ下って橋を渡り、沢沿いを東へ。赤い握りが目印。',
    minigame: { type: 'search-dark', cfg: { title: '避難小屋：暗い床を照らす', help: '灯りを動かして、赤い握りを探してください。', image: 'assets/photos/creek-memory-v4-2.webp', marks: [{ x: 0.68, y: 0.74, label: '赤い握りのハンドル' }] } },
    steps: [S('橋を渡る', '林道を南へ。沢の橋の赤い紐は、帰りの目印です。', 'look'), S('避難小屋へ', '沢沿いを東へ進むと、戸口の灯りが見えます。', 'look', 'station:S_CRANK'), S('床を照らして探す', '小屋の床を調べます。', 'task')] },
  { id: 'T_PHONE', title: '鳴っている携帯電話を拾う', stage: 'L5', room: 'O_EAST_SM', station: 'S_PHONE', optional: true, needs: ['T_BOTTLE'],
    meaning: '圏外のはずの山で、どこかで着信音が鳴っている。',
    hint: '避難小屋の裏、泥の中から鳴っている。',
    steps: [S('着信音の方へ', '避難小屋の裏手です。', 'task', 'station:S_PHONE')] },
  { id: 'T_GATE', title: '林道ゲートを巻き上げる', stage: 'L6', room: 'O_FRONT', station: 'S_GATE', needs: ['T_CRANK'],
    meaning: '駐車場の手前に、鎖のゲートが下りている。車で出るには、これを上げるしかない。',
    hint: '別荘の前の林道を西へ。ゲートの脇の鉄の箱にハンドルを差す。',
    minigame: { type: 'pump-gauge', cfg: { title: 'ゲートの巻上げ箱：ハンドルを回す', help: '押している間、ハンドルを回します。針を緑の帯に保ってください。上げすぎると、鎖が滑って戻ります。', sec: 4 } },
    steps: [S('林道を戻る', '橋を渡って北へ、別荘の前まで戻ります。', 'look'), S('ゲートの箱にハンドルを差す', '林道ゲートの脇の鉄の箱を調べます。', 'task', 'station:S_GATE')] },
  { id: 'T_ENGINE', title: '車を始動して、山を下りる', stage: 'L7', room: 'O_PARK', station: 'S_CAR', needs: ['T_GATE'],
    meaning: '修司の車の鍵は、サングラスと一緒に机にあった。エンジンさえかかれば、山を下りられる。',
    hint: 'ゲートの先の駐車場。運転席の戸が開いている。',
    minigame: { type: 'timing', cfg: { title: 'エンジン：鍵を回す', help: '針が的に重なったときに押してください。', look: 'needle' } },
    steps: [S('駐車場へ', 'ゲートをくぐり、灯りの点いた車へ。', 'look', 'station:S_CAR'), S('エンジンをかける', '運転席を調べます。', 'task')] },
]);

const I = (id, name, o) => ({ id, name, ...o });
out('items.json', [
  I('I_CAMERA', '古い DV カメラ', { start: true, room: 'CAB_UP', stage: 'L1', kind: 'camera', photo: 'assets/items/camera.webp', desc: '叔父から借りた古い DV カメラ。片付けで持ち帰る備品を、一つずつ撮っている。', why: '撮った記録は、手帳の「資料」で見返せる。', feeling: '画面の端が、ときどき乱れる。' }),
  I('I_RADIO', '修司の携帯無線', { start: true, room: 'CAB_UP', stage: 'L1', kind: 'radio', photo: 'assets/items/radio.webp', desc: '修司から借りた携帯無線。圏外の山では、これだけが修司とつながる。', why: '修司の声は、この無線から聞こえる。', feeling: '雑音の奥に、ときどき別の声が混ざる。' }),
  I('I_LIGHT', '懐中電灯', { start: true, room: 'CAB_UP', stage: 'L1', kind: 'flashlight', photo: 'assets/items/light.webp', desc: '片付け用に持ってきた懐中電灯。', why: '物置と小屋の暗がりを照らす。', feeling: '電池は、まだ大丈夫。' }),
  I('I_GLASSES', 'サングラス', { kind: 'glasses', color: '#1d1f22', room: 'CAB_HALL', stage: 'L3', x: 3.65, z: 24.5, photo: 'assets/items/glasses.webp', desc: '修司が机に置いていった、濃い色のサングラス。', why: '掛けていると、白い姿と目が合っても胸の苦しさが半分以下になる。', feeling: 'なぜ、山でこれを。' }),
  I('I_KEYS', '車とゲートと物置の鍵', { kind: 'key', room: 'CAB_HALL', stage: 'L3', x: 4.05, z: 24.8, photo: 'assets/items/note.webp', desc: '輪に通した三本の鍵。札に「車」「ゲート」「物置」。', why: '物置の戸と、修司の車を開ける。', feeling: '鍵の輪が、手の中で冷たい。' }),
  I('I_BOTTLE', '蓋つきのボトル（二本）', { kind: 'bottle', given: 'T_BOTTLE', room: 'SHED', stage: 'L4', photo: 'assets/items/bottle.webp', desc: '物置の棚に並んでいた、蓋つきのボトル。中で何かが揺れる。', why: '白い姿が近いときに投げると、しばらく怯ませられる（R、タッチはボトルのボタン）。二回まで。', feeling: '中身は、見ない方がいい気がする。' }),
  I('I_CRANK', '巻上げハンドル', { kind: 'crank-handle', given: 'T_CRANK', room: 'SHELTER', stage: 'L5', photo: 'assets/items/crank.webp', desc: '赤い握りの鉄のハンドル。林道ゲートの巻上げ箱に差して回す。', why: 'これでゲートの鎖を巻き上げる。', feeling: '握りの赤が、新しく塗り直されている。' }),
  I('I_PHONE', '拾った携帯電話', { kind: 'phone', given: 'T_PHONE', room: 'O_EAST_SM', stage: 'L5', photo: 'assets/items/phone.webp', desc: '泥の中で鳴っていた携帯電話。画面には「着信」とだけ出ていた。', why: '誰の物かは分からない。', feeling: '耳に当てたとき、子供の声がした。' }),
]);

out('monsters.json', {
  early: { stages: 4 },
  hints: { run: '走れ。目を合わせるな。', turn: '曲がって、木の陰へ。', hide: '隠れろ。目を閉じて。' },
  monsters: [{
    id: 'jashi', look: 'jashi', spotFx: 'dread',
    phases: [{ preset: 'early', untilStage: 'L5' }, { preset: 'normal' }],
    activeFrom: { task: 'T_RADIO' },
    spawn: { room: 'O_SOUTH' }, route: 'mountain_loop',
    nearAttack: { room: 'O_TIMBER_N', from: { room: 'O_TIMBER_E' }, target: { room: 'O_TIMBER_N' } },
    kill: { by: 'melee', reach: 2.95 }, // the scythe (rules.js attackRange + strikeReach); contact never kills
    params: { sight: 22, catch: 0, lose: { dist: 24 } }, // it gives up only past its own sight
  }],
});
console.log('stages, tasks, items, monsters written');
