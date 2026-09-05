#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceRoot = join(projectRoot, 'docs/qa/regression-20260905');
mkdirSync(join(evidenceRoot, 'screenshots'), { recursive: true });

const moduleSpecifier = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(moduleSpecifier);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function fixtureData(input, scenario) {
  const url = input instanceof URL ? input : new URL(input, 'https://fixture.invalid');
  const { hostname, pathname } = url;
  const highRisk = scenario === 'high-risk';
  const candles = Array.from({ length: 200 }, (_, i) => [
    Date.now() - (199 - i) * 86400000, '9000', '11000', '8000', highRisk ? '10000' : '100000', '10',
    Date.now(), '1000000', '100', '1', '1', '0',
  ]);
  const down = [55000, 50000, 45000, 40000, 35000, 30000].map((strike, i) => ({
    strike, probability: [0.17, 0.135, 0.075, 0.06, 0.045, 0.032][i],
  }));
  if (pathname.includes('/ticker/24hr')) return { lastPrice: '100000', priceChangePercent: '1.25' };
  if (pathname.includes('/market/ticker')) return { data: [{ last: '100000', open24h: '99000' }] };
  if (pathname.includes('/klines')) return candles;
  if (hostname.includes('okx.com') && pathname.includes('/market/candles')) return { data: [...candles].reverse() };
  if (pathname.includes('/candles')) return candles;
  if (pathname.includes('/mining/hashrate')) return { currentDifficulty: 80000000000000, currentHashrate: 928000000000000000000 };
  if (pathname.includes('/blocks/tip/height')) return 965546;
  if (hostname === 'api.alternative.me') return { data: [{ value: '73' }] };
  if (pathname.includes('mCapRealizedRatio')) return { code: 100, data: [{ v: highRisk ? 4 : 1.23 }] };
  if (pathname.includes('/sopr')) return { code: 100, data: [{ v: 1.045 }] };
  if (pathname.includes('/puellMultiple')) return { code: 100, data: [{ v: highRisk ? 5 : 1.2 }] };
  if (pathname.includes('/balancedPrice')) return { code: 100, data: [{ v: 50000 }] };
  if (pathname.includes('btc-cache') || pathname.endsWith('/latest')) return { mvrvz: highRisk ? 8 : 0.81, psip: null, ts: Date.now() };
  if (hostname === 'probs.fuckbtc.com') return { survival: { downside: down } };
  if (hostname === 'flywheel-monitor.pages.dev') return {
    strc: { price: 97.33, change_pct: 1.2 },
    flywheel_score: 75,
    reasons: ['STRC 接近锚定'],
    strategy_official: { strc_metrics: { shares: 98164503 } },
    strc_runway: { runway_months: 52, runway_months_conservative: 41.4, monthly_dividend: 98200000 },
    global_runway: { runway_months: 35.4, status: 'healthy', debt_interest_rate: 0.01, cash: 5100000000, annual_cash_need: 1730000000, headroom_to_9m: 3802500000, headroom_to_6m: 4235000000 },
  };
  if (hostname === 'strc-issuance.pages.dev') return { parsed: { strc: { atm_remaining_m: 17511 } } };
  if (pathname.includes('/mnav')) return {
    eth_price: 2500,
    ...(scenario === 'mstr-official-only' ? {
      mstr: {
        official_mnav: 1.15,
        official_mnav_as_of: '2026-09-04',
        source_as_of: { home: '2026-09-04', shares: '2026-08-30', ledger: '2026-08-31', notes: '2026-09-04' },
        source: 'strategy.com'
      },
      bmnr: { eth_holdings: 1920000, stock_price: 40, shares: 200000000 }
    } : scenario === 'bmnr-isolated' ? { mstr: { stock_price: 150 }, bmnr: { eth_holdings: 1920000, stock_price: 40, shares: 200000000, cash: 100000000 } } : {
      mstr: { btc_holdings: 845050, stock_price: 150, shares: 450000000, debt: 6710000000, pref: 14800000000, cash: 5100000000, official_mnav: 1.15, official_mnav_as_of: '2026-09-04', source_as_of: { home: '2026-09-04', shares: '2026-08-30', ledger: '2026-08-31', notes: '2026-09-04' }, source: 'strategy.com' },
      bmnr: { eth_holdings: 1920000, stock_price: 40, shares: 200000000 },
    }),
  };
  if (scenario === 'bad-json') return '{"broken":';
  return {};
}

