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
