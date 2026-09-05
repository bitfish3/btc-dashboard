import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createScheduler,
  createStore,
  raceSources,
  requestJson,
} from '../assets/runtime.mjs';

function response(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => body instanceof Error ? Promise.reject(body) : Promise.resolve(body),
  };
}

function fakeClock(start = 0) {
  let current = start;
  let nextId = 1;
  const timers = new Map();
  const now = () => current;
  const setTimer = (fn, delay = 0) => {
    const id = nextId++;
    timers.set(id, { at: current + Math.max(0, delay), fn });
    return id;
  };
  const clearTimer = (id) => timers.delete(id);
  const advance = async (amount) => {
    const target = current + amount;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id);
      current = timer.at;
      timer.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    current = target;
    await Promise.resolve();
  };
  return { now, setTimer, clearTimer, advance, pending: () => timers.size };
}

test('requestJson rejects HTTP errors and malformed JSON', async () => {
  await assert.rejects(
    requestJson('/http-error', { fetchImpl: async () => response({}, { ok: false, status: 503 }) }),
    (error) => error.name === 'HttpError' && error.status === 503,
  );
  await assert.rejects(
    requestJson('/bad-json', { fetchImpl: async () => response(new SyntaxError('bad json')) }),
    /bad json/,
  );
});

test('requestJson deadline covers a body that never completes', async () => {
  let aborted = false;
  await assert.rejects(
    requestJson('/stalled-body', {
      timeoutMs: 10,
      fetchImpl: async (_url, init) => {
        init.signal.addEventListener('abort', () => { aborted = true; });
        return { ok: true, status: 200, json: () => new Promise(() => {}) };
      },
    }),
    (error) => error.name === 'TimeoutError' && error.code === 'TIMEOUT',
  );
  assert.equal(aborted, true);
});

test('requestJson propagates caller cancellation', async () => {
  const controller = new AbortController();
  const pending = requestJson('/cancelled', {
    signal: controller.signal,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('fetch aborted')));
    }),
  });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

test('raceSources accepts the first source that validates itself and aborts losers', async () => {
  let loserAborted = false;
  const winner = raceSources([
    () => Promise.resolve({ price: 100, valid: true }),
    (signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        loserAborted = true;
        resolve({ price: 1, valid: false });
      });
    }),
  ]);
  assert.deepEqual(await winner, { price: 100, valid: true });
  assert.equal(loserAborted, true);
});

test('raceSources ignores rejected invalid sources and rejects when all fail', async () => {
  const value = await raceSources([
    () => Promise.reject(new Error('provider payload invalid')),
    () => Promise.resolve('valid source'),
  ]);
  assert.equal(value, 'valid source');
  await assert.rejects(
    raceSources([() => Promise.reject(new Error('a')), () => Promise.reject(new Error('b'))]),
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
});

test('raceSources validates its complete source list before starting requests', async () => {
  let started = 0;
  await assert.rejects(
    raceSources([() => { started += 1; return Promise.resolve('ok'); }, null]),
    TypeError,
  );
  assert.equal(started, 0);
});

test('store validates values, supports legacy records, and returns stale last-good records', () => {
  let current = 10_000;
  const data = new Map([
    ['btc_legacy', JSON.stringify({ t: 9_000, v: 42 })],
    ['btc_future', JSON.stringify({ t: 20_000, v: 7 })],
  ]);
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const store = createStore({
    now: () => current,
    storage,
    validators: { price: (value) => Number.isFinite(value) && value > 0 },
  });

  assert.equal(store.get('legacy', 2_000), 42);
  assert.equal(store.getRecord('future'), null);
  assert.equal(store.set('price', -1), null);
  const record = store.set('price', 100, { dataAt: 9_500, source: 'test' });
  assert.equal(record.value, 100);
  assert.equal(record.v, 100);
  current = 10_002;
  assert.equal(store.get('price', 1), null);
  assert.equal(store.getRecord('price').source, 'test');
  current = 10_001;
  assert.equal(store.get('price', 2), 100);
});

test('store keeps memory available when persistence throws and notifies subscribers', () => {
  let current = 1_000;
  const events = [];
  const store = createStore({
    now: () => current,
    storage: {
      getItem() { throw new Error('private mode'); },
      setItem() { throw new Error('quota'); },
    },
    validators: { metric: (value) => Number.isFinite(value) },
  });
  const unsubscribe = store.subscribe((event) => events.push(event));
  assert.equal(store.set('metric', 3.14)?.value, 3.14);
  assert.equal(store.get('metric', 100), 3.14);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'metric');
  unsubscribe();
  current += 1;
  store.set('metric', 4);
  assert.equal(events.length, 1);
});

