import { requestJson, raceSources } from './runtime.mjs';

const API = Object.freeze({
  binancePrice: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
  okxPrice: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
  coingeckoPrice: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
  blockchainPrice: 'https://blockchain.info/ticker',
  hashrate: 'https://mempool.space/api/v1/mining/hashrate/3d',
  weeklyBinance: 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=200',
  weeklyOkx: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1W&limit=200',
  dailyBinance: 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=200',
  dailyOkx: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1D&limit=200',
  mvrv: 'https://looknode-proxy.corms-cushier-0l.workers.dev/mCapRealizedRatio',
  sopr: 'https://looknode-proxy.corms-cushier-0l.workers.dev/sopr',
  puell: 'https://looknode-proxy.corms-cushier-0l.workers.dev/puellMultiple',
  balancedPrice: 'https://looknode-proxy.corms-cushier-0l.workers.dev/balancedPrice',
  mvrvz: 'https://btc-cache.corms-cushier-0l.workers.dev/latest',
  mnav: 'https://looknode-proxy.corms-cushier-0l.workers.dev/api/mnav',
  fng: 'https://api.alternative.me/fng/?limit=1',
  height: 'https://mempool.space/api/blocks/tip/height',
  probabilities: 'https://probs.fuckbtc.com/api/data',
  forecast2027: 'https://probs.fuckbtc.com/api/forecast/2027',
  strcFlywheel: 'https://flywheel-monitor.pages.dev/snapshot.json',
  strcIssuance: 'https://mstr.fuckbtc.com/snapshot.json'
});

const NUMBER = Number.isFinite;

function number(value) {
  if (typeof value === 'number') return NUMBER(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return NUMBER(parsed) ? parsed : null;
  }
  return null;
}

