import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveAhr999,
  deriveMnav,
  average,
  isValidFlywheelValue,
  isCurrentMstrSnapshot,
  isValidIssuanceValue,
  isValidMnavValue,
  parseBinanceCandles,
  parseHalvingHeight,
  parseIssuancePayload,
  parseForecast2027,
  parseMnavPayload,
  parseMvrvzPayload,
  parseOkxCandles,
  parsePricePayload,
  parseProbabilitiesPayload
} from '../assets/data-sources.mjs';

function candles(count = 200, close = 100) {
  return Array.from({ length: count }, (_, index) => [Date.now() - (count - index) * 86400000, '0', '0', '0', String(close + index), '0']);
}

const DAY = 86400000;
const MINUTE = 60000;

function usDateAt(time) {
  const date = new Date(time);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

function utcDateAt(time) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

test('2027 forecast rejects wrong-year, wrong-semantics and invalid probabilities', () => {
  const payload = { year: 2027, semantics: 'touch_by_2027_end', status: 'fresh', fetchedAt: new Date().toISOString(), markets: [{ threshold: 100000, probability: 0.84, volume: 1000, liquidity: 17000 }] };
  assert.equal(parseForecast2027(payload).value.markets[0].probability, 0.84);
  assert.throws(() => parseForecast2027({ ...payload, year: 2026 }));
  assert.throws(() => parseForecast2027({ ...payload, semantics: 'year_end_price' }));
  assert.throws(() => parseForecast2027({ ...payload, markets: [{ threshold: 100000, probability: 1.2 }] }));
});

test('nested public MSTR snapshot preserves the issuance disclosure clock', () => {
  const result = parseIssuancePayload({ ts: '2026-09-05T06:00:00Z', issuance: { ts: '2026-08-31T12:17:21Z', parsed: { strc: { atm_remaining_m: 17510.8 } } } });
  assert.equal(result.value.atmRemainingM, 17510.8);
  assert.equal(result.dataAt, Date.parse('2026-08-31T12:17:21Z'));
});

test('MSTR snapshot keeps explicit official mNAV and date while ignoring generic ratios', () => {
  const now = Date.now();
  const dataAsOf = usDateAt(now - DAY);
  const payload = {
    ts: new Date(now - 5 * MINUTE).toISOString(),
    mnav: {
      mnav_official: 1.15,
      data_as_of: dataAsOf,
      mnav: 9.99,
      basic: 8.88,
      ev: 7.77
    },
    issuance: { parsed: { strc: { atm_remaining_m: 17510.8 } } }
  };

  const result = parseIssuancePayload(payload);
  assert.deepEqual(result.value.mstrSnapshot, {
    officialMnav: 1.15,
    officialMnavAsOf: utcDateAt(now - DAY),
    snapshotAt: Date.parse(payload.ts)
  });
  assert.equal(isValidIssuanceValue(result.value), true);
});

test('official MSTR snapshot remains a usable fallback when ATM is missing', () => {
  const now = Date.now();
  const result = parseIssuancePayload({
    ts: new Date(now - MINUTE).toISOString(),
    mnav: { mnav_official: 1.15, data_as_of: usDateAt(now - DAY) }
  });

  assert.equal(result.value.atmRemainingM, null);
  assert.equal(result.value.mstrSnapshot.officialMnav, 1.15);
  assert.equal(isValidIssuanceValue(result.value), true);
});

test('generic, basic, and EV ratios cannot create an issuance fallback without official mNAV', () => {
  assert.throws(() => parseIssuancePayload({
    ts: new Date(Date.now() - MINUTE).toISOString(),
    mnav: { mnav: 1.15, basic: 1.1, ev: 1.2, data_as_of: usDateAt(Date.now() - DAY) }
  }), /invalid STRC issuance response/);
});

test('valid ATM remains intact when the optional snapshot is missing, stale, future, or invalid', () => {
  const now = Date.now();
  const atmRemainingM = 4321.25;
  const cases = [
    ['missing', {}],
    ['stale', {
      ts: new Date(now - 8 * DAY).toISOString(),
      mnav: { mnav_official: 1.15, data_as_of: usDateAt(now - 8 * DAY) }
    }],
    ['future', {
      ts: new Date(now + 2 * MINUTE).toISOString(),
      mnav: { mnav_official: 1.15, data_as_of: new Date(now + 2 * MINUTE).toISOString() }
    }],
    ['invalid', {
      ts: new Date(now - MINUTE).toISOString(),
      mnav: { mnav_official: 'NaN', data_as_of: 'not-a-date', basic: 1.1, ev: 1.2 }
    }]
  ];

  for (const [label, snapshot] of cases) {
    const result = parseIssuancePayload({
      ...snapshot,
      issuance: { parsed: { strc: { atm_remaining_m: atmRemainingM } } }
    });
    assert.equal(result.value.atmRemainingM, atmRemainingM, label);
    assert.equal('mstrSnapshot' in result.value, false, label);
    assert.equal(isValidIssuanceValue(result.value), true, label);
  }
});

test('issuance cache validator accepts normalized fallback shapes and rejects toxic snapshots', () => {
  const now = Date.parse('2030-01-15T12:00:00Z');
  const snapshot = {
    officialMnav: 1.15,
    officialMnavAsOf: now - DAY,
    snapshotAt: now - MINUTE
  };

  assert.equal(isValidIssuanceValue({ atmRemainingM: 0 }), true);
  assert.equal(isValidIssuanceValue({ atmRemainingM: null, mstrSnapshot: snapshot }), true);
  assert.equal(isValidIssuanceValue({ atmRemainingM: 100, mstrSnapshot: snapshot }), true);
  assert.equal(isValidIssuanceValue({ atmRemainingM: null }), false);
  assert.equal(isValidIssuanceValue({ atmRemainingM: 100, mstrSnapshot: { ...snapshot, officialMnav: NaN } }), false);
});

test('MSTR snapshot freshness uses an injected now and includes the exact seven-day boundary', () => {
  const now = Date.parse('2030-01-15T12:00:00Z');
  const atBoundary = {
    officialMnav: 1.15,
    officialMnavAsOf: now - 7 * DAY,
    snapshotAt: now - 7 * DAY
  };
  assert.equal(isCurrentMstrSnapshot(atBoundary, now), true);
  assert.equal(isCurrentMstrSnapshot({ ...atBoundary, snapshotAt: now - 7 * DAY - 1 }, now), false);
  assert.equal(isCurrentMstrSnapshot({ ...atBoundary, officialMnavAsOf: now + 60000 }, now), true);
  assert.equal(isCurrentMstrSnapshot({ ...atBoundary, officialMnavAsOf: now + 60001 }, now), false);
});

test('historical adapters reject short and invalid close series before averaging', () => {
  assert.throws(() => parseBinanceCandles(candles(199)), /200 candles/);
  const invalid = candles();
  invalid[17][4] = 'NaN';
  assert.throws(() => parseBinanceCandles(invalid), /invalid close/);
  const nonPositive = candles();
  nonPositive[17][4] = '0';
  assert.throws(() => parseBinanceCandles(nonPositive), /invalid close/);
});

test('OKX candle adapter reverses newest-first data and retains source timestamp', () => {
  const rows = candles().reverse();
  const result = parseOkxCandles({ data: rows });
  assert.equal(result.value.count, 200);
  assert.equal(result.value.closes[0], 100);
  assert.equal(result.value.closes.at(-1), 299);
  assert.equal(result.dataAt, result.value.lastTs);
});

test('price parser rejects malformed race candidates and never fabricates a price', () => {
  assert.throws(() => parsePricePayload({ lastPrice: null }, 'binance'), /invalid/);
  assert.throws(() => parsePricePayload({ data: [{ last: 'NaN', open24h: '100' }] }, 'okx'), /invalid/);
  const parsed = parsePricePayload({ lastPrice: '65000', priceChangePercent: '-1.25' }, 'binance');
  assert.deepEqual(parsed.value, { price: 65000, changePct: -1.25, chg: -1.25 });
});

test('mNAV rejects incomplete records without default BTC/ETH quotes', () => {
  assert.throws(() => parseMnavPayload({
    mstr: { stock_price: 300 },
    bmnr: { shares: 100, cash: 1, eth_holdings: 10, stock_price: 20 }
  }), /complete company/);

  const partial = parseMnavPayload({
    data_as_of: '2026-09-03T00:00:00Z',
    mstr: { btc_holdings: 100000, shares: 200000000, stock_price: 300, debt: 100, pref: 50, cash: 25 },
    bmnr: { shares: 100, cash: 1, eth_holdings: 10, stock_price: 20 }
  });
  assert.ok(partial.value.mstr);
  assert.equal(partial.value.bmnr, null);
  assert.equal(partial.value.ethPrice, null);
  assert.equal(partial.dataAt, Date.parse('2026-09-03T00:00:00Z'));
  assert.equal(deriveMnav(partial.value, 65000).bmnr, null);
});

test('official MSTR mNAV survives without current BTC/share inputs and keeps its source date', () => {
  const parsed = parseMnavPayload({
    mstr: {
      official_mnav: 1.15,
      official_mnav_as_of: '2026-09-04',
      source_as_of: { home: '2026-09-04', shares: '2026-08-30', ledger: '2026-08-31', notes: '2026-09-04' },
      source: 'strategy.com'
    }
  });
  assert.equal(parsed.value.mstr.officialMnav, 1.15);
  assert.equal(parsed.value.mstr.officialMnavAsOf, Date.parse('2026-09-04'));
  assert.deepEqual(parsed.value.mstr.sourceAsOf, { home: '2026-09-04', shares: '2026-08-30', ledger: '2026-08-31', notes: '2026-09-04' });
  assert.equal(deriveMnav(parsed.value, null).mstr.officialMnav, 1.15);
  assert.equal(isValidMnavValue(parsed.value), true);
});

test('generic mnav field is not promoted to official mNAV', () => {
  assert.throws(() => parseMnavPayload({ mstr: { mnav: 1.15 } }), /complete company/);
});

test('legacy EV/BTC remains a separate derived comparison when official mNAV is absent', () => {
  const parsed = parseMnavPayload({
    mstr: { btc_holdings: 100000, shares: 200000000, stock_price: 300, debt: 100, pref: 50, cash: 25 }
  });
  const result = deriveMnav(parsed.value, 65000);
  assert.equal(result.mstr.officialMnav, undefined);
  assert.equal(result.mstr.legacy, true);
  assert.ok(result.mstr.ev > 0);
});

test('BMNR remains independently usable only when API supplies eth_price', () => {
  const parsed = parseMnavPayload({
    bmnr: { shares: 100, eth_holdings: 10, stock_price: 20 },
    eth_price: 3000,
    data_as_of: 1788571992230
  });
  const result = deriveMnav(parsed.value, null);
  assert.equal(result.mstr, null);
  assert.equal(result.bmnr.mnav, 20 * 100 / (10 * 3000));
});

test('derived AHR999 changes when a validated price arrives and keeps candle date', () => {
  const daily = { closes: Array(200).fill(100), lastTs: Date.parse('2026-09-03T00:00:00Z') };
  const lower = deriveAhr999(50000, daily);
  const higher = deriveAhr999(60000, daily);
  assert.ok(lower > 0);
  assert.ok(higher > lower);
  assert.equal(parseMvrvzPayload({ mvrvz: '0.8098', ts: 1788571992230 }).dataAt, null);
  assert.equal(parseMvrvzPayload({ mvrvz: '0.8098', mvrvz_date: '2026-09-03' }).dataAt, Date.parse('2026-09-03'));
});

test('probability parser drops malformed entries instead of writing NaN', () => {
  const result = parseProbabilitiesPayload({ survival: { downside: [
    { strike: 55000, probability: 0.2 },
    { strike: 50000, probability: null },
    { strike: 45000, probability: 2 }
  ] } });
  assert.deepEqual(result.value, { 55000: 0.2 });
});

test('halving boundary advances to the next epoch and averages cannot overflow', () => {
  assert.equal(parseHalvingHeight(840000).value.height, 840000);
  assert.equal(parseHalvingHeight(840000).value.progress, 0);
  assert.equal(parseHalvingHeight(840000).value.days, Math.round(210000 * 10 / (60 * 24)));
  assert.throws(() => average(Array(200).fill(1e308)), /overflowed/);
});

test('normalized cache validators reject toxic partial mNAV and STRC values', () => {
  assert.equal(isValidMnavValue({ mstr: {} }), false);
  assert.equal(isValidMnavValue({ bmnr: { holdings: 10, stockPrice: 20, shares: 100 }, ethPrice: 3000 }), true);
  assert.equal(isValidFlywheelValue({ strc: { price: 'oops' } }), false);
  assert.equal(isValidFlywheelValue({ strc: { price: 97.3, change_pct: 1.2 } }), true);
});