function externalKind(input) {
  const url = input instanceof URL ? input : new URL(input, 'https://fixture.invalid');
  const { hostname, pathname } = url;
  if (pathname.includes('mining/hashrate')) return 'hashrate';
  if (hostname === 'flywheel-monitor.pages.dev') return 'strc-fast';
  if (hostname === 'strc-issuance.pages.dev') return 'strc-issuance';
  if (pathname.includes('/mnav')) return 'mnav';
  if (pathname.includes('balancedPrice')) return 'bp';
  if (pathname.includes('mCapRealizedRatio')) return 'mvrv';
  if (pathname.includes('/sopr')) return 'sopr';
  if (pathname.includes('puellMultiple')) return 'puell';
  if (pathname.includes('/klines') || pathname.includes('/candles')) return 'ahr-input';
  if (pathname.includes('/ticker/24hr') || pathname.includes('/market/ticker')) return 'price';
  if (hostname === 'btc-cache.corms-cushier-0l.workers.dev' || pathname.endsWith('/latest')) return 'mvrvz';
  if (hostname === 'api.alternative.me') return 'fng';
  if (pathname.includes('blocks/tip/height')) return 'halving';
  if (hostname === 'probs.fuckbtc.com') return 'probs';
  return 'other';
}

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function createStaticServer(root) {
  const server = createServer((request, response) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('bad request');
      return;
    }
    const candidate = resolve(root, `.${urlPath === '/' ? '/index.html' : urlPath}`);
    const rel = relative(resolve(root), candidate);
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/')) {
      response.writeHead(403).end('forbidden');
      return;
    }
    try {
      const body = readFileSync(candidate);
      response.writeHead(200, { 'content-type': MIME[extname(candidate)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise(server));
  });
}

