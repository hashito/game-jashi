# 画像制作記録

## v4で追加した生成素材（2026-10-29）

built-in image_genで各素材を別々に生成しました。Pillowによる縮小と形式変換のみを行い、透明な枝葉はPNG、他はWebP品質88で配置しています。元の生成画像は保持しています。

### 杉の枝葉

- ファイル：`dist/assets/textures/cedar-bough-v4.png`
- 寸法：768 × 768 RGBA
- サイズ：907,216 bytes
- 用途：枝の段ごとに配置する透明な針葉テクスチャ。葉の間の隙間をアルファで維持。
- 生成プロンプト：

> Use case: photorealistic-natural. Asset type: transparent game foliage texture, Japanese cedar bough for many small billboard planes in a 3D horror forest. A single naturally asymmetric drooping Japanese cedar branch with fine layered evergreen needles, several slender woody twigs clearly visible, realistic dense but lacy needle clusters with many real gaps and sharp irregular fringes. Flat front-facing botanical photo, entirely contained with transparent margin on all sides, soft neutral overcast illumination, deep muted olive and forest greens with dry brown inner stems. Isolated on genuine transparent background, no ground, no container, no shadow behind the branch, no mist, no text, no border. The silhouette must look like real feathered conifer foliage, never a rounded cloud or smooth blob. High detail square composition.

### 怪異の皮膚

- ファイル：`dist/assets/textures/monster-skin-v4.webp`
- 寸法：768 × 768 RGB
- サイズ：193,596 bytes
- 用途：立体モデルの顔と身体に共通する灰白色の皮膚。
- 生成プロンプト：

> Use case: stylized-concept. Asset type: seamless tileable physically based horror creature skin albedo texture, square orthographic flat material scan. Extremely pale cool ivory / ash-gray hairless stretched skin with fine pores, very subtle fine gray branching capillaries, small creases and tiny scattered dry cracks, gentle desaturated olive undertones. The surface is consistently pale across the entire image, no dark central patch, no facial features, no eyes, no mouth, no text, no raised objects, no blood, no wounds, no directional lighting, no vignette, no hard shadows. All four edges naturally tile. This material will be applied to both a slender monster's head and body for coherent skin color, realistic detailed material not abstract noise.

### 修司の会話用ポートレート

- ファイル：`dist/assets/portraits/shuji-v4.webp`
- 寸法：640 × 640 RGB
- サイズ：64,070 bytes
- 用途：対面／無線の両方で話者を識別する、架空の成人男性の顔。
- 生成プロンプト：

> Use case: photorealistic-natural. Asset type: character portrait in a Japanese first-person mountain horror game's radio conversation UI. Fictional Japanese man in his mid-fifties, weathered kind but serious face, short black hair graying at the sides, clean-shaven, olive work jacket over a dark thermal shirt, small old black walkie-talkie clipped to jacket. Head-and-shoulders close portrait, looking just beside camera, both eyes and whole face clearly visible, natural face anatomy, realistic Japanese features. Quiet forestry worker at a mountain cabin, overcast early winter afternoon, softly blurred muted cedar forest backdrop, soft light clearly exposes facial features. Restrained uneasy expression, realistic film still, no smile posing, no horror makeup, no blood, no text, no watermarks. Square image, face centered in upper middle with generous headroom, chest and walkie talkie visible.

### 怪異の近接映像

- ファイル：`dist/assets/textures/monster-face-v4.webp`
- 寸法：900 × 900 RGB
- サイズ：73,474 bytes
- 用途：被弾・死亡の破損映像用。通常3Dの顔は目・顎・歯・頬の立体形状で表現。
- 生成プロンプト：

> Use case: stylized-concept. Asset type: close-up of the fictional supernatural creature 'Jashi' for an in-game interrupted videotape attack frame. A hairless elongated humanoid head and thin neck with uniformly pallid ash-ivory skin, the skin tone matching the neck and shoulders. ONE single large vertically oriented eye in the middle of the forehead and upper nose bridge; no ordinary pair of eyes. The eye is sunken inside thick irregular anatomical eyelid folds, slightly twisted brow ridge. Asymmetric gaunt cheeks, unsettling distorted facial anatomy, a small deep black mouth pulled crooked with a visibly misaligned lower jaw and irregular narrow off-white teeth. Thin sinewy neck, convincing physically sculpted form, menacing dead gaze toward viewer. This is a practical prosthetic monster design / photorealistic 3D creature, not a painted mask or colored round decal. Strong horror through anatomy and expression, restrained color. No blood spray, no dismemberment, no exposed organs, no skin injuries, no red-painted face, no bright facial color. Head and shoulders large centered, flat desaturated dark forest background, soft cold side light makes eyelids, jaw and teeth readable. No text or watermark. Square image.


