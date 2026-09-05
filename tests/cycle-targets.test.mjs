import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOCATION_SCENARIOS,
  DEFAULT_PARAMS,
  calculateCycleTargets,
  calculateAllocationTarget,
  formatUsd,
  validateParams
} from '../assets/cycle-targets.mjs';

test('single allocation control defaults to 1.5% and derives target price and funding', () => {
  const result = calculateAllocationTarget(undefined, 80000);
  assert.equal(result.allocationPct, 1.5);
  assert.equal(result.targetPrice, 225000);
  assert.equal(result.manualTarget.capitalization, 4.5e12);
  assert.equal(result.funding.cumulative.low, 145e9);
  assert.equal(result.funding.cumulative.high, 2.9e12 / 15);
  assert.equal(calculateAllocationTarget(1, 80000).targetPrice, 150000);
  assert.equal(calculateAllocationTarget(2, null).funding, null);
  for (const invalid of ['', 0, -1, 101, Infinity]) assert.equal(calculateAllocationTarget(invalid).valid, false);
});

test('allocation scenarios map 300T / 20M to the expected target prices', () => {
  const result = calculateCycleTargets(DEFAULT_PARAMS, 80_000);
  const onePercent = result.allocationRows.find(row => row.allocation === 0.01);
  assert.equal(onePercent.capitalization, 3e12);
  assert.equal(onePercent.targetPrice, 150_000);
  assert.deepEqual(result.allocationRows.map(row => row.allocation), [...ALLOCATION_SCENARIOS]);
});

test('reference funding arithmetic keeps capitalization and cash flow distinct', () => {
  const result = calculateCycleTargets(DEFAULT_PARAMS, 80_000);
  assert.equal(result.current.capitalization, 1.6e12);
  assert.equal(result.manualTarget.capitalization, 3.4e12);
  assert.equal(result.deltaCapitalization, 1.8e12);
  assert.deepEqual(result.funding.cumulative, { low: 90e9, high: 120e9 });
  assert.deepEqual(result.funding.annual, { low: 30e9, high: 60e9 });
  assert.deepEqual(result.funding.monthly, { low: 2.5e9, high: 5e9 });
});

test('stress multiplier changes only funding scale', () => {
  const stress = calculateCycleTargets({ ...DEFAULT_PARAMS, impactLow: 5, impactHigh: 5 }, 80_000);
  assert.equal(stress.manualTarget.capitalization, 3.4e12);
  assert.deepEqual(stress.funding.cumulative, { low: 360e9, high: 360e9 });
  assert.deepEqual(stress.funding.annual, { low: 120e9, high: 180e9 });
});

test('reached targets have zero positive funding', () => {
  const result = calculateCycleTargets(DEFAULT_PARAMS, 200_000);
  assert.equal(result.deltaCapitalization, 0);
  assert.deepEqual(result.funding.cumulative, { low: 0, high: 0 });
  assert.ok(result.allocationRows.every(row => row.reached || row.deltaCapitalization > 0));
});

test('missing quote leaves independent target values but clears quote-dependent funding', () => {
  const result = calculateCycleTargets(DEFAULT_PARAMS, null);
  assert.equal(result.valid, true);
  assert.equal(result.current, null);
  assert.equal(result.manualTarget.capitalization, 3.4e12);
  assert.equal(result.deltaCapitalization, null);
  assert.equal(result.funding, null);
});

test('invalid and overflowing parameters are rejected locally', () => {
  assert.equal(validateParams({ ...DEFAULT_PARAMS, supplyM: 0 }).valid, false);
  assert.equal(validateParams({ ...DEFAULT_PARAMS, impactLow: 20, impactHigh: 15 }).valid, false);
  assert.equal(validateParams({ ...DEFAULT_PARAMS, yearsLow: 3, yearsHigh: 2 }).valid, false);
  assert.equal(validateParams({ ...DEFAULT_PARAMS, supplyM: 22 }).valid, false);
  assert.equal(calculateCycleTargets({ ...DEFAULT_PARAMS, targetPrice: Number.NaN }, 80_000).valid, false);
  assert.equal(formatUsd(90e9), '$90B');
  assert.equal(formatUsd(Infinity), '$--');
});

test('derived funding and allocation overflow never leak into valid results', () => {
  assert.equal(calculateCycleTargets({ impactLow: 1e-310, impactHigh: 1e-310 }, 80_000).valid, false);
  assert.equal(calculateCycleTargets({ supplyM: 1e-310 }, 80_000).valid, false);
  assert.equal(calculateCycleTargets({ yearsLow: 1e-310, yearsHigh: 1e-310 }, 80_000).valid, false);
  assert.equal(calculateCycleTargets({ assetPoolT: Number.MAX_VALUE }, 80_000).valid, false);
});
