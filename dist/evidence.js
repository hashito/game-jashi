// Optional close inspection. Main objectives and all existing endings remain
// reachable without these details. Text is HTML, never baked into a photograph.
export const EVIDENCE={
  boots:{image:'assets/photos/boots-detail-v4-2.webp',alt:'物置の床に揃えた長靴。そのそばに裸足の泥跡',caption:'長靴と、床の濡れた跡の接写',action:'靴底と床の跡を照らす',result:'靴底の溝は横向き。そばの泥跡には溝がなく、指の跡がある。長靴を履いて来た誰かが、ここで脱いだ跡でもない。裸足の跡だけが戸の内側で止まっている。',cue:'woodCreak'},
  ledger:{image:'assets/photos/ledger-detail-v4-2.webp',alt:'濡れた作業日誌。斜めの光に浮かぶ筆圧の跡',caption:'避難小屋で撮った作業日誌の接写',action:'白紙のページに斜めから光を当てる',result:'消した字ではなく、前のページから残った筆圧だった。「戸を叩く間は、数えない」。その下に三本の縦線。四本目だけ、紙の裏側から押しつけられている。',cue:'page'},
  mirror:{image:'assets/photos/mirror-detail-v4-2.webp',alt:'伏せた手鏡の裏に貼られた古い紙と擦れた金属',caption:'寝床のそばに伏せられていた手鏡',action:'紙を剥がさず、縁だけ傾ける',result:'鏡の細い縁に戸口が映る。自分の位置からは見えないはずの、戸の裏側だ。紙には小さく「開いているのを映したら、こちらも開けておく」とあった。鏡を伏せると、家の軋みが一度だけ途切れた。',cue:'presenceShift'},
  cassette:{action:'巻き戻して、録音の末尾を読む',result:'カメラに取り込んだ音を聞き直す。修司の「二人、乗ったな」のあとに、戸を引く音。エンジンがかかってから、すぐ耳元で「まだ、一人」。声が終わるより先に、録音の時刻が前の秒へ戻っていた。',cue:'tape'},
  tag:{action:'紐を外さず、札の裏を見る',result:'返却欄には空欄が一つある。名前が消されたのではない。そこだけ、札を作ったときから文字を書く場所がなかった。紐は枝ではなく、何もない空間を一周する長さで結ばれていた。',cue:'distantScrape'},
};
export const restoreEvidence=saved=>new Set(Array.isArray(saved)?saved.filter(id=>Object.hasOwn(EVIDENCE,id)):[]);
