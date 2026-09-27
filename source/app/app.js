import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

/*
 * 世界の地震 3Dビューア
 * - USGSのGeoJSON原本を読み、このファイル内で対象判定・除外理由・3D座標を計算する。
 * - 描画はThree.js、操作はOrbitControls。
 * - window.__quakeAudit はUI/描画と同じデータ構造を参照する。
 */

const APP_VERSION = '2026.09.27-rc.8';

const DATA_PATHS = {
  acquireResult: new URL('data/acquire-result.json', import.meta.url).href,
  manifest: new URL('data/manifest.json', import.meta.url).href,
  raw: new URL('data/004-query.geojson', import.meta.url).href,
  count: new URL('data/003-count.txt', import.meta.url).href
};

const DATASET = {
  start: '2025-01-01T00:00:00Z',
  endExclusive: '2026-01-01T00:00:00Z',
  startMs: Date.UTC(2025, 0, 1, 0, 0, 0, 0),
  endMs: Date.UTC(2026, 0, 1, 0, 0, 0, 0),
  minMagnitude: 4.5,
  acquiredAt: null,
  manifestSha256: null
};

const EARTH_RADIUS_KM = 6371;
// 初期表示と全リセット後の地図レイヤー（地表＋海底地形の陰影）
const DEFAULT_MAP_LAYER = 'bathymetry';
const MAP_LAYER_VALUES = ['none', 'land', 'bathymetry'];

// data-testid と id が一致しない要素も拾えるようにする
function byTestId(id) {
  const byId = document.getElementById(id);
  if (byId) return byId;
  if (typeof document.querySelector === 'function') return document.querySelector(`[data-testid="${id}"]`);
  return null;
}

const dom = {
  topbar: typeof document.querySelector === 'function' ? document.querySelector('.topbar') : null,
  helpOpen: byTestId('help-open'),
  helpPanel: document.getElementById('help-panel'),
  helpClose: byTestId('help-close'),
  dataDetail: document.getElementById('data-detail'),
  csvExport: byTestId('csv-export'),
  csvOutput: byTestId('csv-output'),
  csvSelect: byTestId('csv-select'),
  csvStatus: document.getElementById('csv-status'),
  settingsExport: byTestId('settings-export'),
  settingsInput: byTestId('settings-input'),
  settingsImport: byTestId('settings-import'),
  settingsSelect: byTestId('settings-select'),
  settingsError: byTestId('settings-error'),
  helpCurrent: document.getElementById('help-current'),
  mapRetry: document.getElementById('map-retry'),
  dataOpen: byTestId('data-open'),
  dataPanel: document.getElementById('data-panel'),
  dataClose: byTestId('data-close'),
  datasetInfo: document.getElementById('dataset-info'),
  datasetStatus: document.getElementById('dataset-status'),
  dataPresetHint: document.getElementById('data-preset-hint'),
  dataStatus: document.getElementById('data-status'),
  dataStart: byTestId('data-start'),
  dataEnd: byTestId('data-end'),
  dataMinMag: byTestId('data-min-mag'),
  dataAcquire: byTestId('data-acquire'),
  dataCancel: byTestId('data-cancel'),
  dataRetry: byTestId('data-retry'),
  dataProgress: byTestId('data-progress'),
  dataError: byTestId('data-error'),
  dataRevert: byTestId('data-revert'),
  dataSave: byTestId('data-save'),
  dataSaveText: byTestId('data-save-text'),
  dataSaveSelect: byTestId('data-save-select'),
  dataImportText: byTestId('data-import-text'),
  dataImport: byTestId('data-import'),
  dataImportSelect: byTestId('data-import-select'),
  dataImportFile: byTestId('data-import-file'),
  dataGeojsonFile: byTestId('data-geojson-file'),
  datasetCaption: document.getElementById('dataset-caption'),
  datasetSummary: document.getElementById('dataset-summary'),
  dataReveal: byTestId('data-reveal'),
  dataSwitchNote: document.getElementById('data-switch-note'),
  dataSwitchText: document.getElementById('data-switch-text'),
  dataSwitchSave: byTestId('data-switch-save'),
  dataSwitchProceed: byTestId('data-switch-proceed'),
  dataSwitchCancel: byTestId('data-switch-cancel'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  app: document.getElementById('app'),
  hud: document.getElementById('hud'),
  canvas: document.getElementById('globe'),
  period: document.getElementById('period'),
  acquiredAt: document.getElementById('acquired-at'),
  rawCount: document.getElementById('raw-count'),
  queryCount: document.getElementById('query-count'),
  targetCount: document.getElementById('target-count'),
  excludedCount: document.getElementById('excluded-count'),
  unplottableCount: document.getElementById('unplottable-count'),
  mode: document.getElementById('mode'),
  surface: document.getElementById('surface'),
  depthScale: document.getElementById('depth-scale'),
  depthScaleLabel: document.getElementById('depth-scale-label'),
  resetScale: document.getElementById('reset-scale'),
  minDepth: document.getElementById('min-depth'),
  maxDepth: document.getElementById('max-depth'),
  minMag: document.getElementById('min-mag'),
  maxMag: document.getElementById('max-mag'),
  visibleCount: document.getElementById('visible-count'),
  frontCount: document.getElementById('front-count'),
  backsideNote: document.getElementById('backside-note'),
  selectedId: document.getElementById('selected-id'),
  selectedTime: document.getElementById('selected-time'),
  selectedDepth: document.getElementById('selected-depth'),
  selectedMag: document.getElementById('selected-mag'),
  selectedSource: document.getElementById('selected-source'),
  mapLayer: document.getElementById('map-layer'),
  mapStatus: document.getElementById('map-status'),
  mapCredit: document.getElementById('map-credit'),
  surfaceOpacity: document.getElementById('surface-opacity'),
  surfaceOpacityLabel: document.getElementById('surface-opacity-label'),
  graticule: document.getElementById('graticule'),
  resetView: document.getElementById('reset-view'),
  clearDepth: document.getElementById('clear-depth'),
  clearMag: document.getElementById('clear-mag'),
  clearFilters: document.getElementById('clear-filters'),
  filterStatus: document.getElementById('filter-status'),
  toggleConditions: document.getElementById('toggle-conditions'),
  toggleDetails: document.getElementById('toggle-details'),
  closeConditions: document.getElementById('close-conditions'),
  closeDetails: document.getElementById('close-details'),
  alwaysVisibleScale: document.getElementById('always-visible-scale'),
  details: document.getElementById('details'),
  searchInput: document.getElementById('search-input'),
  searchSuggestions: document.getElementById('search-suggestions'),
  searchApply: document.getElementById('search-apply'),
  searchClear: document.getElementById('search-clear'),
  searchStatus: document.getElementById('search-status'),
  regionSelect: document.getElementById('region-select'),
  bboxWest: document.getElementById('bbox-west'),
  bboxSouth: document.getElementById('bbox-south'),
  bboxEast: document.getElementById('bbox-east'),
  bboxNorth: document.getElementById('bbox-north'),
  bboxApply: document.getElementById('bbox-apply'),
  bboxError: document.getElementById('bbox-error'),
  filterReset: byTestId('filter-reset'),
  presetShallow: document.getElementById('preset-shallow'),
  presetDeep: document.getElementById('preset-deep'),
  presetMag6: document.getElementById('preset-mag6'),
  conditionChips: document.getElementById('condition-chips'),
  sortSelect: document.getElementById('sort'),
  resultList: document.getElementById('result-list'),
  resultTotal: document.getElementById('result-total'),
  pageStatus: document.getElementById('page-status'),
  pagePrev: document.getElementById('page-prev'),
  pageNext: document.getElementById('page-next'),
  selectedPlace: document.getElementById('selected-place'),
  selectedLat: document.getElementById('selected-lat'),
  selectedLon: document.getElementById('selected-lon'),
  timeStart: byTestId('time-start'),
  timeEnd: byTestId('time-end'),
  timeApply: byTestId('time-apply'),
  timeReset: byTestId('time-reset'),
  timePrevMonth: byTestId('time-prev-month'),
  timeNextMonth: byTestId('time-next-month'),
  timePlay: byTestId('time-play'),
  timeRestart: byTestId('time-restart'),
  timeSpeed: byTestId('time-speed'),
  timeMode: byTestId('time-mode'),
  timeWindow: byTestId('time-window'),
  timeSlider: byTestId('time-slider'),
  timeLabel: byTestId('time-label'),
  timeError: byTestId('time-error'),
  timeCursor: document.getElementById('time-cursor'),
  timeDetails: document.getElementById('time-details'),
  timeToggle: byTestId('time-toggle'),
  monthBar: document.getElementById('month-bar'),
  summaryCount: byTestId('summary-count'),
  summaryMaxMag: byTestId('summary-max-mag'),
  summaryMinDepth: byTestId('summary-min-depth'),
  summaryMaxDepth: byTestId('summary-max-depth'),
  detailList: document.getElementById('detail-list'),
  selectionHint: document.getElementById('selection-hint')
};

// 実データ処理結果（UIと監査で同じオブジェクトを参照）
let allRecords = [];
let excludedRecords = [];
let unplottableIds = [];
let selectedRecord = null;
let rawFeatureCount = 0;
let countQueryValue = null;

// Three.js
let renderer;
let scene;
let camera;
let controls;
let surfaceMesh;
let surfaceMaterial;
let graticuleGroup;
let points;
let pointsMaterial;
let mapTextures = { land: null, bathymetry: null };
let actualMapLayer = 'none';
let mapStatus = 'none';
let mapRequestId = 0;
let renderedRecords = [];
let renderedPositions = null;

// クリック判定用
let pointerDownInfo = null;

// 背面（カメラから見て地球の裏側の半球）の点を隠しているかと、その実描画バッファ上の可視フラグ
let backsideCullingEnabled = false;
let backsideHiddenCount = 0;
let visibilityFlags = [];
let frontIds = [];

// 実描画（GPU uniform）とCPU側コピーの観測値。snapshot() はこれを読むだけで状態を変更しない。
let lastGpuState = { cameraPosition: null, cullBackside: null };
let lastCpuCameraPosition = null;

// 探索（検索・地域・一覧）
const PAGE_SIZE = 20;
const REGION_PRESETS = [
  { id: 'world', label_ja: '全世界', label_en: 'World', bbox: null, note: '全地球（範囲指定なし）' },
  { id: 'japan', label_ja: '日本周辺', label_en: 'Japan', bbox: [120, 20, 150, 47], note: '日本列島と周辺海域の概略範囲' },
  { id: 'hokkaido', label_ja: '北海道', label_en: 'Hokkaido', bbox: [139, 41, 146.5, 45.9], note: '北海道と周辺の概略範囲' },
  { id: 'tohoku', label_ja: '東北', label_en: 'Tohoku', bbox: [136.8, 36, 142.2, 41.6], note: '東北地方と周辺の概略範囲' },
  { id: 'kanto', label_ja: '関東', label_en: 'Kanto', bbox: [138, 33.9, 141.5, 37.5], note: '関東地方と周辺の概略範囲' },
  { id: 'chubu', label_ja: '中部', label_en: 'Chubu', bbox: [135.4, 33.4, 139, 38], note: '中部地方と周辺の概略範囲' },
  { id: 'kinki', label_ja: '近畿／関西', label_en: 'Kinki/Kansai', bbox: [133.4, 33, 137, 36.1], note: '近畿地方と周辺の概略範囲' },
  { id: 'chugoku', label_ja: '中国地方', label_en: 'Chugoku', bbox: [130.5, 33, 135.6, 36.5], note: '中国地方と周辺の概略範囲' },
  { id: 'shikoku', label_ja: '四国', label_en: 'Shikoku', bbox: [131.5, 32.4, 134.9, 34.9], note: '四国と周辺の概略範囲' },
  { id: 'kyushu', label_ja: '九州', label_en: 'Kyushu', bbox: [128.5, 29.5, 132.2, 35], note: '九州と周辺の概略範囲' },
  { id: 'okinawa', label_ja: '沖縄', label_en: 'Okinawa', bbox: [122, 23.5, 131, 27.5], note: '沖縄諸島と南西諸島の概略範囲' }
];
const SORT_VALUES = ['time-desc', 'time-asc', 'mag-desc', 'depth-desc'];

// 時間（UTC・半開区間 [start, end)）
// 時間（UTC・半開区間 [start, end)）。データセットに応じて applyDataset() が更新する。
let PERIOD_START_MS = Date.UTC(2025, 0, 1);
let PERIOD_END_MS = Date.UTC(2026, 0, 1);
const DAY_MS = 86400000;
let DAY_COUNT = 365; // day 0 = 開始日 … day DAY_COUNT-1 = 最終日（うるう年・24時間データ等でも可）
let MONTH_KEYS = [];   // ['2025-01', ...] 年付きで複数年でも衝突しない
let MONTH_TITLES = []; // ['2025年1月', ...]
const TIME_SOURCES = ['all', 'custom', 'month', 'timeline'];

const timeState = {
  startMs: PERIOD_START_MS,
  endMs: PERIOD_END_MS,
  cursorDay: DAY_COUNT - 1,
  playing: false,
  speedDaysPerSecond: 1,
  playMode: 'cumulative',
  windowDays: 7,
  source: 'all',
  error: null
};

let monthlyCounts = [];
let monthMaxCount = 0;
let timeSummary = { count: 0, maxMagnitude: null, minDepthKm: null, maxDepthKm: null };
let timeTimer = null;
let cursorFloat = DAY_COUNT - 1;
let lastTickMs = 0;
let timeDetailsOpen = false;

const TIME_SOURCE_LABELS = { all: '全期間', custom: 'カスタム範囲', month: '選択した月', timeline: 'タイムライン' };

function timeSourceLabel() {
  if (timeState.source === 'timeline') {
    return timeState.playMode === 'window' ? `直近${timeState.windowDays}日` : '累積（1/1〜選択日を含む）';
  }
  return TIME_SOURCE_LABELS[timeState.source] || '全期間';
}

function setTimeDetails(open) {
  timeDetailsOpen = !!open;
  if (dom.timeDetails) dom.timeDetails.hidden = !timeDetailsOpen;
  if (dom.timeToggle) {
    dom.timeToggle.setAttribute('aria-expanded', timeDetailsOpen ? 'true' : 'false');
    dom.timeToggle.textContent = timeDetailsOpen ? '時間の詳細を閉じる' : '時間の詳細';
  }
}

let geoCandidates = [];
let matchedRecords = [];
let pageRecords = [];
let suggestionItems = [];
let suggestionIndex = -1;
let selectionMaterial = null;
let selectionMarker = null;

const explorer = {
  textQuery: '',
  textQueryRaw: '',
  regionId: 'world',
  regionLabel: '全世界',
  regionNote: '全地球（範囲指定なし）',
  bbox: null,
  sort: 'time-desc',
  page: 1,
  error: null
};

// 描画は要求時のみ。D03の再生など、連続更新が必要なときだけ continuousRender を立てる。
let renderPending = false;
let continuousRender = false;

// ---------------------------------------------------------------------------
// データ処理
// ---------------------------------------------------------------------------

function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function featureId(feature, index) {
  if (feature && typeof feature.id === 'string' && feature.id.length > 0) return feature.id;
  return null;
}

function extractCoordinateParts(feature) {
  const geometry = feature && feature.geometry;
  if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) {
    return { longitude: null, latitude: null, depth_km: null };
  }
  const coordinates = geometry.coordinates;
  return {
    longitude: finiteNumberOrNull(coordinates[0]),
    latitude: finiteNumberOrNull(coordinates[1]),
    depth_km: finiteNumberOrNull(coordinates[2])
  };
}

function isPlottable(record) {
  const { longitude, latitude, depth_km } = record;
  if (longitude === null || latitude === null || depth_km === null) return false;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(depth_km)) return false;
  if (longitude < -180 || longitude > 180) return false;
  if (latitude < -90 || latitude > 90) return false;
  return true;
}

function processRawFeatures(features) {
  const records = [];
  const excluded = [];
  const unplottable = [];

  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i] || {};
    const properties = feature.properties || {};
    const id = featureId(feature, i);

    // 仕様の判定順:
    // time不正 -> 期間 -> mag不正 -> mag閾値 -> type
    const timeMs = finiteNumberOrNull(properties.time);
    if (timeMs === null) {
      excluded.push({ id, reason: 'missing_or_invalid_time' });
      continue;
    }
    if (timeMs < DATASET.startMs || timeMs >= DATASET.endMs) {
      excluded.push({ id, reason: 'outside_period' });
      continue;
    }

    const magnitude = finiteNumberOrNull(properties.mag);
    if (magnitude === null) {
      excluded.push({ id, reason: 'missing_or_invalid_magnitude' });
      continue;
    }
    if (magnitude < DATASET.minMagnitude) {
      excluded.push({ id, reason: 'below_magnitude' });
      continue;
    }
    if (properties.type !== 'earthquake') {
      excluded.push({ id, reason: 'not_earthquake' });
      continue;
    }

    const { longitude, latitude, depth_km } = extractCoordinateParts(feature);
    const record = {
      id,
      time_ms: timeMs,
      longitude,
      latitude,
      depth_km,
      magnitude,
      place: typeof properties.place === 'string' ? properties.place : null,
      source_url: typeof properties.url === 'string' ? properties.url : null
    };
    records.push(record);
    if (!isPlottable(record)) unplottable.push(id);
  }

  return { records, excluded, unplottableIds: unplottable };
}

// ---------------------------------------------------------------------------
// 3D座標
// ---------------------------------------------------------------------------

function latLonRadiusToVector(latitudeDeg, longitudeDeg, radius) {
  const latitude = latitudeDeg * Math.PI / 180;
  const longitude = longitudeDeg * Math.PI / 180;
  const cosLat = Math.cos(latitude);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(longitude),
    radius * Math.sin(latitude),
    -radius * cosLat * Math.sin(longitude)
  );
}

function localPositionFor(record, mode, depthScale) {
  const radius = mode === 'surface'
    ? 1
    : (EARTH_RADIUS_KM - record.depth_km * depthScale) / EARTH_RADIUS_KM;
  return latLonRadiusToVector(record.latitude, record.longitude, radius);
}

function pointSizeFor(magnitude) {
  const clamped = Math.max(4.5, Math.min(9.0, magnitude));
  return 4 + (clamped - 4.5) * (14 / 4.5);
}

function colorForDepth(depthKm) {
  // 可視化用の色。データ値そのものではなく凡例との対応に使う。
  const t = Math.max(0, Math.min(700, depthKm)) / 700;
  const hue = (20 + t * 250) / 360; // 20°(橙) -> 270°(紫)
  return new THREE.Color().setHSL(hue, 0.92, 0.57);
}

// ---------------------------------------------------------------------------
// フィルター
// ---------------------------------------------------------------------------

function readNumericInput(input) {
  const raw = input.value;
  if (raw === null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readFilters() {
  return {
    minDepth: readNumericInput(dom.minDepth),
    maxDepth: readNumericInput(dom.maxDepth),
    minMag: readNumericInput(dom.minMag),
    maxMag: readNumericInput(dom.maxMag)
  };
}

function passesFilters(record, filters) {
  if (filters.minDepth !== null && record.depth_km < filters.minDepth) return false;
  if (filters.maxDepth !== null && record.depth_km > filters.maxDepth) return false;
  if (filters.minMag !== null && record.magnitude < filters.minMag) return false;
  if (filters.maxMag !== null && record.magnitude > filters.maxMag) return false;
  return true;
}

function readDepthScale() {
  const raw = Number(dom.depthScale.value);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(5, raw));
}

function syncDepthScaleUi() {
  const scale = readDepthScale();
  if (String(dom.depthScale.value) !== String(scale)) dom.depthScale.value = String(scale);
  dom.depthScaleLabel.value = `${scale.toFixed(1)}倍`;
  updateAlwaysVisibleScale();
}

// パネルを閉じていても表示モードと深さ倍率が分かる常設ラベル
function updateAlwaysVisibleScale() {
  try {
    syncHeaderHeight(); // 文言の折返しでヘッダーの高さが変わるため測り直す
  } catch (error) {
    // 計測できない環境ではCSSのフォールバック値を使う
  }
  if (!dom.alwaysVisibleScale) return;
  const scale = readDepthScale();
  const scaleText = scale === 1 ? '1.0倍（等倍）' : `${scale.toFixed(1)}倍（表示上の拡大）`;
  dom.alwaysVisibleScale.value = dom.mode.value === 'hypocenter'
    ? `震源表示 / 深さ${scaleText}`
    : `地表投影 / 深さ倍率 ${scale.toFixed(1)}倍（震源表示に適用）`;
}


// ---------------------------------------------------------------------------
// 背景地図（NASA Blue Marble 2004）
// ---------------------------------------------------------------------------

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function tryLoadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    image.src = src;
  });
}

async function loadImageFromBase64(base64, mime) {
  const type = mime || 'image/jpeg';
  let blobUrl = null;
  try {
    const blob = new Blob([base64ToUint8Array(base64)], { type });
    blobUrl = URL.createObjectURL(blob);
  } catch (error) {
    blobUrl = null;
  }
  if (blobUrl) {
    try {
      const image = await tryLoadImage(blobUrl);
      URL.revokeObjectURL(blobUrl);
      return image;
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
    }
  }
  // blob URL が使えない環境（CSP等）向けに data URI で再試行する
  return tryLoadImage(`data:${type};base64,${base64}`);
}

function embeddedMapEntry(layer) {
  const embedded = window.__USGS_EMBEDDED__;
  const maps = embedded && embedded.maps;
  return maps && maps[layer] ? maps[layer] : null;
}

function embeddedMapManifest() {
  const embedded = window.__USGS_EMBEDDED__;
  const maps = embedded && embedded.maps;
  return maps && maps.manifest ? maps.manifest : null;
}

