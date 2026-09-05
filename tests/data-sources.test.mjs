import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveAhr999,
  deriveMnav,
  average,
  isValidFlywheelValue,
  isValidMnavValue,
  parseBinanceCandles,
  parseHalvingHeight,
  parseMnavPayload,
  parseMvrvzPayload,
  parseOkxCandles,
  parsePricePayload,
  parseProbabilitiesPayload
} from '../assets/data-sources.mjs';

function candles(count = 200, close = 100) {
  return Array.from({ length: count }, (_, index) => [Date.now() - (count - index) * 86400000, '0', '0', '0', String(close + index), '0']);
}

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
