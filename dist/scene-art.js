// Small, optional records attached to existing walls, rails and posts. These
// coordinates never add collision or replace the signs used for navigation.
export const SCENE_ART_RULES=Object.freeze({loadRadius:14,unloadRadius:19,maxLoadsPerUpdate:2,textureWidth:512,textureHeight:640});

export const SCENE_ART=Object.freeze([
  {
    id:'trail-notice',label:'玄関脇の入山注意書き',title:'入山される方へ',
    text:'古い注意書きに、白い人影を描いた挿絵が貼られている。\n「霧の中で人を見ても、こちらから呼ばないこと」\nその下に、別の筆圧で「返事があっても」と書き足されていた。',
    caption:'白い人影に、声をかけない。',alt:'霧の杉林の奥に白い人影が立つ、色あせた入山注意書きの挿絵。',
    image:'./assets/photos/trail-notice-v4-2.webp',x:-4.25,z:18.825,level:0,y:1.6,rotation:Math.PI,width:.64,height:.8,mount:'cabin-porch-wall',type:'notice',
  },
  {
    id:'forestry-notice',label:'物置の作業注意書き',title:'作業終了の確認',
    text:'鋸と安全帽の挿絵の下に、工具を片付ける順番が記されている。\n「道具、人員、足音の順に確認」\n最後の項目だけ、何度も丸で囲まれている。',
    caption:'戻る人数と、足音を確かめる。',alt:'古びた鋸と安全帽が置かれた林業作業場の挿絵。',
    image:'./assets/photos/forestry-notice-v4-2.webp',x:-16.585,z:-2.7,level:0,y:1.65,rotation:Math.PI/2,width:.6,height:.75,mount:'shed-east-wall',type:'notice',
  },
  {
    id:'shelter-notice',label:'避難小屋の夜間掲示',title:'夜間の戸締まり',
    text:'戸口に灯りのともる小屋の挿絵が掲示されている。\n「戸を叩く者には、先に名前を言わせること」\n紙の端には「名前を知っていた」と小さく書かれていた。',
    caption:'名前を聞いてから、戸を開ける。',alt:'暗い杉林の中で戸口が暖かく光る、小さな避難小屋の挿絵。',
    image:'./assets/photos/shelter-notice-v4-2.webp',x:13.28,z:-14,level:0,y:1.6,rotation:Math.PI/2,width:.6,height:.75,mount:'shelter-west-wall',type:'notice',
  },
  {
    id:'bridge-notice',label:'橋の欄干の注意札',title:'沢を渡る人へ',
    text:'赤い布が結ばれた橋の挿絵。\n「足音が一つ余ったら、振り返らずに渡りきること」\n挿絵の赤い布は、今も欄干に結ばれているものとよく似ている。',
    caption:'足音が一つ余っても、渡りきる。',alt:'霧の沢に架かる木橋と、その欄干に結ばれた赤い布の挿絵。',
    image:'./assets/photos/bridge-notice-v4-2.webp',x:2.39,z:-10.65,level:0,y:1.22,rotation:-Math.PI/2,width:.52,height:.65,mount:'bridge-east-rail',type:'notice',
  },
  {
    id:'cabin-memory',label:'別荘の壁に掛かった写真',title:'まだ明るかった頃',
    text:'昼間に撮られた、今いる別荘の写真。木の外壁も、二階の窓も同じだ。\n額の裏から、日付のないメモがはみ出している。\n「窓の内側に立つ人が写るので、もう撮らない」',
    caption:'別荘の古い記念写真。撮影日不明。',alt:'山の杉林に建つ古い二階建ての木造別荘を写した、色あせた写真。',
    image:'./assets/photos/cabin-memory-v4-2.webp',x:5.83,z:23.15,level:0,y:1.6,rotation:-Math.PI/2,width:.56,height:.7,mount:'cabin-east-wall',type:'photo',
  },
  {
    id:'logging-memory',label:'物置の作業員の写真',title:'最後の作業日',
    text:'作業員たちが、全員こちらに背を向けている。手前には揃えられた長靴。\n写真の裏書きだけが紙片に写されている。\n「帰る前に撮った。呼んでも、誰もこちらを向かなかった」',
    caption:'林業班の記録写真。帰路の記録なし。',alt:'杉林でこちらに背を向けて立つ作業員たちと、手前に揃えられた長靴の古い写真。',
    image:'./assets/photos/logging-memory-v4-2.webp',x:-20.2,z:-4.82,level:0,y:1.73,rotation:0,width:.54,height:.675,mount:'shed-back-wall',type:'photo',
  },
  {
    id:'creek-memory',label:'沢沿いの杭に留められた写真',title:'濡れた足跡',
    text:'木橋の上に濡れた足跡が続いている。\n写真の余白に、鉛筆で「晴れが三日続いた朝」とある。\n乾いた紙に触れた指先だけが、冷たくなった気がした。',
    caption:'沢の見回り記録。雨のなかった朝。',alt:'薄暗い木橋の板の上に濡れた足跡が続く、古い現場記録写真。',
    image:'./assets/photos/creek-memory-v4-2.webp',x:20.322,z:-24.2,level:0,y:.98,rotation:-Math.PI/2,width:.48,height:.6,mount:'creek-marker-post',type:'photo',
  },
  {
    id:'parking-memory',label:'駐車場の柵の車両写真',title:'出庫前の点検',
    text:'車のフロントガラスに、手の跡が残っている。\n写真の下には「外側から拭いても消えなかった」と書かれている。\n念のため車内を確かめた、と続くはずの行は途中で切れていた。',
    caption:'車両点検の添付写真。報告書は欠落。',alt:'山の駐車場に停まる古い車と、フロントガラスに残った手形の記録写真。',
    image:'./assets/photos/parking-memory-v4-2.webp',x:-22,z:16.825,level:0,y:1.55,rotation:Math.PI,width:.58,height:.725,mount:'parking-north-fence',type:'photo',
  },
].map(art=>Object.freeze(art)));