async function ensureMapTexture(layer) {
  if (mapTextures[layer]) return mapTextures[layer];
  const entry = embeddedMapEntry(layer);
  if (!entry || !entry.base64) throw new Error('地図データが同梱されていません');

  const image = await loadImageFromBase64(entry.base64, entry.mime || 'image/jpeg');
  const gpuMax = renderer && renderer.capabilities && renderer.capabilities.maxTextureSize
    ? renderer.capabilities.maxTextureSize
    : 4096;
  // 5400x2700 の原本は、サンドボックス内のGPUメモリを抑えるため最大4096pxへ縮小する。
  const maxSize = Math.max(1, Math.min(4096, gpuMax));

  let textureImage = image;
  if (image.width > maxSize || image.height > maxSize) {
    const scale = Math.min(maxSize / image.width, maxSize / image.height);
    const width = Math.max(1, Math.floor(image.width * scale));
    const height = Math.max(1, Math.floor(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    textureImage = canvas;
  }

  const texture = new THREE.Texture(textureImage);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true; // SphereGeometry + Plate Carree: v=1 is north/top.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    if (maxAnisotropy) texture.anisotropy = Math.min(4, maxAnisotropy);
  }
  texture.needsUpdate = true;
  mapTextures[layer] = texture;
  return texture;
}

function applyMapLayer(layer, texture) {
  if (!surfaceMaterial) return;
  surfaceMaterial.map = texture || null;
  surfaceMaterial.color.set(texture ? 0xffffff : 0x2d6f9f);
  surfaceMaterial.emissive.set(texture ? 0x000000 : 0x07121f);
  surfaceMaterial.needsUpdate = true;
  actualMapLayer = texture ? layer : 'none';
  computeVisibility();
  if (renderer && scene && camera) requestRender();
}

function setMapStatus(message, isError) {
  mapStatus = message;
  if (!dom.mapStatus) return;
  dom.mapStatus.textContent = message;
  dom.mapStatus.classList.toggle('error-text', !!isError);
}

function updateMapCredit() {
  if (!dom.mapCredit) return;
  const manifest = embeddedMapManifest();
  if (!manifest) {
    dom.mapCredit.textContent = '背景地図: なし';
    return;
  }
  const base = `背景: NASA Earth Observatory Blue Marble ${manifest.image_epoch || ''}（取得 ${manifest.acquired_at || ''}）`;
  if (actualMapLayer === 'bathymetry') {
    dom.mapCredit.textContent = `${base} / 海底地形: GEBCO`;
  } else if (actualMapLayer === 'land') {
    dom.mapCredit.textContent = base;
  } else {
    dom.mapCredit.textContent = '背景地図: 地図なし';
  }
}

let failedMapLayer = null; // 読み込みに失敗した地図（再試行用。ユーザーが「地図なし」を選んだ正常状態とは区別する）

async function loadSelectedMapLayer() {
  const requested = dom.mapLayer ? dom.mapLayer.value : DEFAULT_MAP_LAYER;
  const layer = MAP_LAYER_VALUES.indexOf(requested) >= 0 ? requested : DEFAULT_MAP_LAYER;
  if (dom.mapLayer && dom.mapLayer.value !== layer) dom.mapLayer.value = layer;
  const requestId = ++mapRequestId;
  if (layer === 'none') {
    applyMapLayer('none', null);
    setMapStatus('地図なし');
    updateMapCredit();
    return;
  }
  setMapStatus('地図を読み込んでいます…');
  try {
    const texture = await ensureMapTexture(layer);
    if (requestId !== mapRequestId) return;
    applyMapLayer(layer, texture);
    failedMapLayer = null; // 成功したら失敗記憶を消す
    setMapStatus(layer === 'bathymetry' ? '表示中: 地表＋海底地形（陰影）' : '表示中: 地表（陸地陰影）');
    updateMapCredit();
  } catch (error) {
    if (requestId !== mapRequestId) return;
    failedMapLayer = layer; // 「地図を再読み込み」で本来のレイヤーを再試行できるようにする
    if (dom.mapLayer) dom.mapLayer.value = 'none';
    applyMapLayer('none', null);
    setMapStatus(`地図の読み込みに失敗しました（${layer}）: ${error && error.message ? error.message : String(error)}。「地図を再読み込み」で再試行できます。`, true);
    updateMapCredit();
  }
}

function retryMapLayer() {
  const target = failedMapLayer || (dom.mapLayer ? dom.mapLayer.value : DEFAULT_MAP_LAYER);
  if (!target || target === 'none') {
    if (failedMapLayer && dom.mapLayer) {
      dom.mapLayer.value = failedMapLayer; // 選択が none に戻されていても、失敗した本来の地図を復帰させる
      void loadSelectedMapLayer();
      return;
    }
    setMapStatus('現在は「地図なし」です。地図を表示するには地図レイヤーを選んでください。');
    return;
  }
  if (dom.mapLayer) dom.mapLayer.value = target;
  void loadSelectedMapLayer();
}

function updateSurfaceOpacityUi() {
  if (!dom.surfaceOpacity || !surfaceMaterial) return;
  const raw = Number(dom.surfaceOpacity.value);
  const opacity = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
  surfaceMaterial.opacity = opacity;
  if (dom.surfaceOpacityLabel) dom.surfaceOpacityLabel.value = opacity.toFixed(2);
  computeVisibility();
  if (renderer && scene && camera) requestRender();
}

function updateFilterStatus() {
  if (!dom.filterStatus) return;
  const filters = readFilters();
  const depthParts = [];
  if (filters.minDepth !== null) depthParts.push(`${filters.minDepth} km以上`);
  if (filters.maxDepth !== null) depthParts.push(`${filters.maxDepth} km以下`);
  const magParts = [];
  if (filters.minMag !== null) magParts.push(`M${filters.minMag}以上`);
  if (filters.maxMag !== null) magParts.push(`M${filters.maxMag}以下`);
  const depthText = depthParts.length ? depthParts.join(' / ') : '指定なし';
  const magText = magParts.length ? magParts.join(' / ') : '指定なし';
  const backsideText = backsideCullingEnabled ? ` / 背面非表示 ${backsideHiddenCount}件` : ' / 背面は全周表示';
  dom.filterStatus.textContent = `適用中 — 深さ: ${depthText} / マグニチュード: ${magText} / 絞り込み対象 ${renderedRecords.length}件${backsideText}`;
}

// 絞り込み対象（全件）と、実際にこの向きで描画している件数を区別して表示する
function updateCountsUi() {
  if (dom.visibleCount) dom.visibleCount.value = String(renderedRecords.length);
  const frontCount = backsideCullingEnabled ? frontIds.length : renderedRecords.length;
  if (dom.frontCount) dom.frontCount.value = String(frontCount);
  if (dom.backsideNote) {
    dom.backsideNote.textContent = backsideCullingEnabled
      ? `（背面 ${backsideHiddenCount}件を非表示）`
      : '（全周を表示）';
  }
  updateFilterStatus();
}

// 描画・クリック選択と同じ判定。点Pとカメラ位置Cについて dot(P, C) < 0 を背面とする。
// 点のバッファは地球中心が原点・無変換なので、モデル座標＝ワールド座標で比較できる。
function computeVisibility() {
  backsideCullingEnabled = !!(
    surfaceMesh && surfaceMesh.visible
    && surfaceMaterial && surfaceMaterial.map
    && surfaceMaterial.opacity > 0
  );
  visibilityFlags = [];
  frontIds = [];
  backsideHiddenCount = 0;

  if (!points || !points.geometry || !camera) {
    updateCountsUi();
    return;
  }
  const positionAttribute = points.geometry.getAttribute('position');
  if (!positionAttribute) {
    updateCountsUi();
    return;
  }
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;

  for (let i = 0; i < renderedRecords.length; i += 1) {
    const x = positionAttribute.getX(i);
    const y = positionAttribute.getY(i);
    const z = positionAttribute.getZ(i);
    const visible = !backsideCullingEnabled || (x * cx + y * cy + z * cz) >= 0;
    visibilityFlags.push(visible);
    if (visible) {
      frontIds.push(renderedRecords[i].id);
    } else {
      backsideHiddenCount += 1;
    }
  }
  updateSelectionMarker();
  updateCountsUi();
}

// ---------------------------------------------------------------------------
// 探索（検索・地域・一覧・詳細）
// ---------------------------------------------------------------------------

function embeddedGeo() {
  const embedded = window.__USGS_EMBEDDED__;
  return embedded && embedded.geo ? embedded.geo : null;
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  let text = value;
  try {
    text = text.normalize('NFKC');
  } catch (error) {
    // NFKC不可の環境ではそのまま比較する
  }
  return text.trim().toLowerCase();
}

function regionChoices() {
  return REGION_PRESETS.concat(geoCandidates);
}

function findRegionChoice(id) {
  for (const region of regionChoices()) {
    if (region.id === id) return region;
  }
  return null;
}

function bboxText(bbox) {
  if (!bbox) return '範囲指定なし（全世界）';
  const west = bbox[0];
  const south = bbox[1];
  const east = bbox[2];
  const north = bbox[3];
  return `${west}°〜${east}°E / ${south}°〜${north}°N${west > east ? '（日付変更線を跨ぐ）' : ''}`;
}

function matchesQuery(record, query) {
  if (!query) return true;
  const id = normalizeText(record.id);
  const place = normalizeText(record.place);
  return id.indexOf(query) >= 0 || (place ? place.indexOf(query) >= 0 : false);
}

function inBbox(record, bbox) {
  if (record.longitude === null || record.latitude === null) return false;
  const west = bbox[0];
  const south = bbox[1];
  const east = bbox[2];
  const north = bbox[3];
  if (record.latitude < south || record.latitude > north) return false;
  if (west <= east) return record.longitude >= west && record.longitude <= east;
  return record.longitude >= west || record.longitude <= east; // west>east は日付変更線跨ぎ
}

function compareIdsAscending(a, b) {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function compareBySort(sort) {
  if (sort === 'time-asc') return (a, b) => (a.time_ms - b.time_ms) || compareIdsAscending(a, b);
  if (sort === 'mag-desc') return (a, b) => (b.magnitude - a.magnitude) || compareIdsAscending(a, b);
  if (sort === 'depth-desc') return (a, b) => (b.depth_km - a.depth_km) || compareIdsAscending(a, b);
  return (a, b) => (b.time_ms - a.time_ms) || compareIdsAscending(a, b); // time-desc
}

function applyExplorerFilters() {
  const filters = readFilters();
  const query = normalizeText(explorer.textQuery);
  const base = [];
  for (const record of allRecords) {
    if (!isPlottable(record)) continue;
    if (!passesFilters(record, filters)) continue;
    if (explorer.bbox && !inBbox(record, explorer.bbox)) continue;
    if (!matchesQuery(record, query)) continue;
    base.push(record);
  }

  // 月別件数: 「現在の地域・検索・深さ・Mに合う全期間」を母集団とし、時間絞り込みからは独立。
  monthlyCounts = new Array(MONTH_KEYS.length).fill(0);
  for (const record of base) {
    if (record.time_ms < PERIOD_START_MS || record.time_ms >= PERIOD_END_MS) continue;
    const index = monthIndexForMs(record.time_ms);
    if (index >= 0) monthlyCounts[index] += 1;
  }
  monthMaxCount = monthlyCounts.reduce((max, value) => (value > max ? value : max), 0);

  // 時間は [start, end) の半開区間。原本のミリ秒値で比較する（ローカル時刻は使わない）。
  const list = [];
  for (const record of base) {
    if (record.time_ms < timeState.startMs || record.time_ms >= timeState.endMs) continue;
    list.push(record);
  }
  list.sort(compareBySort(explorer.sort));
  matchedRecords = list;

  // サマリーは現在の時間絞り込み後の対象から。0件なら件数のみ0で他はnull。
  if (list.length === 0) {
    timeSummary = { count: 0, maxMagnitude: null, minDepthKm: null, maxDepthKm: null };
  } else {
    let maxMagnitude = -Infinity;
    let minDepthKm = Infinity;
    let maxDepthKm = -Infinity;
    for (const record of list) {
      if (record.magnitude > maxMagnitude) maxMagnitude = record.magnitude;
      if (record.depth_km < minDepthKm) minDepthKm = record.depth_km;
      if (record.depth_km > maxDepthKm) maxDepthKm = record.depth_km;
    }
    timeSummary = { count: list.length, maxMagnitude, minDepthKm, maxDepthKm };
  }

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (!Number.isFinite(explorer.page) || explorer.page < 1) explorer.page = 1;
  if (explorer.page > pages) explorer.page = pages;
  pageRecords = list.slice((explorer.page - 1) * PAGE_SIZE, explorer.page * PAGE_SIZE);

  if (selectedRecord && !list.some((record) => record.id === selectedRecord.id)) {
    selectedRecord = null;
    updateSelectedDetails();
  }
}

function pageCountValue() {
  return Math.max(1, Math.ceil(matchedRecords.length / PAGE_SIZE));
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUtcMinute(ms) {
  if (!Number.isFinite(ms)) return '-';
  const date = new Date(ms);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day} ${hour}:${minute}`;
}

function renderList() {
  if (!dom.resultList) return;
  // ページ送り・選択連動でページが変わっても、常に現在のページ範囲を描く
  const pages = pageCountValue();
  if (explorer.page > pages) explorer.page = pages;
  if (explorer.page < 1) explorer.page = 1;
  pageRecords = matchedRecords.slice((explorer.page - 1) * PAGE_SIZE, explorer.page * PAGE_SIZE);
  const rows = pageRecords.map((record) => `
    <li class="result-row" role="option" tabindex="0" data-event-id="${escapeHtml(record.id)}" aria-selected="false">
      <span class="row-time">${escapeHtml(formatUtcMinute(record.time_ms))}</span>
      <span class="row-mag">M${escapeHtml(record.magnitude)}</span>
      <span class="row-depth">${escapeHtml(record.depth_km)}km</span>
      <span class="row-place" title="${escapeHtml(record.place || '')}">${escapeHtml(record.place || '（原文地名なし）')}</span>
      <span class="row-id">${escapeHtml(record.id)}</span>
    </li>`).join('');
  const empty = matchedRecords.length === 0
    ? '<li class="result-empty" aria-selected="false">条件に一致する地震がありません。<button type="button" class="ghost-btn" data-action="reset">検索・条件をリセット</button></li>'
    : '';
  dom.resultList.innerHTML = rows + empty;
  if (dom.resultTotal) dom.resultTotal.value = String(matchedRecords.length);
  if (dom.pageStatus) dom.pageStatus.textContent = `${explorer.page} / ${pageCountValue()}`;
  if (dom.pagePrev) dom.pagePrev.disabled = explorer.page <= 1;
  if (dom.pageNext) dom.pageNext.disabled = explorer.page >= pageCountValue();
  syncListSelection();
}

function syncListSelection() {
  if (!dom.resultList) return;
  const id = selectedRecord ? selectedRecord.id : null;
  let target = null;
  const rows = dom.resultList.querySelectorAll('[data-event-id]');
  for (const row of rows) {
    const isSelected = !!id && row.getAttribute('data-event-id') === id;
    row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    row.classList.toggle('is-selected', isSelected);
    if (isSelected) target = row;
  }
  if (!target || typeof target.scrollIntoView !== 'function') return;
  const listRect = dom.resultList.getBoundingClientRect ? dom.resultList.getBoundingClientRect() : null;
  const rowRect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
  if (listRect && rowRect && (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom)) {
    target.scrollIntoView({ block: 'nearest' }); // 読んでいる行を動かさない最小限のスクロール
  }
}

function renderConditionChips() {
  if (!dom.conditionChips) return;
  const filters = readFilters();
  const chips = [];
  if (explorer.regionId !== 'world') {
    chips.push(`<span class="chip condition-chip">地域: ${escapeHtml(explorer.regionLabel)}<button type="button" data-chip="region" aria-label="地域条件を解除">×</button></span>`);
  }
  if (explorer.textQuery) {
    chips.push(`<span class="chip condition-chip">検索: ${escapeHtml(explorer.textQuery)}<button type="button" data-chip="query" aria-label="検索条件を解除">×</button></span>`);
  }
  if (filters.minDepth !== null) chips.push(`<span class="chip condition-chip">深さ ${escapeHtml(filters.minDepth)}km以上<button type="button" data-chip="minDepth" aria-label="最小深さを解除">×</button></span>`);
  if (filters.maxDepth !== null) chips.push(`<span class="chip condition-chip">深さ ${escapeHtml(filters.maxDepth)}km以下<button type="button" data-chip="maxDepth" aria-label="最大深さを解除">×</button></span>`);
  if (filters.minMag !== null) chips.push(`<span class="chip condition-chip">M${escapeHtml(filters.minMag)}以上<button type="button" data-chip="minMag" aria-label="最小Mを解除">×</button></span>`);
  if (timeState.source !== 'all') {
    chips.push(`<span class="chip condition-chip">時間: ${escapeHtml(formatYmd(timeState.startMs))} 以上〜${escapeHtml(formatYmd(timeState.endMs))} 未満（${escapeHtml(timeSourceLabel())}）<button type="button" data-chip="time" aria-label="時間条件を全期間へ戻す">×</button></span>`);
  }
  if (filters.maxMag !== null) chips.push(`<span class="chip condition-chip">M${escapeHtml(filters.maxMag)}以下<button type="button" data-chip="maxMag" aria-label="最大Mを解除">×</button></span>`);
  dom.conditionChips.innerHTML = chips.length ? chips.join('') : '<span class="hint">条件なし（対象の全件を表示中）</span>';
}

function refreshExplorer() {
  applyExplorerFilters();
  renderList();
  renderConditionChips();
  updateTimeUi();
  rebuildRenderedPoints();
}

function syncRegionSelect(id, label) {
  if (!dom.regionSelect) return;
  let option = null;
  for (const candidate of dom.regionSelect.options) {
    if (candidate.value === id) option = candidate;
  }
  if (!option) {
    option = document.createElement('option');
    option.value = id;
    dom.regionSelect.appendChild(option);
  }
  option.textContent = label;
  dom.regionSelect.value = id;
}

function applyRegion(id, label, bbox, note) {
  explorer.regionId = id;
  explorer.regionLabel = label;
  explorer.regionNote = note || '';
  explorer.bbox = bbox ? bbox.slice() : null;
  explorer.textQuery = '';
  explorer.page = 1;
  explorer.error = null;
  if (dom.searchInput) dom.searchInput.value = '';
  hideSuggestions();
  syncRegionSelect(id, label);
  refreshExplorer();
  focusBbox(explorer.bbox);
}

function focusBbox(bbox) {
  if (!bbox || !camera || !controls) return;
  const centerLat = Math.max(-80, Math.min(80, (bbox[1] + bbox[3]) / 2));
  // 経度は西端から東回りに測った幅で中心を出す（west>east は日付変更線跨ぎ）
  const width = ((bbox[2] - bbox[0]) % 360 + 360) % 360;
  const centerRaw = bbox[0] + width / 2;
  const centerLon = ((centerRaw + 180) % 360 + 360) % 360 - 180; // 例: 170→-170 の中心は ±180
  const direction = latLonRadiusToVector(centerLat, centerLon, 1).normalize();
  const distance = Math.max(camera.position.length(), 2.2);
  camera.position.copy(direction.multiplyScalar(distance));
  controls.target.set(0, 0, 0);
  controls.update();
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  requestRender();
}

function buildSuggestions(query) {
  const q = normalizeText(query);
  if (!q) return [];
  const items = [];
  for (const region of regionChoices()) {
    const ja = normalizeText(region.label_ja);
    const en = normalizeText(region.label_en || '');
    if (ja.indexOf(q) >= 0 || en.indexOf(q) >= 0) {
      items.push({
        type: 'region',
        id: region.id,
        label: region.label_ja,
        sub: region.bbox ? `概略範囲 ${bboxText(region.bbox)}` : '範囲指定なし（全世界）',
        bbox: region.bbox || null,
        note: region.note || (region.id.indexOf('country:') === 0 ? '国・地域の概略矩形（国境内判定ではありません）' : '')
      });
    }
    if (items.length >= 8) break;
  }
  let eventCount = 0;
  for (const record of allRecords) {
    if (eventCount >= 4) break;
    if (!isPlottable(record)) continue;
    const id = normalizeText(record.id);
    const place = normalizeText(record.place);
    if (id.indexOf(q) >= 0 || (place ? place.indexOf(q) >= 0 : false)) {
      items.push({ type: 'event', id: record.id, label: record.place || record.id, sub: `USGS ID ${record.id}`, bbox: null });
      eventCount += 1;
    }
  }
  return items;
}

function renderSuggestions(items) {
  if (!dom.searchSuggestions) return;
  suggestionItems = items;
  suggestionIndex = -1;
  dom.searchSuggestions.innerHTML = items.map((item, index) => `
    <li role="option" class="suggestion-item" aria-selected="false" data-index="${index}">
      <button type="button" class="suggestion-btn" data-index="${index}">
        <span class="suggestion-label">${escapeHtml(item.label)}</span>
        <span class="suggestion-sub">${escapeHtml(item.sub)}</span>
      </button>
    </li>`).join('');
  dom.searchSuggestions.hidden = items.length === 0;
}

function hideSuggestions() {
  suggestionItems = [];
  suggestionIndex = -1;
  if (!dom.searchSuggestions) return;
  dom.searchSuggestions.hidden = true;
  dom.searchSuggestions.innerHTML = '';
}

function moveSuggestion(delta) {
  if (!suggestionItems.length || !dom.searchSuggestions) return;
  suggestionIndex = (suggestionIndex + delta + suggestionItems.length) % suggestionItems.length;
  const options = dom.searchSuggestions.querySelectorAll('[data-index]');
  for (const option of options) {
    const isActive = Number(option.getAttribute('data-index')) === suggestionIndex;
    option.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive && typeof option.scrollIntoView === 'function') option.scrollIntoView({ block: 'nearest' });
  }
}

function setSearchStatus(message, isError) {
  if (!dom.searchStatus) return;
  dom.searchStatus.textContent = message || '';
  dom.searchStatus.classList.toggle('error-text', !!isError);
}

function applySuggestion(item) {
  if (!item) return;
  if (item.type === 'region') {
    applyRegion(item.id, item.label, item.bbox, item.note);
    setSearchStatus(`地域「${item.label}」を適用しました。${item.bbox ? '探索用の概略範囲で、行政界ではありません。' : ''}`);
  } else {
    explorer.textQueryRaw = item.id;
    explorer.textQuery = normalizeText(item.id);
    explorer.page = 1;
    explorer.error = null;
    hideSuggestions();
    setSearchStatus(`USGS ID「${item.id}」で検索しました。`);
    refreshExplorer();
    selectRecordById(item.id, { focus: true });
  }
}

function applySearch() {
  explorer.error = null;
  if (suggestionIndex >= 0 && suggestionItems[suggestionIndex]) {
    applySuggestion(suggestionItems[suggestionIndex]);
    return;
  }
  const typed = dom.searchInput ? dom.searchInput.value : '';
  const q = normalizeText(typed);
  if (!q) {
    const message = '検索語を入力してください（国名・地域名・USGS ID・原文地名の一部）。';
    explorer.error = message;
    setSearchStatus(message, true);
    return;
  }
  // 国名・地域名はUSGS原文placeへのAND検索にせず、地域（概略範囲）として適用する
  const region = regionChoices().find((candidate) => normalizeText(candidate.label_ja) === q || normalizeText(candidate.label_en) === q);
  if (region) {
    applySuggestion({ type: 'region', id: region.id, label: region.label_ja, bbox: region.bbox || null, note: region.note });
    return;
  }
  explorer.textQueryRaw = typed.trim();
  explorer.textQuery = normalizeText(typed); // 監査値は NFKC→trim→小文字化した適用値
  explorer.page = 1;
  explorer.error = null;
  hideSuggestions();
  setSearchStatus(`USGS ID・原文地名の部分一致で検索: 「${explorer.textQueryRaw}」`);
  refreshExplorer();
}

function clearSearch() {
  explorer.textQuery = '';
  explorer.textQueryRaw = '';
  explorer.page = 1;
  explorer.error = null;
  if (dom.searchInput) dom.searchInput.value = '';
  hideSuggestions();
  setSearchStatus('');
  refreshExplorer();
}

function setBboxError(message) {
  if (!dom.bboxError) return;
  dom.bboxError.textContent = message || '';
  dom.bboxError.classList.toggle('error-text', !!message);
}

function applyBboxInput() {
  const values = [dom.bboxWest, dom.bboxSouth, dom.bboxEast, dom.bboxNorth].map(readNumericInput);
  if (values.some((value) => value === null)) {
    const message = '西経度・南緯度・東経度・北緯度の4つを数値で入力してください（前の条件を保持します）。';
    explorer.error = message;
    setBboxError(message);
    return;
  }
  const west = values[0];
  const south = values[1];
  const east = values[2];
  const north = values[3];
  if (west < -180 || west > 180 || east < -180 || east > 180) {
    explorer.error = '経度は -180〜180 の範囲で入力してください（前の条件を保持します）。';
    setBboxError('経度は -180〜180 の範囲で入力してください（前の条件を保持します）。');
    return;
  }
  if (south < -90 || south > 90 || north < -90 || north > 90) {
    explorer.error = '緯度は -90〜90 の範囲で入力してください（前の条件を保持します）。';
    setBboxError('緯度は -90〜90 の範囲で入力してください（前の条件を保持します）。');
    return;
  }
  if (south > north) {
    explorer.error = '南緯度は北緯度以下にしてください（前の条件を保持します）。';
    setBboxError('南緯度は北緯度以下にしてください（前の条件を保持します）。');
    return;
  }
  if (west === east) {
    explorer.error = '西経度と東経度が同じです。範囲を指定してください（前の条件を保持します）。';
    setBboxError('西経度と東経度が同じです。範囲を指定してください（前の条件を保持します）。');
    return;
  }
  setBboxError('');
  explorer.error = null;
  const label = `指定範囲 ${bboxText([west, south, east, north])}`;
  explorer.regionId = 'bbox';
  explorer.regionLabel = label;
  explorer.regionNote = '入力した矩形の概略範囲';
  explorer.bbox = [west, south, east, north];
  explorer.textQuery = '';
  explorer.page = 1;
  explorer.error = null;
  if (dom.searchInput) dom.searchInput.value = '';
  hideSuggestions();
  syncRegionSelect('bbox', label);
  refreshExplorer();
  focusBbox(explorer.bbox);
}

function resetAllConditions() {
  // 検索・地域・深さ/M の絞り込みだけを解除する（地図レイヤー・視点・深さ倍率は変更しない）
  dom.minDepth.value = '';
  dom.maxDepth.value = '';
  dom.minMag.value = '';
  dom.maxMag.value = '';
  explorer.textQuery = '';
  explorer.regionId = 'world';
  explorer.regionLabel = '全世界';
  explorer.regionNote = '全地球（範囲指定なし）';
  explorer.bbox = null;
  explorer.page = 1;
  explorer.error = null;
  if (dom.searchInput) dom.searchInput.value = '';
  setBboxError('');
  setSearchStatus('');
  hideSuggestions();
  syncRegionSelect('world', '全世界');
  // 時間も初期の全期間へ戻す（半開区間）
  if (timeTimer) {
    clearInterval(timeTimer);
    timeTimer = null;
  }
  timeState.playing = false;
  setContinuousRender(false);
  timeState.startMs = PERIOD_START_MS;
  timeState.endMs = PERIOD_END_MS;
  timeState.source = 'all';
  timeState.cursorDay = DAY_COUNT - 1;
  cursorFloat = DAY_COUNT - 1;
  setTimeError('');
  refreshExplorer();
}

function applyPreset(kind) {
  if (kind === 'shallow') {
    dom.minDepth.value = '';
    dom.maxDepth.value = '70';
  } else if (kind === 'deep') {
    dom.minDepth.value = '300';
    dom.maxDepth.value = '';
  } else if (kind === 'mag6') {
    dom.minMag.value = '6';
    dom.maxMag.value = '';
  }
  explorer.page = 1;
  refreshExplorer();
}

function changePage(delta) {
  const pages = pageCountValue();
  const next = Math.max(1, Math.min(pages, explorer.page + delta));
  if (next === explorer.page) return;
  explorer.page = next;
  renderList();
}

function updateSelectionMarker() {
  if (!selectionMarker || !selectedRecord) {
    if (selectionMarker) selectionMarker.visible = false;
    return;
  }
  if (!isPlottable(selectedRecord)) {
    selectionMarker.visible = false;
    return;
  }
  const mode = dom.mode.value === 'hypocenter' ? 'hypocenter' : 'surface';
  const vector = localPositionFor(selectedRecord, mode, readDepthScale());
  selectionMarker.position.copy(vector);
  let visible = true;
  if (backsideCullingEnabled && camera) {
    visible = (vector.x * camera.position.x + vector.y * camera.position.y + vector.z * camera.position.z) >= 0;
  }
  selectionMarker.visible = visible;
}

function initExplorer() {
  const geo = embeddedGeo();
  geoCandidates = geo && Array.isArray(geo.regions)
    ? geo.regions.map((region) => ({
      id: region.id,
      label_ja: region.label_ja,
      label_en: region.label_en,
      bbox: region.bbox,
      note: '国・地域の概略矩形（国境内判定ではありません）'
    }))
    : [];
  if (dom.sortSelect && SORT_VALUES.indexOf(dom.sortSelect.value) >= 0) {
    explorer.sort = dom.sortSelect.value;
  }
  applyExplorerFilters();
  renderList();
  renderConditionChips();
  updateTimeUi();
}

// ---------------------------------------------------------------------------
// 時間を追う（UTC・半開区間）
// ---------------------------------------------------------------------------

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatYmd(ms) {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatIsoUtc(ms) {
  // 秒だけに丸めない（データセット/設定/CSVの精度を落とさない）
  const value = Number(ms);
  if (!Number.isFinite(value)) return '-';
  return new Date(value).toISOString();
}

// UIで秒までで十分な箇所向け（丸め表示。データには使わない）
function formatIsoUtcSeconds(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return '-';
  return `${formatYmd(value)}T${pad2(new Date(value).getUTCHours())}:${pad2(new Date(value).getUTCMinutes())}:${pad2(new Date(value).getUTCSeconds())}Z`;
}

function dayStartMs(day) {
  return PERIOD_START_MS + day * DAY_MS;
}

// 最終日が部分日（24時間データ等）でも末日分を落とさない
function dayEndMs(day) {
  return Math.min(PERIOD_END_MS, PERIOD_START_MS + (day + 1) * DAY_MS);
}

function rebuildCalendar() {
  if (!(PERIOD_END_MS > PERIOD_START_MS)) {
    PERIOD_END_MS = PERIOD_START_MS + DAY_MS;
  }
  DAY_COUNT = Math.max(1, Math.ceil((PERIOD_END_MS - PERIOD_START_MS) / DAY_MS));
  MONTH_KEYS = [];
  MONTH_TITLES = [];
  const first = new Date(PERIOD_START_MS);
  const last = new Date(PERIOD_END_MS - 1);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();
  for (let guard = 0; guard < 600; guard += 1) {
    MONTH_KEYS.push(`${year}-${pad2(month + 1)}`);
    MONTH_TITLES.push(`${year}年${month + 1}月`);
    if (year === last.getUTCFullYear() && month === last.getUTCMonth()) break;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  monthlyCounts = new Array(MONTH_KEYS.length).fill(0);
}

function monthBounds(index) {
  const key = MONTH_KEYS[index];
  if (!key) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return {
    start: Math.max(PERIOD_START_MS, Date.UTC(year, month - 1, 1)),
    end: Math.min(PERIOD_END_MS, Date.UTC(year, month, 1))
  };
}

function monthIndexForMs(ms) {
  const date = new Date(ms);
  return MONTH_KEYS.indexOf(`${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`);
}

function parseUtcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split('-');
  const ms = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return formatYmd(ms) === value ? ms : null;
}

function currentMonthIndex() {
  const start = new Date(timeState.startMs);
  const month = start.getUTCMonth();
  return Number.isFinite(month) && month >= 0 && month <= 11 ? month : 0;
}

// スライダー/再生の定義（累積 or 直近N日）から適用中の半開区間を求める
function applyTimeDerivedRange() {
  const day = Math.max(0, Math.min(DAY_COUNT - 1, Math.round(timeState.cursorDay)));
  timeState.cursorDay = day;
  if (timeState.playMode === 'window') {
    const end = dayEndMs(day);
    const start = Math.max(PERIOD_START_MS, end - timeState.windowDays * DAY_MS);
    timeState.startMs = start;
    timeState.endMs = end;
  } else {
    timeState.startMs = PERIOD_START_MS;
    timeState.endMs = dayEndMs(day);
  }
}

function setTimeError(message) {
  timeState.error = message || null;
  if (dom.timeError) {
    dom.timeError.textContent = message || '';
    dom.timeError.classList.toggle('error-text', !!message);
  }
}

function activeMonthIndex() {
  if (timeState.source !== 'month') return -1;
  for (let index = 0; index < MONTH_KEYS.length; index += 1) {
    const bounds = monthBounds(index);
    if (bounds && timeState.startMs === bounds.start && timeState.endMs === bounds.end) return index;
  }
  return -1;
}

function renderMonthBar() {
  if (!dom.monthBar) return;
  const active = activeMonthIndex();
  dom.monthBar.innerHTML = monthlyCounts.map((count, index) => {
    const height = monthMaxCount > 0 && count > 0 ? Math.max(2, Math.round((count / monthMaxCount) * 34)) : 0;
    const month = MONTH_KEYS[index];
    const title = MONTH_TITLES[index] || month;
    const isActive = index === active;
    return `<button type="button" class="month-btn${isActive ? ' is-active' : ''}" data-month="${month}" data-count="${count}" ` +
      `aria-pressed="${isActive ? 'true' : 'false'}" ` +
      `title="${title}: ${count}件${isActive ? '（適用中）' : ''}" ` +
      `aria-label="${title} ${count}件${count ? '' : '（0件）'}${isActive ? ' 適用中' : ''}" ` +
      `style="--bar-height:${height}px"><span class="month-bar-count">${count}</span>` +
      `<span class="month-bar-fill"></span><span class="month-bar-label">${index + 1}</span></button>`;
  }).join('');
}

function renderTimeSummary() {
  const has = timeSummary.count > 0;
  const dash = '—';
  if (dom.summaryCount) dom.summaryCount.value = String(timeSummary.count);
  if (dom.summaryMaxMag) dom.summaryMaxMag.value = has && timeSummary.maxMagnitude !== null ? String(timeSummary.maxMagnitude) : dash;
  if (dom.summaryMinDepth) dom.summaryMinDepth.value = has && timeSummary.minDepthKm !== null ? String(timeSummary.minDepthKm) : dash;
  if (dom.summaryMaxDepth) dom.summaryMaxDepth.value = has && timeSummary.maxDepthKm !== null ? String(timeSummary.maxDepthKm) : dash;
}

function updateTimeUi() {
  const sourceLabel = timeSourceLabel();
  if (dom.timeLabel) {
    // 原本の対象期間はヘッダーに出ているので、ここは適用中の期間と種類だけを簡潔に示す（時刻データは不変）
    dom.timeLabel.value = `適用中の期間（UTC）: ${formatYmd(timeState.startMs)} 以上〜${formatYmd(timeState.endMs)} 未満（終了は含まない）／${sourceLabel}`;
  }
  if (dom.timeStart) dom.timeStart.value = formatYmd(timeState.startMs);
  if (dom.timeEnd) dom.timeEnd.value = formatYmd(timeState.endMs);
  if (dom.timeSlider) {
    dom.timeSlider.value = String(timeState.cursorDay);
    const day = Math.max(0, Math.min(DAY_COUNT - 1, timeState.cursorDay));
    dom.timeSlider.setAttribute(
      'aria-valuetext',
      `${formatYmd(dayStartMs(day))}（データ期間 ${formatYmd(PERIOD_START_MS)} 以上〜${formatYmd(PERIOD_END_MS)} 未満の ${day + 1}/${DAY_COUNT} 日目）`
    );
  }
  if (dom.timeCursor) {
    const date = new Date(dayStartMs(timeState.cursorDay));
    dom.timeCursor.textContent = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  }
  if (dom.timePlay) dom.timePlay.textContent = timeState.playing ? '一時停止' : '再生';
  if (dom.timeSpeed) dom.timeSpeed.value = String(timeState.speedDaysPerSecond);
  if (dom.timeMode) dom.timeMode.value = timeState.playMode;
  if (dom.timeWindow) dom.timeWindow.value = String(timeState.windowDays);
  renderMonthBar();
  renderTimeSummary();
}

function applyMonthRange(index) {
  const bounds = monthBounds(Math.max(0, Math.min(MONTH_KEYS.length - 1, index)));
  if (!bounds) return;
  timeState.startMs = bounds.start;
  timeState.endMs = bounds.end;
  timeState.source = 'month';
  timeState.cursorDay = Math.max(0, Math.min(DAY_COUNT - 1, Math.round((timeState.endMs - DAY_MS - PERIOD_START_MS) / DAY_MS)));
  cursorFloat = timeState.cursorDay;
  setTimeError('');
  refreshExplorer();
}

function shiftMonth(delta) {
  stopPlayback();
  applyMonthRange(currentMonthIndex() + delta);
}

function applyCustomTimeRange() {
  const startText = dom.timeStart ? dom.timeStart.value : '';
  const endText = dom.timeEnd ? dom.timeEnd.value : '';
  if (!startText || !endText) {
    setTimeError('開始日と終了日を YYYY-MM-DD で入力してください（前の適用条件を保持します）。');
    return;
  }
  const startMs = parseUtcDate(startText);
  const endMs = parseUtcDate(endText);
  if (startMs === null || endMs === null) {
    setTimeError('日付の形式が正しくありません（YYYY-MM-DD。前の適用条件を保持します）。');
    return;
  }
  const clippedStart = Math.max(startMs, PERIOD_START_MS);
  const clippedEnd = Math.min(endMs, PERIOD_END_MS);
  if (clippedStart >= clippedEnd) {
    setTimeError(`現在のデータ期間 ${formatYmd(PERIOD_START_MS)} 以上〜${formatYmd(PERIOD_END_MS)} 未満の範囲で指定してください（前の適用条件を保持します）。`);
    return;
  }
  stopPlayback();
  timeState.startMs = clippedStart;
  timeState.endMs = clippedEnd;
  timeState.source = 'custom';
  // 部分日でも末日を落とさない（1日未満でも cursor が負にならない）
  timeState.cursorDay = Math.max(0, Math.min(DAY_COUNT - 1, Math.ceil((clippedEnd - PERIOD_START_MS) / DAY_MS) - 1));
  cursorFloat = timeState.cursorDay;
  setTimeError('');
  refreshExplorer();
}

function resetTimeRange() {
  // 時間だけを初期の全期間へ戻す（地域・検索・深さ・Mは維持）
  stopPlayback();
  timeState.startMs = PERIOD_START_MS;
  timeState.endMs = PERIOD_END_MS;
  timeState.source = 'all';
  timeState.cursorDay = DAY_COUNT - 1; // 再生を押せば最初（1/1）から始まる
  cursorFloat = DAY_COUNT - 1;
  setTimeError('');
  refreshExplorer();
}

function setTimelineCursor(day, source) {
  timeState.cursorDay = Math.max(0, Math.min(DAY_COUNT - 1, Math.round(day)));
  cursorFloat = timeState.cursorDay;
  timeState.source = source || 'timeline';
  applyTimeDerivedRange();
  refreshExplorer();
}

function nowMs() {
  return typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function tickPlayback() {
  // 実経過時間で日を進める（重い描画でtimerが遅れても速度がずれない）。年末は超えない。
  const now = nowMs();
  const elapsedSeconds = Math.max(0, (now - lastTickMs) / 1000);
  lastTickMs = now;
  if (elapsedSeconds <= 0) return;
  cursorFloat = Math.min(DAY_COUNT - 1, cursorFloat + timeState.speedDaysPerSecond * elapsedSeconds);
  const day = Math.min(DAY_COUNT - 1, Math.floor(cursorFloat));
  if (day === timeState.cursorDay && cursorFloat < DAY_COUNT - 1) return; // 変化しない日は描き直さない
  timeState.cursorDay = day;
  applyTimeDerivedRange();
  refreshExplorer();
  if (day >= DAY_COUNT - 1) stopPlayback(); // データ期間の最終日で停止
}

function startPlayback() {
  if (timeState.cursorDay >= DAY_COUNT - 1) {
    // 末尾から再生したら最初の日へ戻る
    timeState.cursorDay = 0;
    cursorFloat = 0;
  }
  timeState.playing = true;
  timeState.source = 'timeline'; // 累積/N日の定義で適用中（ラベル・チップも一致させる）
  applyTimeDerivedRange();
  lastTickMs = nowMs();
  refreshExplorer();
  if (timeTimer) clearInterval(timeTimer);
  timeTimer = window.setInterval(tickPlayback, 200); // 進める量は実経過時間から計算
  updateTimeUi();
}

function stopPlayback() {
  timeState.playing = false;
  if (timeTimer) {
    clearInterval(timeTimer); // 停止・手動操作・タブ非表示でタイマーを残さない
    timeTimer = null;
  }
  setContinuousRender(false); // 停止後は要求時描画（必要な1フレームだけ）に戻す
  updateTimeUi();
}

function togglePlayback() {
  if (timeState.playing) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

// ---------------------------------------------------------------------------
// ヘルプ・データ情報・CSV出力・表示設定の保存/復元（D04）
// ---------------------------------------------------------------------------

let helpReturnFocus = null;

function focusableIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const nodes = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  return Array.prototype.filter.call(nodes, (node) => !node.hidden && !node.disabled);
}

function setHelpOpen(open) {
  if (!dom.helpPanel) return;
  const next = !!open;
  if (next) {
    setTimeDetails(false); // 他パネルと重ならないように畳む
    setDrawer('conditions', false);
    setDrawer('details', false);
    helpReturnFocus = document.activeElement || dom.helpOpen;
    if (dom.dataDetail) renderDataDetail();
    if (dom.helpCurrent) {
      const mode = dom.mode && dom.mode.value === 'hypocenter' ? '震源表示' : '地表投影';
      const scale = readDepthScale();
      dom.helpCurrent.textContent = `現在の表示: ${mode} / 深さ倍率 ${scale.toFixed(1)}倍 / 地図: ${dom.mapLayer ? dom.mapLayer.value : '-'} / 適用中の時間: ${formatYmd(timeState.startMs)} 以上〜${formatYmd(timeState.endMs)} 未満（${timeSourceLabel()}）`;
    }
  }
  dom.helpPanel.hidden = !next;
  if (dom.helpOpen) dom.helpOpen.setAttribute('aria-expanded', next ? 'true' : 'false');
  if (next) {
    const first = focusableIn(dom.helpPanel)[0];
    try {
      (first || dom.helpPanel).focus();
    } catch (error) {
      /* フォーカス不可の環境では無視 */
    }
  } else if (helpReturnFocus && typeof helpReturnFocus.focus === 'function') {
    try {
      helpReturnFocus.focus();
    } catch (error) {
      /* 同上 */
    }
    helpReturnFocus = null;
  }
}

// ヘルプ内でTab移動を閉じ込める（開いている間のTabが背後のUIへ抜けない）
function trapHelpTab(event) {
  if (!dom.helpPanel || dom.helpPanel.hidden || event.key !== 'Tab') return;
  const items = focusableIn(dom.helpPanel);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function embeddedAcquisition() {
  return window.__USGS_EMBEDDED__ || {};
}

function originalFileInfo() {
  const manifest = embeddedAcquisition().manifest;
  const requests = manifest && Array.isArray(manifest.requests) ? manifest.requests : [];
  for (const request of requests) {
    const path = String(request.path || '');
    if (path.indexOf('004-query') >= 0 || path.indexOf('geojson') >= 0) {
      return { path, sha256: request.sha256 || null, bytes: request.bytes || null, url: request.url || null };
    }
  }
  return { path: null, sha256: null, bytes: null, url: null };
}

// 内蔵版の原本情報（このHTMLに同梱したmanifest。新規取得データには流用しない）
function embeddedSourceRecords() {
  const embedded = embeddedAcquisition();
  const manifest = embedded.manifest || {};
  const acquire = embedded.acquireResult || {};
  const requests = Array.isArray(manifest.requests) ? manifest.requests : [];
  const acquiredAt = manifest.acquired_at || acquire.acquired_at || null;
  const records = [];
  for (const request of requests) {
    if (!request) continue;
    const path = String(request.path || '');
    if (request.kind && request.kind !== 'query' && path.indexOf('geojson') < 0 && path.indexOf('query') < 0) continue;
    records.push({
      url: request.url || null,
      acquiredAt: request.acquired_at || acquiredAt,
      sha256: request.sha256 || null,
      bytes: typeof request.bytes === 'number' ? request.bytes : null,
      path: path || null
    });
  }
  return records;
}

// 現在表示しているデータの原本情報だけを返す（別データの出典を混ぜない）
function currentSourceRecords() {
  if (dataManager.sourceKind === 'usgs-acquisition') {
    return Array.isArray(dataManager.sourceRecords) ? dataManager.sourceRecords : [];
  }
  if (dataManager.sourceKind === 'geojson') {
    return [{
      url: null,
      acquiredAt: null,
      sha256: DATASET.manifestSha256 || null,
      bytes: dataManager.geojsonText ? utf8ByteLength(dataManager.geojsonText) : null,
      path: null
    }];
  }
  const embedded = embeddedSourceRecords();
  if (embedded.length) return embedded;
  const file = originalFileInfo();
  return file.path || file.sha256 ? [{ url: file.url, acquiredAt: DATASET.acquiredAt, sha256: file.sha256, bytes: file.bytes, path: file.path }] : [];
}

function renderDataDetail() {
  if (!dom.dataDetail) return;
  const embedded = embeddedAcquisition();
  const acquire = embedded.acquireResult || {};
  const manifest = embedded.manifest || {};
  const mapManifest = (embedded.maps && embedded.maps.manifest) || {};
  const file = originalFileInfo();
  const kind = dataManager.sourceKind;
  const sources = currentSourceRecords();
  const rows = [
    ['アプリ版', APP_VERSION],
    ['現在のデータ', `${dataManager.label} / ${allRecords.length} 件 / 月別表示は ${MONTH_KEYS[0] || '-'}〜${MONTH_KEYS[MONTH_KEYS.length - 1] || '-'} の ${MONTH_KEYS.length} か月`],
    ['データの区分', kind === 'embedded'
      ? '内蔵の2025年保存版（このHTMLに同梱したUSGS原本のmanifest）'
      : (kind === 'geojson'
        ? 'ローカルGeoJSON（この画面で読み込んだファイル。原本の取得条件は不明）'
        : 'USGS公式APIからこの画面で取得して保持しているbundle（原本を再生成しない）')],
    ['通信について', 'USGS公式APIへ通信するのは「取得して切替」「再試行」を押した時だけです。保存済みデータの表示・読込（内蔵版・保存JSON・GeoJSON）は外部へ通信しません。'],
    ['取得日時 (UTC)', DATASET.acquiredAt || '不明（ローカルGeoJSON等）'],
    ['対象条件', kind === 'geojson'
      ? '全世界・type=earthquake を保証しません（読み込んだファイルに観測された範囲のみ。最小Mは実測値）'
      : `全世界 / type=earthquake / マグニチュード ${DATASET.minMagnitude} 以上`],
    ['対象期間 (UTC)', `${DATASET.start} 以上〜${DATASET.endExclusive} 未満（開始を含み、終了を含まない）`],
    ['識別ハッシュ (SHA-256)', DATASET.manifestSha256 || '不明'],
    ['背景地図', `NASA Earth Observatory Blue Marble Next Generation ${mapManifest.image_epoch || '-'}（${mapManifest.projection || '-'}。${mapManifest.resolution_note || '陰影画像であり標高・水深の数値ではありません'}）`],
    ['海底地形', 'GEBCO に基づく陰影（NASA画像に含まれる）'],
    ['地理検索', 'Natural Earth 1:110m admin-0 から作った国・地域の概略矩形（住所・市町村の検索はしません。国境の内側判定もしません）'],
    ['マグニチュード', 'USGSのマグニチュード（震度ではありません。このアプリは震度・予測を扱いません）'],
    ['ライセンス', 'USGS地震情報・Natural Earth: パブリックドメイン / NASA Earth Observatory: 出典表示のうえ利用可 / Three.js: MIT License（バンドルに同梱）']
  ];
  const originRows = [];
  if (kind === 'embedded') {
    originRows.push(['取得記録の状態', String(acquire.status || manifest.status || '-')]);
    originRows.push(['manifest ハッシュ', String(manifest.sha256 || DATASET.manifestSha256 || '-')]);
    originRows.push(['原本ファイル', file.path ? `${file.path} / ${file.bytes || '-'} bytes` : '-']);
  } else if (kind === 'usgs-acquisition') {
    originRows.push(['取得記録の状態', 'この画面で取得して保持しているbundle（原本を再生成しない）']);
    originRows.push(['bundle サイズ', dataManager.bundleText ? `${utf8ByteLength(dataManager.bundleText)} bytes` : '-']);
  } else {
    originRows.push(['取得記録の状態', 'ローカルGeoJSON（保存URL・取得日時の記録なし）']);
    originRows.push(['ファイル サイズ', dataManager.geojsonText ? `${utf8ByteLength(dataManager.geojsonText)} bytes` : '-']);
  }
  if (sources.length) {
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      const size = source.bytes === null || source.bytes === undefined ? 'bytes不明' : `${source.bytes} bytes`;
      originRows.push([
        `原本 ${index + 1}/${sources.length}`,
        `${source.url || 'URL記録なし'} / 取得 ${source.acquiredAt || '不明'} / sha256 ${source.sha256 || '-'} / ${size}${source.path ? ` / ${source.path}` : ''}`
      ]);
    }
  } else {
    originRows.push(['原本', 'URL記録なし（読み込んだファイルのため原本情報がありません）']);
  }
  const allRows = rows.concat(originRows);
  dom.dataDetail.innerHTML = allRows.map((pair) =>
    `<div><dt>${escapeHtml(pair[0])}</dt><dd>${escapeHtml(pair[1])}</dd></div>`).join('');
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS = ['id', 'time_utc', 'longitude', 'latitude', 'depth_km', 'magnitude', 'place', 'source_url'];

function buildCsvText() {
  const lines = [CSV_COLUMNS.join(',')];
  for (const record of matchedRecords) {
    lines.push([
      record.id,
      typeof record.time_ms === 'number' ? new Date(record.time_ms).toISOString() : '',
      record.longitude,
      record.latitude,
      record.depth_km,
      record.magnitude,
      record.place || '',
      record.source_url || ''
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

function exportCsv() {
  if (!dom.csvOutput) return;
  const text = buildCsvText();
  dom.csvOutput.value = text;
  if (dom.csvStatus) {
    // 自動コピーはしない（権限を使わない）。「コピー完了」とは表示しない。
    dom.csvStatus.textContent = `現在の条件に一致する全 ${matchedRecords.length} 件を、一覧と同じ並び順で生成しました（ページや手前半球に限定しません）。下の「全選択」を押して手動でコピーしてください。`;
  }
}

function selectCsvText() {
  if (!dom.csvOutput) return;
  dom.csvOutput.value = dom.csvOutput.value || buildCsvText();
  try {
    dom.csvOutput.focus();
    dom.csvOutput.select();
  } catch (error) {
    /* select不可の環境では無視 */
  }
  if (dom.csvStatus) {
    dom.csvStatus.textContent = 'テキストを選択しました。お使いの環境のコピー操作（Ctrl/Cmd+C または長押しの「コピー」）で取得してください。';
  }
}

function currentSettingsObject() {
  const filters = readFilters();
  return {
    schema: 1,
    appVersion: APP_VERSION,
    sourceManifestSha256: DATASET.manifestSha256,
    dataset: {
      recordCount: allRecords.length,
      period: { startInclusive: DATASET.start, endExclusive: DATASET.endExclusive }
    },
    conditions: {
      textQuery: explorer.textQuery,
      region: { id: explorer.regionId, label: explorer.regionLabel },
      bbox: explorer.bbox ? explorer.bbox.slice() : null,
      depth: { min: filters.minDepth, max: filters.maxDepth },
      magnitude: { min: filters.minMag, max: filters.maxMag },
      time: { startMs: timeState.startMs, endMs: timeState.endMs, source: timeState.source, cursorDay: timeState.cursorDay },
      sort: explorer.sort,
      selectedId: selectedRecord ? selectedRecord.id : null
    },
    view: {
      mode: dom.mode ? dom.mode.value : 'surface',
      depthScale: readDepthScale(),
      surface: dom.surface ? !!dom.surface.checked : true,
      surfaceOpacity: surfaceMaterial ? surfaceMaterial.opacity : 0.85,
      graticule: dom.graticule ? !!dom.graticule.checked : true,
      mapLayer: dom.mapLayer ? dom.mapLayer.value : DEFAULT_MAP_LAYER,
      camera: { position: camera ? [camera.position.x, camera.position.y, camera.position.z] : null }
    },
    playback: {
      playMode: timeState.playMode,
      speedDaysPerSecond: timeState.speedDaysPerSecond,
      windowDays: timeState.windowDays,
      cursorDay: timeState.cursorDay
    }
  };
}

function exportSettings() {
  if (!dom.settingsInput) return;
  dom.settingsInput.value = JSON.stringify(currentSettingsObject(), null, 2);
  if (dom.settingsError) {
    dom.settingsError.textContent = '現在の表示設定を出力しました。復元するときは、このJSONを貼り付けて「読み込む」を押してください。';
    dom.settingsError.classList.remove('error-text');
  }
}

function selectSettingsText() {
  if (!dom.settingsInput) return;
  if (!dom.settingsInput.value) exportSettings();
  try {
    dom.settingsInput.focus();
    dom.settingsInput.select();
  } catch (error) {
    /* 同上 */
  }
}

function utf8ByteLength(text) {
  const value = String(text);
  if (typeof TextEncoder === 'function') {
    try {
      return new TextEncoder().encode(value).length;
    } catch (error) {
      /* フォールバックへ */
    }
  }
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) { bytes += 4; i += 1; }
    else bytes += 3;
  }
  return bytes;
}

// month: 同一の月の1日 00:00 UTC 〜 翌月1日 00:00 UTC（12月の終了は 2026-01-01）
function isSingleMonthRange(startMs, endMs) {
  for (let index = 0; index < MONTH_KEYS.length; index += 1) {
    const bounds = monthBounds(index);
    if (bounds && bounds.start === startMs && bounds.end === endMs) return true;
  }
  return false;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return value === null || value === undefined ? null : (Number.isFinite(value) ? value : NaN);
}

function validateSettings(raw) {
  const fail = (message) => ({ ok: false, message });
  if (!isPlainObject(raw)) return fail('JSONのrootはオブジェクトにしてください。');
  if (raw.schema !== 1) return fail(`schemaが未対応です（このアプリは 1 のみ対応。受信: ${JSON.stringify(raw.schema)}）。`);
  if (typeof raw.sourceManifestSha256 !== 'string' || !raw.sourceManifestSha256) return fail('sourceManifestSha256 がありません。');
  if (DATASET.manifestSha256 && raw.sourceManifestSha256 !== DATASET.manifestSha256) {
    return fail('異なる原本（manifestハッシュが一致しません）の設定なので復元できません。同じデータセットのJSONを使ってください。');
  }
  const conditions = raw.conditions;
  const view = raw.view;
  const playback = raw.playback;
  if (!isPlainObject(conditions) || !isPlainObject(view) || !isPlainObject(playback)) return fail('conditions / view / playback が必要です。');
  if (typeof conditions.textQuery !== 'string') return fail('conditions.textQuery は文字列にしてください。');
  if (!isPlainObject(conditions.region) || typeof conditions.region.id !== 'string' || typeof conditions.region.label !== 'string') {
    return fail('conditions.region は {id, label} の文字列にしてください。');
  }
  let bbox = null;
  if (conditions.bbox !== null && conditions.bbox !== undefined) {
    if (!Array.isArray(conditions.bbox) || conditions.bbox.length !== 4 || !conditions.bbox.every((value) => Number.isFinite(value))) {
      return fail('conditions.bbox は数値4つの配列か null にしてください。');
    }
    const west = conditions.bbox[0];
    const south = conditions.bbox[1];
    const east = conditions.bbox[2];
    const north = conditions.bbox[3];
    if (west < -180 || west > 180 || east < -180 || east > 180) return fail('bbox の経度は -180〜180 にしてください。');
    if (south < -90 || south > 90 || north < -90 || north > 90) return fail('bbox の緯度は -90〜90 にしてください。');
    if (south > north) return fail('bbox は南緯度 ≦ 北緯度にしてください。');
    bbox = [west, south, east, north];
  }
  if (!isPlainObject(conditions.depth)) return fail('conditions.depth は {min, max} のオブジェクトにしてください。');
  if (!isPlainObject(conditions.magnitude)) return fail('conditions.magnitude は {min, max} のオブジェクトにしてください。');
  for (const key of ['min', 'max']) {
    if (!(key in conditions.depth)) return fail(`conditions.depth.${key} がありません（未指定は null にしてください）。`);
    if (!(key in conditions.magnitude)) return fail(`conditions.magnitude.${key} がありません（未指定は null にしてください）。`);
  }
  const depthMin = finiteOrNull(conditions.depth.min);
  const depthMax = finiteOrNull(conditions.depth.max);
  const magMin = finiteOrNull(conditions.magnitude.min);
  const magMax = finiteOrNull(conditions.magnitude.max);
  for (const value of [depthMin, depthMax, magMin, magMax]) {
    if (Number.isNaN(value)) return fail('深さ/M の値は有限の数値か null にしてください（文字列や未定義は不可）。');
  }
  for (const value of [depthMin, depthMax]) {
    if (value !== null && (value < 0 || value > 1000)) return fail('深さは 0〜1000 km の範囲にしてください。');
  }
  for (const value of [magMin, magMax]) {
    if (value !== null && (value < -2 || value > 12)) return fail('マグニチュードは -2〜12 の範囲にしてください。');
  }
  if (depthMin !== null && depthMax !== null && depthMin > depthMax) return fail('最小深さは最大深さ以下にしてください。');
  if (magMin !== null && magMax !== null && magMin > magMax) return fail('最小マグニチュードは最大マグニチュード以下にしてください。');
  const time = conditions.time;
  if (!isPlainObject(time)) return fail('conditions.time が必要です。');
  if (!Number.isInteger(time.startMs) || !Number.isInteger(time.endMs)) return fail('time.startMs / endMs は整数（UTCミリ秒）にしてください。');
  if (time.startMs < DATASET.startMs || time.endMs > DATASET.endMs || time.startMs >= time.endMs) {
    return fail(`time の期間が現在のデータ期間（${formatYmd(DATASET.startMs)}以上〜${formatYmd(DATASET.endMs)}未満）の半開区間になっていません。`);
  }
  if (TIME_SOURCES.indexOf(time.source) < 0) return fail('time.source は all / custom / month / timeline のいずれかにしてください。');
  if (time.source === 'all') {
    if (time.startMs !== PERIOD_START_MS || time.endMs !== PERIOD_END_MS) {
      return fail(`time.source が all のときは全期間（${formatYmd(PERIOD_START_MS)}以上〜${formatYmd(PERIOD_END_MS)}未満）にしてください。`);
    }
  } else if (time.source === 'month') {
    // UI の applyMonthRange と同じ「その月だけ」の1か月区間であること（累積timelineとは別）
    if (!isSingleMonthRange(time.startMs, time.endMs)) {
      return fail('time.source が month のときは「同じ月の1日 00:00 UTC 以上〜翌月1日 00:00 UTC 未満」の1か月区間にしてください。');
    }
  }
  if (SORT_VALUES.indexOf(conditions.sort) < 0) return fail('conditions.sort は time-desc / time-asc / mag-desc / depth-desc のいずれかにしてください。');
  if (conditions.selectedId !== null && conditions.selectedId !== undefined && typeof conditions.selectedId !== 'string') {
    return fail('conditions.selectedId は文字列か null にしてください。');
  }
  if (view.mode !== 'surface' && view.mode !== 'hypocenter') return fail('view.mode は surface か hypocenter にしてください。');
  const depthScale = finiteOrNull(view.depthScale);
  if (depthScale === null || Number.isNaN(depthScale) || depthScale < 1 || depthScale > 5) return fail('view.depthScale は 1〜5 にしてください。');
  if (typeof view.surface !== 'boolean' || typeof view.graticule !== 'boolean') return fail('view.surface / graticule は真偽値にしてください。');
  const opacity = finiteOrNull(view.surfaceOpacity);
  if (opacity === null || Number.isNaN(opacity) || opacity < 0 || opacity > 1) return fail('view.surfaceOpacity は 0〜1 にしてください。');
  if (MAP_LAYER_VALUES.indexOf(view.mapLayer) < 0) return fail('view.mapLayer は none / land / bathymetry のいずれかにしてください。');
  if (!isPlainObject(view.camera) || !Array.isArray(view.camera.position) || view.camera.position.length !== 3 || !view.camera.position.every((value) => Number.isFinite(value))) {
    return fail('view.camera.position は有限の数値3つの配列にしてください。');
  }
  const cameraDistance = Math.hypot(view.camera.position[0], view.camera.position[1], view.camera.position[2]);
  const minCamera = (controls && Number.isFinite(controls.minDistance)) ? controls.minDistance : 1.25;
  const maxCamera = (controls && Number.isFinite(controls.maxDistance)) ? controls.maxDistance : 8.0;
  if (!Number.isFinite(cameraDistance) || cameraDistance < minCamera || cameraDistance > maxCamera) {
    return fail(`view.camera.position は実際に操作できる距離（中心から ${minCamera}〜${maxCamera}）にしてください。`);
  }
  if (playback.playMode !== 'cumulative' && playback.playMode !== 'window') return fail('playback.playMode は cumulative / window のいずれかにしてください。');
  if ([1, 7, 30].indexOf(playback.speedDaysPerSecond) < 0) return fail('playback.speedDaysPerSecond は 1 / 7 / 30 のいずれかにしてください。');
  if ([1, 7, 30].indexOf(playback.windowDays) < 0) return fail('playback.windowDays は 1 / 7 / 30 のいずれかにしてください。');
  if (!Number.isInteger(playback.cursorDay) || playback.cursorDay < 0 || playback.cursorDay > DAY_COUNT - 1) {
    return fail('playback.cursorDay は 0〜364 の整数にしてください。');
  }
  // conditions.time と playback の重複フィールドは矛盾させない
  if ('cursorDay' in time && time.cursorDay !== playback.cursorDay) {
    return fail('conditions.time.cursorDay と playback.cursorDay が矛盾しています。');
  }
  if (time.source === 'month' && playback.cursorDay !== Math.round((time.endMs - DAY_MS - PERIOD_START_MS) / DAY_MS)) {
    return fail('time.source が month なのに cursorDay が月末と一致しません。');
  }
  if (time.source === 'timeline') {
    const dayEnd = Math.min(PERIOD_END_MS, PERIOD_START_MS + (playback.cursorDay + 1) * DAY_MS);
    if (playback.playMode === 'cumulative') {
      if (time.startMs !== PERIOD_START_MS || time.endMs !== dayEnd) {
        return fail(`再生モード cumulative の timeline は ${formatYmd(PERIOD_START_MS)}以上〜${formatYmd(dayEnd)}未満でなければなりません（指定の期間と cursorDay が矛盾しています）。`);
      }
    } else {
      const windowStart = Math.max(PERIOD_START_MS, dayEnd - playback.windowDays * DAY_MS);
      if (time.startMs !== windowStart || time.endMs !== dayEnd) {
        return fail(`再生モード window（${playback.windowDays}日）の timeline は ${formatYmd(windowStart)}以上〜${formatYmd(dayEnd)}未満でなければなりません（指定の期間と cursorDay/N日 が矛盾しています）。`);
      }
    }
  }
  if ((time.source === 'month' || time.source === 'timeline') && playback.cursorDay < 0) {
    return fail('cursorDay が不正です。');
  }
  return {
    ok: true,
    value: {
      conditions: {
        textQuery: conditions.textQuery,
        region: { id: conditions.region.id, label: conditions.region.label },
        bbox,
        depthMin,
        depthMax,
        magMin,
        magMax,
        time: { startMs: time.startMs, endMs: time.endMs, source: time.source },
        sort: conditions.sort,
        selectedId: conditions.selectedId || null
      },
      view: { mode: view.mode, depthScale, surface: view.surface, surfaceOpacity: opacity, graticule: view.graticule, mapLayer: view.mapLayer, cameraPosition: view.camera.position.slice() },
      playback: { playMode: playback.playMode, speedDaysPerSecond: playback.speedDaysPerSecond, windowDays: playback.windowDays, cursorDay: playback.cursorDay }
    }
  };
}

async function importSettings() {
  const text = dom.settingsInput ? dom.settingsInput.value : '';
  const fail = (message) => {
    if (dom.settingsError) {
      dom.settingsError.textContent = `復元できません: ${message}（適用中の状態は変更していません）`;
      dom.settingsError.classList.add('error-text');
    }
  };
  if (!text || !text.trim()) {
    fail('JSONが空です。');
    return;
  }
  const byteLength = utf8ByteLength(text);
  if (byteLength > 64 * 1024) {
    fail(`JSONが大きすぎます（UTF-8で ${byteLength} バイト。上限は 64KiB = 65536 バイトです）。`);
    return;
  }
  let raw = null;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    fail(`JSONとして読めません（${error && error.message ? error.message : 'parse error'}）。`);
    return;
  }
  const checked = validateSettings(raw);
  if (!checked.ok) {
    fail(checked.message);
    return;
  }
  const value = checked.value;

  // 検証を通った設定だけを一括で反映する（再生は停止状態で復元）
  if (timeTimer) {
    clearInterval(timeTimer);
    timeTimer = null;
  }
  timeState.playing = false;
  setContinuousRender(false);

  explorer.textQuery = value.conditions.textQuery;
  explorer.textQueryRaw = value.conditions.textQuery;
  explorer.regionId = value.conditions.region.id;
  explorer.regionLabel = value.conditions.region.label;
  explorer.regionNote = '復元した地域条件';
  explorer.bbox = value.conditions.bbox;
  explorer.sort = value.conditions.sort;
  explorer.page = 1;
  if (dom.searchInput) dom.searchInput.value = value.conditions.textQuery;
  if (dom.minDepth) dom.minDepth.value = value.conditions.depthMin === null ? '' : String(value.conditions.depthMin);
  if (dom.maxDepth) dom.maxDepth.value = value.conditions.depthMax === null ? '' : String(value.conditions.depthMax);
  if (dom.minMag) dom.minMag.value = value.conditions.magMin === null ? '' : String(value.conditions.magMin);
  if (dom.maxMag) dom.maxMag.value = value.conditions.magMax === null ? '' : String(value.conditions.magMax);
  if (dom.sortSelect) dom.sortSelect.value = value.conditions.sort;
  syncRegionSelect(value.conditions.region.id, value.conditions.region.label);

  timeState.startMs = value.conditions.time.startMs;
  timeState.endMs = value.conditions.time.endMs;
  timeState.source = TIME_SOURCES.indexOf(value.conditions.time.source) >= 0 ? value.conditions.time.source : 'custom';
  timeState.cursorDay = value.playback.cursorDay;
  cursorFloat = value.playback.cursorDay;
  timeState.speedDaysPerSecond = value.playback.speedDaysPerSecond;
  timeState.playMode = value.playback.playMode;
  timeState.windowDays = value.playback.windowDays;
  setTimeError('');

  selectedRecord = null;

  if (dom.mode) dom.mode.value = value.view.mode;
  if (dom.depthScale) dom.depthScale.value = String(value.view.depthScale);
  if (dom.surface) dom.surface.checked = value.view.surface;
  if (dom.surfaceOpacity) dom.surfaceOpacity.value = String(value.view.surfaceOpacity);
  if (dom.graticule) dom.graticule.checked = value.view.graticule;
  if (dom.mapLayer) dom.mapLayer.value = value.view.mapLayer;
  if (surfaceMesh) surfaceMesh.visible = value.view.surface;
  if (graticuleGroup) graticuleGroup.visible = value.view.graticule;
  syncDepthScaleUi();
  updateSurfaceOpacityUi();
  updateAlwaysVisibleScale();
  if (camera && controls) {
    camera.position.set(value.view.cameraPosition[0], value.view.cameraPosition[1], value.view.cameraPosition[2]);
    controls.target.set(0, 0, 0);
    controls.update();
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
  }

  refreshExplorer();
  // selectedId が null のときも、マーカー・一覧の選択・詳細を一貫して「選択なし」へ戻す
  selectRecordById(value.conditions.selectedId, {});
  rebuildRenderedPoints();
  try {
    await loadSelectedMapLayer();
  } catch (error) {
    // 地図だけの失敗は地図ステータスに表示する（他の復元は完了している）
  }
  if (dom.settingsError) {
    dom.settingsError.textContent = '表示設定を復元しました（再生は停止状態、選択はJSONどおり）。';
    dom.settingsError.classList.remove('error-text');
  }
}

// ---------------------------------------------------------------------------
// D06 データマネージャ（USGS取得・保存・読込）rc.6
// ---------------------------------------------------------------------------

const ACQUISITION_SCHEMA = 'usgs-acquisition/1';
const IMPORT_LIMIT_BYTES = 160 * 1024 * 1024; // 原本100MiB→base64約134MiBを往復できる上限
const IMPORT_LIMIT_EVENTS = 100000;
const IMPORT_LIMIT_DAYS = 3660;
const DISPLAY_TEXT_LIMIT = 8 * 1024 * 1024; // これより大きいJSONはtextareaへ入れない
const API_HOST = 'earthquake.usgs.gov';
const API_PATH_PREFIX = '/fdsnws/event/1/';
const FORBIDDEN_GEO_PARAMS = ['minlatitude', 'maxlatitude', 'minlongitude', 'maxlongitude', 'latitude', 'longitude', 'maxradiuskm', 'maxradius', 'circle', 'rectangle'];

const dataManager = {
  sourceKind: 'embedded',
  label: '内蔵 2025年保存版',
  busy: false,
  error: null,
  progress: null,
  controller: null,
  epoch: 0,
  bundleText: null,
  bundleSha256: null,
  geojsonText: null,
  sourceRecords: null,
  savedText: null,
  dirty: false,
  pendingAction: null
};

let embeddedDataset = null;
let presetSelection = null; // '24h' | '7d' | '30d' | null(手入力)

function safeEventUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, 'https://earthquake.usgs.gov/');
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'earthquake.usgs.gov' && url.hostname !== 'www.usgs.gov') return null;
    return url.href;
  } catch (error) {
    return null;
  }
}

function utf8DecodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256HexBytes(bytes) {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
    throw new Error('SHA-256（WebCrypto）が使えないため原本を検証できません。');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function sha256HexText(text) {
  return sha256HexBytes(new TextEncoder().encode(String(text)));
}

function setDataError(message) {
  dataManager.error = message || null;
  if (dom.dataError) {
    dom.dataError.textContent = message || '';
    dom.dataError.classList.toggle('error-text', !!message);
  }
}

function setDataStatus(message) {
  if (dom.dataStatus) dom.dataStatus.textContent = message || '';
}

function updateDatasetInfo() {
  dataManager.dirty = dataManager.sourceKind === 'usgs-acquisition' && !!dataManager.bundleText && !dataManager.savedText;
  const kindText = dataManager.sourceKind === 'embedded'
    ? '内蔵の保存版（取得不要）'
    : (dataManager.sourceKind === 'geojson' ? 'ローカルGeoJSON・取得日時不明' : 'USGSから取得したデータ（原本bundleを保持）');
  if (dom.datasetSummary) {
    dom.datasetSummary.innerHTML = [
      `<div><span>データ</span><b>${escapeHtml(dataManager.label)}</b></div>`,
      `<div><span>期間 (UTC)</span><b>${escapeHtml(formatIsoUtc(PERIOD_START_MS))} 以上〜${escapeHtml(formatIsoUtc(PERIOD_END_MS))} 未満</b></div>`,
      `<div><span>取得日時 (UTC)</span><b>${escapeHtml(DATASET.acquiredAt || '不明（ローカルGeoJSON等）')}</b></div>`,
      `<div><span>件数 / 最小M</span><b>${allRecords.length} 件（除外 ${excludedRecords.length} / 描画不可 ${unplottableIds.length}） / M${DATASET.minMagnitude} 以上</b></div>`
    ].join('');
  }
  const rows = [
    ['データ', dataManager.label],
    ['出典の状態', kindText],
    ['期間 (UTC)', `${formatIsoUtc(PERIOD_START_MS)} 以上〜${formatIsoUtc(PERIOD_END_MS)} 未満`],
    ['日数', `${DAY_COUNT}日（最終日は部分日を含む）`],
    ['取得日時 (UTC)', DATASET.acquiredAt || '不明（ローカルGeoJSON等）'],
    ['最小マグニチュード', `M${DATASET.minMagnitude} 以上`],
    ['件数', `${allRecords.length} 件 / 除外 ${excludedRecords.length} 件 / 描画不可 ${unplottableIds.length} 件`],
    ['識別ハッシュ (SHA-256)', DATASET.manifestSha256 || '不明']
  ];
  if (dom.datasetInfo) {
    dom.datasetInfo.innerHTML = rows.map((pair) =>
      `<div><dt>${escapeHtml(pair[0])}</dt><dd>${escapeHtml(pair[1])}</dd></div>`).join('');
  }
  if (dom.datasetCaption) {
    dom.datasetCaption.textContent = dataManager.sourceKind === 'geojson'
      ? `ローカルGeoJSON（取得日時不明） / 観測された期間 / M${DATASET.minMagnitude}以上 / UTC`
      : `USGS公式カタログ${dataManager.sourceKind === 'embedded' ? '（内蔵 2025年版）' : ''} / 全世界 / M${DATASET.minMagnitude}以上 / UTC`;
  }
  if (dom.datasetStatus) {
    dom.datasetStatus.textContent = dataManager.busy
      ? '取得中…（終わるまで現在のデータを表示したままにします）'
      : (dataManager.sourceKind === 'embedded' ? '内蔵データを使用中' : '読み込んだデータを使用中');
  }
  if (dom.dataPresetHint && !presetSelection) {
    dom.dataPresetHint.textContent = `現在のデータ期間: ${formatIsoUtc(PERIOD_START_MS)} 以上〜${formatIsoUtc(PERIOD_END_MS)} 未満 / M${DATASET.minMagnitude} 以上`;
  }
  if (dom.dataStatus && dataManager.dirty && !dataManager.error && !dataManager.pendingAction) {
    setDataStatus('未保存の取得データがあります（「データを保存」で取り出せます）。');
  }
  if (dom.timeSlider) {
    dom.timeSlider.min = '0';
    dom.timeSlider.max = String(DAY_COUNT - 1);
  }
  if (dom.timeStart) {
    dom.timeStart.min = formatYmd(PERIOD_START_MS);
    dom.timeStart.max = formatYmd(PERIOD_END_MS - 1);
  }
  if (dom.timeEnd) {
    dom.timeEnd.min = formatYmd(PERIOD_START_MS);
    dom.timeEnd.max = formatYmd(PERIOD_END_MS);
  }
}

// 型・有限性のみ検証する（範囲外座標などは unplottable として扱い、全体は拒否しない）
function validateRecords(records) {
  if (!Array.isArray(records)) return 'レコード配列がありません。';
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!isPlainObject(record)) return `${i}件目のレコードがオブジェクトではありません。`;
    if (typeof record.id !== 'string' || !record.id) return `${i}件目の id がありません。`;
    if (!Number.isFinite(record.time_ms)) return `id=${record.id} の time_ms が数値ではありません。`;
    for (const key of ['longitude', 'latitude', 'depth_km', 'magnitude']) {
      const value = record[key];
      if (value === null || value === undefined) continue;
      if (typeof value !== 'number' || Number.isNaN(value)) return `id=${record.id} の ${key} が数値ではありません。`;
    }
    if (!(record.place === null || record.place === undefined || typeof record.place === 'string')) return `id=${record.id} の place が文字列ではありません。`;
    if (!(record.source_url === null || record.source_url === undefined || typeof record.source_url === 'string')) return `id=${record.id} の source_url が文字列ではありません。`;
  }
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.id)) return `IDが重複しています（${record.id}）。`;
    seen.add(record.id);
  }
  return null;
}

function applyDataset(records, meta) {
  const problem = validateRecords(records);
  if (problem) throw new Error(problem);
  const startMs = Math.trunc(meta.startMs);
  const endMs = Math.trunc(meta.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) throw new Error('データセットの期間が不正です。');
  if ((endMs - startMs) / 86400000 > IMPORT_LIMIT_DAYS) throw new Error(`期間が長すぎます（上限 ${IMPORT_LIMIT_DAYS} 日）。`);
  if (records.length > IMPORT_LIMIT_EVENTS) throw new Error(`件数が多すぎます（上限 ${IMPORT_LIMIT_EVENTS} 件）。`);

  stopPlayback();
  DATASET.startMs = startMs;
  DATASET.endMs = endMs;
  DATASET.start = formatIsoUtc(startMs);
  DATASET.endExclusive = formatIsoUtc(endMs);
  DATASET.minMagnitude = Number.isFinite(meta.minMagnitude) ? meta.minMagnitude : DATASET.minMagnitude;
  DATASET.acquiredAt = meta.acquiredAt || null;
  DATASET.manifestSha256 = meta.manifestSha256 || null;
  PERIOD_START_MS = startMs;
  PERIOD_END_MS = endMs;
  rebuildCalendar();

  allRecords = records;
  excludedRecords = Array.isArray(meta.excluded) ? meta.excluded : [];
  unplottableIds = allRecords.filter((record) => !isPlottable(record)).map((record) => record.id);
  rawFeatureCount = Number.isFinite(meta.rawFeatureCount) ? meta.rawFeatureCount : records.length + excludedRecords.length;
  countQueryValue = Number.isFinite(meta.countValue) ? meta.countValue : null;

  dataManager.sourceKind = meta.sourceKind;
  dataManager.label = meta.label;
  dataManager.bundleText = meta.bundleText || null;
  dataManager.bundleSha256 = meta.bundleSha256 || null;
  dataManager.geojsonText = meta.geojsonText || null;
  dataManager.sourceRecords = Array.isArray(meta.sourceRecords) ? meta.sourceRecords : null;

  selectedRecord = null;
  explorer.textQuery = '';
  explorer.textQueryRaw = '';
  explorer.regionId = 'all';
  explorer.regionLabel = 'すべての地域';
  explorer.bbox = null;
  explorer.page = 1;
  if (dom.searchInput) dom.searchInput.value = '';
  if (dom.minDepth) dom.minDepth.value = '';
  if (dom.maxDepth) dom.maxDepth.value = '';
  if (dom.minMag) dom.minMag.value = '';
  if (dom.maxMag) dom.maxMag.value = '';
  syncRegionSelect('all', 'すべての地域');
  timeState.startMs = PERIOD_START_MS;
  timeState.endMs = PERIOD_END_MS;
  timeState.source = 'all';
  timeState.cursorDay = DAY_COUNT - 1;
  cursorFloat = DAY_COUNT - 1;
  timeState.playing = false;
  timeState.error = null;
  setTimeError('');

  if (dom.period) dom.period.value = `${DATASET.start} 以上〜${DATASET.endExclusive} 未満`;
  if (dom.acquiredAt) dom.acquiredAt.value = DATASET.acquiredAt || '-';
  if (dom.rawCount) dom.rawCount.value = String(rawFeatureCount);
  if (dom.queryCount) dom.queryCount.value = countQueryValue === null ? '-' : String(countQueryValue);
  if (dom.targetCount) dom.targetCount.value = String(allRecords.length);
  if (dom.excludedCount) dom.excludedCount.value = String(excludedRecords.length);
  if (dom.unplottableCount) dom.unplottableCount.value = String(unplottableIds.length);

  refreshExplorer();
  selectRecordById(null, {});
  rebuildRenderedPoints();
  renderMonthBar();
  updateDatasetInfo();
}

// --- 原本bundleの検証（入力bundleは一切変更しない。すべて通ってから一括適用） ----
const COUNT_PARAMS = ['starttime', 'endtime', 'minmagnitude', 'eventtype'];
const QUERY_PARAMS = COUNT_PARAMS.concat(['format', 'orderby', 'limit']);

function parseIsoMs(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function readRequestUrl(request) {
  let url = null;
  try {
    url = new URL(String(request.url || ''));
  } catch (error) {
    return { error: 'URLとして読めません。' };
  }
  const map = new Map();
  for (const pair of url.searchParams) {
    if (map.has(pair[0])) return { error: `URLパラメータ ${pair[0]} が重複しています。` };
    map.set(pair[0], pair[1]);
  }
  return { url, map };
}

async function validateBundle(bundle) {
  if (!isPlainObject(bundle)) return { error: 'bundleがオブジェクトではありません。' };
  if (bundle.schema !== ACQUISITION_SCHEMA) return { error: `未知のschemaです（${JSON.stringify(bundle.schema)}）。` };
  const criteria = bundle.criteria;
  if (!isPlainObject(criteria)) return { error: 'criteriaがありません。' };
  const critStart = parseIsoMs(criteria.startInclusive);
  const critEnd = parseIsoMs(criteria.endExclusive);
  if (critStart === null || critEnd === null) return { error: 'criteriaの期間がISO8601として読めません。' };
  if (critStart >= critEnd) return { error: 'criteriaの期間が不正です（開始≧終了）。' };
  if ((critEnd - critStart) / 86400000 > IMPORT_LIMIT_DAYS) return { error: `criteriaの期間が長すぎます（上限 ${IMPORT_LIMIT_DAYS} 日）。` };
  if (!Number.isFinite(criteria.minMagnitude) || criteria.minMagnitude < -2 || criteria.minMagnitude > 10) return { error: 'criteriaの最小マグニチュードが -2〜10 ではありません。' };
  if (criteria.eventType !== 'earthquake') return { error: 'criteriaのeventTypeがearthquakeではありません。' };
  if (!Array.isArray(bundle.requests) || !bundle.requests.length) return { error: 'requestsがありません。' };
  if (!Array.isArray(bundle.partitions) || !bundle.partitions.length) return { error: 'partitionsがありません。' };
  const startedAt = parseIsoMs(bundle.startedAt);
  const acquiredAt = parseIsoMs(bundle.acquiredAt);
  if (startedAt === null || acquiredAt === null) return { error: 'startedAt / acquiredAt がISO8601として読めません。' };
  if (startedAt > acquiredAt) return { error: 'startedAt が acquiredAt より後になっています。' };
  if (!Number.isInteger(bundle.totalCount) || bundle.totalCount < 0) return { error: 'totalCount が0以上の整数ではありません。' };

  const requestBytes = new Array(bundle.requests.length).fill(null);
  const queryUse = new Array(bundle.requests.length).fill(0);

  // 1) requests: URL/パラメータのallowlist、bytes、SHA-256（原本バイト列の照合）
  for (let index = 0; index < bundle.requests.length; index += 1) {
    const request = bundle.requests[index];
    if (!isPlainObject(request)) return { error: `${index}番目のrequestがオブジェクトではありません。` };
    if (request.kind !== 'count' && request.kind !== 'query') return { error: `${index}番目のrequest.kind が不正です（${request.kind}）。` };
    if (request.status !== 200) return { error: `${index}番目のrequestのHTTP statusが200ではありません（${request.status}）。` };
    const requestAt = parseIsoMs(request.acquiredAt);
    if (requestAt === null) return { error: `${index}番目のrequestの取得日時が不正です。` };
    if (requestAt < startedAt || requestAt > acquiredAt) return { error: `${index}番目のrequestの取得日時が startedAt〜acquiredAt の外です。` };
    if (typeof request.bodyBase64 !== 'string') return { error: `${index}番目のrequestにbodyBase64がありません。` };
    if (!Number.isInteger(request.bytes) || request.bytes < 0) return { error: `${index}番目のrequest.bytes が0以上の整数ではありません。` };
    if (typeof request.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(request.sha256.toLowerCase())) return { error: `${index}番目のrequest.sha256 が16進64桁ではありません。` };
    const read = readRequestUrl(request);
    if (read.error) return { error: `${index}番目のrequestのURL: ${read.error}` };
    const url = read.url;
    const map = read.map;
    if (url.protocol !== 'https:') return { error: `${index}番目のrequestのprotocolがhttpsではありません。` };
    if (url.hostname !== API_HOST) return { error: `${index}番目のrequestのhostがUSGS公式APIではありません。` };
    if (url.port !== '') return { error: `${index}番目のrequestにポート指定があります。` };
    if (url.username !== '' || url.password !== '') return { error: `${index}番目のrequestのURLに資格情報があります。` };
    if (url.hash !== '') return { error: `${index}番目のrequestのURLにfragmentがあります。` };
    const expectedPath = `${API_PATH_PREFIX}${request.kind}`;
    if (url.pathname !== expectedPath) return { error: `${index}番目のrequestのURL pathがkindと一致しません（${url.pathname}）。` };
    const allowed = request.kind === 'count' ? COUNT_PARAMS : QUERY_PARAMS;
    for (const [name] of map) {
      if (allowed.indexOf(name) < 0) return { error: `${index}番目のrequestに許可されていないパラメータ（${name}）があります。` };
    }
    for (const name of COUNT_PARAMS) {
      if (!map.has(name)) return { error: `${index}番目のrequestに ${name} がありません。` };
    }
    const startMs = parseIsoMs(map.get('starttime'));
    const endMs = parseIsoMs(map.get('endtime'));
    if (startMs === null || endMs === null) return { error: `${index}番目のrequestのstarttime/endtimeがISO8601として読めません。` };
    if (map.get('eventtype') !== 'earthquake') return { error: `${index}番目のrequestのeventtypeがearthquakeではありません。` };
    const paramMag = Number(map.get('minmagnitude'));
    if (!Number.isFinite(paramMag) || paramMag !== criteria.minMagnitude) return { error: `${index}番目のrequestのminmagnitudeがcriteriaと一致しません。` };
    if (request.kind === 'query') {
      if (map.get('format') !== 'geojson') return { error: `${index}番目のqueryにformat=geojsonがありません。` };
      if (!map.has('limit')) return { error: `${index}番目のqueryにlimitがありません。` };
      if (!/^\d+$/.test(String(map.get('limit'))) || Number(map.get('limit')) !== 20000) return { error: `${index}番目のqueryのlimitが20000ではありません。` };
    }
    let bytes = null;
    try {
      bytes = base64ToBytes(request.bodyBase64);
    } catch (error) {
      return { error: `${index}番目のrequestのbodyBase64を復号できません。` };
    }
    if (request.bytes !== bytes.length) return { error: `${index}番目のrequestのバイト数が一致しません（宣言 ${request.bytes} / 実際 ${bytes.length}）。` };
    let sha = null;
    try {
      sha = await sha256HexBytes(bytes);
    } catch (error) {
      return { error: error.message };
    }
    if (request.sha256.toLowerCase() !== sha) return { error: `${index}番目のrequestのSHA-256が一致しません（改変された可能性があります）。` };
    if (startMs >= endMs) return { error: `${index}番目のrequestの期間が不正です。` };
    requestBytes[index] = bytes;
  }

  // 2) partitions: 昇順・連続・重複なし・criteriaの完全被覆・前後countとfeatures件数の一致
  const total = [];
  let cursor = critStart;
  let declaredTotal = 0;
  for (let index = 0; index < bundle.partitions.length; index += 1) {
    const partition = bundle.partitions[index];
    if (!isPlainObject(partition)) return { error: `${index}番目のpartitionがオブジェクトではありません。` };
    const start = parseIsoMs(partition.startInclusive);
    const end = parseIsoMs(partition.endExclusive);
    if (start === null || end === null || start >= end) return { error: `${index}番目のpartitionの期間が不正です。` };
    if (start !== cursor) return { error: `${index}番目のpartitionが前の区間と連続していません（重複または欠落）。` };
    cursor = end;
    if (!Number.isInteger(partition.count) || partition.count < 0) return { error: `${index}番目のpartition.countが0以上の整数ではありません。` };
    if (partition.count > 20000) return { error: `${index}番目のpartition.countが上限20000を超えています。` };
    for (const key of ['before', 'query', 'after']) {
      if (!Number.isInteger(partition[key]) || partition[key] < 0 || partition[key] >= bundle.requests.length) {
        return { error: `${index}番目のpartition.${key} のrequest参照が不正です。` };
      }
    }
    if (new Set([partition.before, partition.query, partition.after]).size !== 3) {
      return { error: `${index}番目のpartitionのbefore/query/afterが同じrequestを指しています。` };
    }
    const queryRequest = bundle.requests[partition.query];
    const beforeRequest = bundle.requests[partition.before];
    const afterRequest = bundle.requests[partition.after];
    if (queryRequest.kind !== 'query') return { error: `${index}番目のpartition.query がqueryリクエストを指していません。` };
    if (beforeRequest.kind !== 'count' || afterRequest.kind !== 'count') return { error: `${index}番目のpartitionのbefore/afterがcountリクエストを指していません。` };
    queryUse[partition.query] += 1;
    for (const request of [queryRequest, beforeRequest, afterRequest]) {
      const read = readRequestUrl(request);
      if (read.error) return { error: `${index}番目のpartitionのrequest URL: ${read.error}` };
      const requestStart = parseIsoMs(read.map.get('starttime'));
      const requestEnd = parseIsoMs(read.map.get('endtime'));
      if (requestStart !== start || requestEnd !== end - 1) {
        return { error: `${index}番目のpartitionの窓とリクエストURLのstarttime/endtimeが一致しません（endtimeは end-1ms=${formatIsoUtc(end - 1)}）。` };
      }
    }
    // count本文は厳密な10進整数（'61xxx' を 61 と解釈しない）
    const beforeBody = utf8DecodeBase64(beforeRequest.bodyBase64).trim();
    const afterBody = utf8DecodeBase64(afterRequest.bodyBase64).trim();
    if (!/^\d+$/.test(beforeBody) || !/^\d+$/.test(afterBody)) return { error: `${index}番目の前後count本文が10進整数ではありません。` };
    const beforeCount = Number(beforeBody);
    const afterCount = Number(afterBody);
    let geo = null;
    try {
      geo = JSON.parse(utf8DecodeBase64(queryRequest.bodyBase64));
    } catch (error) {
      return { error: `${index}番目のquery応答をJSONとして読めません。` };
    }
    if (!isPlainObject(geo) || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
      return { error: `${index}番目のquery応答がGeoJSONのFeatureCollectionではありません。` };
    }
    const features = geo.features;
    if (features.length > 20000) return { error: `${index}番目のfeatures件数が上限20000を超えています。` };
    if (features.length !== partition.count) return { error: `${index}番目の件数が一致しません（partition ${partition.count} / features ${features.length}）。` };
    if (beforeCount !== features.length || afterCount !== features.length) {
      return { error: `${index}番目の前後countとfeatures件数が一致しません（before ${beforeCount} / features ${features.length} / after ${afterCount}）。` };
    }
    const meta = isPlainObject(geo.metadata) ? geo.metadata : {};
    if ('count' in meta) {
      if (!Number.isInteger(meta.count) || meta.count !== features.length) return { error: `${index}番目のmetadata.countがfeatures件数と一致しません。` };
    }
    const ids = [];
    for (const feature of features) {
      if (!isPlainObject(feature)) return { error: `${index}番目に不正なfeatureがあります。` };
      if (typeof feature.id !== 'string' || !feature.id) return { error: `${index}番目にidの無い（または文字列でない）イベントがあります。` };
      const properties = isPlainObject(feature.properties) ? feature.properties : {};
      const time = Number(properties.time);
      if (!Number.isFinite(time)) return { error: `${index}番目の ${feature.id} に有効な時刻がありません。` };
      if (time < start || time >= end) return { error: `${index}番目の ${feature.id} の時刻がpartitionの範囲外です。` };
      const mag = Number(properties.mag);
      if (!Number.isFinite(mag) || mag < criteria.minMagnitude) return { error: `${index}番目の ${feature.id} のマグニチュードがcriteriaの条件外です。` };
      ids.push(feature.id);
    }
    declaredTotal += partition.count;
    total.push(...features);
  }
  if (cursor !== critEnd) return { error: 'partitionsがcriteriaの期間全体を覆っていません。' };
  if (declaredTotal !== bundle.totalCount) return { error: `totalCountが一致しません（宣言 ${bundle.totalCount} / 合計 ${declaredTotal}）。` };
  const queryIndexes = [];
  for (let index = 0; index < bundle.requests.length; index += 1) {
    if (bundle.requests[index].kind === 'query') queryIndexes.push(index);
  }
  if (queryIndexes.length !== bundle.partitions.length) {
    return { error: `query応答の数（${queryIndexes.length}）がpartitions（${bundle.partitions.length}）と一致しません（不要な/欠けた応答）。` };
  }
  for (const index of queryIndexes) {
    if (queryUse[index] !== 1) return { error: `query応答（${index}番目）がpartitionから1回だけ参照されていません。` };
  }
  if (total.length > IMPORT_LIMIT_EVENTS) return { error: `イベント数が上限（${IMPORT_LIMIT_EVENTS} 件）を超えています。` };
  const seen = new Set();
  for (const feature of total) {
    if (seen.has(feature.id)) return { error: `イベントIDが重複しています（${feature.id}）。` };
    seen.add(feature.id);
  }
  return { bundle, features: total, critStart, critEnd, requestBytes };
}

function planFromBundle(checked, canonicalText, sha, label) {
  const previous = { startMs: DATASET.startMs, endMs: DATASET.endMs, minMagnitude: DATASET.minMagnitude };
  DATASET.startMs = checked.critStart;
  DATASET.endMs = checked.critEnd;
  DATASET.minMagnitude = checked.bundle.criteria.minMagnitude;
  let processed = null;
  try {
    processed = processRawFeatures(checked.features);
  } finally {
    DATASET.startMs = previous.startMs;
    DATASET.endMs = previous.endMs;
    DATASET.minMagnitude = previous.minMagnitude;
  }
  if (processed.excluded.length) {
    throw new Error(`応答に条件外のイベントが含まれています（除外 ${processed.excluded.length} 件）。原本を再生成しないため取り込みません。`);
  }
  const sourceRecords = [];
  for (const partition of checked.bundle.partitions) {
    const request = checked.bundle.requests[partition.query];
    sourceRecords.push({
      url: request.url,
      acquiredAt: request.acquiredAt || null,
      sha256: request.sha256 || null,
      bytes: typeof request.bytes === 'number' ? request.bytes : null,
      path: null
    });
  }
  return {
    sourceRecords,
    records: processed.records,
    excluded: processed.excluded,
    startMs: checked.critStart,
    endMs: checked.critEnd,
    minMagnitude: checked.bundle.criteria.minMagnitude,
    acquiredAt: checked.bundle.acquiredAt || checked.bundle.startedAt || null,
    manifestSha256: sha,
    rawFeatureCount: checked.features.length,
    countValue: Number.isFinite(checked.bundle.totalCount) ? checked.bundle.totalCount : checked.features.length,
    label: label || 'USGS取得データ',
    sourceKind: 'usgs-acquisition'
  };
}

function planFromGeojson(parsed, canonicalText, sha) {
  const features = parsed.features;
  const times = [];
  const mags = [];
  for (const feature of features) {
    const properties = (feature && feature.properties) || {};
    const time = Number.parseFloat(String(properties.time));
    if (Number.isFinite(time)) times.push(time);
    const mag = Number.parseFloat(String(properties.mag));
    if (Number.isFinite(mag)) mags.push(mag);
  }
  if (!times.length) throw new Error('GeoJSONに有効な時刻（properties.time）がありません。');
  if (!mags.length) throw new Error('GeoJSONに有効なマグニチュード（properties.mag）がありません。');
  const startMs = Math.min.apply(null, times);
  const endMs = Math.max.apply(null, times) + 1;
  const minMagnitude = Math.min.apply(null, mags); // 観測された最小M（負のMも落とさない）
  const previous = { startMs: DATASET.startMs, endMs: DATASET.endMs, minMagnitude: DATASET.minMagnitude };
  DATASET.startMs = startMs;
  DATASET.endMs = endMs;
  DATASET.minMagnitude = minMagnitude;
  let processed = null;
  try {
    processed = processRawFeatures(features);
  } finally {
    DATASET.startMs = previous.startMs;
    DATASET.endMs = previous.endMs;
    DATASET.minMagnitude = previous.minMagnitude;
  }
  return {
    records: processed.records,
    excluded: processed.excluded,
    startMs,
    endMs,
    minMagnitude,
    acquiredAt: null,
    manifestSha256: sha,
    rawFeatureCount: features.length,
    countValue: null,
    label: 'ローカルGeoJSON・取得日時不明',
    sourceKind: 'geojson'
  };
}

// 未保存データがあるときのカスタム確認（sandboxではwindow.confirmを使えない）
function requestDataSwitch(label, action) {
  if (!dataManager.dirty) return false; // 委譲しない（呼び出し側は自分の処理を続ける）
  dataManager.pendingAction = action;
  if (dom.dataSwitchNote) {
    dom.dataSwitchNote.hidden = false;
    if (dom.dataSwitchText) dom.dataSwitchText.textContent = `未保存の取得データがあります。${label}へ切り替えますか？（先に保存用JSONを表示できます）`;
  }
  if (dom.dataStatus) setDataStatus('未保存の取得データがあります。保存用JSONを表示してから切り替えるか、このまま切り替えてください。');
  return true;
}

function resolveDataSwitch(proceed) {
  const action = dataManager.pendingAction;
  dataManager.pendingAction = null;
  if (dom.dataSwitchNote) dom.dataSwitchNote.hidden = true;
  if (proceed && typeof action === 'function') action();
  else if (!proceed) setDataStatus('切り替えを中止しました。現在のデータをそのまま使います。');
}

// --- 取得（ユーザーが押した時だけ。二重取得・古い応答を排除） ----------------
function presetDays(kind) {
  return kind === '24h' ? 1 : (kind === '7d' ? 7 : 30);
}

function readLocalDateTime(input) {
  const value = input ? String(input.value || '').trim() : '';
  if (!value) return NaN;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) return NaN;
  let iso = value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) iso += ':00';
  return Date.parse(`${iso}Z`);
}

function readAcquisitionInputs() {
  const minMagRaw = dom.dataMinMag ? String(dom.dataMinMag.value).trim() : '';
  if (!minMagRaw) return { error: '最小マグニチュードを入力してください（空欄は0とみなしません）。' };
  const minMagnitude = Number(minMagRaw);
  if (!Number.isFinite(minMagnitude)) return { error: '最小マグニチュードは数値で入力してください。' };
  if (minMagnitude < -2 || minMagnitude > 10) return { error: '最小マグニチュードは -2〜10 にしてください（取得道具の制限と同じ）。' };
  if (presetSelection) {
    const endMs = Date.now(); // 取得を押した瞬間に一度だけ固定
    return { startMs: endMs - presetDays(presetSelection) * DAY_MS, endMs, minMagnitude };
  }
  const startMs = readLocalDateTime(dom.dataStart);
  const endMs = readLocalDateTime(dom.dataEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { error: '開始と終了の日時（UTC）を入力してください（終了は含みません）。' };
  if (startMs >= endMs) return { error: '開始は終了より前にしてください（終了は含まない半開区間）。' };
  return { startMs, endMs, minMagnitude };
}

function updateProgressUi(progress) {
  dataManager.progress = progress || null;
  if (!dom.dataProgress) return;
  if (!progress) {
    dom.dataProgress.textContent = '';
    return;
  }
  const parts = [`段階: ${progress.phase || '-'}`];
  if (Number.isFinite(progress.requests)) parts.push(`リクエスト ${progress.requests}`);
  if (Number.isFinite(progress.bytes)) parts.push(`${Math.round(progress.bytes / 1024)} KiB`);
  if (Number.isFinite(progress.events)) parts.push(`${progress.events} 件`);
  dom.dataProgress.textContent = parts.join(' / ');
}

function setDataBusy(busy) {
  dataManager.busy = !!busy;
  if (dom.dataAcquire) dom.dataAcquire.disabled = dataManager.busy;
  if (dom.dataCancel) dom.dataCancel.disabled = !dataManager.busy;
  if (dom.dataRevert) dom.dataRevert.disabled = dataManager.busy;
  if (dom.dataImport) dom.dataImport.disabled = dataManager.busy;
  if (dom.dataImportFile) dom.dataImportFile.disabled = dataManager.busy;
  if (dom.dataGeojsonFile) dom.dataGeojsonFile.disabled = dataManager.busy;
  if (dom.datasetStatus) {
    dom.datasetStatus.textContent = dataManager.busy
      ? '取得中…（終わるまで現在のデータを表示したままにします）'
      : (dataManager.sourceKind === 'embedded' ? '内蔵データを使用中' : '読み込んだデータを使用中');
  }
}

async function acquireData(force) {
  if (dataManager.busy) return;
  if (!force && requestDataSwitch('新しいUSGS取得', () => { void acquireData(true); })) {
    return; // 確認UIへ委譲した。true側の1回だけが走る
  }
  const inputs = readAcquisitionInputs();
  if (inputs.error) {
    setDataError(inputs.error);
    return;
  }
  if (!window.USGSAcquire || typeof window.USGSAcquire.acquire !== 'function') {
    setDataError('取得道具（USGSAcquire）がこのHTMLに組み込まれていません。');
    return;
  }
  setDataError('');
  setDataBusy(true);
  updateProgressUi({ phase: 'starting', requests: 0, bytes: 0, events: 0 });
  const epoch = ++dataManager.epoch;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  dataManager.controller = controller;
  try {
    const result = await window.USGSAcquire.acquire({
      startMs: inputs.startMs,
      endMs: inputs.endMs,
      minMagnitude: inputs.minMagnitude,
      signal: controller ? controller.signal : undefined,
      onProgress: (progress) => { if (epoch === dataManager.epoch) updateProgressUi(progress); }
    });
    if (epoch !== dataManager.epoch) return; // 中止・別操作後の古い応答は適用しない
    const canonical = JSON.stringify(result);
    const checked = await validateBundle(result);
    if (checked.error) throw new Error(`取得bundleの検証に失敗しました: ${checked.error}`);
    const sha = await sha256HexText(canonical);
    const plan = planFromBundle(checked, canonical, sha, `USGS取得 ${formatYmd(inputs.startMs)}〜${formatYmd(inputs.endMs)}`);
    if (epoch !== dataManager.epoch) return;
    // すべての検証が終わってから一括commit
    applyDataset(plan.records, { ...plan, bundleText: canonical, bundleSha256: sha, geojsonText: null });
    setDataError('');
    setDataStatus(`取得して切替しました: ${plan.records.length} 件（${formatIsoUtc(plan.startMs)} 以上〜${formatIsoUtc(plan.endMs)} 未満）。「データを保存」で原本bundleを取り出せます。`);
  } catch (error) {
    if (epoch !== dataManager.epoch) return;
    const aborted = error && (error.name === 'AbortError' || error.code === 'aborted');
    setDataError(aborted
      ? '取得を中止しました。現在のデータは変更していません。'
      : `取得に失敗しました（現在のデータは変更していません）: ${error && error.message ? error.message : String(error)}`);
    setDataStatus('取得できませんでした。再試行できます。');
  } finally {
    if (epoch === dataManager.epoch) {
      dataManager.controller = null;
      setDataBusy(false);
      updateProgressUi(null);
    }
  }
}

function cancelAcquisition() {
  dataManager.epoch += 1; // 以後の応答は無効
  if (dataManager.controller) {
    try {
      dataManager.controller.abort();
    } catch (error) {
      /* 中止できない環境では無視 */
    }
  }
  dataManager.controller = null;
  setDataBusy(false);
  updateProgressUi(null);
  setDataStatus('取得を中止しました。現在のデータは変更していません。');
}

function revertToEmbedded(force) {
  if (!embeddedDataset) return;
  if (!force && requestDataSwitch('内蔵の2025年保存版', () => revertToEmbedded(true))) {
    return;
  }
  dataManager.epoch += 1;
  applyDataset(embeddedDataset.records, { ...embeddedDataset.meta, bundleText: null, bundleSha256: null, geojsonText: null });
  setDataError('');
  setDataStatus('内蔵の2025年保存版に戻しました（再取得は不要です）。');
}

// --- 保存（原本をそのまま。単独HTMLはblob、DSHはテキストをコピー） ---------
function datasetSaveText() {
  if (dataManager.bundleText) return dataManager.bundleText;   // 取得bundle（canonical JSON）
  if (dataManager.geojsonText) return dataManager.geojsonText; // 読み込んだ元GeoJSONそのまま
  return null;
}

async function saveDataset() {
  const text = datasetSaveText();
  if (!text) {
    setDataStatus('内蔵の2025年保存版はこのHTMLに同梱済みです（保存は不要。必要な場合は新しい期間を取得して保存できます）。');
    return;
  }
  const bytes = utf8ByteLength(text);
  const tooBig = bytes > DISPLAY_TEXT_LIMIT;
  if (dom.dataSaveText) {
    dom.dataSaveText.value = tooBig ? '' : text;
  }
  if (dom.dataReveal) {
    dom.dataReveal.hidden = !tooBig; // 大きい時だけ「大きなJSONを表示」を出す
    dom.dataReveal.dataset.pending = tooBig ? '1' : '';
  }
  let attempted = false;
  try {
    if (typeof Blob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quake-dataset-${formatYmd(PERIOD_START_MS)}-${formatYmd(PERIOD_END_MS)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      attempted = true;
    }
  } catch (error) {
    attempted = false;
  }
  const sizeText = `${Math.round(bytes / 1048576 * 10) / 10} MiB`;
  if (tooBig) {
    setDataStatus(`JSONは ${sizeText} と大きいため、普段はテキスト欄に表示していません。ダウンロード${attempted ? 'を試みました（保存できたかは環境により異なります）' : 'が使えない環境では、下の「大きなJSONを表示」を押すと全内容を選択・コピーできます（表示に時間がかかります）。'}`);
  } else if (attempted) {
    setDataStatus(`ダウンロードを試みました（${sizeText}）。このプレビュー（sandbox）では保存が拒否されることがあります。その場合は下のJSONを選択・コピーしてファイルへ保存するか、index.htmlをダウンロードして単独で開いてください。`);
  } else {
    setDataStatus(`このプレビューでは直接保存できません。下のJSONを選択・コピーしてファイルへ保存するか、index.htmlをダウンロードして単独で開いてください（${sizeText}）。`);
  }
  dataManager.savedText = text; // 「取り出し済み」の記録（端末への保存を断定しない）
}

// 大きいJSONでも、利用者が明示的に押したときだけテキスト欄へ入れる（救出経路）
function revealSaveText() {
  const text = datasetSaveText();
  if (!text || !dom.dataSaveText) return;
  const bytes = utf8ByteLength(text);
  dom.dataSaveText.value = text;
  if (dom.dataReveal) dom.dataReveal.hidden = true;
  setDataStatus(`全JSON（${(bytes / 1048576).toFixed(1)} MiB）をテキスト欄に表示しました。「全選択」を押してコピーし、ファイルへ保存してください。`);
}

function selectDataText(target) {
  const node = target === 'save' ? dom.dataSaveText : dom.dataImportText;
  if (!node) return;
  if (target === 'save' && !node.value) node.value = datasetSaveText() || '';
  if (target === 'import' && !node.value) return;
  try {
    node.focus();
    node.select();
  } catch (error) {
    /* 選択できない環境では無視 */
  }
}

// --- 読込（取得bundle / 元GeoJSON） ---------------------------------------
async function importDatasetText(text, sourceLabel, force) {
  if (dataManager.busy) throw new Error('取得中は読み込めません。完了または中止のあとに操作してください。');
  if (!force && requestDataSwitch('読み込むデータ', () => {
    void importDatasetText(text, sourceLabel, true).then((message) => {
      setDataError('');
      setDataStatus(message);
    }).catch((error) => {
      setDataError(`読み込めません（現在のデータは変更していません）: ${error && error.message ? error.message : String(error)}`);
    });
  })) {
    return '未保存の取得データがあります。保存用JSONを表示してから切り替えるか、「このまま切り替える」を押してください。';
  }
  if (!text || !text.trim()) throw new Error('JSONが空です。');
  const bytes = utf8ByteLength(text);
  if (bytes > IMPORT_LIMIT_BYTES) throw new Error(`ファイルが大きすぎます（${Math.round(bytes / 1048576)} MiB。上限 ${Math.round(IMPORT_LIMIT_BYTES / 1048576)} MiB）。`);
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSONとして読めません（${error && error.message ? error.message : 'parse error'}）。`);
  }
  const epoch = ++dataManager.epoch;
  if (isPlainObject(parsed) && parsed.schema === ACQUISITION_SCHEMA) {
    const checked = await validateBundle(parsed);
    if (checked.error) throw new Error(`原本bundleの検証に失敗しました: ${checked.error}`);
    const canonical = JSON.stringify(parsed); // 整形の違いだけでは設定hashを変えない
    const sha = await sha256HexText(canonical);
    const plan = planFromBundle(checked, canonical, sha, sourceLabel || 'USGS取得データ（保存JSON）');
    if (epoch !== dataManager.epoch) throw new Error('別の操作が先に進んだため適用しませんでした。');
    applyDataset(plan.records, { ...plan, bundleText: canonical, bundleSha256: sha, geojsonText: null });
    return `${plan.records.length} 件を復元しました（${formatIsoUtc(plan.startMs)} 以上〜${formatIsoUtc(plan.endMs)} 未満 / 原本SHA-256一致）。`;
  }
  if (isPlainObject(parsed) && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    if (!parsed.features.length) throw new Error('GeoJSONにfeaturesがありません。');
    if (parsed.features.length > IMPORT_LIMIT_EVENTS) throw new Error(`featuresが多すぎます（${parsed.features.length} 件。上限 ${IMPORT_LIMIT_EVENTS} 件）。`);
    // 元テキストは再シリアライズせずそのまま保持・保存する（改変しない）
    const sha = await sha256HexText(text);
    const plan = planFromGeojson(parsed, text, sha);
    if ((plan.endMs - plan.startMs) / 86400000 > IMPORT_LIMIT_DAYS) throw new Error(`観測期間が長すぎます（上限 ${IMPORT_LIMIT_DAYS} 日）。`);
    if (epoch !== dataManager.epoch) throw new Error('別の操作が先に進んだため適用しませんでした。');
    applyDataset(plan.records, { ...plan, bundleText: null, bundleSha256: null, geojsonText: text });
    return `${plan.records.length} 件を読み込みました（ローカルGeoJSON・取得日時不明。描画不可 ${plan.records.filter((record) => !isPlottable(record)).length} 件は一覧とCSVには含まれます）。`;
  }
  if (isPlainObject(parsed) && Array.isArray(parsed.records)) {
    throw new Error('records形式は取り込めません。元のGeoJSONまたは取得bundle（usgs-acquisition/1）を読み込んでください。');
  }
  if (isPlainObject(parsed) && 'features' in parsed && parsed.type !== 'FeatureCollection') {
    throw new Error(`GeoJSONのtypeがFeatureCollectionではありません（${JSON.stringify(parsed.type)}）。`);
  }
  throw new Error('対応していないJSONです（取得bundle usgs-acquisition/1、またはGeoJSON FeatureCollectionを読み込めます）。');
}

async function importFromTextarea() {
  const text = dom.dataImportText ? dom.dataImportText.value : '';
  try {
    const message = await importDatasetText(text, '保存JSONから読み込み', false);
    if (dataManager.pendingAction) return;
    setDataError('');
    setDataStatus(message);
  } catch (error) {
    setDataError(`読み込めません（現在のデータは変更していません）: ${error && error.message ? error.message : String(error)}`);
  }
}

function wireDataFileInput(input, note) {
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > IMPORT_LIMIT_BYTES) {
      setDataError(`ファイルが大きすぎます（${(file.size / 1048576).toFixed(1)} MiB。上限 ${Math.round(IMPORT_LIMIT_BYTES / 1048576)} MiB）`);
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setDataError('ファイルを読み取れませんでした（現在のデータは変更していません）。');
    reader.onload = () => {
      void (async () => {
        try {
          const message = await importDatasetText(String(reader.result), `${file.name}${note ? `（${note}）` : ''}`, false);
          if (dataManager.pendingAction) return;
          setDataError('');
          setDataStatus(message);
        } catch (error) {
          setDataError(`読み込めません（現在のデータは変更していません）: ${error && error.message ? error.message : String(error)}`);
        }
        input.value = '';
      })();
    };
    reader.readAsText(file);
  });
}

