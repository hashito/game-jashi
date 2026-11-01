> **公開URL：https://jashi.autoarticles.net/** （Firebase `jashi-hashito`、GA4 `G-MKTNWD1KZT` / properties/561435165）
>
> 公開の手順：`npm run build`（`public/` を作り、`site.json` から title・description・OGP・JSON-LD・GA4・sitemap を加える）→ `firebase deploy --only hosting --project jashi-hashito`。
> 共有画像は `npm run og`。更新情報は `data/release-notes.json`。素材の記録は `ASSETS.md`、Three.js は MIT（`THREE-LICENSE.txt`）。Game-fleet の `projects/jashi` に登録している。

# 邪視 ― 視線の山

ネット怪談「邪視」の骨組みを借りた、一人称3Dのホラー探索・逃走ゲーム。5.0.0 で Game-kit 標準（1.9）の土台に作り直した。

叔父の修司の別荘を片付けに来た主人公は、二階のベランダの望遠鏡で、山に立つ白い姿を見てしまう。目が合うと心が削られ、近づかれると鎌が振り下ろされる。目を閉じ（Q）、ボトルを投げ（R）、木の陰を選んで、無線の修司の声を頼りに山を下りる。7段階・約15分・結末3種。

## 作り

| 場所 | 中身 |
|---|---|
| `data/` | 間取り（`plan.json`）、段階、作業、品物、資料、会話、結末。`tools/authoring/make-plan.mjs` と `make-data.mjs` で作る（会話・資料・結末は 4.x からの変換で、いまは JSON が正本） |
| `js/ext/index.js` | 作品の拡張の入口。怪異の見た目（`jashi.js`）、山と別荘の飾り（`mountain.js`）、視線・鎌・ボトル（`gaze.js` と `rules.js`）、音（`sound.js`）、物語と作業（`story.js`） |
| `js/kit/` | Game-kit の標準部品（`npm run sync-kit` で更新する。直接は書き換えない） |
| `css/theme-game.css` | 作品の HUD（心と体の帯、鎌の警告、閉じた目） |
| `assets/` | 写真・品物の写真・テクスチャ・修司の声 |

怪異は接触では殺さない（`monsters.json` の `params.catch: 0`）。殺すのは鎌の一撃（届く距離 2.95 m、`kill.reach`）と、目を合わせ続けたときの視線。逃走の検査（`check-escape`）は、この届く距離で「立ち止まれば死ぬ」を確かめる。

## 検査

```bash
npm test
npm run check
npm run stage
npm run check:escape
npm run check:traps
npm run smoke
npm run smoke:mobile
```

## 声

修司の無線の声は VOICEVOX で作った（**VOICEVOX:麒ヶ島宗麟**、ノーマル）。台詞と設定は `tools/local-media-voices.json`、制作の手順は `tools/local-media-README.md` にある。ゲームではタイトルの注記にクレジットを出している。
