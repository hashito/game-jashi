import { LANDMARKS, STAIRS } from './layout.js';
import { StepGuideCore } from './kit/step-guide.js';

// Guidance is derived from the real save flags, never a second progression/save.
const DETAILS = {
  telescope: {chapter:'一 / 二階の備品',title:'三脚の望遠鏡',location:'別荘・二階のベランダ',appearance:'細い三本脚の上に、短い筒が載っています。',purpose:'片付ける備品を、DVカメラに記録します。',action:'望遠鏡を覗く',hint:'部屋の窓側へ進み、開いた戸からベランダへ出ます。',image:'telescope'},
  stairs: {chapter:'二 / 窓の向こう',title:'一階へ下りる階段',location:'二階の部屋・南西の角',appearance:'床に点く矢印と、階段の入口の灯りが目印です。',purpose:'窓から離れ、一階で修司と連絡を取ります。',action:'階段を歩いて下りる',hint:'ベランダから部屋へ戻り、地図の階段の印へ向かいます。'},
  radio: {chapter:'三 / 途切れる声',title:'黒い携帯無線機',location:'別荘・一階の東側の机',appearance:'アンテナのある黒い箱です。サングラスの左にあります。',purpose:'つまみを合わせて、修司の声を聞きます。',action:'無線機を調整する',hint:'机へ近づき、黒い無線機のほうを向きます。',image:'radio'},
  glasses: {chapter:'三 / 一階の机',title:'サングラスと鍵束',location:'別荘・一階の東側の机',appearance:'黒いレンズと、銀色の鍵の輪です。無線機の右にあります。',purpose:'目を守り、車とゲートの鍵を持っていきます。',action:'サングラスと鍵束を取る',hint:'無線機の右側を見ます。小さいので机のすぐ前まで近づきます。',image:'glasses'},
  note: {chapter:'四 / 帰る支度',title:'叔父の書き置き',location:'別荘・一階の西側の机',appearance:'机の上に置かれた、一枚の白い紙です。',purpose:'外へ出る前に、帰るための手順を確かめます。',action:'書き置きを読む',hint:'無線機の机から、階段側にある別の机へ向かいます。',image:'note'},
  bottle: {chapter:'四 / 西の物置',title:'蓋つきのボトル2本',location:'西の物置・中の床',appearance:'黄土色の細長いボトルが、二本並んでいます。',purpose:'近づかれたとき、一時的に相手をひるませて逃げます。',action:'ボトル2本を持つ',hint:'物置に入ったら、正面の床を見下ろします。長靴は任意の記録です。',image:'bottle'},
  crank: {chapter:'五 / 東の避難小屋',title:'赤い握りのハンドル',location:'東の避難小屋・中の床',appearance:'黒い鉄が折れ曲がり、端に赤い握りが付いています。',purpose:'駐車場のゲートを巻き上げるために使います。',action:'ハンドルを取る',hint:'小屋に入ったら、正面の床を見ます。机の写真と日誌は任意の記録です。',image:'crank'},
  listen: {chapter:'五 / 無線の続き',title:'修司の説明を聞く',location:'安全な場所で、無線の続きを確認',appearance:'次の行き先が決まるまで、無線の会話が続きます。',purpose:'ハンドルの使い方を確かめます。',action:'会話の「次へ」で続きを聞く',hint:'「読む間停止」で落ち着いて読めます。再開すると次の行き先に変わります。'},
  gate: {chapter:'六 / 戻る道',title:'駐車場のゲート',location:'別荘の西・駐車場の入口',appearance:'鉄の柵と、手前の巻き上げ機が目印です。',purpose:'鍵とハンドルで、車までの道を開けます。',action:'ゲートを巻き上げる',hint:'巻き上げ機の前で操作します。完了するまで離れないでください。'},
  car: {chapter:'七 / 最後の数秒',title:'駐車場の車',location:'開けたゲートの奥・車の横',appearance:'駐車場に止めた、小さな車です。',purpose:'エンジンをかけて、山を下ります。',action:'エンジンをかける',hint:'車の横で操作し、エンジンがかかるまでその場を離れないでください。'},
};

export function objectiveFor(flags = {}, stage = 0) {
  const id = !flags.seen ? 'telescope' : !flags.downstairs ? 'stairs' : flags.gate ? 'car'
    : !flags.radioTuned ? 'radio' : !flags.glasses ? 'glasses' : flags.crank && stage >= 5 ? 'gate'
    : !flags.note ? 'note' : !flags.bottle ? 'bottle' : !flags.crank ? 'crank' : 'listen';
  const detail = DETAILS[id];
  return {id,...detail,text:detail.action,target:id === 'stairs' ? STAIRS.top : LANDMARKS[id] || null,
    image:detail.image ? `assets/items/${detail.image}.webp` : null,
    voice:['stairs','listen'].includes(id) ? null : `assets/audio/guide-${id}.wav`};
}

export function describeSearch(objective, {level=0, distance=Infinity, blocked=true, targetId=null, closed=false, touch=false} = {}) {
  if (objective.id === 'listen') return {phase:'listen',label:'移動せず、無線の続きを確認',near:false,ready:false};
  const target=objective.target;
  if (!target) return {phase:'travel',label:objective.location,near:false,ready:false};
  if ((target.level||0)!==level) return {phase:'floor',label:`まず${target.level===1?'二階':'一階'}へ。地図の階段をたどります`,near:false,ready:false};
  if (objective.id === 'stairs') return {phase:'travel',label:'床の矢印に沿って、階段を下ります',near:false,ready:false};
  const near=!closed&&!blocked&&distance<=7,ready=near&&targetId===objective.id;
  return ready ? {phase:'ready',label:`${touch?'「調べる」をタップ':'Eで'}${objective.action}`,near,ready}
    : near ? {phase:'search',label:'すぐ近くです。見本と同じ物を探してください',near,ready}
    : {phase:'travel',label:'地図の印へ。方角は通れる道を示します',near:false,ready:false};
}

// Standard idle hint logic, driven by game time so pause never consumes the timer.
export class SearchGuidance {
  constructor(){this.id=null;this.core=null;this.closest=Infinity;this.cued=false;}
  update(objective, context, time, {danger=false}={}) {
    this.time=time;
    if(this.id!==objective.id){this.id=objective.id;this.closest=Infinity;this.cued=false;
      this.core=new StepGuideCore({steps:[{id:objective.id,hint:objective.hint}],now:()=>this.time*1000,idleMs:18000,auto:false});
      this.time=time;this.core.touch();
    }
    this.time=time;
    const view=describeSearch(objective,context);
    if(context.distance<this.closest-1){this.closest=context.distance;this.core.hintSaid=false;this.core.touch();}
    if(view.ready||danger)this.core.touch();
    this.core.tick();
    const cue=view.ready&&!this.cued&&!danger;
    if(cue)this.cued=true;
    return {...view,hint:!danger&&!view.ready&&this.core.hintSaid?objective.hint:'',cue};
  }
}
