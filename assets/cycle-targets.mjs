export const DEFAULT_PARAMS = Object.freeze({
  assetPoolT: 300,
  supplyM: 20,
  targetPrice: 170000,
  impactLow: 15,
  impactHigh: 20,
  yearsLow: 2,
  yearsHigh: 3
});

export const ALLOCATION_SCENARIOS = Object.freeze([0.01, 0.015, 0.02, 0.025, 0.03, 0.05]);
export const DEFAULT_ALLOCATION_PCT = 2;

const USD_T = 1e12;
const BTC_M = 1e6;
const MAX_SUPPLY_M = 21;

const finitePositive = value => Number.isFinite(value) && value > 0;

function number(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function range(low, high) {
  return { low, high };
}

function deriveFunding(deltaCapitalization, params) {
  if (!Number.isFinite(deltaCapitalization)) return null;
  const cumulative = range(deltaCapitalization / params.impactHigh, deltaCapitalization / params.impactLow);
  const annual = range(
    cumulative.low / params.yearsHigh,
    cumulative.high / params.yearsLow
  );
  const monthly = range(annual.low / 12, annual.high / 12);
  return { cumulative, annual, monthly };
}

function allFinite(values) {
  return values.every(value => Number.isFinite(value));
}

export function validateParams(input = {}) {
  const params = { ...DEFAULT_PARAMS };
  const errors = [];
  for (const key of Object.keys(params)) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = number(input[key]);
    if (value == null) errors.push(`${key}必须是有限数字`);
    else params[key] = value;
  }
  for (const [key, label] of [
    ['assetPoolT', '资产池'],
    ['supplyM', '供给'],
    ['targetPrice', '目标价'],
    ['impactLow', '乘数下限'],
    ['impactHigh', '乘数上限'],
    ['yearsLow', '期限下限'],
    ['yearsHigh', '期限上限']
  ]) {
    if (!finitePositive(params[key])) errors.push(`${label}必须是正数`);
  }
  if (finitePositive(params.supplyM) && params.supplyM > MAX_SUPPLY_M) errors.push('供给不能超过 21M BTC');
  if (finitePositive(params.impactLow) && finitePositive(params.impactHigh) && params.impactLow > params.impactHigh) errors.push('乘数下限不能高于上限');
  if (finitePositive(params.yearsLow) && finitePositive(params.yearsHigh) && params.yearsLow > params.yearsHigh) errors.push('期限下限不能高于上限');
  const assetPoolUsd = params.assetPoolT * USD_T;
  const supplyBtc = params.supplyM * BTC_M;
  if (!allFinite([assetPoolUsd, supplyBtc])) errors.push('参数换算溢出');
  return { valid: errors.length === 0, errors, params };
}

export function calculateCycleTargets(input = {}, currentPrice = null) {
  const validation = validateParams(input);
  if (!validation.valid) return { ...validation, quote: null, current: null, manualTarget: null, funding: null, allocationRows: [] };
  const { params } = validation;
  const assetPoolUsd = params.assetPoolT * USD_T;
  const supplyBtc = params.supplyM * BTC_M;
  const quote = finitePositive(number(currentPrice)) ? number(currentPrice) : null;
  const currentCapitalization = quote == null ? null : supplyBtc * quote;
  const targetCapitalization = supplyBtc * params.targetPrice;
  const targetShare = targetCapitalization / assetPoolUsd;
  const deltaCapitalization = currentCapitalization == null ? null : Math.max(targetCapitalization - currentCapitalization, 0);
  const funding = deriveFunding(deltaCapitalization, params);
  const allocationRows = ALLOCATION_SCENARIOS.map(allocation => {
    const capitalization = assetPoolUsd * allocation;
    const target = capitalization / supplyBtc;
    const delta = currentCapitalization == null ? null : Math.max(capitalization - currentCapitalization, 0);
    return {
      allocation,
      capitalization,
      targetPrice: target,
      deltaCapitalization: delta,
      funding: deriveFunding(delta, params),
      reached: currentCapitalization != null && capitalization <= currentCapitalization
    };
  });
  const values = [assetPoolUsd, supplyBtc, currentCapitalization, targetCapitalization, targetShare, deltaCapitalization]
    .filter(value => value != null);
  const fundingValues = value => value == null ? [] : Object.values(value).flatMap(({ low, high }) => [low, high]);
  values.push(...fundingValues(funding));
  for (const row of allocationRows) {
    values.push(row.capitalization, row.targetPrice, ...fundingValues(row.funding));
  }
  if (!allFinite(values)) return { valid: false, errors: ['派生计算溢出'], params, quote, current: null, manualTarget: null, funding: null, allocationRows: [] };
  return {
    valid: true,
    errors: [],
    params,
    quote,
    current: currentCapitalization == null ? null : { capitalization: currentCapitalization, price: quote },
    manualTarget: { capitalization: targetCapitalization, share: targetShare },
    deltaCapitalization,
    funding,
    allocationRows
  };
}