function applyPresetRange(kind) {
  presetSelection = kind;
  const days = presetDays(kind);
  const label = kind === '24h' ? '最新24時間' : (kind === '7d' ? '最新7日' : '最新30日');
  if (dom.dataPresetHint) {
    dom.dataPresetHint.textContent = `選択中: ${label}（正確に ${days} 日分の半開区間。開始と終了は「取得して切替」を押した瞬間のUTC時刻で一度だけ固定します。終了は含みません）`;
  }
  if (dom.dataStart) dom.dataStart.value = '';
  if (dom.dataEnd) dom.dataEnd.value = '';
  setDataError('');
}

function setDataPanelOpen(open) {
  if (!dom.dataPanel) return;
  const next = !!open;
  if (next) {
    setTimeDetails(false);
    setDrawer('conditions', false);
    setDrawer('details', false);
    if (dom.helpPanel) setHelpOpen(false);
    updateDatasetInfo();
  }
  dom.dataPanel.hidden = !next;
  if (dom.dataOpen) dom.dataOpen.setAttribute('aria-expanded', next ? 'true' : 'false');
  if (next) {
    const first = focusableIn(dom.dataPanel)[0];
    try {
      (first || dom.dataPanel).focus();
    } catch (error) {
      /* フォーカス不可の環境では無視 */
    }
  } else if (dom.dataOpen && typeof dom.dataOpen.focus === 'function') {
    try {
      dom.dataOpen.focus();
    } catch (error) {
      /* 同上 */
    }
  }
}