制作方法：built-in image_gen。ゲーム向けに生成した画像をWebPへ形式変換。写真内に文字は焼き込まず、画面の文字はHTMLで表示しています。

## タイトル背景

- ファイル：`dist/assets/title-forest.webp`
- 1672 × 941 px
- 生成プロンプト：

> Use case: photorealistic-natural. Asset type: cinematic title background for a Japanese first-person horror game. Make one photorealistic widescreen 16:9 photograph, ideally 1536 by 864, of a Japanese cedar mountain forest in winter between dusk and blue night. Heavy cold fog layers between towering black cedar trunks. A damp narrow earth trail starts in the foreground and bends into the forest. Far away, at the right third, a small old wooden lodge with one dim amber window is barely visible. The left third is naturally dark and uncluttered, suitable for overlaying Japanese title text later. Very faintly, deep among trees in the central distance, there is a small slender pale humanoid silhouette, its anatomy completely obscured by darkness and distance. It should take a moment to notice. Desaturated moss, ink black, cold mist, restrained amber light. Fine film grain, convincing wet bark and woodland floor, restrained premium Japanese folk horror atmosphere, quiet unsettling natural photograph, no jump scare. No text, no lettering, no UI, no border, no logos, no watermark. No close-up eyes, no gore, no sexual details, no naked anatomical detail.

## 山の古写真

- ファイル：`dist/assets/mountain-photo.webp`
- 1448 × 1086 px
- 生成プロンプト：

> Use case: photorealistic-natural. Asset type: old documentary photograph collectible for a Japanese mountain horror game. One landscape 4:3 photographic image, no frame. Winter daytime Japanese cedar forest on a hillside, photographed through a long telephoto lens on cheap old color film. Grainy, slightly blurred, imperfect focus, faded cold green-gray colors, subtle hand shake. Deep among the thin trees in the central-right distance, a very small pale bald head is just barely visible behind a broad dark cedar trunk, facing away from the camera. Only this tiny head and one shoulder are visible; the trunk and thick branches completely conceal the rest of the figure. The tiny head occupies less than 2 percent of the image height. The person's face is not visible. A curved rusty agricultural sickle can barely be seen protruding from the opposite side of that trunk at waist level, mostly hidden by branches. Most of the picture is quiet dense cedar forest, tangled dry underbrush, no snow blanket. Authentic imperfect amateur photograph, subtle dread through ambiguity, nothing graphic. No text, no lettering, no caption, no border, no logos, no watermark, no UI. The photograph must not show a full human body.

## 改修で追加した画像（2026-10-28）

生成方法：built-in image_gen。生成したPNGをsharpで1024 × 1024 pxへ縮小し、WebPへ形式変換・最適化しました。以下のプロンプトは生成時に使用した原文です。

### 湿った杉林の地面

- ファイル：`dist/assets/textures/forest-floor.webp`
- 実寸法：1024 × 1024 px
- ファイルサイズ：298,330 bytes（291.3 KiB）
- WebP品質設定：66
- 用途：森の地面のアルベド。針葉、湿った土、落ち葉、細根の近距離ディテール。
- 生成プロンプト：

> Use case: photorealistic-natural. Asset type: square tileable albedo texture for a real-time 3D Japanese woodland horror game. Create a 1024 by 1024 square, orthographic top-down macro photograph of the damp ground of a Japanese cedar forest in winter. Dark brown moist soil, dense fine fallen cedar needles, scattered small brown dead leaves, thin exposed roots, tiny gray pebbles, very restrained dark olive moss. Uniform distribution and natural microdetail across the whole image, no focal point. Broad subtle dark tonal variations, realistic organic grain and fibers, rich readable detail without harsh contrast. Flat diffuse overcast illumination with no directional shadows, no baked lighting, no perspective, no depth of field. Seamless tiling surface: all four opposite edges must visually match and repeat naturally. Fill the entire image with the surface. No trees standing upright, no landscape horizon, no large objects, no footprints, no text, no logos, no watermark, no border.

### 廃ロッジの古木板

- ファイル：`dist/assets/textures/weathered-wood.webp`
- 実寸法：1024 × 1024 px
- ファイルサイズ：233,612 bytes（228.1 KiB）
- WebP品質設定：74
- 用途：ロッジの壁・床のアルベド。縦木目、割れ、雨染み、板の継ぎ目。
- 生成プロンプト：