test('store requires validators to return true and rejects future data_at', () => {
  let current = 1_000;
  const storage = new Map([
    ['btc_truthy', JSON.stringify({ t: 900, v: 1 })],
    ['btc_future-data', JSON.stringify({ t: 900, v: 1, data_at: 2_000 })],
  ]);
  const store = createStore({
    now: () => current,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    validators: { truthy: () => 1, 'future-data': () => true },
  });
  assert.equal(store.get('truthy', 200), null);
  assert.equal(store.getRecord('future-data'), null);
});

test('scheduler shares an in-flight run and reports lifecycle state', async () => {
  const clock = fakeClock();
  const statuses = [];
  let resolveTask;
  let calls = 0;
  const scheduler = createScheduler({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onStatus: (state) => statuses.push(state),
    tasks: [{
      key: 'price',
      intervalMs: 100,
      initialDelayMs: 0,
      run: () => {
        calls += 1;
        return new Promise((resolve) => { resolveTask = resolve; });
      },
    }],
  });

  scheduler.start();
  await Promise.resolve();
  const first = scheduler.run('price');
  const second = scheduler.run('price');
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  assert.equal(scheduler.getState('price').inFlight, true);
  assert.equal(scheduler.getState('price').phase, 'loading');
  resolveTask({ price: 100 });
  assert.deepEqual(await first, { price: 100 });
  const state = scheduler.getState('price');
  assert.equal(state.phase, 'available');
  assert.equal(state.lastSuccess, 0);
  assert.equal(state.nextDue, 100);
  assert.ok(statuses.some((entry) => entry.phase === 'loading'));
  assert.ok(statuses.some((entry) => entry.phase === 'available'));
});

test('scheduler pauses inactive tasks and starts only due work on return', async () => {
  const clock = fakeClock();
  let active = false;
  let calls = 0;
  const scheduler = createScheduler({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    isActive: () => active,
    tasks: [{ key: 'slow', intervalMs: 1_000, initialDelayMs: 0, run: async () => { calls += 1; } }],
  });
  scheduler.start();
  await clock.advance(2_000);
  assert.equal(calls, 0);
  active = true;
  const pending = scheduler.refreshDue();
  await Promise.all(pending);
  assert.equal(calls, 1);
});

test('scheduler applies bounded exponential failure backoff without changing last success', async () => {
  const clock = fakeClock();
  let calls = 0;
  const scheduler = createScheduler({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    tasks: [{
      key: 'failing',
      intervalMs: 60_000,
      initialDelayMs: 0,
      run: async () => { calls += 1; throw new Error('offline'); },
    }],
  });
  scheduler.start();
  await clock.advance(0);
  assert.equal(calls, 1);
  assert.equal(scheduler.getState('failing').nextDue, 5_000);
  assert.equal(scheduler.getState('failing').lastSuccess, null);
  await clock.advance(4_999);
  assert.equal(calls, 1);
  await clock.advance(1);
  assert.equal(calls, 2);
  assert.equal(scheduler.getState('failing').nextDue, 15_000);
});

test('scheduler handles timer-triggered failures without unhandled rejections', async () => {
  const clock = fakeClock();
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  const scheduler = createScheduler({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    tasks: [{
      key: 'offline',
      intervalMs: 60_000,
      initialDelayMs: 0,
      run: async () => { throw new Error('offline'); },
    }],
  });
  scheduler.start();
  await clock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(unhandled, []);
});
