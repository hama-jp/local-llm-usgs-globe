# 出典とライセンス

- 地震: USGS Earthquake Catalog。2025-01-01T00:00:00Z以上、2026-01-01T00:00:00Z未満、世界、M4.5以上、earthquake。API仕様 https://earthquake.usgs.gov/fdsnws/event/1/ 、GeoJSON仕様 https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php 。USGS提供情報はパブリックドメイン。取得URL・日時・原本・SHA-256は `data/usgs/manifest.json` と原本ファイルに保存。
- 背景地図: NASA Earth Observatory, Blue Marble Next Generation、2004年7月。地表陰影と、GEBCOを含む陸海底陰影。 https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ 。NASA Earth Observatoryへのクレジットを付ける。提供時点の公式利用説明・原画像・取得URLとハッシュは `data/maps/`。地図は陰影画像であり地形の数値計測や球面の凹凸ではない。
- 地名検索資料: Natural Earth 1:110m Admin 0、パブリックドメイン。 https://www.naturalearthdata.com/about/terms-of-use/ 。原GeoJSON、利用条件、出典、取得日時とハッシュは `data/geography/`。日本の地方はDGXモデルが探索用の概略矩形を設定。
- 3Dライブラリ: Three.js r180 / OrbitControls、MIT。著作権と全文は `licenses/THREE-LICENSE.txt`、固定版の取得元とハッシュは同フォルダーのPROVENANCE。
- ビルド道具: esbuild 0.28.1（MIT）は実験側の提供汎用道具。ブラウザーでの再生には不要。ライセンスは `licenses/ESBUILD-LICENSE.md`、提供バイナリーの出典は `licenses/esbuild-provided-tool.json`。

アプリ・地震データ処理・地名索引・ビルドスクリプト: 既存DSHでDGXのdeepseek-v4.1-flashが実装。Codex: 環境、資料取得、Todoと不具合フィードバック、独立検証、記録、配布候補の梱包。アプリのCodex直接修正なし。アプリと独自の道具の公開ライセンスはMITです。第三者コード・地図・観測データの条件は上記および各licensesファイルに従います。
