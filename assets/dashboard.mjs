import { createScheduler, createStore } from './runtime.mjs';
import {
  average,
  deriveAhr999,
  deriveMnav,
  fetchBalancedPrice,
  fetchDailyCandles,
  fetchFearGreed,
  fetchHalving,
  fetchHashrate,
  fetchMnav,
  fetchMvrv,
  fetchMvrvZ,
  fetchPrice,
  fetchProbabilities,
  fetchPuell,
  fetchSopr,
  fetchStrcFlywheel,
  fetchStrcIssuance,
  fetchWeeklyCandles,
  isValidFlywheelValue,
  isValidIssuanceValue,
  isValidMnavValue,
  parseFlywheelPayload,
  parseIssuancePayload
} from './data-sources.mjs';
import { createCycleTargets } from './cycle-targets.mjs';

const BLOCK_REWARD = 3.125;

const MINERS = [
  { model: 'Antminer U3S23 Hyd.', hashrate: 1160, power: 11020 },
  { model: 'Antminer S23 Hyd.', hashrate: 380, power: 5428 },
  { model: 'Whatsminer M73', hashrate: 512, power: 7424 },
  { model: 'SEALMINER A2 Pro Hyd', hashrate: 500, power: 7450 },
  { model: 'Whatsminer M70', hashrate: 310, power: 5270 },
  { model: 'Antminer S21+ Hyd.', hashrate: 319, power: 4785 },
  { model: 'Whatsminer M66S', hashrate: 298, power: 5067 },
  { model: 'Antminer S21 Hyd.', hashrate: 335, power: 5360 },
  { model: 'Antminer S21 Pro', hashrate: 234, power: 3510 },
  { model: 'Antminer S21', hashrate: 200, power: 3500 },
  { model: 'Whatsminer M63S', hashrate: 390, power: 7215 },
  { model: 'Whatsminer M60S', hashrate: 186, power: 3422 },
  { model: 'Antminer T21', hashrate: 190, power: 3610 },
  { model: 'Whatsminer M56S++', hashrate: 230, power: 5290 },
  { model: 'Antminer S19 XP Hyd.', hashrate: 255, power: 5304 },
  { model: 'Antminer S19 XP', hashrate: 140, power: 3010 },
  { model: 'Whatsminer M50S++', hashrate: 150, power: 3276 },
  { model: 'Whatsminer M50S+', hashrate: 140, power: 3080 },
  { model: 'Avalon A1466', hashrate: 150, power: 3350 },
  { model: 'Whatsminer M50', hashrate: 118, power: 3276 },
  { model: 'Antminer S19j Pro+', hashrate: 122, power: 3355 },
  { model: 'Antminer S19 Pro', hashrate: 110, power: 3250 },
  { model: 'Antminer S19j Pro', hashrate: 104, power: 3068 }
].filter(miner => (miner.power / miner.hashrate) <= 29.5);

const TTL = Object.freeze({
  price: 86400000,
  hashrate: 86400000,
  ahr999: 86400000,
  wma200: 86400000,
  bp: 86400000,
  fng: 7200000,
  halving: 86400000,
  mvrv: 86400000,
  mvrvz: 86400000,
  sopr: 86400000,
  puell: 86400000,
  probs: 3600000,
  mnav: 1800000,
  'mstr-mnav': 1800000,
  'bmnr-mnav': 1800000,
  'strc-flywheel': 1800000,
  'strc-issuance': 1800000
});

const DERIVED_TTL = Object.freeze({
  price: 300000,
  hashrate: 86400000,
  ahr999: 86400000,
  wma200: 86400000,
  bp: 86400000,
  fng: 7200000,
  mvrv: 86400000,
  mvrvz: 86400000,
  sopr: 86400000,
  puell: 86400000,
  mnav: 1800000
});

const INTERVAL = Object.freeze({
  price: 15000,
  hashrate: 300000,
  ahr999: 300000,
  wma200: 300000,
  fng: 600000,
  halving: 600000,
  mvrv: 3600000,
  mvrvz: 1800000,
  sopr: 3600000,
  puell: 3600000,
  probs: 1800000,
  bp: 3600000,
  mnav: 1800000,
  'strc-flywheel': 1800000,
  'strc-issuance': 1800000
});

const METRIC_CONFIG = Object.freeze({
  mvrv: { id: 'mvrv-value', note: 'mvrv-note', title: 'MVRV' },
  mvrvz: { id: 'mvrvz-value', note: 'mvrvz-note', title: 'MVRV-Z' },
  sopr: { id: 'sopr-value', note: 'sopr-note', title: 'SOPR' },
  puell: { id: 'puell-value', note: 'puell-note', title: 'Puell' }
});

const TASK_AREA = Object.freeze({
  price: ['#btc-price'],
  hashrate: ['#hashrate'],
  ahr999: ['#ahr999'],
  wma200: ['#wma200-price'],
  bp: ['#bp-price'],
  fng: ['#fng-value'],
  halving: ['#halving-days'],
  mvrv: ['#mvrv-value'],
  mvrvz: ['#mvrvz-value'],
  sopr: ['#sopr-value'],
  puell: ['#puell-value'],
  probs: ['#prob-row'],
  mnav: ['#mstr-mnav', '#bmnr-mnav'],
  'strc-flywheel': ['#strc-price', '#strc-score'],
  'strc-issuance': ['#strc-atm', '#strc-issued']
});

const state = {
  price: null,
  hashrate: null,
  weeklyCandles: null,
  dailyCandles: null,
  ahr999: null,
  wma200: null,
  bp: null,
  metrics: { mvrv: null, mvrvz: null, sopr: null, puell: null },
  fng: null,
  halving: null,
  probs: null,
  mnav: null,
  mnavCompanies: { mstr: null, bmnr: null },
  mnavLegacy: null,
  mnavDerived: null,
  strcFlywheel: null,
  strcIssuance: null,
  available: Object.create(null),
  meta: Object.create(null),
  frame: null
};

let store;
let scheduler;
let expiryTimer = null;
let cycleTargets;

const finitePositive = value => Number.isFinite(value) && value > 0;
const finite = value => Number.isFinite(value);
const $ = id => document.getElementById(id);

function safeStorage() {
  try { return globalThis.localStorage; } catch (_) { return undefined; }
}

function validRecord(value) {
  return value && typeof value === 'object' && Number.isFinite(value.t) && value.t >= 0;
}

function valueFrom(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) return value.value;
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'v')) return value.v;
  return value;
}

function recordValue(record) {
  return valueFrom(record?.value ?? record?.v);
}

function readCached(key, maxAgeMs) {
  if (!store) return null;
  try {
    const record = store.getRecord(key);
    if (!validRecord(record)) return null;
    const freshValue = store.get(key, maxAgeMs);
    const staleValue = freshValue ?? store.get(key, Number.MAX_SAFE_INTEGER);
    const value = valueFrom(staleValue);
    if (value == null) return null;
    return {
      value,
      record,
      fresh: freshValue != null,
      fetchedAt: record.t,
      dataAt: record.dataAt ?? null,
      source: record.source ?? null
    };
  } catch (_) {
    return null;
  }
}

function cacheSet(key, value, meta = {}) {
  if (value == null || !store) return null;
  try { return store.set(key, value, { dataAt: meta.dataAt ?? null, source: meta.source ?? null }); } catch (_) { return null; }
}

function sourceRecord(result) {
  if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'value')) return result;
  return { value: result, source: null, dataAt: null };
}