async function serve(root) {
  const server = await createStaticServer(root);
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function runScenario(browser, root, name, options = {}) {
  const { server, origin } = await serve(root);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    const externalRequests = [];
    const failures = [];
    const started = Date.now();
    let externalFailures = false;
    page.on('request', (request) => {
      if (!request.url().startsWith(origin)) externalRequests.push({ url: request.url(), at: Date.now() - started });
    });
    page.on('requestfailed', (request) => failures.push({ url: request.url(), error: request.failure()?.errorText || 'failed' }));
    page.on('pageerror', (error) => failures.push({ pageerror: error.message }));

    await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === origin) {
      await route.continue();
      return;
    }
    const kind = externalKind(requestUrl);
    const isolatedBtcFailure = name === 'bmnr-isolated' && (
      kind === 'price' || requestUrl.hostname === 'api.coingecko.com' || requestUrl.hostname === 'blockchain.info'
    );
    const shouldHang =
      (name === 'price-fast-hash-hung' && kind === 'hashrate') ||
      (name === 'strc-fast-issuance-hung' && kind === 'strc-issuance') ||
      (name === 'cache-slow-chain' && ['mvrv', 'mvrvz', 'sopr', 'puell'].includes(kind));
    if (shouldHang) {
      await sleep(name === 'cache-slow-chain' ? 900 : 1500);
      try { await route.abort('timedout'); } catch (_) {}
      return;
    }
    const legacyMnavFailure = name === 'mnav-failure-keeps-legacy' && kind === 'mnav';
    if (externalFailures || isolatedBtcFailure || legacyMnavFailure || name === 'all-failed') {
      await route.fulfill(jsonResponse({ error: 'synthetic failure' }, 503));
      return;
    }
    let delay = 20;
    if (name === 'price-fast-hash-hung' && kind === 'price') delay = 50;
    if (name === 'strc-fast-issuance-hung' && kind === 'strc-fast') delay = 60;
    if (name === 'cache-slow-chain' && ['mvrv', 'mvrvz', 'sopr', 'puell'].includes(kind)) delay = 900;
    if (name === 'legacy-cache') delay = 900;
    if (name === 'expired-cache' && kind === 'price') delay = 600;
    if (name === 'late-quote-recompute' && kind === 'price') delay = 300;
    await sleep(delay);
    await route.fulfill(jsonResponse(fixtureData(requestUrl, name)));
    });

    if (options.storageThrow) {
    await page.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
        Storage.prototype[method] = () => { throw new Error('synthetic storage failure'); };
      }
    });
    }
    if (options.cache) {
    await page.addInitScript((cache) => {
      for (const [key, value] of Object.entries(cache)) {
        localStorage.setItem(`btc_${key}`, JSON.stringify({ t: Date.now(), v: value, dataAt: '2026-09-05', source: 'fixture-cache' }));
      }
    }, options.cache);
    }
    if (options.rawCache) {
      await page.addInitScript((cache) => {
        for (const [key, raw] of Object.entries(cache)) localStorage.setItem(`btc_${key}`, raw);
      }, options.rawCache);
    }

    const result = { name, root, externalRequests, failures, timings: {}, assertions: [] };
    const body = () => page.locator('body').innerText();
    const textOf = async (selector) => (await page.locator(selector).first().innerText()).trim();
    const check = (condition, message) => {
      assert.ok(condition, `${name}: ${message}`);
      result.assertions.push(message);
    };

    if (name === 'expiry-refresh') await page.clock.install({ time: new Date() });
    await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
    result.timings.domContentLoaded = Date.now() - started;

    if (name === 'cycle-targets') {
      await page.waitForFunction(() => document.querySelector('[data-target-manual-cap]')?.textContent?.includes('$3.4T'), null, { timeout: 2500 });
      check(/\$3\.4T/.test(await textOf('[data-target-manual-cap]')), 'reference target capitalization is visible');
      check(/\$150K/.test(await textOf('[data-target-rows]')), '1% allocation target price is visible');
      const beforeRequests = externalRequests.length;
      const changedAt = Date.now();
      await page.locator('#target-price').fill('180000');
      await page.waitForFunction(() => document.querySelector('[data-target-manual-cap]')?.textContent?.includes('$3.6T'), null, { timeout: 100 });
      check(Date.now() - changedAt <= 100, 'target input updates within 100ms');
      await page.locator('[data-target-preset="reference"]').press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-target-manual-cap]')?.textContent?.includes('$3.4T'), null, { timeout: 2500 });
      await page.locator('[data-target-preset="stress"]').press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-target-cumulative]')?.textContent?.includes('$280B'), null, { timeout: 2500 });
      check(/\$280B/.test(await textOf('[data-target-cumulative]')), '5x stress funding is visible for the fixture quote');
      await page.locator('#target-supply').fill('0');
      await page.waitForFunction(() => !document.querySelector('[data-target-errors]')?.hidden, null, { timeout: 100 });
      check((await textOf('[data-target-cumulative]')) === '--', 'invalid target parameters clear funding');
      check(/\$100,000/.test(await textOf('#btc-price')), 'invalid target parameters leave the main quote intact');
      await page.locator('[data-target-preset="reference"]').press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-target-errors]')?.hidden, null, { timeout: 100 });
      check(externalRequests.length === beforeRequests, 'target controls add no network requests');
      await page.locator('#targets').screenshot({ path: join(evidenceRoot, 'screenshots/cycle-targets-desktop.png') });
      await page.setViewportSize({ width: 375, height: 812 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'target module fits a 375px viewport');
      await page.locator('#targets').screenshot({ path: join(evidenceRoot, 'screenshots/cycle-targets-mobile.png') });
    }

    if (name === 'expiry-refresh') {
      await page.waitForFunction(() => {
        const ids = ['#bp-ratio', '#wma200-ratio', '#ahr999', '#p50-val', '#mstr-mnav'];
        return ids.every((selector) => {
          const text = document.querySelector(selector)?.textContent?.trim() || '--';
          return text !== '--' && text !== '' && !/loading/i.test(text);
        });
      }, null, { timeout: 3000 });
      externalFailures = true;
      // mNAV's declared freshness window is 30 minutes; advance beyond it.
      await page.clock.fastForward(31 * 60 * 1000);
      await sleep(100);
      check((await textOf('#bp-ratio')) === '--', 'expired BP ratio is cleared after refresh failure');
      check((await textOf('#wma200-ratio')) === '--', 'expired WMA ratio is cleared after refresh failure');
      check((await textOf('#ahr999')) === '--', 'expired AHR999 is cleared after refresh failure');
      check((await textOf('#p50-val')) === '--', 'expired mining percentile is cleared after refresh failure');
      check((await textOf('#mstr-mnav')) === '--', 'expired MSTR mNAV is cleared after refresh failure');
      check((await textOf('#bmnr-mnav')) === '--', 'expired BMNR mNAV is cleared after refresh failure');
      check((await textOf('[data-target-cumulative]')) === '--', 'expired quote clears target funding');
      check((await textOf('[data-target-manual-cap]')) === '$3.4T', 'target valuation remains visible without a fresh quote');
      await page.screenshot({ path: join(evidenceRoot, 'screenshots/expiry-refresh-safe-state.png'), fullPage: false });
    }

    if (name === 'cache-poison') {
      await page.waitForFunction(() => /\$100,000|100000/.test(document.querySelector('#btc-price')?.textContent || ''), null, { timeout: 1500 });
      await page.waitForFunction(() => /[0-9.]+x/.test(document.querySelector('#mstr-mnav')?.textContent || '') && /97\.33/.test(document.querySelector('#strc-price')?.textContent || ''), null, { timeout: 2500 });
      try {
        await page.waitForFunction(() => /[0-9.]+/.test(document.querySelector('#bp-ratio')?.textContent || ''), null, { timeout: 2500 });
      } catch (error) {
        throw new Error(`${error.message}; bp=${await textOf('#bp-ratio')}; bpPrice=${await textOf('#bp-price')}; price=${await textOf('#btc-price')}`);
      }
      check(/\$100,000|100000/.test(await textOf('#btc-price')), 'poisoned cache does not block normal price');
      check(/[0-9.]+/.test(await textOf('#bp-ratio')), 'poisoned cache does not block derived BP ratio');
      check(/[0-9.]+x/.test(await textOf('#mstr-mnav')), 'poisoned mNAV cache does not replace valid network mNAV');
      check((await textOf('#mstr-mnav-title')).includes('官方 mNAV'), 'MSTR headline uses official reported mNAV label');
      check((await textOf('#mstr-detail')).includes('源'), 'MSTR official mNAV keeps source date detail');
      check(/97\.33/.test(await textOf('#strc-price')), 'poisoned STRC cache does not replace valid network STRC');
      const poisonedText = await body();
      check(!/oops|NaN|Infinity/.test(poisonedText), 'poisoned cache leaves no oops/NaN/Infinity text');
    }

    if (name === 'bmnr-isolated') {
      await page.waitForFunction(() => /[0-9.]+x/.test(document.querySelector('#bmnr-mnav')?.textContent || ''), null, { timeout: 2500 });
      check(/--/.test(await textOf('#btc-price')), 'BTC price failure remains unavailable');
      check(/[0-9.]+x/.test(await textOf('#bmnr-mnav')), 'complete BMNR+ETH remains visible when BTC price fails');
      check(/[0-9.]+x/.test(await textOf('#mstr-mnav')), 'legacy MSTR card remains independently visible');
      const mstrState = await page.evaluate(() => document.querySelector('#mstr-mnav')?.closest('article')?.querySelector('.dashboard-state')?.textContent || '');
      check(/缓存|过期|可用/.test(mstrState), 'legacy MSTR card keeps its own cache/expiry status');
      const legacyRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('btc_mstr-mnav')));
      check(legacyRecord.t === options.expectedCacheTimestamp, 'legacy MSTR cache timestamp is preserved');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /[0-9.]+x/.test(document.querySelector('#bmnr-mnav')?.textContent || ''), null, { timeout: 2500 });
      check(/[0-9.]+x/.test(await textOf('#mstr-mnav')), 'legacy MSTR cache survives reload beside BMNR cache');
      check(/[0-9.]+x/.test(await textOf('#bmnr-mnav')), 'BMNR remains available after reload');
      const reloadedLegacyRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('btc_mstr-mnav')));
      check(reloadedLegacyRecord.t === options.expectedCacheTimestamp, 'legacy MSTR timestamp survives reload unchanged');
    }

    if (name === 'mnav-failure-keeps-legacy') {
      await page.waitForFunction(() => /[0-9.]+x/.test(document.querySelector('#mstr-mnav')?.textContent || ''), null, { timeout: 2500 });
      check(/[0-9.]+x/.test(await textOf('#mstr-mnav')), 'legacy MSTR mNAV remains visible when fresh mNAV source fails');
      const legacyRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('btc_mstr-mnav')));
      check(legacyRecord.t === options.expectedCacheTimestamp, 'legacy MSTR cache timestamp is preserved');
    }

    if (name === 'mstr-official-only') {
      await page.waitForFunction(() => document.querySelector('#mstr-mnav')?.textContent?.trim() === '1.15x', null, { timeout: 2500 });
      check((await textOf('#mstr-mnav')) === '1.15x', 'official MSTR mNAV renders without BTC/share inputs');
      check((await textOf('#mstr-mnav-title')).includes('官方 mNAV'), 'official-only MSTR record keeps official headline label');
      check((await textOf('#mstr-detail')).includes('源'), 'official-only MSTR record keeps independent source date');
      check((await textOf('#mstr-basic')) === '--', 'official-only MSTR record does not invent Basic comparison');
    }

  if (name === 'price-fast-hash-hung') {
    await page.waitForFunction(() => /\$[0-9]/.test(document.querySelector('#btc-price')?.textContent || ''), null, { timeout: 1000 });
    result.timings.priceVisible = Date.now() - started;
    check(result.timings.priceVisible < 1000, 'price visible before 1s while hash request hangs');
    check((await textOf('#hashrate')).includes('---') || (await textOf('#hashrate')).includes('--'), 'hashrate remains pending while hung');
    await page.screenshot({ path: join(evidenceRoot, 'screenshots/price-first-hash-hung.png'), fullPage: false });
    }

    if (name === 'strc-fast-issuance-hung') {
    await page.waitForFunction(() => /\$97\.33|97\.33/.test(document.querySelector('#strc-price')?.textContent || ''), null, { timeout: 1000 });
    check(/97\.33/.test(await textOf('#strc-price')), 'fast STRC source appears before issuance source');
    check(/--/.test(await textOf('#strc-atm')), 'slow issuance card remains pending while source hangs');
    await page.screenshot({ path: join(evidenceRoot, 'screenshots/strc-fast-issuance-hung.png'), fullPage: false });
    }

  if (name === 'cache-slow-chain') {
    await page.waitForFunction(() => /1\.23/.test(document.querySelector('#mvrv-value')?.textContent || ''), null, { timeout: 500 });
    const cachedText = await body();
    check(/1\.23/.test(await textOf('#mvrv-value')), 'cached MVRV appears before slow network returns');
    check(/0\.81/.test(await textOf('#mvrvz-value')), 'cached MVRV-Z appears before slow network returns');
    check(/1\.045/.test(await textOf('#sopr-value')), 'cached SOPR appears before slow network returns');
    check(/1\.2/.test(await textOf('#puell-value')), 'cached Puell appears before slow network returns');
    check(/缓存|stale|陈旧|last.good|上次|来源|data.status/i.test(cachedText), 'a cache/stale marker is visible');
    await page.screenshot({ path: join(evidenceRoot, 'screenshots/cache-first-slow-chain.png'), fullPage: false });
    }

    if (name === 'all-failed') {
    await sleep(1200);
    const allText = await body();
    check(!/NaN|Infinity/.test(allText), 'all-failed state contains no NaN or Infinity');
    check(!/加载中\.\.\.|计算中…/.test(allText), 'all-failed state leaves indefinite loading labels');
    check(!/%/.test(await textOf('#psip-value')), 'PSIP does not fabricate a percentage when source is unavailable');
    check(!/[0-9.]+x/.test(await textOf('#mstr-mnav')), 'MSTR mNAV remains unavailable without valid inputs');
    check(!/[0-9.]+x/.test(await textOf('#bmnr-mnav')), 'BMNR mNAV remains unavailable without valid inputs');
    await page.screenshot({ path: join(evidenceRoot, 'screenshots/all-failed-safe-state.png'), fullPage: false });
    }

    if (name === 'storage-throw') {
    await page.waitForFunction(() => /\$[0-9]/.test(document.querySelector('#btc-price')?.textContent || ''), null, { timeout: 1000 });
    check(/\$[0-9]/.test(await textOf('#btc-price')), 'page remains usable when storage methods throw');
    check(!failures.some((failure) => failure.pageerror), 'storage failure does not create an unhandled page error');
    }

  if (name === 'late-quote-recompute') {
    await page.waitForFunction(() => /\$100,000|100000/.test(document.querySelector('#btc-price')?.textContent || ''), null, { timeout: 1000 });
    await sleep(300);
    await page.waitForFunction(() => !/^--$/.test(document.querySelector('#bp-ratio')?.textContent?.trim() || '--'), null, { timeout: 1500 });
    check(!/^--$/.test(await textOf('#bp-ratio')), 'BP ratio recomputes after late price/data arrival');
    await page.waitForFunction(() => !/^--$/.test(document.querySelector('#wma200-ratio')?.textContent?.trim() || '--'), null, { timeout: 1500 });
    check(!/^--$/.test(await textOf('#wma200-ratio')), 'WMA ratio recomputes after late price/data arrival');
    await page.waitForFunction(() => !/^--$/.test(document.querySelector('#ahr999')?.textContent?.trim() || '--'), null, { timeout: 1500 });
    check(!/^--$/.test(await textOf('#ahr999')), 'ahr999 recomputes after late price/data arrival');
    await page.waitForFunction(() => /[0-9.]+x/.test(document.querySelector('#mstr-mnav')?.textContent || ''), null, { timeout: 1500 });
    check(/[0-9.]+x/.test(await textOf('#mstr-mnav')), 'mNAV recomputes after late price/data arrival');
  }

    if (name === 'legacy-cache') {
      await sleep(250);
      check(/928\.0/.test(await textOf('#hashrate')), 'legacy hashrate cache restores the visible hashrate');
      check(/[0-9.]+/.test(await textOf('#strc-price')), 'legacy STRC cache restores a visible price');
      check(/[0-9.]+x/.test(await textOf('#mstr-mnav')), 'legacy MSTR mNAV cache restores a numeric card');
      check(/[0-9.]+x/.test(await textOf('#bmnr-mnav')), 'legacy BMNR mNAV cache restores a numeric card');
    }

    if (name === 'expired-cache') {
      await sleep(250);
      const expiredText = await body();
      check(/缓存过期|stale|陈旧/i.test(expiredText), 'expired cache is visibly marked stale');
      const record = await page.evaluate(() => JSON.parse(localStorage.getItem('btc_price')));
      check(record.t === options.expectedCacheTimestamp, 'expired cache timestamp is not rewritten before refresh succeeds');
    }

    if (name === 'bad-cache') {
      await page.waitForFunction(() => /\$[0-9]/.test(document.querySelector('#btc-price')?.textContent || ''), null, { timeout: 1000 });
      check(/\$[0-9]/.test(await textOf('#btc-price')), 'bad cached JSON does not block a fresh price');
      check(!failures.some((failure) => failure.pageerror), 'bad cached JSON does not create an unhandled page error');
    }

    check(!failures.some((failure) => failure.pageerror), 'scenario has no unhandled pageerror');
    return result;
  } finally {
    await context.close().catch(() => {});
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function runResponsive(browser, root) {
  const { server, origin } = await serve(root);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    await route.fulfill(jsonResponse(fixtureData(url, 'responsive')));
    });
    const samples = [];
    for (const viewport of [{ width: 1280, height: 720 }, { width: 768, height: 1024 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
    await sleep(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const slider = page.locator('#electricity');
    const before = await slider.inputValue();
    const p50Before = await page.locator('#p50-val').innerText();
    const changedAt = Date.now();
    await slider.press('ArrowRight');
    await page.waitForFunction(({ value, p50 }) => {
      const sliderValue = document.querySelector('#electricity')?.value;
      const p50Value = document.querySelector('#p50-val')?.textContent;
      return sliderValue !== value && p50Value !== p50;
    }, { value: before, p50: p50Before }, { timeout: 100 });
    const changedMs = Date.now() - changedAt;
    assert.ok(overflow <= 1, `${viewport.width}px has horizontal overflow ${overflow}px`);
    assert.ok(changedMs <= 100, `${viewport.width}px slider took ${changedMs}ms`);
    samples.push({ viewport, overflow, sliderChangedMs: changedMs });
    if (viewport.width === 375) await page.screenshot({ path: join(evidenceRoot, 'screenshots/responsive-mobile-375.png'), fullPage: false });
    }
    return samples;
  } finally {
    await context.close().catch(() => {});
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function runAccessibility(browser, root) {
  const { server, origin } = await serve(root);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    await route.fulfill(jsonResponse(fixtureData(url, 'accessibility')));
    });
    await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.skip-link').press('Enter');
    const a11y = await page.evaluate(() => {
    const main = document.querySelector('main#main-content');
    const scrollRegion = document.querySelector('.table-scroll');
    const namedRegion = scrollRegion?.getAttribute('role') === 'region' && Boolean(
      scrollRegion.getAttribute('aria-label') || scrollRegion.getAttribute('aria-labelledby'),
    );
    return { activeIsMain: document.activeElement === main, namedRegion, hash: location.hash };
    });
    assert.equal(a11y.hash, '#main-content', 'skip link updates the main-content hash');
    assert.equal(a11y.activeIsMain, true, 'skip link moves activeElement to main');
  assert.equal(a11y.namedRegion, true, 'a scrollable region has an accessible name');
    await page.screenshot({ path: join(evidenceRoot, 'screenshots/skip-link-focus.png'), fullPage: false });
    return a11y;
  } finally {
    await context.close().catch(() => {});
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function runLoadBenchmark(browser, root, cacheMode) {
  const { server, origin } = await serve(root);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      await sleep(50);
      await route.fulfill(jsonResponse(fixtureData(url, 'benchmark')));
    });
    if (cacheMode === 'legacy') {
      await page.addInitScript(() => {
        const now = Date.now();
        localStorage.setItem('btc_mvrvz', JSON.stringify({ t: now, v: 0.81 }));
        localStorage.setItem('btc_sopr', JSON.stringify({ t: now, v: 1.045 }));
        localStorage.setItem('btc_puell', JSON.stringify({ t: now, v: 1.2 }));
      });
    }
    const started = Date.now();
    await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const values = ['#mvrvz-value', '#sopr-value', '#puell-value']
        .map((selector) => document.querySelector(selector)?.textContent?.trim() || '--');
      return values.every((value) => value !== '--' && value !== '');
    }, null, { timeout: 5000 });
    const visibleMs = Date.now() - started;
    if (root === projectRoot) {
      await page.screenshot({ path: join(evidenceRoot, 'screenshots', `benchmark-${cacheMode}.png`), fullPage: false });
    }
    return { root, cacheMode, visibleMs, metrics: ['mvrvz', 'sopr', 'puell'], fixtureDelayMs: 50 };
  } finally {
    await context.close().catch(() => {});
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function runHighRiskColors(browser, root) {
  const { server, origin } = await serve(root);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      await route.fulfill(jsonResponse(fixtureData(url, 'high-risk')));
    });
    await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const values = ['#mvrv-value', '#mvrvz-value', '#puell-value', '#ahr999']
        .map((selector) => Number.parseFloat(document.querySelector(selector)?.textContent || 'NaN'));
      return values[0] >= 3.5 && values[1] >= 7 && values[2] >= 4 && values[3] > 5;
    }, null, { timeout: 2500 });
    const result = await page.evaluate(() => {
      const selectors = ['#mvrv-value', '#mvrvz-value', '#puell-value', '#ahr999'];
      return Object.fromEntries(selectors.map((selector) => [selector, {
        text: document.querySelector(selector)?.textContent?.trim(),
        color: getComputedStyle(document.querySelector(selector)).color,
      }]));
    });
    const colors = Object.values(result).map((entry) => entry.color);
    assert.ok(colors.every((color) => color === 'rgb(246, 70, 93)'), `high-risk metrics must use red, got ${colors.join(', ')}`);
    await page.screenshot({ path: join(evidenceRoot, 'screenshots/high-risk-colors-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: join(evidenceRoot, 'screenshots/high-risk-colors-mobile.png'), fullPage: false });
    return result;
  } finally {
    await context.close().catch(() => {});
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

const browser = await chromium.launch({ headless: true });
const results = { generatedAt: new Date().toISOString(), scenarios: [], failures: [], responsive: [], accessibility: null, benchmark: [], colorRegression: null, notes: [] };
async function record(label, operation) {
  try {
    return await operation();
  } catch (error) {
    const failure = { scenario: label, error: error?.message || String(error), stack: error?.stack || null };
    results.failures.push(failure);
    console.error(`browser smoke failed: ${label}: ${failure.error}`);
    return null;
  }
}
try {
  for (const [label, options] of [
    ['price-fast-hash-hung', undefined],
    ['strc-fast-issuance-hung', undefined],
    ['cache-slow-chain', { cache: { mvrv: 1.23, mvrvz: 0.81, sopr: 1.045, puell: 1.2 } }],
    ['legacy-cache', { rawCache: {
      hashrate: JSON.stringify({ t: Date.now(), v: { diff: 80000000000000, hr: '928.0' } }),
      strc: JSON.stringify({ t: Date.now(), v: { fw: fixtureData(new URL('https://flywheel-monitor.pages.dev/snapshot.json'), 'legacy-cache'), iss: fixtureData(new URL('https://strc-issuance.pages.dev/snapshot.json'), 'legacy-cache') } }),
      'mstr-mnav': JSON.stringify({ t: Date.now(), v: { basic: 1.08, ev: 1.12, holdings: 845050, price: 150 } }),
      'bmnr-mnav': JSON.stringify({ t: Date.now(), v: { mnav: 0.92, eth: 1920000, price: 40 } }),
    } }],
    ['expiry-refresh', undefined],
    ['cache-poison', { rawCache: {
      mnav: JSON.stringify({ t: Date.now(), v: { mstr: {} } }),
      'strc-flywheel': JSON.stringify({ t: Date.now(), v: { strc: { price: 'oops' } } }),
    } }],
    ['bmnr-isolated', (() => { const timestamp = Date.now() - 120000; return {
      expectedCacheTimestamp: timestamp,
      rawCache: { 'mstr-mnav': JSON.stringify({ t: timestamp, v: { basic: 1.08, ev: 1.12, holdings: 845050, price: 150 } }) },
    }; })()],
    ['mnav-failure-keeps-legacy', (() => { const timestamp = Date.now(); return {
      expectedCacheTimestamp: timestamp,
      rawCache: { 'mstr-mnav': JSON.stringify({ t: timestamp, v: { basic: 1.08, ev: 1.12, holdings: 845050, price: 150 } }) },
    }; })()],
    ['mstr-official-only', undefined],
    ['expired-cache', (() => { const timestamp = Date.now() - 172800001; return { expectedCacheTimestamp: timestamp, rawCache: { price: JSON.stringify({ t: timestamp, v: { price: 65000, changePct: -2 } }) } }; })()],
    ['bad-cache', { rawCache: { price: '{"broken":' } }],
    ['all-failed', undefined],
    ['storage-throw', { storageThrow: true }],
    ['late-quote-recompute', undefined],
    ['cycle-targets', undefined],
  ]) {
    const scenario = await record(label, () => runScenario(browser, projectRoot, label, options));
    if (scenario) results.scenarios.push(scenario);
  }
  results.responsive = await record('responsive', () => runResponsive(browser, projectRoot)) || [];
  results.accessibility = await record('accessibility', () => runAccessibility(browser, projectRoot));
  results.colorRegression = await record('high-risk-colors', () => runHighRiskColors(browser, projectRoot));
  for (const cacheMode of ['cold', 'legacy']) {
    const benchmark = await record(`benchmark:${cacheMode}`, () => runLoadBenchmark(browser, projectRoot, cacheMode));
    if (benchmark) results.benchmark.push(benchmark);
  }
  if (process.env.BASELINE_ROOT) {
    for (const cacheMode of ['cold', 'legacy']) {
      const benchmark = await record(`benchmark:baseline:${cacheMode}`, () => runLoadBenchmark(browser, resolve(process.env.BASELINE_ROOT), cacheMode));
      if (benchmark) results.benchmark.push(benchmark);
    }
  }
  results.notes.push('All external API requests were intercepted and fulfilled/aborted by synthetic fixtures; no paid API or network fetch was used.');
  if (process.env.BASELINE_ROOT) {
    results.notes.push(`BASELINE_ROOT benchmarked: ${process.env.BASELINE_ROOT}; benchmark values are synthetic-fixture visibility times only.`);
  }
} finally {
  await browser.close();
}

writeFileSync(join(evidenceRoot, 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
if (results.failures.length) process.exitCode = 1;
