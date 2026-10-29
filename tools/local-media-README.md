# 邪視の素材制作と再検証

必要な写真3点・案内音声8本を最初に共有JSONキューへ列挙した。完成した音声を再生成しないよう、現在の `media-queue.json` は **音声8本の再検証 → 写真3点の配信用変換 → 台帳** を実行する。独立したCPU処理は2枠で並行し、最後の台帳は全11点の完了に依存する。生成専用レシピは別に残している。

```powershell
# サービスを起動しない。原本が assets/sources にある制作環境用。
node tools/media-queue.mjs media-queue.json
node tools/media-queue.mjs media-queue.json --run
# 配布リポジトリでは最終ファイルと台帳をそのまま検査できる。
node tools/check-production-assets.mjs --release
```

Pythonは `D:/AI/ComfyUI/venv/Scripts/python.exe` のPillow・NumPyを使用する。別環境で再利用する場合はキューの実行ファイルを変更する。原本とraw、キューの状態・実行ログはGit管理外。新しいチェックアウトでは由来不明な既存出力をキューで上書きせず、新しい出力パスで制作・検収してから採用する。通常の台帳検査に生成サービスや原本は不要。

## 採用した写真

`tools/photo-prompts.json` は採用原本、制作ブリーフ、目視検収の記録。導入・帰還は内蔵 `image_gen` による新規生成、古写真は同ツールで `dist/assets/mountain-photo.webp` を編集したもの。元の山写真も保存している。**採用画像はComfyUI・FLUXの生成結果ではない。** 正確なimage_gen実行入力はアーカイブに残っていないため、ブリーフと実行プロンプトを区別する。ツール非開示のモデル名やseedは推測しない。

原本の保存先とSHA-256は各 `importSource` に記録した。原本を `assets/sources/arrival.png`, `return.png`, `evidence.png` に用意すると `tools/prepare-photo.py <id>` が配信用WebPと個別記録を作る。画像内容を変更せず、RGB化・1400×1050以内の等倍比縮小・品質88のWebP符号化のみ。切り抜きや明るさ補正は行わない。

|画像|配信寸法|サイズ|検収|
|---|---|---:|---|
|arrival-v4-1.webp|1400×788|139,998 B|二階の戸口、三脚の望遠鏡、片付け箱を確認|
|return-v4-1.webp|1400×788|151,034 B|夜明けの下り道、谷、DVカメラの輪郭を確認|
|mountain-v4-1.webp|1400×1050|330,382 B|白い頭と幹の反対の鎌状の曲線が本文と一致|

圧縮後も目視検収済み。帰還写真は暗い森林と車内を保つが、路面・ガードレール・カメラは識別できる。3点とも物語の場面写真として使い、探索対象の見本には実際の3Dモデルから撮った `dist/assets/items/` を使う。

## 音声の再利用・追加制作

`tools/local-media-voices.json` が台詞、話者、速度の正本。D:/AIのVOICEVOXから生成した24kHzモノラル16bit WAVを同梱する。余白を先頭120ms・末尾200ms残して無音を整理し、端を6msでフェード、ピークを-6dBFSへ揃えた。語句や声質を後処理で変形しない。各記録には台詞・設定・SHA-256・尺・ピーク/RMS・クリップ数がある。現在の検証ジョブは波形とレシピの一致を確認するだけで、音声エンジンに接続しない。

クレジットは **VOICEVOX:麒ヶ島宗麟**。ノーマル（speaker53）、エンジン0.25.2。ゲーム内・資料に表記し、音声素材の再配布先にもクレジット義務を引き継ぐ。[公式規約](https://www.virvoxproject.com/voicevoxの利用規約)を2026-10-30に確認。架空の修司役の合成音声。

追加生成が必要な場合だけ `pwsh -File tools/local-media-start.ps1` で専用CPU版（2スレッド、localhost:50022、変更API無効）を起動する。既存GPU版50021とは別で、PIDとログは `tools/_raw/local-media/` に保存する。`tools/local-media-voice-queue.json` が生成専用レシピ。既存出力を守るため、新しい台詞を別ID・別出力に登録して実行する。サービス停止はこのタスクが起動したPIDと実行コマンドを確認してから行う。今回の専用サービスは生成後に終了済み。

## ローカル画像生成の保管レシピ

`tools/local-media-comfy-prompts.json` / `tools/local-media-comfy-queue.json` は未実行のFLUX.1-schnell候補制作レシピ。GPUは1枠。`photo` ワーカーはComfyUI8188のキューが空くまで待ち、受付IDを記録して、履歴の成功と実ファイル保存まで待つ。同じ設定で再実行すると受付IDを再確認する。候補画像と記録は `tools/_raw/local-media/candidates/` に隔離し、採用済み写真・台帳を置換しない。モデルの自動ダウンロードはしない。

2026-10-30はComfyUI8188のAPIが接続拒否で、ログには前日のCUDAエラーと、再起動時のDBロック・ポート使用中が記録されていた。プロセス照会の結果が一致しないため、残存PIDだけで停止原因を断定しない。追加の読み取り調査では、別系統のGPU版VOICEVOX50021が応答し、WindowsのGPUカウンターでも同プロセスの大きなメモリ使用を確認した。Wan動画とACE-StepはComfyUIを経由するが、GPU版VOICEVOXは別サービスである。ComfyUIのキューだけではGPU全体の空きを判断できない。

この状況で新規ローカル画像推論やACE-Step環境音生成は投入していない。GPUリセット・OS再起動・他の制作ワーカーの停止・既存設定の変更も行っていない。今回の音声は別ポートのCPUサービスだけを使用し、制作後に終了した。診断記録は `tools/_raw/local-media/`。別の制作システムの使用状況を確認してからローカルGPU生成を再開する。

全11点の個別記録は `tools/local-media-records/`、検証証跡は `tools/local-media-verification/`、公開用台帳は `assets/production.json`。台帳生成時に全ファイルのSHA-256を照合し、内蔵生成・内蔵編集・ローカル生成という実際の由来を保持する。自動波形検査と音声デコード検査は、人による聞き取り品質確認とは区別する。