function trapDataTab(event) {
  if (!dom.dataPanel || dom.dataPanel.hidden || event.key !== 'Tab') return;
  const items = focusableIn(dom.dataPanel);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

// ---------------------------------------------------------------------------
// 描画スケジューラ（必要なときだけ描く）
// ---------------------------------------------------------------------------

function renderFrame() {
  if (!renderer || !scene || !camera) return;
  if (controls) controls.update();
  computeVisibility();
  if (pointsMaterial && pointsMaterial.uniforms && pointsMaterial.uniforms.uCameraPosition) {
    pointsMaterial.uniforms.uCameraPosition.value.copy(camera.position);
    pointsMaterial.uniforms.uCullBackside.value = backsideCullingEnabled ? 1 : 0;
    const uniformCamera = pointsMaterial.uniforms.uCameraPosition.value;
    lastGpuState = {
      cameraPosition: [uniformCamera.x, uniformCamera.y, uniformCamera.z],
      cullBackside: pointsMaterial.uniforms.uCullBackside.value
    };
  }
  lastCpuCameraPosition = [camera.position.x, camera.position.y, camera.position.z];
  renderer.render(scene, camera);
}

function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    renderFrame();
    if (continuousRender) requestRender();
  });
}

// D03以降の再生用。通常は使わない（呼ぶと連続描画になる）。
function setContinuousRender(on) {
  continuousRender = !!on;
  if (continuousRender) requestRender();
}