function trimNumber(value, digits = 2) {
  return Number(value.toFixed(digits)).toString();
}

export function formatUsd(value, digits = 2) {
  if (!Number.isFinite(value)) return '$--';
  const absolute = Math.abs(value);
  if (absolute >= 1e12) return `$${trimNumber(value / 1e12, digits)}T`;
  if (absolute >= 1e9) return `$${trimNumber(value / 1e9, digits)}B`;
  if (absolute >= 1e6) return `$${trimNumber(value / 1e6, digits)}M`;
  if (absolute >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatPercent(value, digits = 2) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '--';
}

function formatRange(values, formatter = formatUsd) {
  if (!values || !Number.isFinite(values.low) || !Number.isFinite(values.high)) return '--';
  if (values.low === values.high) return formatter(values.low);
  return `${formatter(values.low)}–${formatter(values.high)}`;
}

function noopController() {
  return { update() {}, render() {}, destroy() {} };
}

export function calculateAllocationTarget(allocationPct = DEFAULT_ALLOCATION_PCT, currentPrice = null) {
  const allocation = number(allocationPct);
  if (!finitePositive(allocation) || allocation > 100) {
    return { valid: false, errors: ['占比请输入大于 0、且不超过 100 的数字'], funding: null };
  }
  const targetPrice = DEFAULT_PARAMS.assetPoolT * USD_T * allocation / 100 / (DEFAULT_PARAMS.supplyM * BTC_M);
  const result = calculateCycleTargets({ ...DEFAULT_PARAMS, targetPrice }, currentPrice);
  return { ...result, allocationPct: allocation, targetPrice };
}

function priceInChinese(value) {
  if (!finitePositive(value)) return '--';
  return value >= 10000 ? `${trimNumber(value / 10000)} 万美元` : `${Math.round(value).toLocaleString('zh-CN')} 美元`;
}

function fundingInChinese(funding) {
  if (!funding) return '待报价';
  if (funding.high === 0) return '已达到，无需新增';
  const divisor = funding.high >= 1e8 ? 1e8 : funding.high >= 1e4 ? 1e4 : 1;
  const unit = divisor === 1e8 ? '亿美元' : divisor === 1e4 ? '万美元' : '美元';
  const low = Math.round(funding.low / divisor).toLocaleString('zh-CN');
  const high = Math.round(funding.high / divisor).toLocaleString('zh-CN');
  return `${low === high ? low : `${low}–${high}`} ${unit}`;
}

export function createCycleTargets(root = null) {
  if (!root || typeof root.querySelector !== 'function') return noopController();
  const input = root.querySelector('[data-target-input="allocationPct"]');
  if (!input) return noopController();
  let currentPrice = null;
  let pending = false;
  let latest = calculateAllocationTarget(input.value, null);

  function render(result = latest) {
    latest = result;
    const setText = (selector, text) => { const element = root.querySelector(selector); if (element && element.textContent !== text) element.textContent = text; };
    const error = root.querySelector('[data-target-errors]');
    if (error) {
      error.textContent = result.errors.join(' · ');
      error.hidden = result.errors.length === 0;
    }
    const currentShare = currentPrice == null ? null : currentPrice * DEFAULT_PARAMS.supplyM * BTC_M / (DEFAULT_PARAMS.assetPoolT * USD_T);
    setText('[data-target-current-share]', formatPercent(currentShare));
    setText('[data-target-current-price]', currentPrice == null ? '待报价' : priceInChinese(currentPrice));
    setText('[data-target-goal-price]', result.valid ? priceInChinese(result.targetPrice) : '--');
    setText('[data-target-cumulative]', result.valid ? fundingInChinese(result.funding?.cumulative) : '--');
    const stale = root.querySelector('[data-target-quote-note]');
    if (stale) {
      stale.hidden = currentPrice != null;
      stale.textContent = '现价缺失或已过期；价格目标仍可估算，资金需求等待有效报价。';
    }
    return result;
  }

  function scheduleRender() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      render(calculateAllocationTarget(input.value, currentPrice));
    });
  }

  input.addEventListener('input', scheduleRender, { passive: true });
  render(latest);
  return {
    update(price) {
      currentPrice = finitePositive(number(price)) ? number(price) : null;
      scheduleRender();
    },
    render,
    destroy() { input.removeEventListener('input', scheduleRender); },
    getState() { return latest; }
  };
}