function nowText(value) {
  if (!Number.isFinite(value)) return '未知';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function sourceDateText(value) {
  const timestamp = Number.isFinite(value) ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return '源日期未知';
  return `源 ${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(timestamp))}`;
}

function statusNode(target) {
  const element = typeof target === 'string' ? $(target.replace(/^#/, '')) : target;
  if (!element) return null;
  const area = element.closest('.cycle-card, .stat-item, .fng-section, .pendulum-section, .risk-panel, .table-section') || element;
  let node = area.querySelector(':scope > .dashboard-state');
  if (!node) {
    node = document.createElement('span');
    node.className = 'dashboard-state';
    node.setAttribute('aria-live', 'polite');
    node.style.cssText = 'display:block;margin-top:5px;color:var(--dim);font-size:11px;line-height:1.35';
    const title = area.querySelector(':scope > .cycle-card-title, :scope > .stat-label, :scope > .panel-label, :scope > .table-title');
    if (title?.parentNode) title.parentNode.insertBefore(node, title.nextSibling);
    else area.appendChild(node);
  }
  return node;
}

function setAreaStatus(taskKey, phase, meta = {}) {
  const targets = TASK_AREA[taskKey] || [];
  const message = statusMessage(phase, meta);
  for (const target of targets) {
    const node = statusNode(target);
    if (!node) continue;
    node.textContent = message;
    node.style.color = phase === 'unavailable' ? 'var(--red)' : phase === 'stale' ? 'var(--gold)' : 'var(--dim)';
  }
}

function statusMessage(phase, meta = {}) {
  return phase === 'loading' ? '加载中…'
    : phase === 'unavailable' ? `不可用 · 获取 ${nowText(meta.fetchedAt)} · ${meta.error || '暂无有效来源'}`
      : phase === 'stale' ? `缓存过期 · 获取 ${nowText(meta.fetchedAt)} · ${sourceDateText(meta.dataAt)}`
        : phase === 'cached' ? `缓存可用 · 获取 ${nowText(meta.fetchedAt)} · ${sourceDateText(meta.dataAt)}`
          : `可用 · 获取 ${nowText(meta.fetchedAt)} · ${sourceDateText(meta.dataAt)}`;
}

function setMnavStatus(company, phase, meta = {}) {
  const node = statusNode(company === 'mstr' ? '#mstr-mnav' : '#bmnr-mnav');
  if (!node) return;
  node.textContent = statusMessage(phase, meta);
  node.style.color = phase === 'unavailable' ? 'var(--red)' : phase === 'stale' ? 'var(--gold)' : 'var(--dim)';
}

function markAvailable(key, available, meta = {}) {
  state.available[key] = available;
  state.meta[key] = meta;
}

function isCurrent(key) {
  if (state.available[key] === false) return false;
  const fetchedAt = state.meta[key]?.fetchedAt;
  const ttl = DERIVED_TTL[key];
  return Number.isFinite(fetchedAt) && (!Number.isFinite(ttl) || Date.now() - fetchedAt < ttl);
}

function isCurrentMnavCompany(entry) {
  return Boolean(entry?.meta && Number.isFinite(entry.meta.fetchedAt) && Date.now() - entry.meta.fetchedAt < TTL.mnav);
}

function commit(key, result, apply) {
  const item = sourceRecord(result);
  if (item.value == null) throw new Error(`${key} returned no value`);
  const stored = cacheSet(key, item.value, item);
  if (store && !stored) throw new Error(`${key} value rejected by cache validator`);
  state.meta[key] = { fetchedAt: stored?.t ?? Date.now(), dataAt: item.dataAt, source: item.source };
  markAvailable(key, true, state.meta[key]);
  apply(item.value, item);
  setAreaStatus(key, 'available', state.meta[key]);
  return item.value;
}

function commitRaw(taskKey, cacheKey, result, apply) {
  const item = sourceRecord(result);
  if (item.value == null) throw new Error(`${taskKey} returned no value`);
  const stored = cacheSet(cacheKey, item.value, item);
  if (store && !stored) throw new Error(`${cacheKey} value rejected by cache validator`);
  state.meta[taskKey] = { fetchedAt: stored?.t ?? Date.now(), dataAt: item.dataAt, source: item.source };
  markAvailable(taskKey, true, state.meta[taskKey]);
  apply(item.value, item);
  if (taskKey === 'wma200' && finitePositive(state.wma200)) cacheSet('wma200', state.wma200, { dataAt: item.dataAt, source: 'derived:weekly-candles' });
  if (taskKey === 'ahr999' && finitePositive(state.ahr999)) cacheSet('ahr999', state.ahr999, { dataAt: item.dataAt, source: 'derived:daily-candles' });
  setAreaStatus(taskKey, 'available', state.meta[taskKey]);
  return item.value;
}

function commitMnav(result) {
  const item = sourceRecord(result);
  const value = item.value;
  if (!value || (!value.mstr && !value.bmnr)) throw new Error('mNAV returned no complete company record');
  const records = [];
  if (value.mstr) {
    const stored = cacheSet('mstr-mnav-input', value.mstr, item);
    if (store && !stored) throw new Error('MSTR mNAV value rejected by cache validator');
    records.push(stored);
  }
  if (value.bmnr && finitePositive(value.ethPrice)) {
    const stored = cacheSet('bmnr-mnav-input', { ...value.bmnr, ethPrice: value.ethPrice }, item);
    if (store && !stored) throw new Error('BMNR mNAV value rejected by cache validator');
    records.push(stored);
  }
  const fetchedAt = Math.max(...records.filter(Boolean).map(record => record.t));
  state.meta.mnav = { fetchedAt, dataAt: item.dataAt, source: item.source };
  markAvailable('mnav', true, state.meta.mnav);
  applyMnav(value, item);
  return value;
}

function applyPrice(value, meta = {}) {
  if (!finitePositive(value?.price)) throw new Error('invalid price value');
  state.price = value.price;
  state.priceChange = finite(value.changePct) ? value.changePct : finite(value.chg) ? value.chg : 0;
  const change = state.priceChange;
  const element = $('btc-price');
  if (element) {
    element.innerHTML = `$${Math.round(value.price).toLocaleString('en-US')} <span style="font-size:12px;color:${change >= 0 ? 'var(--green)' : 'var(--red)'}">${change >= 0 ? '↑' : '↓'}${Math.abs(change).toFixed(2)}%</span>`;
  }
  renderVwap();
  renderAnchorRatios();
  renderMnav();
  renderAhr999();
  scheduleMiningRender();
  computeCyclePendulum();
  cycleTargets?.update(isCurrent('price') ? state.price : null);
}

function applyHashrate(value) {
  const difficulty = value?.difficulty ?? value?.diff;
  const hashrate = value?.hashrate ?? (finitePositive(Number(value?.hr)) ? Number(value.hr) * 1e18 : null);
  if (!finitePositive(difficulty) || !finitePositive(hashrate)) throw new Error('invalid hashrate value');
  state.hashrate = { difficulty, hashrate, eh: finitePositive(value?.eh) ? value.eh : hashrate / 1e18 };
  const element = $('hashrate');
  if (element) element.textContent = `${state.hashrate.eh.toFixed(1)} EH/s`;
  scheduleMiningRender();
}

function applyMetric(name, value) {
  const config = METRIC_CONFIG[name];
  if (!config || !finite(value)) throw new Error(`invalid ${name} value`);
  state.metrics[name] = value;
  const element = $(config.id);
  if (element) {
    element.textContent = name === 'sopr' ? value.toFixed(3) : value.toFixed(2);
    const limit = name === 'mvrv' ? 3.5 : name === 'mvrvz' ? 7 : name === 'puell' ? 4 : Infinity;
    element.style.color = value >= limit ? 'var(--red)' : name === 'sopr' && value >= 1.03 ? 'var(--text)' : value >= (name === 'mvrv' ? 2 : name === 'mvrvz' ? 5 : name === 'puell' ? 4 : 1) ? 'var(--gold)' : 'var(--green)';
  }
  const note = $(config.note);
  if (!note) return;
  const rules = {
    mvrv: [[1, '🟢 MVRV < 1 — 低估区间，历史大底'], [2, '✅ 正常偏低 — 持币/定投区间'], [3.5, '📈 正常偏高 — 注意风险'], [Infinity, '🔴 MVRV > 3.5 — 过热，历史顶部区间']],
    mvrvz: [[0, '🟢 Z<0 极度低估 — 历史大底区'], [2, '🟢 低估累积区'], [5, '正常估值区间'], [7, '📈 偏热 — 注意风险'], [Infinity, '🔴 Z>7 顶部泡沫区']],
    sopr: [[1, '🟢 亏损投降进行中 — 卖出潮未尽'], [1.03, '⚖️ 临界 1.0 — 关键观察窗'], [Infinity, '📈 获利了结主导 — 卖出潮已过']],
    puell: [[0.5, '🟢 矿工深度投降 — 历史大底信号区'], [1, '🟢 矿工承压 — 收入低于年均'], [4, '矿工正常区间'], [Infinity, '🔴 矿工高利润 — 历史顶部区间']]
  };
  const rule = rules[name].find(([limit]) => value < limit) || rules[name].at(-1);
  note.textContent = rule[1];
  note.style.color = value < (name === 'mvrv' ? 2 : name === 'mvrvz' ? 2 : name === 'sopr' ? 1.03 : 1) ? 'var(--green)' : 'var(--dim)';
  computeCyclePendulum();
}

function applyFng(value) {
  if (!finite(value) || value < 0 || value > 100) throw new Error('invalid F&G value');
  state.fng = value;
  const angle = (value / 100) * 180 - 90;
  $('fng-needle')?.style.setProperty('transform', `rotate(${angle}deg)`);
  const valueElement = $('fng-value');
  if (valueElement) valueElement.textContent = String(value);
  let label, color, desc;
  if (value <= 20) { label = '极度恐惧'; color = 'var(--red)'; desc = '市场极度恐慌，可能是买入机会'; }
  else if (value <= 40) { label = '恐惧'; color = 'var(--gold)'; desc = '市场情绪偏空，投资者谨慎'; }
  else if (value <= 60) { label = '中性'; color = '#f0d000'; desc = '市场情绪中性，观望为主'; }
  else if (value <= 80) { label = '贪婪'; color = 'var(--green)'; desc = '市场情绪偏多，注意风险'; }
  else { label = '极度贪婪'; color = 'var(--green)'; desc = '市场过度乐观，考虑止盈'; }
  const status = $('fng-status');
  if (status) { status.textContent = label; status.style.color = color; }
  if ($('fng-desc')) $('fng-desc').textContent = desc;
  computeCyclePendulum();
}

function applyHalving(value) {
  if (!value || !finite(value.height) || !finite(value.days)) throw new Error('invalid halving value');
  state.halving = value;
  if ($('halving-days')) $('halving-days').textContent = `${value.days} 天`;
  if ($('halving-block')) $('halving-block').textContent = Number(value.height).toLocaleString();
  if ($('halving-date')) $('halving-date').textContent = value.date || '未知';
  if ($('halving-fill')) $('halving-fill').style.width = `${Math.max(0, Math.min(100, value.progress))}%`;
}

function applyWma(value) {
  if (!value || !Array.isArray(value.closes)) throw new Error('invalid WMA input');
  state.weeklyCandles = value;
  state.wma200 = average(value.closes);
  if ($('wma200-price')) $('wma200-price').textContent = `$${Math.round(state.wma200).toLocaleString()}`;
  renderAnchorRatios();
}

function applyDaily(value) {
  if (!value || !Array.isArray(value.closes)) throw new Error('invalid daily candles');
  state.dailyCandles = value;
  renderAhr999();
}

function applyBp(value) {
  if (!finitePositive(value)) throw new Error('invalid balanced price');
  state.bp = value;
  if ($('bp-price')) $('bp-price').textContent = `$${Math.round(value).toLocaleString()}`;
  renderAnchorRatios();
  computeCyclePendulum();
}

function renderAnchorRatios() {
  if (!finitePositive(state.price) || !isCurrent('price')) {
    if ($('wma200-ratio')) $('wma200-ratio').textContent = '--';
    if ($('bp-ratio')) $('bp-ratio').textContent = '--';
    return;
  }
  if (finitePositive(state.wma200) && isCurrent('wma200')) {
    const ratio = state.price / state.wma200;
    if ($('wma200-ratio')) { $('wma200-ratio').textContent = ratio.toFixed(2); $('wma200-ratio').style.color = ratio < 1 ? 'var(--red)' : ratio < 1.5 ? 'var(--green)' : ratio < 3 ? 'var(--gold)' : 'var(--red)'; }
    if ($('wma200-note')) { $('wma200-note').textContent = ratio < 1 ? '⚠️ 低于 200WMA — 极端熊市信号' : ratio < 1.5 ? '✅ 接近 200WMA — 历史底部区间' : ratio < 3 ? '📈 高于 200WMA — 正常牛市区间' : '🔥 远超 200WMA — 过热信号'; $('wma200-note').style.color = ratio < 1 ? 'var(--red)' : ratio < 1.5 ? 'var(--green)' : 'var(--dim)'; }
  } else if ($('wma200-ratio')) $('wma200-ratio').textContent = '--';
  if (finitePositive(state.bp) && isCurrent('bp')) {
    const ratio = state.price / state.bp;
    if ($('bp-ratio')) { $('bp-ratio').textContent = ratio.toFixed(2); $('bp-ratio').style.color = ratio < 1 ? 'var(--red)' : ratio < 1.5 ? 'var(--green)' : ratio < 3 ? 'var(--text)' : 'var(--gold)'; }
    if ($('bp-note')) { $('bp-note').textContent = ratio < 1 ? '⚠️ 低于 BP — 极度低估，历史周期大底' : ratio < 1.5 ? '✅ 接近 BP — 底部区间' : ratio < 3 ? '📈 高于 BP — 正常估值区间' : '🔥 远超 BP — 估值偏高'; $('bp-note').style.color = ratio < 1 ? 'var(--red)' : ratio < 1.5 ? 'var(--green)' : ratio < 3 ? 'var(--dim)' : 'var(--gold)'; }
  } else if ($('bp-ratio')) $('bp-ratio').textContent = '--';
}

function renderAhr999() {
  if (state.dailyCandles && !isCurrent('ahr999')) {
    state.ahr999 = null;
    if ($('ahr999')) $('ahr999').textContent = '--';
    return;
  }
  if (state.dailyCandles && finitePositive(state.price) && isCurrent('price')) {
    const value = deriveAhr999(state.price, state.dailyCandles);
    if (finitePositive(value)) state.ahr999 = value;
  }
  if (!finitePositive(state.ahr999) || !isCurrent('price') || (!state.dailyCandles && !isCurrent('ahr999'))) {
    if ($('ahr999')) $('ahr999').textContent = '--';
    return;
  }
  const element = $('ahr999');
  if (element) {
    element.textContent = state.ahr999.toFixed(2);
    element.style.color = state.ahr999 < 1.2 ? 'var(--green)' : state.ahr999 < 5 ? 'var(--gold)' : 'var(--red)';
    element.title = state.ahr999 < 0.45 ? '抄底区间' : state.ahr999 < 1.2 ? '定投区间' : state.ahr999 < 5 ? '观望区间' : '泡沫区间';
  }
}

function renderVwap() {
  const weekly = globalThis.BTC_WEEKLY || {};
  const values = weekly.VWAP_VALUES || {};
  for (const [id, key] of [['vwap-2017', '2017'], ['vwap-2022', '2022'], ['vwap-halv', 'halv']]) {
    const value = Number(values[key]);
    if (!finitePositive(value) || !$(id)) continue;
    if (!finitePositive(state.price) || !isCurrent('price')) { $(id).textContent = `$${Math.round(value).toLocaleString()} · 倍数 --`; continue; }
    const ratio = state.price / value;
    $(id).innerHTML = `$${Math.round(value).toLocaleString()} <span style="color:${ratio < 1 ? 'var(--red)' : ratio < 1.5 ? 'var(--gold)' : 'var(--green)'}">${ratio.toFixed(2)}x</span>`;
  }
}

function renderCorr() {
  const weekly = globalThis.BTC_WEEKLY || {};
  const values = weekly.CORR_VALUES || {};
  for (const group of ['gold', 'qqq']) {
    for (const days of [30, 90, 180, 252]) {
      const element = $(`corr-${group}-${days}`);
      const value = Number(values[group]?.[`d${days}`]);
      if (!element) continue;
      if (!finite(value)) { element.textContent = 'n/a'; continue; }
      element.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
    }
  }
}

function applyProbs(value) {
  state.probs = value;
  for (const strike of [55000, 50000, 45000, 40000, 35000, 30000]) {
    const tile = $(`prob-${strike}`);
    const probability = value[strike];
    const element = tile?.querySelector('.prob-val');
    if (!element) continue;
    if (!finite(probability) || probability < 0 || probability > 1) { element.textContent = '--'; continue; }
    element.textContent = `${(probability * 100).toFixed(1)}%`;
    element.style.color = probability >= 0.5 ? 'var(--red)' : probability >= 0.25 ? 'var(--gold)' : 'var(--green)';
    tile.style.borderColor = probability >= 0.5 ? 'var(--red)' : probability >= 0.25 ? 'var(--gold)' : 'var(--border)';
  }
}

function applyMnav(value) {
  state.mnav = value;
  const meta = state.meta.mnav || {};
  if (value?.mstr) state.mnavCompanies.mstr = { kind: 'raw', value: value.mstr, meta, fresh: true, cached: false };
  if (value?.bmnr && finitePositive(value.ethPrice)) state.mnavCompanies.bmnr = { kind: 'raw', value: { ...value.bmnr, ethPrice: value.ethPrice }, meta, fresh: true, cached: false };
  renderMnav();
}

function applyMnavCard(id, value, detail) {
  if (finitePositive(value)) {
    const element = $(id);
    if (element) {
      element.textContent = `${value.toFixed(2)}x`;
      element.style.color = value < 1 ? 'var(--green)' : value < 2 ? 'var(--gold)' : 'var(--red)';
    }
    if (detail) detail();
  } else if ($(id)) {
    $(id).textContent = '--';
  }
}

function renderMnav() {
  const derived = { mstr: null, bmnr: null };
  const mstrEntry = state.mnavCompanies.mstr;
  const bmnrEntry = state.mnavCompanies.bmnr;
  if (mstrEntry && isCurrentMnavCompany(mstrEntry)) {
    derived.mstr = mstrEntry.kind === 'raw'
      ? deriveMnav({ mstr: mstrEntry.value }, isCurrent('price') ? state.price : null).mstr
      : mstrEntry.value;
  }
  if (bmnrEntry && isCurrentMnavCompany(bmnrEntry)) {
    derived.bmnr = bmnrEntry.kind === 'raw'
      ? deriveMnav({ bmnr: bmnrEntry.value, ethPrice: bmnrEntry.value.ethPrice }, null).bmnr
      : bmnrEntry.value;
  }
  state.mnavDerived = derived;
  if (derived.mstr) {
    const officialMnav = finitePositive(derived.mstr.officialMnav) ? derived.mstr.officialMnav : null;
    const headline = officialMnav ?? (derived.mstr.legacy ? derived.mstr.ev : null);
    applyMnavCard('mstr-mnav', headline, () => {
      if ($('mstr-basic')) $('mstr-basic').textContent = finitePositive(derived.mstr.basic) ? `${derived.mstr.basic.toFixed(2)}x` : '--';
      if ($('mstr-ev')) $('mstr-ev').textContent = derived.mstr.ev == null ? '--' : `${derived.mstr.ev.toFixed(2)}x`;
      if ($('mstr-detail')) {
        if (officialMnav != null) {
          const asOf = sourceDateText(derived.mstr.officialMnavAsOf ?? derived.mstr.sourceAsOf);
          $('mstr-detail').textContent = `${asOf} · ${derived.mstr.source || '官方 reported'}`;
        } else if (derived.mstr.holdings != null && derived.mstr.stockPrice != null) {
          $('mstr-detail').textContent = `历史 EV/BTC 对照 · BTC ${derived.mstr.holdings.toLocaleString()} | $${derived.mstr.stockPrice}`;
        } else {
          $('mstr-detail').textContent = '官方 mNAV 不可用：缺少 source_as_of';
        }
      }
    });
    if ($('mstr-basic')) $('mstr-basic').textContent = finitePositive(derived.mstr.basic) ? `${derived.mstr.basic.toFixed(2)}x` : '--';
    if ($('mstr-ev')) $('mstr-ev').textContent = derived.mstr.ev == null ? '--' : `${derived.mstr.ev.toFixed(2)}x`;
    if ($('mstr-mnav-title')) $('mstr-mnav-title').textContent = officialMnav != null
      ? '官方 mNAV · Price / Net BTC Per Share'
      : '历史 EV/BTC 对照 · 非官方 mNAV';
    if ($('mstr-detail') && officialMnav != null) $('mstr-detail').textContent = `${sourceDateText(derived.mstr.officialMnavAsOf ?? derived.mstr.sourceAsOf)} · ${derived.mstr.source || '官方 reported'}`;
    setMnavStatus('mstr', mstrEntry?.cached ? 'cached' : 'available', mstrEntry.meta);
  } else {
    if ($('mstr-mnav')) $('mstr-mnav').textContent = '--';
    if ($('mstr-mnav-title')) $('mstr-mnav-title').textContent = '官方 mNAV · Price / Net BTC Per Share';
    if ($('mstr-detail')) $('mstr-detail').textContent = '数据不可用：缺少官方 mNAV 与有效 source_as_of';
    setMnavStatus('mstr', mstrEntry ? 'stale' : 'unavailable', mstrEntry?.meta || { error: '缺少有效 MSTR 数据' });
  }
  if (derived.bmnr) {
    applyMnavCard('bmnr-mnav', derived.bmnr.mnav, () => {
      if ($('bmnr-detail')) $('bmnr-detail').textContent = `ETH ${derived.bmnr.holdings.toLocaleString()} | $${derived.bmnr.stockPrice}`;
    });
    setMnavStatus('bmnr', bmnrEntry?.cached ? 'cached' : 'available', bmnrEntry.meta);
  } else {
    if ($('bmnr-mnav')) $('bmnr-mnav').textContent = '--';
    if ($('bmnr-detail')) $('bmnr-detail').textContent = '数据不可用：mNAV 返回缺少可靠 ETH 价格或完整字段';
    setMnavStatus('bmnr', bmnrEntry ? 'stale' : 'unavailable', bmnrEntry?.meta || { error: '缺少有效 BMNR 数据' });
  }
}

function fmtMoney(value) { return finite(value) ? `$${Math.round(value).toLocaleString()}` : '$--'; }

function calcShutdown(hashrate, power, difficulty, electricity) {
  const btcPerDay = (86400 * hashrate * 1e12 * BLOCK_REWARD) / (difficulty * 2 ** 32);
  return btcPerDay > 0 ? (power * 24 / 1000 * electricity) / btcPerDay : null;
}

function percentile(values, percentage) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (percentage / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function clearMining() {
  for (const id of ['p25-val', 'p50-val', 'p75-val', 'p90-val']) if ($(id)) $(id).textContent = '--';
  if ($('range')) $('range').textContent = '--- ~ ---';
  if ($('profit-count')) $('profit-count').innerHTML = '<span class="profit">--</span>/--';
  for (const id of ['pct-25', 'pct-50', 'pct-75', 'pct-90']) $(id)?.classList.remove('active');
  if ($('chart-container')) $('chart-container').textContent = '等待有效价格与算力数据';
  if ($('miner-tbody')) $('miner-tbody').textContent = '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function validLegacyMstr(value) {
  if (!value || typeof value !== 'object') return false;
  const hasMultiple = finitePositive(value.ev) || finitePositive(value.basic) || finitePositive(value.mnav);
  return hasMultiple && finitePositive(value.holdings) && finitePositive(value.price);
}

function validLegacyBmnr(value) {
  return Boolean(value && typeof value === 'object' && finitePositive(value.mnav) && finitePositive(value.eth) && finitePositive(value.price));
}

function validCandleCache(value) {
  const genesis = Date.parse('2009-01-03T00:00:00Z');
  return Boolean(value && Array.isArray(value.closes) && value.closes.length >= 200 && value.closes.every(finitePositive) && finite(value.lastTs) && value.lastTs >= genesis && value.lastTs <= Date.now());
}

function validMstrInput(value) {
  return isValidMnavValue({ mstr: value });
}

function validBmnrInput(value) {
  return Boolean(value && typeof value === 'object' && finitePositive(value.holdings) && finitePositive(value.stockPrice) && finitePositive(value.shares) && finitePositive(value.ethPrice));
}

function renderMining() {
  state.frame = null;
  if (!finitePositive(state.price) || !isCurrent('price') || !finitePositive(state.hashrate?.difficulty) || !isCurrent('hashrate')) { clearMining(); return; }
  const electricity = Number($('electricity')?.value);
  if (!finite(electricity)) { clearMining(); return; }
  const data = MINERS.map(miner => ({
    ...miner,
    eff: miner.power / miner.hashrate,
    shutdown: calcShutdown(miner.hashrate, miner.power, state.hashrate.difficulty, electricity)
  })).filter(item => finitePositive(item.shutdown)).sort((a, b) => a.shutdown - b.shutdown);
  if (!data.length) { clearMining(); return; }
  const prices = data.map(item => item.shutdown);
  const p25 = percentile(prices, 25), p50 = percentile(prices, 50), p75 = percentile(prices, 75), p90 = percentile(prices, 90);
  for (const [id, value] of [['p25-val', p25], ['p50-val', p50], ['p75-val', p75], ['p90-val', p90]]) if ($(id)) $(id).textContent = fmtMoney(value);
  if ($('range')) $('range').textContent = `${fmtMoney(Math.min(...prices))} ~ ${fmtMoney(Math.max(...prices))}`;
  const profitable = prices.filter(value => state.price > value).length;
  if ($('profit-count')) $('profit-count').innerHTML = `<span class="profit">${profitable}</span>/${data.length}`;
  for (const id of ['pct-25', 'pct-50', 'pct-75', 'pct-90']) $(id)?.classList.remove('active');
  const selected = state.price <= p25 ? 'pct-25' : state.price <= p50 ? 'pct-50' : state.price <= p75 ? 'pct-75' : 'pct-90';
  $(selected)?.classList.add('active');
  const rawCeil = Math.ceil(Math.max(state.price * 1.15, Math.max(...prices) * 1.1) / 30000) * 30000;
  if (!finitePositive(rawCeil)) { clearMining(); return; }
  const xCeil = rawCeil;
  const nSteps = Math.min(10, Math.max(1, Math.ceil(xCeil / 30000)));
  let labels = '', bars = '';
  for (const item of data) {
    const width = (item.shutdown / xCeil * 100).toFixed(4);
    const profitableClass = state.price > item.shutdown ? 'profit' : 'loss';
    labels += `<div class="chart-lbl">${escapeHtml(item.model)}</div>`;
    bars += `<div class="cbar ${profitableClass}" style="width:${width}%"></div>`;
  }
  let ticks = '';
  for (let i = 0; i <= nSteps; i++) {
    const tickValue = xCeil * i / nSteps;
    ticks += `<span class="x-tick" style="left:${(i / nSteps * 100).toFixed(4)}%">$${Math.round(tickValue / 1000).toLocaleString()}k</span>`;
  }
  const pricePct = (state.price / xCeil * 100).toFixed(4);
  if ($('chart-container')) $('chart-container').innerHTML = `<div class="chart-grid"><div class="chart-labels">${labels}</div><div class="chart-bars">${bars}<div class="vprice" style="left:${pricePct}%"><div class="vprice-tag">BTC ${fmtMoney(state.price)}</div></div></div></div><div class="x-axis-row"><div></div><div class="x-axis-track">${ticks}</div></div>`;
  if ($('miner-tbody')) $('miner-tbody').innerHTML = data.map(item => {
    const ok = state.price > item.shutdown;
    return `<tr><td class="model">${escapeHtml(item.model)}</td><td>${item.hashrate} TH/s</td><td>${item.power} W</td><td>${item.eff.toFixed(1)} W/TH</td><td class="shutdown ${ok ? 'profit' : 'loss'}">${fmtMoney(item.shutdown)}</td><td><span class="status-badge ${ok ? 'status-profit' : 'status-loss'}">${ok ? '盈利' : '亏损'}</span></td></tr>`;
  }).join('');
}

function scheduleMiningRender() {
  if (state.frame != null) return;
  const raf = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
  state.frame = raf(renderMining);
}

function refreshDerived() {
  renderVwap();
  renderAnchorRatios();
  renderAhr999();
  renderMnav();
  computeCyclePendulum();
  cycleTargets?.update(isCurrent('price') ? state.price : null);
  scheduleMiningRender();
}

function scheduleExpiryRefresh() {
  if (expiryTimer != null) clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => {
    refreshDerived();
    scheduleExpiryRefresh();
  }, 60000);
}

function pendNorm(value, points) {
  if (!finite(value)) return null;
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    if (value <= points[index][0]) {
      const [x0, y0] = points[index - 1];
      const [x1, y1] = points[index];
      return y0 + (y1 - y0) * (value - x0) / (x1 - x0);
    }
  }
  return points.at(-1)[1];
}

function computeCyclePendulum() {
  const parts = [];
  const usable = key => isCurrent(key) && state.metrics[key] != null;
  if (usable('mvrv')) parts.push(['MVRV', pendNorm(state.metrics.mvrv, [[0.8, 0], [1, 20], [2, 45], [3.5, 80], [4.5, 100]]), 0.2]);
  if (usable('mvrvz')) parts.push(['MVRV-Z', pendNorm(state.metrics.mvrvz, [[-0.5, 0], [0, 15], [2, 40], [5, 75], [8, 100]]), 0.2]);
  if (isCurrent('bp') && isCurrent('price') && finitePositive(state.bp) && finitePositive(state.price)) parts.push(['价/BP', pendNorm(state.price / state.bp, [[1, 5], [1.5, 30], [3, 65], [5, 95]]), 0.15]);
  if (usable('puell')) parts.push(['Puell', pendNorm(state.metrics.puell, [[0.4, 3], [0.5, 12], [1, 35], [2, 60], [4, 85], [6, 100]]), 0.15]);
  if (usable('sopr')) parts.push(['SOPR', pendNorm(state.metrics.sopr, [[0.96, 5], [1, 30], [1.03, 50], [1.08, 75], [1.12, 95]]), 0.1]);
  if (isCurrent('fng') && finite(state.fng)) parts.push(['F&G', Math.max(0, Math.min(100, state.fng)), 0.1]);
  const coverage = parts.reduce((sum, part) => sum + part[2], 0);
  const enough = parts.length >= 3 && coverage >= 0.6;
  if (!enough) {
    if ($('pend-score')) $('pend-score').textContent = '--';
    if ($('pend-zone')) { $('pend-zone').textContent = '数据不足'; $('pend-zone').style.color = 'var(--dim)'; }
    if ($('pend-verdict')) $('pend-verdict').textContent = `有效证据 ${Math.round(coverage * 100)}% · ${parts.length} 项，至少需要 60% 且 3 项`;
    if ($('pend-breakdown')) $('pend-breakdown').innerHTML = parts.map(part => `<span class="pend-chip">${part[0]} <b>${Math.round(part[1])}</b></span>`).join('');
    $('pend-needle')?.style.setProperty('transform', 'rotate(-90deg)');
    return null;
  }
  const score = parts.reduce((sum, part) => sum + part[1] * part[2], 0) / coverage;
  $('pend-needle')?.style.setProperty('transform', `rotate(${(score / 100) * 180 - 90}deg)`);
  if ($('pend-score')) $('pend-score').textContent = String(Math.round(score));
  const zones = score < 20 ? ['深熊·投降', '#2ea043', '🟢🟢 极度低估 — 历史大底信号区，重仓 / 加速定投']
    : score < 40 ? ['低估·累积', '#4cd964', '🟢 悲观累积区 — 链上低估、情绪恐惧，定投友好']
      : score < 60 ? ['中性·均衡', '#f0d000', '⚪ 估值回归中性 — 顺势持有，不追高不砍底']
        : score < 80 ? ['过热·乐观', '#f7931a', '🟡 乐观过热 — 分批减仓、收紧止盈纪律']
          : ['泡沫·狂热', '#e74c5f', '🔴 狂热泡沫区 — 历史顶部区间，主动出货'];
  if ($('pend-zone')) { $('pend-zone').textContent = zones[0]; $('pend-zone').style.color = zones[1]; }
  if ($('pend-score')) $('pend-score').style.color = zones[1];
  if ($('pend-verdict')) $('pend-verdict').textContent = zones[2];
  if ($('pend-breakdown')) $('pend-breakdown').innerHTML = parts.map(part => `<span class="pend-chip">${part[0]} <b>${Math.round(part[1])}</b></span>`).join('');
  return score;
}

function renderStrcFlywheel(value) {
  state.strcFlywheel = value;
  const strc = value.strc;
  if (strc?.price != null) {
    const price = strc.price;
    const element = $('strc-price');
    if (element) { element.innerHTML = `$${price.toFixed(2)} <span style="font-size:12px;color:${(strc.change_pct ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${(strc.change_pct ?? 0) >= 0 ? '↑' : '↓'}${Math.abs(strc.change_pct ?? 0).toFixed(1)}%</span>`; element.style.color = price < 92 ? 'var(--red)' : price < 95 ? 'var(--gold)' : 'var(--green)'; }
  }
  if (finite(value.flywheel_score)) {
    const element = $('strc-score');
    if (element) { element.textContent = `${value.flywheel_score}/100`; element.style.color = value.flywheel_score < 33 ? 'var(--red)' : value.flywheel_score < 66 ? 'var(--gold)' : 'var(--green)'; }
  }
  if (Array.isArray(value.reasons) && value.reasons.length && $('strc-reasons')) $('strc-reasons').textContent = value.reasons.join(' · ');
  const shares = value.strategy_official?.strc_metrics?.shares;
  if (finitePositive(shares) && $('strc-issued')) $('strc-issued').textContent = `$${(shares * 100 / 1e9).toFixed(2)}B`;
  const runway = value.strc_runway;
  if (finite(runway?.runway_months)) {
    if ($('strc-runway')) $('strc-runway').textContent = `${runway.runway_months.toFixed(1)}月`;
    if ($('strc-runway-note')) $('strc-runway-note').textContent = `保守口径 ${finite(runway.runway_months_conservative) ? runway.runway_months_conservative.toFixed(1) : '--'}月 · 月股息 ${fmtMillions(runway.monthly_dividend)}`;
  }
  const globalRunway = value.global_runway;
  if (finite(globalRunway?.runway_months) && $('global-runway')) $('global-runway').textContent = `${globalRunway.runway_months.toFixed(1)}月`;
  if (globalRunway && $('global-runway-note')) $('global-runway-note').textContent = `状态 ${globalRunway.status || '--'} · 债息假设 ${finite(globalRunway.debt_interest_rate) ? (globalRunway.debt_interest_rate * 100).toFixed(1) : '--'}%`;
  if (finite(globalRunway?.cash) && $('runway-cash')) $('runway-cash').textContent = fmtBillions(globalRunway.cash);
  if (finite(globalRunway?.annual_cash_need) && $('runway-need')) $('runway-need').textContent = `${fmtBillions(globalRunway.annual_cash_need)}/年`;
  if (globalRunway && $('runway-headroom')) $('runway-headroom').textContent = `9M余量 ${fmtMillions(globalRunway.headroom_to_9m)} · 6M余量 ${fmtMillions(globalRunway.headroom_to_6m)}`;
}

function renderStrcIssuance(value) {
  state.strcIssuance = value;
  if ($('strc-atm') && finite(value?.atmRemainingM)) $('strc-atm').textContent = `$${(value.atmRemainingM / 1000).toFixed(2)}B`;
}

function fmtBillions(value) { return finite(value) ? `$${(value / 1e9).toFixed(2)}B` : '$--'; }
function fmtMillions(value) { return finite(value) ? `$${(value / 1e6).toFixed(1)}M` : '$--'; }

function applyCached(key, cached, apply) {
  if (!cached) return;
  try {
    state.meta[key] = { fetchedAt: cached.fetchedAt, dataAt: cached.dataAt, source: cached.source };
    markAvailable(key, cached.fresh, state.meta[key]);
    apply(cached.value, cached.record);
    setAreaStatus(key, cached.fresh ? 'cached' : 'stale', state.meta[key]);
  } catch (_) {
    markAvailable(key, false, {});
  }
}

function restoreCache() {
  applyCached('price', readCached('price', TTL.price), applyPrice);
  applyCached('hashrate', readCached('hashrate', TTL.hashrate), applyHashrate);
  const weekly = readCached('wma200-input', TTL.wma200);
  if (weekly) applyCached('wma200', weekly, applyWma);
  else applyCached('wma200', readCached('wma200', TTL.wma200), value => { if (finitePositive(value)) { state.wma200 = value; if ($('wma200-price')) $('wma200-price').textContent = `$${Math.round(value).toLocaleString()}`; renderAnchorRatios(); } });
  const daily = readCached('ahr999-input', TTL.ahr999);
  if (daily) applyCached('ahr999', daily, applyDaily);
  else applyCached('ahr999', readCached('ahr999', TTL.ahr999), value => { if (finitePositive(value)) state.ahr999 = value; renderAhr999(); });
  applyCached('bp', readCached('bp', TTL.bp), applyBp);
  for (const name of Object.keys(METRIC_CONFIG)) applyCached(name, readCached(name, TTL[name]), value => applyMetric(name, value));
  applyCached('mvrvz', readCached('mvrvz', TTL.mvrvz), value => applyMetric('mvrvz', value));
  applyCached('fng', readCached('fng', TTL.fng), applyFng);
  applyCached('halving', readCached('halving', TTL.halving), applyHalving);
  applyCached('probs', readCached('probs', TTL.probs), applyProbs);
  const mstrRaw = readCached('mstr-mnav-input', TTL.mnav);
  const bmnrRaw = readCached('bmnr-mnav-input', TTL.mnav);
  const combined = readCached('mnav', TTL.mnav);
  const restoreRawMnav = (company, cached) => {
    if (!cached) return;
    state.mnavCompanies[company] = { kind: 'raw', value: cached.value, meta: { fetchedAt: cached.fetchedAt, dataAt: cached.dataAt, source: cached.source }, fresh: cached.fresh, cached: true };
  };
  restoreRawMnav('mstr', mstrRaw);
  restoreRawMnav('bmnr', bmnrRaw);
  if (combined?.value) {
    if (!mstrRaw && combined.value.mstr) restoreRawMnav('mstr', { value: combined.value.mstr, record: combined.record, fresh: combined.fresh, fetchedAt: combined.fetchedAt, dataAt: combined.dataAt, source: combined.source });
    if (!bmnrRaw && combined.value.bmnr && finitePositive(combined.value.ethPrice)) restoreRawMnav('bmnr', { value: { ...combined.value.bmnr, ethPrice: combined.value.ethPrice }, record: combined.record, fresh: combined.fresh, fetchedAt: combined.fetchedAt, dataAt: combined.dataAt, source: combined.source });
  }
  const legacyMstr = readCached('mstr-mnav', TTL['mstr-mnav']);
  const legacyBmnr = readCached('bmnr-mnav', TTL['bmnr-mnav']);
  if (!state.mnavCompanies.mstr && legacyMstr?.value && validLegacyMstr(legacyMstr.value)) {
    state.mnavCompanies.mstr = { kind: 'derived', value: { legacy: true, basic: finitePositive(legacyMstr.value.basic) ? legacyMstr.value.basic : null, ev: finitePositive(legacyMstr.value.ev) ? legacyMstr.value.ev : finitePositive(legacyMstr.value.mnav) ? legacyMstr.value.mnav : null, holdings: legacyMstr.value.holdings, stockPrice: legacyMstr.value.price }, meta: { fetchedAt: legacyMstr.fetchedAt, dataAt: legacyMstr.dataAt, source: legacyMstr.source }, fresh: legacyMstr.fresh, cached: true };
  }
  if (!state.mnavCompanies.bmnr && legacyBmnr?.value && validLegacyBmnr(legacyBmnr.value)) {
    state.mnavCompanies.bmnr = { kind: 'derived', value: { mnav: legacyBmnr.value.mnav, holdings: legacyBmnr.value.eth, stockPrice: legacyBmnr.value.price }, meta: { fetchedAt: legacyBmnr.fetchedAt, dataAt: legacyBmnr.dataAt, source: legacyBmnr.source }, fresh: legacyBmnr.fresh, cached: true };
  }
  const latestMnav = [state.mnavCompanies.mstr, state.mnavCompanies.bmnr].filter(Boolean).sort((a, b) => b.meta.fetchedAt - a.meta.fetchedAt)[0];
  if (latestMnav) { state.meta.mnav = latestMnav.meta; markAvailable('mnav', true, latestMnav.meta); }
  renderMnav();
  const flywheel = readCached('strc-flywheel', TTL['strc-flywheel']);
  const issuance = readCached('strc-issuance', TTL['strc-issuance']);
  if (flywheel) applyCached('strc-flywheel', flywheel, renderStrcFlywheel);
  if (issuance) applyCached('strc-issuance', issuance, renderStrcIssuance);
  if (!flywheel || !issuance) {
    const legacyStrc = readCached('strc', TTL['strc-flywheel']);
    if (legacyStrc?.value) {
      if (!flywheel && legacyStrc.value.fw) {
        try {
          const normalized = parseFlywheelPayload(legacyStrc.value.fw);
          renderStrcFlywheel(normalized.value);
          state.meta['strc-flywheel'] = { fetchedAt: legacyStrc.fetchedAt, dataAt: legacyStrc.dataAt, source: legacyStrc.source };
          markAvailable('strc-flywheel', legacyStrc.fresh, state.meta['strc-flywheel']);
          setAreaStatus('strc-flywheel', legacyStrc.fresh ? 'cached' : 'stale', state.meta['strc-flywheel']);
        } catch (_) {}
      }
      if (!issuance && legacyStrc.value.iss) {
        try {
          const normalized = parseIssuancePayload(legacyStrc.value.iss);
          renderStrcIssuance(normalized.value);
          state.meta['strc-issuance'] = { fetchedAt: legacyStrc.fetchedAt, dataAt: legacyStrc.dataAt, source: legacyStrc.source };
          markAvailable('strc-issuance', legacyStrc.fresh, state.meta['strc-issuance']);
          setAreaStatus('strc-issuance', legacyStrc.fresh ? 'cached' : 'stale', state.meta['strc-issuance']);
        } catch (_) {}
      }
    }
  }
  renderCorr();
  renderVwap();
  computeCyclePendulum();
}

function task(key, run) {
  return { key, intervalMs: INTERVAL[key], initialDelayMs: 0, run };
}

function makeTasks() {
  return [
    task('price', async () => commit('price', await fetchPrice(), applyPrice)),
    task('hashrate', async () => commit('hashrate', await fetchHashrate(), applyHashrate)),
    task('wma200', async () => commitRaw('wma200', 'wma200-input', await fetchWeeklyCandles(), applyWma)),
    task('ahr999', async () => commitRaw('ahr999', 'ahr999-input', await fetchDailyCandles(), applyDaily)),
    task('bp', async () => commit('bp', await fetchBalancedPrice(), applyBp)),
    task('mvrv', async () => commit('mvrv', await fetchMvrv(), (value) => applyMetric('mvrv', value))),
    task('mvrvz', async () => commit('mvrvz', await fetchMvrvZ(), (value) => applyMetric('mvrvz', value))),
    task('sopr', async () => commit('sopr', await fetchSopr(), (value) => applyMetric('sopr', value))),
    task('puell', async () => commit('puell', await fetchPuell(), (value) => applyMetric('puell', value))),
    task('fng', async () => commit('fng', await fetchFearGreed(), applyFng)),
    task('halving', async () => commit('halving', await fetchHalving(), applyHalving)),
    task('probs', async () => commit('probs', await fetchProbabilities(), applyProbs)),
    task('mnav', async () => commitMnav(await fetchMnav())),
    task('strc-flywheel', async () => commit('strc-flywheel', await fetchStrcFlywheel(), renderStrcFlywheel)),
    task('strc-issuance', async () => commit('strc-issuance', await fetchStrcIssuance(), renderStrcIssuance))
  ];
}

function clearTaskDisplay(key) {
  if (key === 'fng') {
    if ($('fng-value')) $('fng-value').textContent = '--';
    if ($('fng-status')) $('fng-status').textContent = '暂无数据';
    if ($('fng-desc')) $('fng-desc').textContent = '数据暂不可用';
  }
  if (key === 'strc-flywheel') {
    if ($('strc-price')) $('strc-price').textContent = '$--';
    if ($('strc-score')) $('strc-score').textContent = '--/100';
    if ($('strc-reasons')) $('strc-reasons').textContent = '数据暂不可用';
  }
  if (key === 'strc-issuance' && $('strc-atm')) $('strc-atm').textContent = '$--';
  if (key === 'mnav') {
    if ($('mstr-mnav')) $('mstr-mnav').textContent = '--';
    if ($('bmnr-mnav')) $('bmnr-mnav').textContent = '--';
    if ($('mstr-detail')) $('mstr-detail').textContent = '数据暂不可用：缺少有效 BTC 价格或完整字段';
    if ($('bmnr-detail')) $('bmnr-detail').textContent = '数据暂不可用：缺少可靠 ETH 价格或完整字段';
  }
  if (['mvrv', 'mvrvz', 'sopr', 'puell'].includes(key)) {
    const config = METRIC_CONFIG[key];
    if ($(config.id)) $(config.id).textContent = '--';
    if ($(config.note)) $(config.note).textContent = '数据暂不可用';
    state.metrics[key] = null;
  }
  if (key === 'fng' || ['mvrv', 'mvrvz', 'sopr', 'puell'].includes(key)) computeCyclePendulum();
}

function onSchedulerStatus(status) {
  if (status.key === 'mnav') {
    for (const company of ['mstr', 'bmnr']) {
      const entry = state.mnavCompanies[company];
      if (status.phase === 'loading') {
        setMnavStatus(company, entry ? (isCurrentMnavCompany(entry) ? 'cached' : 'stale') : 'loading', entry?.meta || status);
        if (entry) {
          const node = statusNode(company === 'mstr' ? '#mstr-mnav' : '#bmnr-mnav');
          if (node) node.textContent += ' · 更新中…';
        }
      } else if (status.phase === 'unavailable') {
        setMnavStatus(company, entry && isCurrentMnavCompany(entry) ? 'stale' : entry ? 'stale' : 'unavailable', { ...(entry?.meta || {}), error: status.error?.message });
      }
    }
    if (status.phase === 'unavailable') refreshDerived();
    return;
  }
  const known = state.meta[status.key];
  if (status.phase === 'loading') {
    if (known) {
      setAreaStatus(status.key, state.available[status.key] ? 'cached' : 'stale', known);
      for (const target of TASK_AREA[status.key] || []) { const node = statusNode(target); if (node) node.textContent += ' · 更新中…'; }
    } else setAreaStatus(status.key, 'loading', status);
  } else if (status.phase === 'unavailable') {
    setAreaStatus(status.key, state.available[status.key] ? 'stale' : 'unavailable', { ...status, ...(state.meta[status.key] || {}), error: status.error?.message });
    if (!known) clearTaskDisplay(status.key);
    refreshDerived();
  }
}

function setupSlider() {
  const slider = $('electricity');
  if (!slider) return;
  const updateLabels = () => {
    const value = Number(slider.value);
    if (!finite(value)) return;
    const text = `$${value.toFixed(3)}`;
    if ($('elec-value')) $('elec-value').textContent = `${text}/kWh`;
    if ($('elec-display')) $('elec-display').textContent = text;
    scheduleMiningRender();
  };
  slider.addEventListener('input', updateLabels, { passive: true });
  updateLabels();
}

function setupLifecycle() {
  const active = () => document.visibilityState !== 'hidden' && globalThis.navigator?.onLine !== false;
  scheduler = createScheduler({
    tasks: makeTasks(),
    now: () => Date.now(),
    setTimer: globalThis.setTimeout,
    clearTimer: globalThis.clearTimeout,
    isActive: active,
    onStatus: onSchedulerStatus
  });
  document.addEventListener('visibilitychange', () => { refreshDerived(); if (active()) scheduler.refreshDue(); });
  globalThis.addEventListener?.('online', () => { refreshDerived(); scheduler.refreshDue(); });
  globalThis.addEventListener?.('offline', () => {});
  scheduler.start();
  scheduleExpiryRefresh();
}

function setupSkipLink() {
  const link = document.querySelector('.skip-link');
  const main = $('main-content');
  if (!link || !main) return;
  link.addEventListener('click', () => globalThis.requestAnimationFrame?.(() => main.focus()));
}

export function bootDashboard() {
  if (typeof document === 'undefined') return null;
  store = createStore({ storage: safeStorage(), now: () => Date.now(), validators: {
    price: value => finitePositive(value?.price),
    hashrate: value => finitePositive(value?.difficulty ?? value?.diff) && finitePositive(value?.hashrate ?? (finitePositive(Number(value?.hr)) ? Number(value.hr) * 1e18 : null)),
    bp: value => finitePositive(value),
    mvrv: value => finite(value) && value > 0,
    mvrvz: value => finite(value),
    sopr: value => finite(value) && value > 0,
    puell: value => finite(value) && value > 0,
    fng: value => finite(value) && value >= 0 && value <= 100,
    ahr999: value => finitePositive(value),
    'mvrvz-input': value => finite(value),
    'wma200-input': validCandleCache,
    'ahr999-input': validCandleCache,
    'mstr-mnav-input': validMstrInput,
    'bmnr-mnav-input': validBmnrInput,
    'mstr-mnav': validLegacyMstr,
    'bmnr-mnav': validLegacyBmnr,
    mnav: isValidMnavValue,
    halving: value => Boolean(value && Number.isInteger(value.height) && finite(value.days) && finite(value.progress)),
    probs: value => Boolean(value && typeof value === 'object' && Object.values(value).every(probability => finite(probability) && probability >= 0 && probability <= 1)),
    'strc-flywheel': isValidFlywheelValue,
    'strc-issuance': isValidIssuanceValue
  } });
  cycleTargets = createCycleTargets($('targets'));
  restoreCache();
  setupSlider();
  setupSkipLink();
  setupLifecycle();
  scheduleMiningRender();
  return { scheduler, store, state };
}

if (typeof document !== 'undefined') bootDashboard();

export { computeCyclePendulum, deriveMnav, pendNorm, renderMining, state };