> Use case: photorealistic-natural. Asset type: square tileable albedo texture for the walls and floors of an old Japanese mountain lodge in a real-time 3D horror game. Create a 1024 by 1024 square, directly front-on orthographic material photograph of aged vertical wooden planks. Six or seven narrow evenly spaced gray-brown cedar boards, weathered fine wood grain, lengthwise splits, tiny old nail heads, rain stains, slightly dark damp seams, very subtle dark green moss in a few joints. Boards continue uninterrupted through upper and lower image edges; repeatable lateral board spacing and visually matching opposite edges for seamless tiling. Flattish weathered surface with dense natural microdetail and readable grain, balanced medium-dark desaturated gray brown colors. Uniform soft overcast lighting, no directional shadows or bright highlights, no baked shadows, no perspective, no vignette, no depth of field. Material surface fills frame. No building, no windows, no hinges, no handles, no writing, no text, no logos, no watermark, no border.

### 杉の樹皮

- ファイル：`dist/assets/textures/cedar-bark.webp`
- 実寸法：1024 × 1024 px
- ファイルサイズ：256,280 bytes（250.3 KiB）
- WebP品質設定：66
- 用途：杉の幹のアルベド。縦の繊維、深い溝、濡れた暗部。
- 生成プロンプト：

> Use case: photorealistic-natural. Asset type: square seamless tileable cedar bark albedo material for a real-time 3D Japanese mountain horror game. Create a 1024 by 1024 square material scan of Japanese cedar tree bark, viewed directly front-on in orthographic projection. Coarse long vertical bark fibers, deep narrow irregular fissures, thin peeling fibrous ridges, gray-brown weathered wood, dark wet recesses, occasional muted olive tiny moss flecks. Extremely fine convincing natural texture and rough tactile detail with even contrast across the frame. The bark lies as a flat material sample with no curved tree silhouette and no background. Uniform diffuse cloudy daylight, no directional lighting, no strong cast shadows, no shiny highlights, no perspective or depth of field. Seamless repeat in both directions, matching opposite edges, vertical grain continues through the top and bottom, no prominent knot or focal mark. No branches, no leaves, no creatures, no eyes, no text, no logos, no watermark, no borders.

### 眉間に一つだけ縦の目を持つ怪異

- ファイル：`dist/assets/textures/monster-face.webp`
- 実寸法：1024 × 1024 px
- ファイルサイズ：77,736 bytes（75.9 KiB）
- WebP品質設定：82
- 用途：被弾・死亡時の短い顔フラッシュ。黒背景、頭と首の一部のみ。映像の乱れはゲーム側で重ねる。
- 生成プロンプト：

> Use case: stylized-concept. Asset type: square portrait used for a brief non-graphic horror encounter in a Japanese first-person game. One 1024 by 1024 frontal portrait of an uncanny adult humanoid head against pure black. Only the head and a small part of the neck are visible. Completely hairless pale gray-white head with dry plaster-like pores, fine shallow surface cracks, and slight uneven age-worn surface texture. The anatomy must have EXACTLY ONE eye: one narrow VERTICAL slit-shaped eye in the CENTER of the forehead, running vertically along the midline just above the nose. The tiny iris within that single vertical eye is dark amber. There are NO ordinary paired eyes anywhere: the left and right eye areas are solid smooth pale skin, no eye sockets, no eyelids, no brows, no horizontal eye shapes. A small ordinary nose and a small closed, faintly asymmetrical mouth remain. Quiet blank expression, not screaming, no teeth, no aggression pose. Chilling stillness. Cold dim side light catches the plaster-like surface and the single central vertical eye, the sides of the skull fade into black. Believable practical creature prosthetic photographed as an old grainy film still, desaturated gray palette, deep shadows, eerie but readable form. No blood, no wounds, no exposed anatomy, no torso, no nudity, no text, no UI, no scanlines, no VHS tearing, no border, no watermark. The game will add video corruption separately. Absolutely no pair of conventional eyes: only one vertical central eye.

## 4.0.2 小物の画像（2026-10-29）

外部サービスは使っていません。`node tools/make-item-images.mjs` が、ゲーム内の3Dモデル（`dist/world.js` の小物）をヘッドレス Edge で暗い背景の撮影台に置き、灯りに近い暖色の光で描画して PNG にしています。

- ファイル：`dist/assets/items/<id>.png`（320 × 240、16点）と一覧 `dist/assets/items/manifest.json`
- 対象：glasses, note, bottle, crank, photo, phone, radio, bell, telescope, boots, ledger, cassette, mirror, ribbon, toy, tag
- 用途：記録画面の「DVで撮った」写真と、記録一覧の小さな見本。モデルを変えたら上のコマンドで撮り直す。