function positive(value) {
  const parsed = number(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function timestamp(value) {
  if (typeof value === 'string' && value.trim() !== '' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsedDate = Date.parse(value);
    return Number.isFinite(parsedDate) && parsedDate > 0 ? parsedDate : null;
  }
  const parsed = number(value);
  if (parsed == null || parsed <= 0) return null;
  return parsed < 1e12 ? parsed * 1000 : parsed;
}

function explicitSourceDate(...objects) {
  for (const object of objects) {
    if (!object || typeof object !== 'object') continue;
    for (const key of ['source_as_of', 'official_mnav_as_of', 'mnav_as_of', 'data_as_of', 'dataAt', 'mvrvz_date']) {
      const value = timestamp(object[key]);
      if (value != null) return value;
    }
  }
  return null;
}

export function sourceDate(...objects) {
  for (const object of objects) {
    if (!object || typeof object !== 'object') continue;
    for (const key of ['source_as_of', 'official_mnav_as_of', 'mnav_as_of', 'data_as_of', 'dataAt', 'timestamp', 'ts', 'time', 'updated_at']) {
      const value = timestamp(object[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function record(value, source, dataAt = null) {
  return { value, source, dataAt };
}

function request(url, options = {}) {
  const { signal, timeoutMs = 8000, fetchImpl } = options;
  return requestJson(url, { signal, timeoutMs, fetchImpl });
}

function invalid(message) {
  throw new Error(message);
}

function finitePositive(value, label) {
  const parsed = positive(value);
  if (parsed == null) invalid(`invalid ${label}`);
  return parsed;
}

export function parsePricePayload(payload, source = 'unknown') {
  let price;
  let changePct = 0;
  let dataAt = sourceDate(payload);
  if (source === 'binance') {
    price = positive(payload?.lastPrice);
    changePct = number(payload?.priceChangePercent) ?? 0;
  } else if (source === 'okx') {
    const ticker = payload?.data?.[0];
    price = positive(ticker?.last);
    const opened = positive(ticker?.open24h);
    changePct = opened && price ? ((price - opened) / opened) * 100 : 0;
    dataAt = sourceDate(ticker, payload);
  } else if (source === 'coingecko') {
    price = positive(payload?.bitcoin?.usd);
    changePct = number(payload?.bitcoin?.usd_24h_change) ?? 0;
    dataAt = sourceDate(payload?.bitcoin, payload);
  } else if (source === 'blockchain') {
    price = positive(payload?.USD?.last);
    dataAt = sourceDate(payload?.USD, payload);
  } else {
    price = positive(payload?.price ?? payload?.lastPrice ?? payload?.last);
    changePct = number(payload?.changePct ?? payload?.priceChangePercent) ?? 0;
  }
  if (price == null) invalid(`invalid ${source} price`);
  if (!NUMBER(changePct)) changePct = 0;
  return record({ price, changePct, chg: changePct }, source, dataAt);
}

export function parseHashratePayload(payload, source = 'mempool') {
  const difficulty = finitePositive(payload?.currentDifficulty, 'difficulty');
  const hashrate = finitePositive(payload?.currentHashrate, 'hashrate');
  return record({ difficulty, hashrate, eh: hashrate / 1e18 }, source, sourceDate(payload));
}

function candleClose(candle) {
  if (!Array.isArray(candle) || candle.length < 5) return null;
  const ts = timestamp(candle[0]);
  if (ts == null || ts > Date.now() + 86400000) return null;
  return { close: positive(candle[4]), ts };
}

function normalizeCandles(candles, source, reverse = false) {
  if (!Array.isArray(candles) || candles.length < 200) invalid(`${source} requires 200 candles`);
  const selected = reverse ? candles.slice(0, 200) : candles.slice(-200);
  const normalized = selected.map(candleClose);
  if (normalized.some(item => !item || item.close == null)) invalid(`${source} contains an invalid close`);
  const ordered = reverse ? [...normalized].reverse() : normalized;
  const closes = ordered.map(item => item.close);
  const lastTs = ordered.at(-1)?.ts ?? null;
  return record({ closes, lastTs, count: closes.length }, source, lastTs);
}

export function parseBinanceCandles(payload, source = 'binance') {
  return normalizeCandles(payload, source, false);
}

export function parseOkxCandles(payload, source = 'okx') {
  return normalizeCandles(payload?.data, source, true);
}

export function average(closes) {
  if (!Array.isArray(closes) || closes.length < 200 || closes.some(v => !NUMBER(v) || v <= 0)) {
    invalid('at least 200 finite positive closes are required');
  }
  const result = closes.reduce((sum, close) => sum + close, 0) / closes.length;
  if (!NUMBER(result) || result <= 0) invalid('candle average overflowed');
  return result;
}

export function parseMetricSeries(payload, name, options = {}) {
  if (!payload || payload.code !== 100 || !Array.isArray(payload.data) || payload.data.length === 0) {
    invalid(`invalid ${name} response`);
  }
  const last = payload.data.at(-1);
  const value = number(last?.v);
  if (value == null || (options.positive && value <= 0)) invalid(`invalid ${name} value`);
  return record(value, name, sourceDate(last, payload));
}

export function parseMvrvzPayload(payload) {
  const value = number(payload?.mvrvz);
  if (value == null) invalid('invalid MVRV-Z value');
  return record(value, 'mvrvz', explicitSourceDate(payload));
}

export function parseFearGreedPayload(payload) {
  const item = payload?.data?.[0];
  const value = number(item?.value);
  if (value == null || value < 0 || value > 100) invalid('invalid fear and greed value');
  return record(value, 'fng', sourceDate(item, payload));
}

export function parseProbabilitiesPayload(payload) {
  const downside = payload?.survival?.downside;
  if (!Array.isArray(downside)) invalid('invalid probabilities response');
  const map = {};
  for (const item of downside) {
    const strike = number(item?.strike);
    const probability = number(item?.probability);
    if (strike == null || probability == null || probability < 0 || probability > 1) continue;
    map[strike] = probability;
  }
  if (Object.keys(map).length === 0) invalid('probabilities response has no valid entries');
  return record(map, 'probabilities', sourceDate(payload));
}

export function parseHalvingHeight(payload) {
  const height = number(payload);
  if (height == null || height <= 0 || !Number.isInteger(height)) invalid('invalid block height');
  const interval = 210000;
  const next = (Math.floor(height / interval) + 1) * interval;
  const remaining = next - height;
  const days = Math.round((remaining * 10) / (60 * 24));
  const estimated = new Date(Date.now() + days * 86400000);
  const date = `${estimated.getFullYear()}-${String(estimated.getMonth() + 1).padStart(2, '0')}-${String(estimated.getDate()).padStart(2, '0')}`;
  const previous = next - interval;
  return record({ days, height, date, progress: ((height - previous) / interval) * 100 }, 'halving', null);
}

function companyField(object, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object || {}, key)) return object[key];
  }
  return undefined;
}

function parseMstr(object) {
  if (!object || typeof object !== 'object') return null;
  const holdings = positive(companyField(object, 'btc_holdings', 'btcHoldings'));
  const stockPrice = positive(companyField(object, 'stock_price', 'stockPrice'));
  const shares = positive(object.shares);
  const officialMnav = positive(companyField(object, 'official_mnav', 'officialMnav'));
  const officialMnavAsOf = timestamp(companyField(object, 'official_mnav_as_of', 'officialMnavAsOf', 'mnav_as_of'));
  // source_as_of is a structured provenance object on the Worker contract
  // ({home, shares, ledger, notes}); preserve it verbatim.  The headline date
  // comes only from official_mnav_as_of.
  const sourceAsOf = companyField(object, 'source_as_of', 'sourceAsOf') ?? null;
  const basicShares = positive(companyField(object, 'basic_shares', 'basicShares'));
  const assumedDilutedShares = positive(companyField(object, 'assumed_diluted_shares', 'assumedDilutedShares'));
  const fullyDilutedShares = positive(companyField(object, 'fully_diluted_shares', 'fullyDilutedShares'));
  const hasLegacy = holdings != null && stockPrice != null && shares != null;
  if (!hasLegacy && officialMnav == null) return null;
  const debt = number(object.debt);
  const pref = number(object.pref ?? object.preferred);
  const cash = number(object.cash);
  if (![debt, pref, cash].every(validOptionalNumber)) return null;
  return {
    holdings,
    stockPrice,
    shares,
    debt,
    pref,
    cash,
    officialMnav,
    officialMnavAsOf,
    sourceAsOf,
    source: typeof object.source === 'string' && object.source.trim() ? object.source : null,
    basicShares,
    assumedDilutedShares,
    fullyDilutedShares,
    dataAt: sourceDate(object)
  };
}

function parseBmnr(object) {
  if (!object || typeof object !== 'object') return null;
  const holdings = positive(companyField(object, 'eth_holdings', 'ethHoldings'));
  const stockPrice = positive(companyField(object, 'stock_price', 'stockPrice'));
  const shares = positive(object.shares);
  if (holdings == null || stockPrice == null || shares == null) return null;
  return { holdings, stockPrice, shares, dataAt: sourceDate(object) };
}

export function parseMnavPayload(payload) {
  const mstr = parseMstr(payload?.mstr);
  const ethPrice = positive(payload?.eth_price);
  const bmnr = ethPrice == null ? null : parseBmnr(payload?.bmnr);
  if (!mstr && !bmnr) invalid('mNAV response has no complete company record');
  return record({ mstr, bmnr, ethPrice }, 'mnav', sourceDate(payload, payload?.mstr, payload?.bmnr));
}

function validOptionalNumber(value) {
  return value == null || NUMBER(value);
}

export function isValidMnavValue(value) {
  if (!value || typeof value !== 'object') return false;
  let validCompany = false;
  if (value.mstr != null) {
    const m = value.mstr;
    if (!m || typeof m !== 'object') return false;
    const hasOfficial = NUMBER(m.officialMnav) && m.officialMnav > 0;
    const hasLegacy = [m.holdings, m.stockPrice, m.shares].every(v => NUMBER(v) && v > 0);
    if (!hasOfficial && !hasLegacy) return false;
    if (m.officialMnav != null && (!NUMBER(m.officialMnav) || m.officialMnav <= 0)) return false;
    if (m.officialMnavAsOf != null && (!NUMBER(m.officialMnavAsOf) || m.officialMnavAsOf <= 0)) return false;
    if (![m.holdings, m.stockPrice, m.shares].every(validOptionalNumber)) return false;
    if (![m.basicShares, m.assumedDilutedShares, m.fullyDilutedShares].every(v => v == null || (NUMBER(v) && v > 0))) return false;
    if (![m.debt, m.pref, m.cash].every(validOptionalNumber)) return false;
    validCompany = true;
  }
  if (value.bmnr != null) {
    const b = value.bmnr;
    if (!b || typeof b !== 'object' || ![b.holdings, b.stockPrice, b.shares].every(v => NUMBER(v) && v > 0) || !NUMBER(value.ethPrice) || value.ethPrice <= 0) return false;
    validCompany = true;
  }
  return validCompany;
}

export function deriveMnav(data, btcPrice) {
  const result = { mstr: null, bmnr: null };
  if (data?.mstr) {
    const m = data.mstr;
    const official = NUMBER(m.officialMnav) && m.officialMnav > 0 ? {
      officialMnav: m.officialMnav,
      officialMnavAsOf: m.officialMnavAsOf ?? null,
      sourceAsOf: m.sourceAsOf ?? m.dataAt ?? null,
      source: m.source ?? 'mnav'
    } : null;
    const legacy = positive(btcPrice) && positive(m.holdings) && positive(m.stockPrice) && positive(m.shares)
      ? (() => {
        const btcValue = m.holdings * btcPrice;
        const marketCap = m.stockPrice * m.shares;
        const basic = marketCap / btcValue;
        const ev = [m.debt, m.pref, m.cash].every(v => v != null)
          ? (marketCap + m.debt + m.pref - m.cash) / btcValue
          : null;
        return NUMBER(basic) && basic > 0 ? {
          basic,
          ev: NUMBER(ev) && ev > 0 ? ev : null,
          holdings: m.holdings,
          stockPrice: m.stockPrice,
          legacy: true
        } : null;
      })()
      : null;
    if (official || legacy) {
      result.mstr = { ...(official || {}), ...(legacy || {}) };
    }
  }
  if (data?.bmnr && positive(data.ethPrice)) {
    const b = data.bmnr;
    const ethValue = b.holdings * data.ethPrice;
    const marketCap = b.stockPrice * b.shares;
    const mnav = marketCap / ethValue;
    if (NUMBER(mnav) && mnav > 0) result.bmnr = { mnav, holdings: b.holdings, stockPrice: b.stockPrice, ethPrice: data.ethPrice };
  }
  return result;
}

function parsePartialObject(payload, source, predicate) {
  if (!payload || typeof payload !== 'object') invalid(`invalid ${source} response`);
  if (!predicate(payload)) invalid(`empty ${source} response`);
  return record(payload, source, sourceDate(payload));
}

export function parseFlywheelPayload(payload) {
  if (!payload || typeof payload !== 'object') invalid('invalid strc-flywheel response');
  const value = {};
  const strc = payload.strc;
  if (strc && typeof strc === 'object') {
    const price = positive(strc.price);
    const changePct = number(strc.change_pct);
    if (price != null) value.strc = { price, ...(changePct != null ? { change_pct: changePct } : {}) };
  }
  const score = number(payload.flywheel_score);
  if (score != null && score >= 0 && score <= 100) value.flywheel_score = score;
  if (Array.isArray(payload.reasons)) {
    const reasons = payload.reasons.filter(reason => typeof reason === 'string' && reason.trim());
    if (reasons.length) value.reasons = reasons;
  }
  const metrics = payload.strategy_official?.strc_metrics;
  const shares = positive(metrics?.shares);
  if (shares != null) value.strategy_official = { strc_metrics: { shares } };
  const runway = payload.strc_runway;
  if (runway && typeof runway === 'object') {
    const normalized = {};
    for (const key of ['runway_months', 'runway_months_conservative', 'monthly_dividend']) {
      const parsed = number(runway[key]);
      if (parsed != null) normalized[key] = parsed;
    }
    if (Object.keys(normalized).length) value.strc_runway = normalized;
  }
  const globalRunway = payload.global_runway;
  if (globalRunway && typeof globalRunway === 'object') {
    const normalized = {};
    for (const key of ['runway_months', 'cash', 'annual_cash_need', 'headroom_to_9m', 'headroom_to_6m', 'debt_interest_rate']) {
      const parsed = number(globalRunway[key]);
      if (parsed != null) normalized[key] = parsed;
    }
    if (typeof globalRunway.status === 'string' && globalRunway.status.trim()) normalized.status = globalRunway.status;
    if (Object.keys(normalized).length) value.global_runway = normalized;
  }
  if (!Object.keys(value).length) invalid('empty strc-flywheel response');
  return record(value, 'strc-flywheel', explicitSourceDate(payload));
}

export function isValidFlywheelValue(value) {
  if (!value || typeof value !== 'object') return false;
  let valid = false;
  if (value.strc != null) {
    if (!value.strc || !NUMBER(value.strc.price) || value.strc.price <= 0 || (value.strc.change_pct != null && !NUMBER(value.strc.change_pct))) return false;
    valid = true;
  }
  if (value.flywheel_score != null) {
    if (!NUMBER(value.flywheel_score) || value.flywheel_score < 0 || value.flywheel_score > 100) return false;
    valid = true;
  }
  if (value.reasons != null) {
    if (!Array.isArray(value.reasons) || value.reasons.some(reason => typeof reason !== 'string')) return false;
    valid = valid || value.reasons.length > 0;
  }
  const shares = value.strategy_official?.strc_metrics?.shares;
  if (shares != null) {
    if (!NUMBER(shares) || shares <= 0) return false;
    valid = true;
  }
  for (const group of [value.strc_runway, value.global_runway]) {
    if (group == null) continue;
    if (typeof group !== 'object') return false;
    for (const key of ['runway_months', 'runway_months_conservative', 'monthly_dividend', 'cash', 'annual_cash_need', 'headroom_to_9m', 'headroom_to_6m', 'debt_interest_rate']) {
      if (group[key] != null && !NUMBER(group[key])) return false;
    }
    valid = true;
  }
  return valid;
}

function validMstrSnapshot(value) {
  return Boolean(value && NUMBER(value.officialMnav) && value.officialMnav > 0
    && NUMBER(value.officialMnavAsOf) && value.officialMnavAsOf > 0
    && NUMBER(value.snapshotAt) && value.snapshotAt > 0);
}

export function isCurrentMstrSnapshot(value, now = Date.now()) {
  return validMstrSnapshot(value) && [value.snapshotAt, value.officialMnavAsOf]
    .every(date => date <= now + 60000 && now - date <= 7 * 86400000);
}

function parseMstrSnapshot(payload) {
  const snapshotAt = timestamp(payload?.ts);
  // Only explicitly reported mNAV qualifies; Basic/EV ratios are not substitutes.
  for (const item of [payload?.mnav, payload?.strategy_official]) {
    const date = item?.data_as_of;
    const usDate = typeof date === 'string' && date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const officialMnavAsOf = timestamp(usDate
      ? `${usDate[3]}-${usDate[1].padStart(2, '0')}-${usDate[2].padStart(2, '0')}` : date);
    const value = { officialMnav: positive(item?.mnav_official), officialMnavAsOf, snapshotAt };
    if (isCurrentMstrSnapshot(value)) return value;
  }
  return null;
}

export function parseIssuancePayload(payload) {
  const issuance = payload?.issuance ?? payload;
  const amount = number(issuance?.parsed?.strc?.atm_remaining_m);
  const mstrSnapshot = parseMstrSnapshot(payload);
  const atmRemainingM = amount != null && amount >= 0 ? amount : null;
  if (atmRemainingM == null && !mstrSnapshot) invalid('invalid STRC issuance response');
  return record({ atmRemainingM, ...(mstrSnapshot ? { mstrSnapshot } : {}) }, 'strc-issuance', sourceDate(issuance));
}

export function isValidIssuanceValue(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.mstrSnapshot != null && !validMstrSnapshot(value.mstrSnapshot)) return false;
  if (value.atmRemainingM == null) return validMstrSnapshot(value.mstrSnapshot);
  return NUMBER(value.atmRemainingM) && value.atmRemainingM >= 0;
}

export function isValidForecast2027(value) {
  return Boolean(value && value.year === 2027 && value.semantics === 'touch_by_2027_end'
    && ['fresh', 'partial', 'stale'].includes(value.status) && NUMBER(value.fetchedAt) && value.fetchedAt > 0
    && value.fetchedAt <= Date.now() + 60000 && Array.isArray(value.markets) && value.markets.length > 0
    && value.markets.every(m => [100000, 150000].includes(m.threshold) && NUMBER(m.probability) && m.probability >= 0 && m.probability <= 1));
}

export function parseForecast2027(payload) {
  const value = {
    year: payload?.year, semantics: payload?.semantics, status: payload?.status,
    fetchedAt: timestamp(payload?.fetchedAt),
    markets: Array.isArray(payload?.markets) ? payload.markets.map(m => ({
      threshold: number(m.threshold), probability: number(m.probability),
      volume: number(m.volume), liquidity: number(m.liquidity), updatedAt: timestamp(m.updatedAt)
    })) : []
  };
  if (!isValidForecast2027(value)) invalid('2027 prediction data unavailable');
  return record(value, 'prediction-market-2027', value.fetchedAt);
}

export function deriveAhr999(price, dailyCandles) {
  const btcPrice = positive(price);
  if (btcPrice == null || !dailyCandles?.closes) return null;
  const dma200 = average(dailyCandles.closes);
  const lastTs = timestamp(dailyCandles.lastTs) ?? Date.now();
  const genesis = Date.parse('2009-01-03T00:00:00Z');
  const coinDays = Math.floor((lastTs - genesis) / 86400000);
  if (coinDays <= 0) return null;
  const expected = 10 ** (5.84 * Math.log10(coinDays) - 17.01);
  const value = (btcPrice / dma200) * (btcPrice / expected);
  return NUMBER(value) && value > 0 ? value : null;
}

export async function fetchPrice(options = {}) {
  const sources = [
    signal => request(API.binancePrice, { ...options, signal, timeoutMs: 5000 }).then(data => parsePricePayload(data, 'binance')),
    signal => request(API.okxPrice, { ...options, signal, timeoutMs: 5000 }).then(data => parsePricePayload(data, 'okx'))
  ];
  try {
    return await raceSources(sources);
  } catch (_) {
    for (const [url, source] of [[API.coingeckoPrice, 'coingecko'], [API.blockchainPrice, 'blockchain']]) {
      try {
        return parsePricePayload(await request(url, { ...options, timeoutMs: 5000 }), source);
      } catch (_) { /* continue to the next bounded fallback */ }
    }
    throw new Error('all price sources unavailable');
  }
}

export function fetchHashrate(options = {}) {
  return request(API.hashrate, { ...options, timeoutMs: 8000 }).then(data => parseHashratePayload(data));
}

export function fetchWeeklyCandles(options = {}) {
  return raceSources([
    signal => request(API.weeklyBinance, { ...options, signal, timeoutMs: 8000 }).then(data => parseBinanceCandles(data, 'binance-weekly')),
    signal => request(API.weeklyOkx, { ...options, signal, timeoutMs: 8000 }).then(data => parseOkxCandles(data, 'okx-weekly'))
  ]);
}

export function fetchDailyCandles(options = {}) {
  return raceSources([
    signal => request(API.dailyBinance, { ...options, signal, timeoutMs: 8000 }).then(data => parseBinanceCandles(data, 'binance-daily')),
    signal => request(API.dailyOkx, { ...options, signal, timeoutMs: 8000 }).then(data => parseOkxCandles(data, 'okx-daily'))
  ]);
}

export function fetchMvrv(options = {}) {
  return request(API.mvrv, { ...options, timeoutMs: 10000 }).then(data => parseMetricSeries(data, 'mvrv', { positive: true }));
}

export function fetchSopr(options = {}) {
  return request(API.sopr, { ...options, timeoutMs: 10000 }).then(data => parseMetricSeries(data, 'sopr', { positive: true }));
}

export function fetchPuell(options = {}) {
  return request(API.puell, { ...options, timeoutMs: 10000 }).then(data => parseMetricSeries(data, 'puell', { positive: true }));
}

export function fetchBalancedPrice(options = {}) {
  return request(API.balancedPrice, { ...options, timeoutMs: 10000 }).then(data => parseMetricSeries(data, 'bp', { positive: true }));
}

export function fetchMvrvZ(options = {}) {
  return request(API.mvrvz, { ...options, timeoutMs: 10000 }).then(parseMvrvzPayload);
}

export function fetchFearGreed(options = {}) {
  return request(API.fng, { ...options, timeoutMs: 8000 }).then(parseFearGreedPayload);
}

export function fetchHalving(options = {}) {
  return request(API.height, { ...options, timeoutMs: 8000 }).then(parseHalvingHeight);
}

export function fetchProbabilities(options = {}) {
  return request(API.probabilities, { ...options, timeoutMs: 10000 }).then(parseProbabilitiesPayload);
}

export function fetchMnav(options = {}) {
  return request(API.mnav, { ...options, timeoutMs: 15000 }).then(parseMnavPayload);
}

export function fetchStrcFlywheel(options = {}) {
  return request(API.strcFlywheel, { ...options, timeoutMs: 10000 }).then(parseFlywheelPayload);
}

export function fetchStrcIssuance(options = {}) {
  return request(API.strcIssuance, { ...options, timeoutMs: 10000 }).then(parseIssuancePayload);
}

export function fetchForecast2027(options = {}) {
  return request(API.forecast2027, { ...options, timeoutMs: 7000 }).then(parseForecast2027);
}

export { API };
