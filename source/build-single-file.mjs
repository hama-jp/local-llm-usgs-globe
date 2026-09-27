#!/usr/bin/env node
/*
 * Build the DSH single-file viewer.
 *
 * Inputs (read-only):
 *   /work/app/index.template.html
 *   /work/app/style.css
 *   /work/app/app.js
 *   /work/app/data/004-query.geojson
 *   /work/app/data/003-count.txt
 *   /work/app/data/manifest.json
 *   /work/app/data/acquire-result.json
 *   /work/app/vendor/three.module.js
 *   /work/app/vendor/three.core.js
 *   /work/app/vendor/OrbitControls.js
 *   /work/provided-tools/esbuild
 *   /work/provided-maps/manifest.json
 *   /work/provided-maps/land-topography.jpg
 *   /work/provided-maps/land-bathymetry.jpg
 *
 * Output:
 *   /work/app/index.html
 *
 * The output has no runtime imports, no importmap, and no fetch calls of its own.
 * The original GeoJSON bytes are embedded as base64 and decoded inside the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = '/work';
const APP = path.join(ROOT, 'app');
const TEMPLATE = path.join(APP, 'index.template.html');
const OUTPUT = path.join(APP, 'index.html');
const ENTRY = path.join(APP, '.single-entry.js');
const BUNDLE = path.join(APP, '.single-bundle.js');
const ESBUILD = path.join(ROOT, 'provided-tools', 'esbuild');

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function fail(message) {
  console.error(`[build-single-file] ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Transform the existing app.js into an embedded-data-only entry.
// ---------------------------------------------------------------------------
let app = readText(path.join(APP, 'app.js'));

app = app.replace(
  /const DATA_PATHS = \{[\s\S]*?\n\};/,
  `const DATA_PATHS = {
  acquireResult: 'acquireResult',
  manifest: 'manifest',
  raw: 'raw',
  count: 'count'
};`
);

const embeddedFetch = `async function fetchText(path) {
  const embedded = window.__USGS_EMBEDDED__;
  if (!embedded) throw new Error('埋め込みデータが見つかりません。');
  if (path === 'acquireResult') return JSON.stringify(embedded.acquireResult);
  if (path === 'manifest') return JSON.stringify(embedded.manifest);
  if (path === 'raw') return embedded.rawText;
  if (path === 'count') return embedded.countText;
  throw new Error('unknown embedded data: ' + path);
}`;

app = app.replace(/async function fetchText\(path\) \{[\s\S]*?\n\}/, embeddedFetch);
app = app.replace(/\nawait main\(\);\n/, '\nmain();\n');
app = app.replace(
  /async function main\(\) \{\n  try \{\n/,
  "async function main() {\n  try {\n    dom.loading.textContent = '保存済みUSGS原本を処理しています…';\n"
);
app = app.replace('ローカルHTTPサーバー経由で開いてください。', 'ブラウザーのJavaScript/WebGL設定を確認してください。');

if (app.includes('import.meta')) fail('transformed app.js still contains import.meta');
if (!app.includes("return embedded.rawText;")) fail('embedded raw data branch was not inserted');
if (!app.includes('main();')) fail('main() call missing');

fs.writeFileSync(ENTRY, app);

// ---------------------------------------------------------------------------
// 2. Bundle Three.js + OrbitControls + app into one classic IIFE.
// ---------------------------------------------------------------------------
execFileSync(
  ESBUILD,
  [
    ENTRY,
    '--bundle',
    '--format=iife',
    '--target=es2020',
    '--minify',
    '--charset=utf8',
    '--legal-comments=none',
    `--outfile=${BUNDLE}`,
    `--alias:three=${path.join(APP, 'vendor', 'three.module.js')}`
  ],
  { stdio: 'inherit' }
);

let bundle = readText(BUNDLE);

// ---------------------------------------------------------------------------
// 3. Embed the saved USGS bytes and metadata.
// ---------------------------------------------------------------------------
const rawBuffer = fs.readFileSync(path.join(APP, 'data', '004-query.geojson'));
const rawBase64 = rawBuffer.toString('base64');
const countText = readText(path.join(APP, 'data', '003-count.txt')).trim();
const manifest = JSON.parse(readText(path.join(APP, 'data', 'manifest.json')));
const acquireResult = JSON.parse(readText(path.join(APP, 'data', 'acquire-result.json')));

// ---------------------------------------------------------------------------
// 3b. Embed the saved NASA Blue Marble map images (originals are never changed).
// ---------------------------------------------------------------------------
const MAPS_DIR = path.join(ROOT, 'provided-maps');
const mapManifest = JSON.parse(readText(path.join(MAPS_DIR, 'manifest.json')));
const mapFiles = {
  land: 'land-topography.jpg',
  bathymetry: 'land-bathymetry.jpg'
};

function sha256Hex(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const mapRecordsByFile = new Map(
  (mapManifest.records || []).map((record) => [record.file, record])
);

const GEO_DIR = path.join(ROOT, 'provided-geography');
const geoManifest = JSON.parse(readText(path.join(GEO_DIR, 'manifest.json')));
const geoRecordsByFile = new Map((geoManifest.records || []).map((record) => [record.file, record]));

// 国・地域の検索索引（近似矩形）。行政界判定には使わない。
const geoNames = JSON.parse(readText(path.join(GEO_DIR, 'countries.geojson')));
const geoRegionList = [];
for (const feature of geoNames.features || []) {
  const properties = feature.properties || {};
  const lons = [];
  const lats = [];
  const walk = (coordinates) => {
    if (typeof coordinates[0] === 'number') {
      lons.push(coordinates[0]);
      lats.push(coordinates[1]);
    } else {
      for (const child of coordinates) walk(child);
    }
  };
  if (feature.geometry && feature.geometry.coordinates) walk(feature.geometry.coordinates);
  if (!lons.length) continue;
  const uniqueLons = Array.from(new Set(lons.map((v) => Math.round(v * 1e4) / 1e4))).sort((a, b) => a - b);
  let west = uniqueLons[0];
  let east = uniqueLons[uniqueLons.length - 1];
  if (uniqueLons.length > 1) {
    // 日付変更線を跨ぐ国を「世界全域」にしないため、最小の経度被覆区間（west>east は跨ぎ）を求める
    let bestGap = -1;
    let bestIndex = 0;
    const last = uniqueLons.length - 1;
    for (let i = 0; i < uniqueLons.length; i += 1) {
      // 経度は折り返しを含めて考える。最大の隙間の反対側が最小の被覆区間になる。
      const a = uniqueLons[i];
      const gap = i === last ? uniqueLons[0] + 360 - a : uniqueLons[i + 1] - a;
      if (gap > bestGap) {
        bestGap = gap;
        bestIndex = i;
      }
    }
    west = uniqueLons[(bestIndex + 1) % uniqueLons.length];
    east = uniqueLons[bestIndex];
    // 極を含む（緯度が ±90 に接する）国は全周として扱う
    const minLatCandidate = Math.min(...lats);
    const maxLatCandidate = Math.max(...lats);
    if (minLatCandidate <= -89.99 || maxLatCandidate >= 89.99) {
      west = -180;
      east = 180;
    }
  }
  // 概略矩形なので端点は外側へ丸める（丸めで狭まらないように）
  const floor2 = (v) => Math.floor(v * 100) / 100;
  const ceil2 = (v) => Math.ceil(v * 100) / 100;
  // 一意キー: ISO_A2 の "-99" は欠損の番兵なので使わない。ADM0_A3 は全177件で一意（確認済み）。
  const isoA2 = String(properties.ISO_A2 || '');
  const adm0A3 = String(properties.ADM0_A3 || '');
  const key = isoA2 && isoA2 !== '-99' ? isoA2 : (adm0A3 ? `a3-${adm0A3}` : `idx-${geoRegionList.length}`);
  geoRegionList.push({
    id: `country:${key}`,
    label_ja: properties.NAME_JA || properties.NAME_EN || properties.ADMIN || '',
    label_en: properties.NAME_EN || properties.ADMIN || '',
    admin: properties.ADMIN || '',
    bbox: [floor2(west), floor2(Math.min(...lats)), ceil2(east), ceil2(Math.max(...lats))]
  });
}
geoRegionList.sort((a, b) => (a.label_ja < b.label_ja ? -1 : a.label_ja > b.label_ja ? 1 : 0));

const mapsData = { manifest: mapManifest, land: null, bathymetry: null };
{
  const record = geoRecordsByFile.get('countries.geojson');
  const file = path.join(GEO_DIR, 'countries.geojson');
  if (!record) fail('geography manifest has no record for countries.geojson');
  const digest = sha256Hex(file);
  if (digest !== record.sha256) fail(`geography sha256 mismatch: ${digest} !== ${record.sha256}`);
  if (fs.statSync(file).size !== record.bytes) fail('geography byte length mismatch');
}

for (const [layer, fileName] of Object.entries(mapFiles)) {
  const file = path.join(MAPS_DIR, fileName);
  if (!fs.existsSync(file)) fail(`map image missing: ${file}`);
  const record = mapRecordsByFile.get(fileName);
  if (!record) fail(`map manifest has no record for ${fileName}`);
  const digest = sha256Hex(file);
  if (digest !== record.sha256) {
    fail(`map sha256 mismatch for ${fileName}: ${digest} !== ${record.sha256}`);
  }
  const buffer = fs.readFileSync(file);
  if (buffer.length !== record.bytes) {
    fail(`map byte length mismatch for ${fileName}: ${buffer.length} !== ${record.bytes}`);
  }
  mapsData[layer] = {
    fileName,
    mime: record.content_type || 'image/jpeg',
    base64: buffer.toString('base64'),
    sha256: digest,
    bytes: buffer.length,
    width: record.dimensions ? record.dimensions[0] : null,
    height: record.dimensions ? record.dimensions[1] : null,
    imageEpoch: mapManifest.image_epoch || null
  };
}

const embeddedDataScript = `<script>
window.__USGS_EMBEDDED__ = (function () {
  var rawBase64 = ${JSON.stringify(rawBase64)};
  var binary = atob(rawBase64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  var rawText;
  try {
    rawText = new TextDecoder('utf-8').decode(bytes);
  } catch (err) {
    rawText = decodeURIComponent(escape(binary));
  }
  return {
    rawText: rawText,
    countText: ${JSON.stringify(countText)},
    manifest: ${JSON.stringify(manifest)},
    acquireResult: ${JSON.stringify(acquireResult)},
    maps: ${JSON.stringify(mapsData)},
    geo: ${JSON.stringify({ manifest: geoManifest, regions: geoRegionList })}
  };
})();
</script>`;

// Codex提供の取得専用道具（変更せず、そのままHTMLへ組み込む）
const acquireTool = readText('/work/provided-acquisition/usgs-acquire.js');
if (/import\s*\(|import\s+[\w{*]|export\s/.test(acquireTool)) fail('acquisition tool is not a classic script');
const acquireScript = `<script>
${acquireTool.replace(/<\/script/gi, '<\\/script')}
</script>`;

const bundleScript = `<script>
${bundle.replace(/<\/script/gi, '<\\/script')}
</script>`;

// ---------------------------------------------------------------------------
// 4. Assemble index.html from the template.
// ---------------------------------------------------------------------------
let html = readText(TEMPLATE);
const css = readText(path.join(APP, 'style.css'));

html = html.replace(
  '<link rel="stylesheet" href="style.css">',
  () => `<style>\n${css}\n</style>`
);
html = html.replace(/\n?<script type="importmap">[\s\S]*?<\/script>\n?/, '\n');
html = html.replace(
  '<div id="loading" class="loading">USGS原本を読み込み、データ処理中です…</div>',
  '<div id="loading" class="loading">この3Dビューアーを表示するにはJavaScriptを有効にしてください。</div>\n<noscript><div class="loading">JavaScriptが無効です。ブラウザーの設定でJavaScriptを有効にしてください。</div></noscript>'
);
html = html.replace(
  '<script type="module" src="app.js"></script>',
  () => `${embeddedDataScript}\n${acquireScript}\n${bundleScript}`
);

if (html.includes('importmap')) fail('index.html still contains importmap');
if (html.includes('type="module"')) fail('index.html still contains module script');
if (html.includes('href="style.css"')) fail('index.html still references style.css');
if (html.includes('src="app.js"')) fail('index.html still references app.js');
if (Buffer.byteLength(html, 'utf8') > 32 * 1024 * 1024) fail('index.html exceeds 32 MiB');

fs.writeFileSync(OUTPUT, html);

// Keep the app directory clean; the build is reproducible from the sources above.
fs.rmSync(ENTRY, { force: true });
fs.rmSync(BUNDLE, { force: true });

console.log(`[build-single-file] wrote ${OUTPUT}`);
console.log(`[build-single-file] index.html bytes: ${Buffer.byteLength(html, 'utf8')}`);
console.log(`[build-single-file] bundle bytes: ${Buffer.byteLength(bundle, 'utf8')}`);
console.log(`[build-single-file] embedded raw base64 bytes: ${rawBase64.length}`);
console.log(`[build-single-file] embedded geography regions: ${geoRegionList.length} (unique ids: ${new Set(geoRegionList.map((r) => r.id)).size})`);
for (const [layer, entry] of Object.entries(mapsData)) {
  if (!entry || !entry.sha256) continue;
  console.log(`[build-single-file] embedded map ${layer}: ${entry.fileName} ${entry.width}x${entry.height} sha256=${entry.sha256.slice(0, 12)}...`);
}