## 4.1 ローカルの探索案内音声（2026-10-30）

**音声: VOICEVOX:麒ヶ島宗麟**（ノーマル、speaker53、エンジン0.25.2）。D:/AIのVOICEVOXを、既存GPUサービスと分けたCPU2スレッド・localhost:50022で実行。新しい案内8本を標準の共有JSONキューから制作した。台詞は tools/local-media-voices.json、各ファイルの生成設定・SHA-256・音量測定は tools/local-media-records/voice-*.json。

|ファイル（dist/assets/audio/）|尺（秒）|RMS（dBFS）|
|---|---:|---:|
|guide-bottle.wav|6.228|-23.61|
|guide-car.wav|4.758|-22.95|
|guide-crank.wav|5.332|-23.05|
|guide-gate.wav|5.420|-23.01|
|guide-glasses.wav|4.869|-23.07|
|guide-note.wav|4.896|-22.96|
|guide-radio.wav|5.973|-23.58|
|guide-telescope.wav|4.638|-23.11|

全8本が24kHz・モノラル・16bit、ピーク-6.00dBFS、クリップしたサンプル0。合計42.114秒。先頭120ms・末尾200msの余白を保って無音を整理し、6msの端フェードをかけ、音量差を揃えた。読み仮名は実際の合成クエリで確認した。数値検査は人による聞き取り品質の確認の代替ではない。

[VirVox Project公式規約](https://www.virvoxproject.com/voicevoxの利用規約)を2026-10-30に確認。商用・非商用利用はクレジット付き。音声素材を再配布する場合は利用者にも同じ表記を義務づける。実在人物の録音や声まねではなく、架空の修司役の合成音声。

写真3点は最初に同じキューへ登録したが、ComfyUIのCUDA障害後の残存プロセスのため、新規ローカル推論は未完了。GPUリセット・OS再起動・他の制作ジョブの停止は行っていない。採用する原本の生成方法は、写真の項目で別に記録する。

## 4.1 場面写真の採用と配信用変換（2026-10-30）

導入と生還後の写真は内蔵 `image_gen` で生成。古写真は同ツールで既存の `dist/assets/mountain-photo.webp` を編集した。既存原本も残している。ローカルComfyUIの生成結果とは扱わない。D:/AIのPython・PillowでRGB化、最大1400×1050への等倍比縮小、WebP品質88への変換のみを行った。色補正・切り抜き・内容の合成はしていない。

|配信ファイル（dist/assets/photos/）|寸法|サイズ|由来|
|---|---|---:|---|
|arrival-v4-1.webp|1400×788|139,998 bytes|内蔵画像生成|
|return-v4-1.webp|1400×788|151,034 bytes|内蔵画像生成|
|mountain-v4-1.webp|1400×1050|330,382 bytes|既存山写真の内蔵画像編集|

生成原本は `C:/Users/hasit/.codex/generated_images/01a17abc-33fb-7811-a323-50521555304b/` 内の下記ファイル。採用原本のSHA-256、生成方法、編集の参照元SHA-256、最終出力のSHA-256・寸法・輝度測定は `tools/local-media-records/image-*.json` に保存した。

- 導入：`exec-0428df43-1f23-4f0e-a961-ba2d87d4eab2.png`
- 生還：`exec-df09d62a-16ae-423a-ab94-4314e6fae777.png`
- 古写真：`exec-d1f08650-4358-4e83-a15d-dbf626692210.png`

`tools/photo-prompts.json` の文章は制作ブリーフであり、正確なimage_gen実行入力が収録できたものではない。生成モデル名・seedもツールから非開示のため推測して記録しない。未実行のローカル生成設定は `tools/local-media-comfy-prompts.json` と候補専用キューへ分離した。

配信WebPを開いて検収した。導入は二階の戸口、三脚の望遠鏡、片付け箱が読み取れる。帰路は森林・車内を暗めに保ちつつ路面、ガードレール、DVカメラの輪郭が残る。古写真は右側の幹の背後の小さな白い頭と、反対側の鎌状の曲線が文章と一致し、顔や目は見えない。実在事件を撮影した写真ではない。探索の形状見本は場面写真と混同せず、ゲームの3Dモデルから撮った小物画像を使う。

全3写真の配信サイズは621,414 bytes（606.85 KiB）。音声8本は既存の合成結果をSHA-256・台詞・設定・波形の一致で検証し直し、再合成していない。共有JSONキューの12ジョブ（音声8検証・写真3変換・台帳）が完了し、`assets/production.json` に全11素材を ready と記録した。台帳の source.kind は写真の generated-builtin / edited-builtin、音声の generated-local を区別する。