// ---------------------------------------------------------------------------
// Three.jsセットアップ
// ---------------------------------------------------------------------------

function initThree() {
  // WebGLが使えない環境では、無限に「読み込み中」にせず具体的に知らせる
  let probe = null;
  try {
    probe = dom.canvas.getContext('webgl2'); // Three.js r180 は WebGL2 を必要とする
  } catch (error) {
    probe = null;
  }
  if (!probe) {
    throw new Error('この環境ではWebGLを利用できません（地球儀の3D表示に必要です）。ブラウザーのハードウェアアクセラレーション/WebGL設定を確認してください。');
  }
  renderer = new THREE.WebGLRenderer({
    canvas: dom.canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(dom.canvas.clientWidth, dom.canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03070d);

  const aspect = dom.canvas.clientWidth / Math.max(1, dom.canvas.clientHeight);
  camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 100);
  camera.position.set(2.9, 1.45, 2.9);

  controls = new OrbitControls(camera, dom.canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.85;
  controls.enablePan = false;
  controls.minDistance = 1.25;
  controls.maxDistance = 8.0;
  controls.update();
  controls.saveState();

  // 地図の陰影が読めるように、鏡面反射を出さない Lambert と控えめな照明にする。
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 0.45);
  directional.position.set(5, 3, 4);
  scene.add(directional);

  // 表面（透明度あり・初期表示）
  const surfaceGeometry = new THREE.SphereGeometry(1, 64, 32);
  surfaceMaterial = new THREE.MeshLambertMaterial({
    color: 0x2d6f9f,
    emissive: 0x0a1626,
    transparent: true,
    opacity: Number.isFinite(Number(dom.surfaceOpacity.value)) ? Number(dom.surfaceOpacity.value) : 0.46,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  surfaceMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surfaceMesh.visible = dom.surface.checked;
  surfaceMesh.renderOrder = 1;
  scene.add(surfaceMesh);

  addGraticule();

  // 地震点。サイズはマグニチュード、色は深さで変化させる。
  pointsMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
      uCameraPosition: { value: new THREE.Vector3() },
      uCullBackside: { value: 0 }
    },
    vertexShader: `
      uniform float uPixelRatio;
      uniform vec3 uCameraPosition;
      uniform float uCullBackside;
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        if (uCullBackside > 0.5 && dot(worldPosition, uCameraPosition) < 0.0) {
          // 背面の半球: 描画しない（CPU側の可視判定と同じ式）
          gl_PointSize = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        if (dot(c, c) > 0.25) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
    depthTest: true,
    depthWrite: true,
    transparent: false
  });

  points = new THREE.Points(new THREE.BufferGeometry(), pointsMaterial);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);

  // 選択中の地震を示すマーカー（一覧・詳細と連動）
  // 地震点の深さ色（橙〜紫）と混ざらないよう、専用の赤を使う
  selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 1.0,
    depthTest: false,
    depthWrite: false
  });
  selectionMarker = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), selectionMaterial);
  selectionMarker.frustumCulled = false;
  selectionMarker.renderOrder = 4;
  selectionMarker.visible = false;
  scene.add(selectionMarker);

  window.addEventListener('resize', onResize, { passive: true });
  dom.canvas.addEventListener('pointerdown', onPointerDown);
  dom.canvas.addEventListener('pointerup', onPointerUp);
  dom.canvas.addEventListener('pointercancel', () => { pointerDownInfo = null; });

  controls.addEventListener('change', () => { requestRender(); });
  requestRender();
}

function addGraticule() {
  const material = new THREE.LineBasicMaterial({
    color: 0x6fa8c8,
    transparent: true,
    opacity: 0.30,
    depthWrite: false
  });
  graticuleGroup = new THREE.Group();
  const segments = [];

  // 緯線（30度ごと）
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lon = 0; lon <= 360; lon += 5) {
      pts.push(latLonRadiusToVector(lat, lon, 1.002));
    }
    for (let i = 0; i < pts.length - 1; i += 1) segments.push(pts[i], pts[i + 1]);
  }
  // 経線（30度ごと）
  for (let lon = 0; lon < 360; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 5) {
      pts.push(latLonRadiusToVector(lat, lon, 1.002));
    }
    for (let i = 0; i < pts.length - 1; i += 1) segments.push(pts[i], pts[i + 1]);
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(segments);
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 3; // 背景地図の後に描画し、透明度ON/OFFが判別できるようにする
  graticuleGroup.add(lines);
  scene.add(graticuleGroup);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = dom.canvas.clientWidth;
  const height = Math.max(1, dom.canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (pointsMaterial) pointsMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  requestRender();
}

// ---------------------------------------------------------------------------
// 点の再構築
// ---------------------------------------------------------------------------

function rebuildRenderedPoints() {
  if (!points || !scene) return;

  const mode = dom.mode.value === 'hypocenter' ? 'hypocenter' : 'surface';
  const depthScale = readDepthScale();

  // 描画するのは「検索・地域・深さ/M絞り込み」を適用した結果（ページ送りとは無関係に全件）
  const list = matchedRecords;

  const count = list.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const record = list[i];
    const vector = localPositionFor(record, mode, depthScale);
    positions[i * 3] = vector.x;
    positions[i * 3 + 1] = vector.y;
    positions[i * 3 + 2] = vector.z;

    const color = colorForDepth(record.depth_km);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    sizes[i] = pointSizeFor(record.magnitude);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  points.geometry.dispose();
  points.geometry = geometry;

  renderedRecords = list;
  renderedPositions = positions;

  updateAlwaysVisibleScale(); // 表示モード変更にも即追従させる
  computeVisibility();
  updateCountsUi();
  requestRender();
}

// ---------------------------------------------------------------------------
// 選択・詳細
// ---------------------------------------------------------------------------

function cloneRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    time_ms: record.time_ms,
    longitude: record.longitude,
    latitude: record.latitude,
    depth_km: record.depth_km,
    magnitude: record.magnitude,
    place: record.place,
    source_url: record.source_url
  };
}

function updateSelectedDetails() {
  if (dom.detailList) dom.detailList.hidden = !selectedRecord;
  if (dom.selectionHint) dom.selectionHint.hidden = !!selectedRecord;
  if (!selectedRecord) {
    dom.selectedId.value = '-';
    dom.selectedTime.value = '-';
    dom.selectedDepth.value = '-';
    dom.selectedMag.value = '-';
    if (dom.selectedPlace) dom.selectedPlace.value = '-';
    if (dom.selectedLat) dom.selectedLat.value = '-';
    if (dom.selectedLon) dom.selectedLon.value = '-';
    dom.selectedSource.textContent = '-';
    dom.selectedSource.href = '#';
    return;
  }

  dom.selectedId.value = selectedRecord.id === null ? '-' : String(selectedRecord.id);
  dom.selectedTime.value = selectedRecord.time_ms === null
    ? '-'
    : new Date(selectedRecord.time_ms).toISOString();
  dom.selectedDepth.value = selectedRecord.depth_km === null
    ? '-'
    : String(selectedRecord.depth_km);
  dom.selectedMag.value = selectedRecord.magnitude === null
    ? '-'
    : String(selectedRecord.magnitude);
  if (dom.selectedPlace) dom.selectedPlace.value = selectedRecord.place || '（原文地名なし）';
  if (dom.selectedLat) {
    dom.selectedLat.value = selectedRecord.latitude === null ? '-' : selectedRecord.latitude.toFixed(4);
  }
  if (dom.selectedLon) {
    dom.selectedLon.value = selectedRecord.longitude === null ? '-' : selectedRecord.longitude.toFixed(4);
  }

  // 表示は短いラベル。リンク先(href)はUSGS原本の正確なURLを保持する。
  if (selectedRecord.source_url) {
    const safeUrl = safeEventUrl(selectedRecord.source_url);
    if (safeUrl) {
      dom.selectedSource.textContent = 'USGSの原本ページを開く';
      dom.selectedSource.href = safeUrl;
      dom.selectedSource.setAttribute('title', safeUrl);
    } else {
      dom.selectedSource.textContent = selectedRecord.source_url
        ? 'この出典URLは安全な形式でないためリンクにしません（記録は改変していません）'
        : '-';
      dom.selectedSource.href = '#';
      dom.selectedSource.removeAttribute('title');
    }
  } else {
    dom.selectedSource.textContent = '-';
    dom.selectedSource.href = '#';
    dom.selectedSource.removeAttribute('title');
  }
}

function selectRecordById(id, options) {
  const opts = options || {};
  const found = id ? allRecords.find((record) => record.id === id) || null : null;
  const inMatched = found ? matchedRecords.some((record) => record.id === found.id) : false;
  // 適用中の条件から外れた地震は選択を解除する
  selectedRecord = found && inMatched ? cloneRecord(found) : null;

  if (selectedRecord) {
    const index = matchedRecords.findIndex((record) => record.id === selectedRecord.id);
    if (index >= 0) {
      const page = Math.floor(index / PAGE_SIZE) + 1;
      if (page !== explorer.page) {
        explorer.page = page;
        renderList();
      }
    }
    if (opts.focus) focusOnId(selectedRecord.id);
  }
  updateSelectedDetails();
  syncListSelection();
  updateSelectionMarker();
  requestRender();
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  pointerDownInfo = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event) {
  if (event.button !== 0 || !pointerDownInfo) return;
  const dx = event.clientX - pointerDownInfo.x;
  const dy = event.clientY - pointerDownInfo.y;
  pointerDownInfo = null;
  if (Math.hypot(dx, dy) > 6) return; // 回転操作をクリック扱いしない
  pickPoint(event.clientX, event.clientY);
}

function screenPositionForIndex(index, rect) {
  const positionAttribute = points.geometry && points.geometry.getAttribute('position');
  if (!positionAttribute) return null;
  const vector = new THREE.Vector3(
    positionAttribute.getX(index),
    positionAttribute.getY(index),
    positionAttribute.getZ(index)
  ).project(camera);
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || vector.z < -1 || vector.z > 1) return null;
  return {
    x: (vector.x * 0.5 + 0.5) * rect.width,
    y: (-vector.y * 0.5 + 0.5) * rect.height
  };
}

function pickPoint(clientX, clientY) {
  if (!points || renderedRecords.length === 0) return;
  const positionAttribute = points.geometry && points.geometry.getAttribute('position');
  if (!positionAttribute) return;

  camera.updateMatrixWorld(true);
  const rect = dom.canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const sizeAttribute = points.geometry.getAttribute('size');

  let bestIndex = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < renderedRecords.length; i += 1) {
    if (visibilityFlags.length > i && visibilityFlags[i] === false) continue; // 背面は選択対象外
    const screen = screenPositionForIndex(i, rect);
    if (!screen) continue;
    const distance = Math.hypot(screen.x - localX, screen.y - localY);
    const pointSize = sizeAttribute ? sizeAttribute.getX(i) : 6;
    const threshold = Math.max(9, pointSize * 0.9);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0) {
    selectRecordById(renderedRecords[bestIndex].id);
  }
}

// ---------------------------------------------------------------------------
// 監査インターフェース
// ---------------------------------------------------------------------------

function snapshotRecords() {
  return allRecords.map((record) => ({
    id: record.id,
    time_ms: record.time_ms,
    longitude: record.longitude,
    latitude: record.latitude,
    depth_km: record.depth_km,
    magnitude: record.magnitude,
    place: record.place,
    source_url: record.source_url
  }));
}

function snapshotRendered() {
  const result = [];
  if (!points || !points.geometry) return result;
  const positionAttribute = points.geometry.getAttribute('position');
  if (!positionAttribute) return result;
  const array = positionAttribute.array;
  for (let i = 0; i < renderedRecords.length; i += 1) {
    result.push({
      id: renderedRecords[i].id,
      position: [array[i * 3], array[i * 3 + 1], array[i * 3 + 2]]
    });
  }
  return result;
}

function snapshotFilters() {
  return readFilters();
}

function getCurrentDepthScale() {
  return readDepthScale();
}

function findRenderedIndexById(id) {
  for (let i = 0; i < renderedRecords.length; i += 1) {
    if (renderedRecords[i].id === id) return i;
  }
  return -1;
}

function projectPointFromAttribute(index) {
  if (!points || !points.geometry || index < 0) return null;
  const positionAttribute = points.geometry.getAttribute('position');
  if (!positionAttribute) return null;
  camera.updateMatrixWorld(true);
  const vector = new THREE.Vector3(
    positionAttribute.getX(index),
    positionAttribute.getY(index),
    positionAttribute.getZ(index)
  );
  vector.project(camera);
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y)) return null;
  const rect = dom.canvas.getBoundingClientRect();
  return {
    x: (vector.x * 0.5 + 0.5) * rect.width,
    y: (-vector.y * 0.5 + 0.5) * rect.height
  };
}

function focusOnId(id) {
  let index = findRenderedIndexById(id);
  let position = null;

  if (index >= 0) {
    const positionAttribute = points.geometry.getAttribute('position');
    position = new THREE.Vector3(
      positionAttribute.getX(index),
      positionAttribute.getY(index),
      positionAttribute.getZ(index)
    );
  } else {
    const record = allRecords.find((item) => item.id === id);
    if (!record || !isPlottable(record)) return false;
    position = localPositionFor(record, dom.mode.value, getCurrentDepthScale());
  }

  if (!position || position.lengthSq() === 0) return false;

  const direction = position.clone().normalize();
  const distance = Math.max(camera.position.length(), position.length() + 1.5, 2.2);
  camera.position.copy(direction.multiplyScalar(distance));
  controls.target.set(0, 0, 0);
  controls.update();
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  requestRender();
  return true;
}

function resetView() {
  if (!controls || !camera) return false;
  controls.reset();
  controls.target.set(0, 0, 0);
  controls.update();
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  requestRender();
  return true;
}

function snapshotMap() {
  const texture = surfaceMaterial ? surfaceMaterial.map : null;
  const image = texture && texture.image ? texture.image : null;
  const manifest = embeddedMapManifest();
  return {
    requestedLayer: dom.mapLayer ? dom.mapLayer.value : 'none',
    loadedLayer: actualMapLayer,
    status: mapStatus,
    statusText: dom.mapStatus ? dom.mapStatus.textContent : null,
    texture: texture ? {
      imageWidth: image && image.width ? image.width : null,
      imageHeight: image && image.height ? image.height : null,
      flipY: texture.flipY,
      offset: [texture.offset.x, texture.offset.y],
      repeat: [texture.repeat.x, texture.repeat.y],
      matrix: texture.matrix ? texture.matrix.toArray() : null,
      uvSourceU: 'u=0 at lon -180, u=1 at lon +180',
      uvSourceV: 'v=1 at north pole (flipY true), v=0 at south pole',
      colorSpace: texture.colorSpace || null,
      anisotropy: texture.anisotropy,
      wrapS: texture.wrapS,
      wrapT: texture.wrapT
    } : null,
    surface: surfaceMesh ? {
      visible: surfaceMesh.visible,
      materialOpacity: surfaceMaterial ? surfaceMaterial.opacity : null,
      matrixWorld: surfaceMesh.matrixWorld ? surfaceMesh.matrixWorld.toArray() : null
    } : null,
    graticuleVisible: graticuleGroup ? graticuleGroup.visible : false,
    credit: dom.mapCredit ? dom.mapCredit.textContent : null,
    manifest: manifest ? {
      imageEpoch: manifest.image_epoch || null,
      acquiredAt: manifest.acquired_at || null,
      projection: manifest.projection || null,
      extent: manifest.extent || null,
      resolutionNote: manifest.resolution_note || null
    } : null
  };
}

function installAuditApi() {
  window.__quakeAudit = {
    ready: true,
    snapshot() {
      // 観測専用: 状態・DOM・GPUを変更しない。直近の実描画で更新したコピーを返す。
      return {
        schema: 1,
        appVersion: APP_VERSION,
        records: snapshotRecords(),
        excluded: excludedRecords.map((item) => ({ id: item.id, reason: item.reason })),
        unplottableIds: unplottableIds.slice(),
        rendered: snapshotRendered(),
        filters: snapshotFilters(),
        map: snapshotMap(),
        displayedCount: renderedRecords.length,
        mode: dom.mode.value === 'hypocenter' ? 'hypocenter' : 'surface',
        depthScale: getCurrentDepthScale(),
        earthRadius: 1,
        surfaceVisible: surfaceMesh ? surfaceMesh.visible : false,
        selected: cloneRecord(selectedRecord),
        dataManager: {
          sourceKind: dataManager.sourceKind,
          label: dataManager.label,
          busy: dataManager.busy,
          error: dataManager.error,
          progress: dataManager.progress ? { ...dataManager.progress } : null,
          hasBundle: !!dataManager.bundleText,
          dirty: dataManager.dirty,
          startMs: PERIOD_START_MS,
          endMs: PERIOD_END_MS,
          days: DAY_COUNT,
          monthCount: MONTH_KEYS.length,
          months: MONTH_KEYS.slice(),
          recordCount: allRecords.length,
          bundleSha256: dataManager.bundleSha256
        },
        dataset: {
          start: DATASET.start,
          endExclusive: DATASET.endExclusive,
          acquiredAt: DATASET.acquiredAt,
          manifestSha256: DATASET.manifestSha256
        },
        view: {
          quaternion: camera ? camera.quaternion.toArray() : [0, 0, 0, 1],
          distance: camera ? camera.position.length() : 0
        },
        visibility: {
          backsideHidden: backsideCullingEnabled,
          hiddenCount: backsideHiddenCount,
          frontCount: backsideCullingEnabled ? frontIds.length : renderedRecords.length,
          rule: 'dot(pointPosition, cameraPosition) < 0 の点を背面として描画・クリック選択から除外。点バッファは地球中心が原点で無変換のためモデル座標=ワールド座標。有効条件: 表面ON かつ surfaceMaterial.map があり loadedLayer!=none かつ opacity>0。',
          surfaceVisible: surfaceMesh ? surfaceMesh.visible : false,
          loadedLayer: actualMapLayer,
          surfaceOpacity: surfaceMaterial ? surfaceMaterial.opacity : null,
          cameraPosition: lastGpuState.cameraPosition,
          gpuCullBackside: lastGpuState.cullBackside,
          cpuCameraPosition: lastCpuCameraPosition,
          frontIds: frontIds.slice(),
          note: '直近の実描画（GPU uniform uCameraPosition/uCullBackside）とCPU側可視フラグのコピー。snapshot()は何も変更しない。カメラ操作・設定変更の直後に読む場合は、次の描画フレーム完了後（requestAnimationFrame 2回程度）に取得すること。'
        },
        explorer: {
          startMs: timeState.startMs,
          endMs: timeState.endMs,
          textQuery: explorer.textQuery,
          textQueryRaw: explorer.textQueryRaw || null,
          region: { id: explorer.regionId, label: explorer.regionLabel, note: explorer.regionNote },
          bbox: explorer.bbox ? explorer.bbox.slice() : null,
          sort: explorer.sort,
          page: explorer.page,
          pageSize: PAGE_SIZE,
          matchedIds: matchedRecords.map((record) => record.id),
          pageIds: pageRecords.map((record) => record.id),
          error: explorer.error
        },
        time: {
          startMs: timeState.startMs,
          endMs: timeState.endMs,
          cursorDay: timeState.cursorDay,
          playing: timeState.playing,
          speedDaysPerSecond: timeState.speedDaysPerSecond,
          playMode: timeState.playMode,
          windowDays: timeState.windowDays,
          source: timeState.source,
          monthlyCounts: monthlyCounts.slice(),
          monthlyCountsRule: '現在の地域・検索・深さ・Mに合う全期間（時間絞り込みから独立）。時間範囲で母集団は変わらない。',
          summary: {
            count: timeSummary.count,
            maxMagnitude: timeSummary.maxMagnitude,
            minDepthKm: timeSummary.minDepthKm,
            maxDepthKm: timeSummary.maxDepthKm
          },
          error: timeState.error
        },
        render: {
          mode: continuousRender ? 'continuous' : 'on-demand',
          setContinuous(on) {
            setContinuousRender(on);
            return continuousRender ? 'continuous' : 'on-demand';
          }
        }
      };
    },
    // 取得bundleの純粋なコピー（内蔵・GeoJSONはnull。状態を書き換えない）
    acquisitionBundle() {
      if (!dataManager.bundleText) return null;
      try {
        return JSON.parse(JSON.stringify(JSON.parse(dataManager.bundleText)));
      } catch (error) {
        return null;
      }
    },
    focus(id) {
      return focusOnId(id);
    },
    project(id) {
      const index = findRenderedIndexById(id);
      if (index < 0) return null;
      return projectPointFromAttribute(index);
    }
  };
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

async function fetchText(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(path) {
  const text = await fetchText(path);
  return JSON.parse(text);
}

async function loadData() {
  const [acquireResult, manifest, rawText, countText] = await Promise.all([
    fetchJson(DATA_PATHS.acquireResult),
    fetchJson(DATA_PATHS.manifest),
    fetchText(DATA_PATHS.raw),
    fetchText(DATA_PATHS.count)
  ]);

  if (acquireResult.status !== 'complete') {
    throw new Error('取得道具のstatusがcompleteではありません。');
  }

  DATASET.acquiredAt = acquireResult.acquired_at || manifest.finished_at || null;
  DATASET.manifestSha256 = acquireResult.manifest_sha256 || null;

  const raw = JSON.parse(rawText);
  const features = Array.isArray(raw.features) ? raw.features : [];
  rawFeatureCount = features.length;

  const parsedCount = Number.parseInt(String(countText).trim(), 10);
  countQueryValue = Number.isFinite(parsedCount) ? parsedCount : null;

  const processed = processRawFeatures(features);
  allRecords = processed.records;
  excludedRecords = processed.excluded;
  unplottableIds = processed.unplottableIds;

  rebuildCalendar();
  embeddedDataset = {
    records: allRecords,
    meta: {
      sourceKind: 'embedded',
      label: '内蔵 2025年保存版',
      startMs: DATASET.startMs,
      endMs: DATASET.endMs,
      minMagnitude: DATASET.minMagnitude,
      acquiredAt: DATASET.acquiredAt,
      manifestSha256: DATASET.manifestSha256,
      excluded: excludedRecords,
      rawFeatureCount,
      countValue: countQueryValue
    }
  };

  dom.period.value = `${DATASET.start} 以上〜${DATASET.endExclusive} 未満`;
  dom.acquiredAt.value = DATASET.acquiredAt || '-';
  dom.rawCount.value = String(rawFeatureCount);
  dom.queryCount.value = countQueryValue === null ? '-' : String(countQueryValue);
  dom.targetCount.value = String(allRecords.length);
  dom.excludedCount.value = String(excludedRecords.length);
  dom.unplottableCount.value = String(unplottableIds.length);
  updateDatasetInfo();
}

const drawerState = { conditions: false, details: false };

function applyDrawerState() {
  if (!dom.app) return;
  dom.app.classList.toggle('conditions-open', drawerState.conditions);
  dom.app.classList.toggle('details-open', drawerState.details);
  if (dom.toggleConditions) dom.toggleConditions.setAttribute('aria-expanded', drawerState.conditions ? 'true' : 'false');
  if (dom.toggleDetails) dom.toggleDetails.setAttribute('aria-expanded', drawerState.details ? 'true' : 'false');
}

function focusTarget(element) {
  if (element && typeof element.focus === 'function') {
    try { element.focus(); } catch (error) { /* フォーカス不可の環境では無視 */ }
  }
}

// 狭幅のドロワーは常設ヘッダーの「実際の下端」から始める（文字折返しや幅で高さが変わるため実測する）
function syncHeaderHeight() {
  if (!dom.topbar || !document.documentElement || !document.documentElement.style) return;
  let bottom = null;
  if (typeof dom.topbar.getBoundingClientRect === 'function') {
    const rect = dom.topbar.getBoundingClientRect();
    if (rect && Number.isFinite(rect.bottom)) bottom = rect.bottom;
  }
  if (bottom === null) bottom = dom.topbar.offsetHeight || 0;
  document.documentElement.style.setProperty('--header-h', `${Math.max(0, Math.round(bottom))}px`);
}

function watchHeaderHeight() {
  syncHeaderHeight();
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', syncHeaderHeight);
    window.addEventListener('orientationchange', syncHeaderHeight);
  }
  if (typeof ResizeObserver === 'function' && dom.topbar) {
    try {
      const observer = new ResizeObserver(() => { syncHeaderHeight(); });
      observer.observe(dom.topbar);
    } catch (error) {
      // 監視できない環境では resize のみで追従する
    }
  }
}

function setDrawer(which, open) {
  if (open) setTimeDetails(false); // ドロワー表示中は時間の詳細を前面に残さない
  const wasOpen = !!drawerState[which];
  if (open) {
    // 左右を同時に開かない（狭い画面で操作不能になるのを防ぐ）
    drawerState.conditions = which === 'conditions';
    drawerState.details = which === 'details';
  } else {
    drawerState[which] = false;
  }
  applyDrawerState();
  if (open && !wasOpen) {
    focusTarget(which === 'conditions' ? dom.hud : dom.details);
  } else if (!open && wasOpen) {
    focusTarget(which === 'conditions' ? dom.toggleConditions : dom.toggleDetails);
  }
}

function closeOpenDrawer() {
  if (drawerState.conditions) return 'conditions';
  if (drawerState.details) return 'details';
  return null;
}

function wireUi() {
  dom.mode.addEventListener('change', () => {
    rebuildRenderedPoints();
  });

  dom.surface.addEventListener('change', () => {
    surfaceMesh.visible = dom.surface.checked;
    computeVisibility();
    requestRender();
  });

  const onDepthScaleInput = () => {
    syncDepthScaleUi();
    rebuildRenderedPoints();
  };
  dom.depthScale.addEventListener('input', onDepthScaleInput);
  dom.depthScale.addEventListener('change', onDepthScaleInput);
  dom.resetScale.addEventListener('click', () => {
    dom.depthScale.value = '1';
    syncDepthScaleUi();
    rebuildRenderedPoints();
  });

  // 深さ/M の数値入力も、プリセットと同じ経路（一覧・チップ・描画をまとめて更新）を通す
  for (const input of [dom.minDepth, dom.maxDepth, dom.minMag, dom.maxMag]) {
    input.addEventListener('input', () => { explorer.page = 1; refreshExplorer(); });
    input.addEventListener('change', () => { explorer.page = 1; refreshExplorer(); });
  }
  if (dom.clearDepth) {
    dom.clearDepth.addEventListener('click', () => {
      dom.minDepth.value = '';
      dom.maxDepth.value = '';
      explorer.page = 1;
      refreshExplorer();
    });
  }
  if (dom.clearMag) {
    dom.clearMag.addEventListener('click', () => {
      dom.minMag.value = '';
      dom.maxMag.value = '';
      explorer.page = 1;
      refreshExplorer();
    });
  }
  // dom.clearFilters は「全条件リセット」(resetAllConditions) 側だけで扱う（二重ハンドラーを作らない）

  if (dom.mapLayer) {
    dom.mapLayer.addEventListener('change', () => {
      // ユーザーが明示的に「地図なし」を選んだ正常状態は失敗として扱わない
      if (dom.mapLayer.value === 'none') failedMapLayer = null;
      void loadSelectedMapLayer();
    });
  }
  if (dom.surfaceOpacity) {
    const onOpacity = () => updateSurfaceOpacityUi();
    dom.surfaceOpacity.addEventListener('input', onOpacity);
    dom.surfaceOpacity.addEventListener('change', onOpacity);
  }
  if (dom.graticule) {
    dom.graticule.addEventListener('change', () => {
      if (graticuleGroup) graticuleGroup.visible = dom.graticule.checked;
      if (renderer && scene && camera) requestRender();
    });
  }
  if (dom.resetView) {
    dom.resetView.addEventListener('click', () => { resetView(); });
  }
  if (dom.toggleConditions) {
    dom.toggleConditions.addEventListener('click', () => {
      setDrawer('conditions', !drawerState.conditions);
    });
  }
  if (dom.toggleDetails) {
    dom.toggleDetails.addEventListener('click', () => {
      setDrawer('details', !drawerState.details);
    });
  }
  if (dom.closeConditions) {
    dom.closeConditions.addEventListener('click', () => setDrawer('conditions', false));
  }
  if (dom.closeDetails) {
    dom.closeDetails.addEventListener('click', () => setDrawer('details', false));
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      trapHelpTab(event); // ヘルプを開いている間はTabをパネル内に閉じ込める
      trapDataTab(event);  // データパネルを開いている間はTabをパネル内に閉じ込める
      return;
    }
    if (event.key !== 'Escape') return;
    if (dom.helpPanel && !dom.helpPanel.hidden) {
      setHelpOpen(false); // ヘルプを開いている間はヘルプを閉じる
      return;
    }
    if (dom.dataPanel && !dom.dataPanel.hidden) {
      setDataPanelOpen(false); // データパネルを開いている間はデータパネルを閉じる
      return;
    }
    const open = closeOpenDrawer();
    if (open) setDrawer(open, false);
  });
  if (dom.canvas) {
    dom.canvas.addEventListener('dblclick', () => { resetView(); });
  }

  if (dom.searchInput) {
    dom.searchInput.addEventListener('input', () => {
      renderSuggestions(buildSuggestions(dom.searchInput.value));
    });
    dom.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSuggestion(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSuggestion(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        applySearch();
      } else if (event.key === 'Escape') {
        hideSuggestions();
      }
    });
    dom.searchInput.addEventListener('blur', () => { window.setTimeout(hideSuggestions, 150); });
  }
  if (dom.searchSuggestions) {
    dom.searchSuggestions.addEventListener('mousedown', (event) => { event.preventDefault(); });
    dom.searchSuggestions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-index]');
      if (button) applySuggestion(suggestionItems[Number(button.getAttribute('data-index'))]);
    });
  }
  if (dom.searchApply) dom.searchApply.addEventListener('click', applySearch);
  if (dom.searchClear) dom.searchClear.addEventListener('click', clearSearch);
  if (dom.regionSelect) {
    dom.regionSelect.addEventListener('change', () => {
      const region = findRegionChoice(dom.regionSelect.value);
      if (region) applyRegion(region.id, region.label_ja, region.bbox || null, region.note);
    });
  }
  if (dom.bboxApply) dom.bboxApply.addEventListener('click', applyBboxInput);
  if (dom.presetShallow) dom.presetShallow.addEventListener('click', () => applyPreset('shallow'));
  if (dom.presetDeep) dom.presetDeep.addEventListener('click', () => applyPreset('deep'));
  if (dom.presetMag6) dom.presetMag6.addEventListener('click', () => applyPreset('mag6'));
  if (dom.filterReset) dom.filterReset.addEventListener('click', resetAllConditions);
  if (dom.conditionChips) {
    dom.conditionChips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-chip]');
      if (!button) return;
      const chip = button.getAttribute('data-chip');
      if (chip === 'region') {
        explorer.regionId = 'world';
        explorer.regionLabel = '全世界';
        explorer.regionNote = '全地球（範囲指定なし）';
        explorer.bbox = null;
        syncRegionSelect('world', '全世界');
      } else if (chip === 'query') {
        explorer.textQuery = '';
        if (dom.searchInput) dom.searchInput.value = '';
        setSearchStatus('');
      } else if (chip === 'time') {
        resetTimeRange();
        return;
      } else if (chip === 'minDepth') {
        dom.minDepth.value = '';
      } else if (chip === 'maxDepth') {
        dom.maxDepth.value = '';
      } else if (chip === 'minMag') {
        dom.minMag.value = '';
      } else if (chip === 'maxMag') {
        dom.maxMag.value = '';
      }
      explorer.page = 1;
      refreshExplorer();
    });
  }
  if (dom.sortSelect) {
    dom.sortSelect.addEventListener('change', () => {
      if (SORT_VALUES.indexOf(dom.sortSelect.value) >= 0) explorer.sort = dom.sortSelect.value;
      explorer.page = 1;
      refreshExplorer();
    });
  }
  if (dom.timeToggle) {
    dom.timeToggle.addEventListener('click', () => { setTimeDetails(!timeDetailsOpen); });
  }
  if (dom.helpOpen) dom.helpOpen.addEventListener('click', () => setHelpOpen(true));
  if (dom.helpClose) dom.helpClose.addEventListener('click', () => setHelpOpen(false));
  if (dom.csvExport) dom.csvExport.addEventListener('click', exportCsv);
  if (dom.csvSelect) dom.csvSelect.addEventListener('click', selectCsvText);
  if (dom.settingsExport) dom.settingsExport.addEventListener('click', exportSettings);
  if (dom.settingsImport) dom.settingsImport.addEventListener('click', () => { void importSettings(); });
  if (dom.settingsSelect) dom.settingsSelect.addEventListener('click', selectSettingsText);
  if (dom.mapRetry) dom.mapRetry.addEventListener('click', retryMapLayer);
  if (dom.dataOpen) dom.dataOpen.addEventListener('click', () => setDataPanelOpen(true));
  if (dom.dataClose) dom.dataClose.addEventListener('click', () => setDataPanelOpen(false));
  for (const kind of ['24h', '7d', '30d']) {
    const button = byTestId(`data-preset-${kind}`);
    if (button) button.addEventListener('click', () => applyPresetRange(kind));
  }
  if (dom.dataAcquire) dom.dataAcquire.addEventListener('click', () => { void acquireData(false); });
  if (dom.dataRetry) dom.dataRetry.addEventListener('click', () => { void acquireData(false); });
  if (dom.dataCancel) dom.dataCancel.addEventListener('click', cancelAcquisition);
  if (dom.dataRevert) dom.dataRevert.addEventListener('click', () => { void revertToEmbedded(false); });
  if (dom.dataSave) dom.dataSave.addEventListener('click', () => { void saveDataset(); });
  if (dom.dataSaveSelect) dom.dataSaveSelect.addEventListener('click', () => selectDataText('save'));
  if (dom.dataReveal) dom.dataReveal.addEventListener('click', revealSaveText);
  if (dom.dataImport) dom.dataImport.addEventListener('click', () => { void importFromTextarea(); });
  if (dom.dataImportSelect) dom.dataImportSelect.addEventListener('click', () => selectDataText('import'));
  wireDataFileInput(dom.dataImportFile, null);
  wireDataFileInput(dom.dataGeojsonFile, 'ローカルGeoJSON・取得日時不明');
  for (const input of [dom.dataStart, dom.dataEnd]) {
    if (input) input.addEventListener('input', () => {
      presetSelection = null; // 手入力に変えたらカスタム扱い
      if (dom.dataPresetHint) dom.dataPresetHint.textContent = '手入力の期間を使用します（終了は含みません）。';
    });
  }
  if (dom.dataSwitchSave) dom.dataSwitchSave.addEventListener('click', () => { void saveDataset(); });
  if (dom.dataSwitchProceed) dom.dataSwitchProceed.addEventListener('click', () => resolveDataSwitch(true));
  if (dom.dataSwitchCancel) dom.dataSwitchCancel.addEventListener('click', () => resolveDataSwitch(false));
  if (dom.dataRevert) { /* revertToEmbedded は save guard 経由で呼ぶ */ }
  if (dom.timeApply) dom.timeApply.addEventListener('click', applyCustomTimeRange);
  if (dom.timeReset) dom.timeReset.addEventListener('click', resetTimeRange);
  if (dom.timePrevMonth) dom.timePrevMonth.addEventListener('click', () => shiftMonth(-1));
  if (dom.timeNextMonth) dom.timeNextMonth.addEventListener('click', () => shiftMonth(1));
  if (dom.timePlay) dom.timePlay.addEventListener('click', togglePlayback);
  if (dom.timeRestart) {
    dom.timeRestart.addEventListener('click', () => {
      stopPlayback();
      setTimelineCursor(0, 'timeline');
    });
  }
  if (dom.timeSlider) {
    dom.timeSlider.addEventListener('input', () => {
      if (timeState.playing) stopPlayback(); // 手動操作でタイマーを残さない
      setTimelineCursor(Number(dom.timeSlider.value), 'timeline');
    });
  }
  if (dom.timeSpeed) {
    dom.timeSpeed.addEventListener('change', () => {
      timeState.speedDaysPerSecond = Number(dom.timeSpeed.value) || 1;
      updateTimeUi();
    });
  }
  if (dom.timeMode) {
    dom.timeMode.addEventListener('change', () => {
      timeState.playMode = dom.timeMode.value === 'window' ? 'window' : 'cumulative';
      if (timeState.playing) stopPlayback();
      setTimelineCursor(timeState.cursorDay, 'timeline');
    });
  }
  if (dom.timeWindow) {
    dom.timeWindow.addEventListener('change', () => {
      timeState.windowDays = Number(dom.timeWindow.value) || 1;
      if (timeState.playMode === 'window') {
        if (timeState.playing) stopPlayback();
        setTimelineCursor(timeState.cursorDay, 'timeline');
      } else {
        updateTimeUi();
      }
    });
  }
  if (dom.monthBar) {
    dom.monthBar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-month]');
      if (!button) return;
      const month = String(button.getAttribute('data-month'));
      const index = MONTH_KEYS.indexOf(month); // 年付きキーの配列index（1月開始に依存しない）
      if (index < 0) return;
      stopPlayback();
      applyMonthRange(index);
    });
  }
  watchHeaderHeight();
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && timeState.playing) stopPlayback(); // タブ非表示で止める
    });
  }
  if (dom.pagePrev) dom.pagePrev.addEventListener('click', () => changePage(-1));
  if (dom.pageNext) dom.pageNext.addEventListener('click', () => changePage(1));
  if (dom.resultList) {
    dom.resultList.addEventListener('click', (event) => {
      const reset = event.target.closest('[data-action="reset"]');
      if (reset) {
        resetAllConditions();
        return;
      }
      const row = event.target.closest('[data-event-id]');
      if (row) selectRecordById(row.getAttribute('data-event-id'), { focus: true });
    });
    dom.resultList.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-event-id]');
      if (row) {
        event.preventDefault();
        selectRecordById(row.getAttribute('data-event-id'), { focus: true });
      }
    });
  }
}

function showError(error) {
  console.error(error);
  dom.loading.hidden = true;
  dom.error.hidden = false;
  dom.error.textContent = `表示を開始できませんでした。\n${error && error.message ? error.message : String(error)}\nこのアプリは保存済みデータのみを使う単体HTMLです（file:// でもDSHのプレビューでも動きます。HTTPサーバーが必要なのは、分割版の app/index.html を src 構成で開く場合だけです）。`;
}

async function main() {
  try {
    await loadData();
    initThree();
    wireUi();
    syncDepthScaleUi();
    initExplorer();
    rebuildRenderedPoints();
    updateSurfaceOpacityUi();
    updateAlwaysVisibleScale();
    if (graticuleGroup) graticuleGroup.visible = dom.graticule ? dom.graticule.checked : true;
    await loadSelectedMapLayer();
    updateSelectedDetails();
    installAuditApi();
    dom.loading.hidden = true;
    dom.app.hidden = false;
    dom.hud.hidden = false;
  } catch (error) {
    showError(error);
  }
}

await main();
