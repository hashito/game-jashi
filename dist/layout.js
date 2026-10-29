// Authoritative map data. World geometry, navigation and the player's map use
// these same polylines and footprints; there is no hand-drawn second map.
export const WORLD_BOUNDS={minX:-34,maxX:31,minZ:-34,maxZ:32};
export const FLOORS=[
  {level:0,label:'一階・屋外',height:0},
  {level:1,label:'二階',height:3.35,bounds:{minX:-6,maxX:6,minZ:19,maxZ:29}},
];
export const STAIRS={id:'cabin-stairs',x:-4.5,width:2,minZ:20.8,maxZ:27,rise:3.35,bottom:{x:-4.5,z:20.25,level:0},top:{x:-4.5,z:27.7,level:1}};
export const BALCONY={minX:-3,maxX:3,minZ:17,maxZ:19.15,level:1,height:3.35,entrance:{x:0,z:19,level:1}};
export const CABIN_WINDOW={x:0,z:19,width:3.2,sill:4.25,top:6.1};
export const REVEAL_POINT={x:4,z:-28,level:0};
export const ENEMY_REVEAL=REVEAL_POINT;
// The first shot is a face-to-face conversation, before turning to the balcony.
export const SPAWN={x:.65,z:23.2,level:1,yaw:-2.11566};
export const COMPANION_START={x:2.3,z:24.2,level:1};
export const COMPANION_EXIT=[{x:0,z:17,level:0},{x:-8,z:16.5,level:0},{x:-13,z:14.6,level:0},{x:-24,z:12.8,level:0}];
export const BUILDINGS=[
  {id:'cabin',label:'別荘',x:0,z:24,w:12,d:10,entrance:{x:0,z:19}},
  {id:'shed',label:'物置',x:-19,z:-3,w:4.7,d:4,entrance:{x:-19,z:-1}},
  {id:'shelter',label:'避難小屋',x:16,z:-15,w:6,d:5,entrance:{x:16,z:-12.5}},
];
export const PARKING={minX:-33,maxX:-17,minZ:17,maxZ:29,entrance:{x:-17,z:22},gateWidth:4};
export const BRIDGE={x:.8,z:-10,width:3.5,length:4};
export const LANDMARKS={
  telescope:{x:0,z:17.8,level:1,label:'二階の望遠鏡'},
  shutter:{x:1.55,z:19.5,level:1,label:'二階の雨戸の引手'},
  radio:{x:2.7,z:24.5,label:'机の携帯無線'},
  bell:{x:-12.7,z:-6,label:'林業用の呼び鐘'},
  glasses:{x:3.7,z:24.5,label:'サングラスと鍵'},
  note:{x:-2.2,z:24,label:'叔父の書き置き'},
  bottle:{x:-19,z:-3,label:'ボトル'},
  crank:{x:15.8,z:-14.9,label:'巻上げハンドル'},
  photo:{x:17.1,z:-16.1,label:'古い写真'},
  phone:{x:18,z:-23,label:'携帯電話'},
  gate:{x:-14.8,z:22,modelX:-17,modelZ:22,label:'林道ゲート'},
  car:{x:-25.8,z:25.2,modelX:-27,modelZ:23,label:'駐車場の車'},
};
for(const p of Object.values(LANDMARKS))p.level??=0;
export const TRAILS=[
  {id:'main',width:2.8,points:[[0,27],[0,19],[0,12],[0,4],[.8,-8],[.8,-12],[0,-17],[4,-28]]},
  {id:'shed',width:2.6,points:[[0,4],[-8,3],[-15,2],[-19,2],[-19,-1],[-19,-3]]},
  {id:'west-loop',width:2.6,points:[[-15,2],[-13,-8],[-10,-13],[0,-17]]},
  {id:'east-loop',width:2.8,points:[[0,-17],[7,-16],[9.4,-13],[11,-10],[16,-10],[21.5,-10.6],[22,-18.8],[18,-23],[18,-28]]},
  {id:'east-return',width:2.6,points:[[11,-10],[8,-6],[4,-3],[0,4]]},
  {id:'shelter-entrance',width:2.6,points:[[16,-10],[16,-12.5],[16,-15.1]]},
  {id:'road',width:3.2,points:[[0,16.9],[-8,16.5],[-11,19],[-14,22],[-17,22],[-23,22],[-24.1,25.2],[-25.8,25.2]]},
  {id:'service-road',width:2.8,points:[[-8,16.5],[-13,14.6],[-24,12.8]]},
];
// Landmarks and usable sight breaks make each loop readable under pressure.
export const MAP_ZONES=[
  {id:'cabin',label:'別荘・林道',x:0,z:15,color:'#ccb184'},
  {id:'timber',label:'伐採跡・物置',x:-14,z:-4,color:'#a17258'},
  {id:'creek',label:'沢沿い・避難小屋',x:12,z:-14,color:'#80959c'},
];
export const COVER_PATCHES=[
  {id:'timber-stack',kind:'logs',x:-16.8,z:-7,w:2.4,d:1.8,h:1.95},
  {id:'timber-screen',kind:'screen',x:-9.8,z:-5.4,w:.22,d:3.3,h:2.15},
  {id:'creek-stones',kind:'stone',x:11.6,z:-20,w:2.3,d:1.8,h:1.9},
];
export const LORE_PLACEMENTS=[
  {id:'boots',x:-20,z:-2,type:'boots',label:'揃えられた長靴',height:.08},
  {id:'ledger',x:14.5,z:-16,type:'book',label:'作業日誌',height:.92},
  {id:'cassette',x:-2.25,z:27,type:'cassette',label:'古いカセットケース',height:.88},
  {id:'mirror',x:3.6,z:27,type:'mirror',label:'伏せられた手鏡',height:.84},
  {id:'ribbon',x:3,z:-9,type:'ribbon',label:'橋の赤い紐',height:1.04},
  {id:'toy',x:18,z:-25.5,type:'bell',label:'泥に埋もれた小さな鈴',height:.08},
  {id:'tag',x:-10,z:-13,type:'tag',label:'結び付けられた作業札',height:1.4},
];

for(const p of LORE_PLACEMENTS)p.level??=0;

export function distanceToSegment(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz;
  const t=length2?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length2)):0;
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function distanceToTrail(x,z){return Math.min(...TRAILS.flatMap(trail=>trail.points.slice(1).map((p,i)=>distanceToSegment(x,z,trail.points[i],p)-trail.width/2)));}
