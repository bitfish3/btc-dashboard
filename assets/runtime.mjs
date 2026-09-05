/**
 * Small, dependency-free runtime primitives for the dashboard.
 *
 * This module deliberately has no DOM dependency.  The dashboard can use the
 * same code in a browser and the tests can inject fetch, storage and clocks.
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 120_000;

function asError(value, fallback = 'Runtime operation failed') {
  if (value instanceof Error) return value;
  if (value == null) return new Error(fallback);
  return new Error(String(value));
}

function abortError(message = 'The operation was aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function timeoutError(url, timeoutMs) {
  const error = new Error(`Request timed out after ${timeoutMs}ms`);
  error.name = 'TimeoutError';
  error.code = 'TIMEOUT';
  error.url = url;
  error.timeoutMs = timeoutMs;
  return error;
}

/**
 * Fetch JSON with one deadline covering both response headers and body
 * decoding.  A test or browser fetch implementation that ignores AbortSignal
 * cannot keep this promise alive past the deadline.
 */
export function requestJson(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: parentSignal,
    fetchImpl = globalThis.fetch,
    ...requestInit
  } = options;

  if (typeof fetchImpl !== 'function') {
    return Promise.reject(new TypeError('fetchImpl must be a function'));
  }

  const budget = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timer = null;
  let settled = false;
  let removeParentListener = () => {};

  const finish = (resolve, reject, result, isError = false) => {
    if (settled) return;
    settled = true;
    if (timer !== null) clearTimeout(timer);
    removeParentListener();
    if (isError) reject(result);
    else resolve(result);
  };

  return new Promise((resolve, reject) => {
    if (parentSignal?.aborted) {
      try { controller.abort(); } catch (_) {}
      finish(resolve, reject, abortError(), true);
      return;
    }

    const abortFromParent = () => {
      try { controller.abort(); } catch (_) {}
      finish(resolve, reject, abortError(), true);
    };
    if (parentSignal?.addEventListener) {
      parentSignal.addEventListener('abort', abortFromParent, { once: true });
      removeParentListener = () => parentSignal.removeEventListener?.('abort', abortFromParent);
    }

    timer = setTimeout(() => {
      try { controller.abort(); } catch (_) {}
      finish(resolve, reject, timeoutError(url, budget), true);
    }, budget);

    Promise.resolve()
      .then(() => fetchImpl(url, { ...requestInit, signal: controller.signal }))
      .then((response) => {
        if (!response || response.ok === false ||
            (Number.isFinite(response.status) && response.status >= 400)) {
          const status = response?.status;
          const error = new Error(`HTTP request failed${status ? ` (${status})` : ''}`);
          error.name = 'HttpError';
          error.code = 'HTTP_ERROR';
          error.status = status;
          error.url = url;
          throw error;
        }
        if (typeof response.json !== 'function') {
          throw new TypeError('Response does not provide json()');
        }
        // Keep the deadline alive until this body promise resolves.
        return response.json();
      })
      .then((value) => finish(resolve, reject, value))
      .catch((error) => finish(resolve, reject, asError(error), true));
  });
}

/**
 * Resolve the first validated source.  Each source receives its own signal;
 * the winner is left alone while all losers are aborted.  Sources are
 * expected to reject invalid provider payloads themselves. Keeping that
 * validation in each adapter means the race cannot promote a semantically
 * invalid response simply because it arrived first.
 */
export function raceSources(sources, options = {}) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return Promise.reject(new AggregateError([], 'No data sources were provided'));
  }

  // Validate the whole list before starting any request, so a malformed
  // source entry cannot leave an earlier request running in the background.
  for (const source of sources) {
    if (typeof source !== 'function') {
      return Promise.reject(new TypeError('Each source must be a function'));
    }
  }

  const parentSignal = options?.signal;
  const controllers = [];
  const errors = [];
  let remaining = sources.length;
  let settled = false;
  let removeParentListener = () => {};

  const abortOthers = (winnerIndex = -1) => {
    controllers.forEach((controller, index) => {
      if (index === winnerIndex) return;
      try { controller.abort(); } catch (_) {}
    });
  };

  return new Promise((resolve, reject) => {
    if (parentSignal?.aborted) {
      reject(abortError());
      return;
    }

    const abortAll = () => {
      if (settled) return;
      settled = true;
      removeParentListener();
      abortOthers();
      reject(abortError());
    };
    if (parentSignal?.addEventListener) {
      parentSignal.addEventListener('abort', abortAll, { once: true });
      removeParentListener = () => parentSignal.removeEventListener?.('abort', abortAll);
    }

    for (let index = 0; index < sources.length; index += 1) {
      const run = sources[index];
      const controller = new AbortController();
      controllers.push(controller);
      Promise.resolve()
        .then(() => run(controller.signal))
        .then((value) => {
          if (settled) return;
          settled = true;
          removeParentListener();
          abortOthers(index);
          resolve(value);
        })
        .catch((error) => {
          errors[index] = asError(error);
          if (settled) return;
          remaining -= 1;
          if (remaining === 0) {
            settled = true;
            removeParentListener();
            reject(new AggregateError(errors.filter(Boolean), 'All data sources failed'));
          }
        });
    }
  });
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch (_) {
    return undefined;
  }
}

function cloneRecord(record) {
  if (!record) return null;
  return {
    t: record.t,
    value: record.value,
    v: record.value,
    dataAt: record.dataAt ?? null,
    source: record.source ?? null,
  };
}

function timestampFrom(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isFutureTimestamp(value, currentTime) {
  const timestamp = timestampFrom(value);
  return timestamp !== null && Number.isFinite(timestamp) && timestamp > currentTime;
}

/**
 * Two-layer last-good store.  `getRecord` exposes a validated record even
 * after it ages out, allowing the UI to render stale data explicitly; `get`
 * only returns values within maxAgeMs.
 */
export function createStore(options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const validators = options.validators && typeof options.validators === 'object'
    ? options.validators : {};
  const prefix = typeof options.prefix === 'string' ? options.prefix : 'btc_';
  const memory = new Map();
  const listeners = new Set();

  const validate = (key, value) => {
    const validator = validators[key];
    if (typeof validator !== 'function') return true;
    try { return validator(value) === true; } catch (_) { return false; }
  };

  const parse = (key, raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const rawTime = raw.t ?? raw.fetchedAt ?? raw.timestamp;
    if (typeof rawTime !== 'number' || !Number.isFinite(rawTime) || rawTime < 0 || rawTime > now()) return null;
    const t = rawTime;
    const value = Object.prototype.hasOwnProperty.call(raw, 'v') ? raw.v : raw.value;
    const dataAt = raw.dataAt ?? raw.data_at ?? null;
    if (!validate(key, value) || isFutureTimestamp(dataAt, now())) return null;
    return {
      t,
      value,
      dataAt,
      source: raw.source ?? null,
    };
  };

  const read = (key) => {
    if (memory.has(key)) return memory.get(key);
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      const text = storage.getItem(prefix + key);
      if (text == null) return null;
      const record = parse(key, JSON.parse(text));
      if (!record) return null;
      memory.set(key, record);
      return record;
    } catch (_) {
      return null;
    }
  };

  const emit = (event) => {
    for (const listener of listeners) {
      try { listener(event); } catch (_) { /* observers must not break storage */ }
    }
  };

  const getRecord = (key) => cloneRecord(read(key));

  const get = (key, maxAgeMs = Infinity) => {
    const record = read(key);
    if (!record) return null;
    const age = now() - record.t;
    if (!Number.isFinite(age) || age < 0 || age >= maxAgeMs) return null;
    return record.value;
  };

  const set = (key, value, metadata = {}) => {
    if (typeof key !== 'string' || key.length === 0 || !validate(key, value)) return null;
    const currentTime = now();
    if (!Number.isFinite(currentTime) || currentTime < 0 || isFutureTimestamp(metadata.dataAt, currentTime)) {
      return null;
    }
    const record = {
      t: currentTime,
      value,
      dataAt: metadata.dataAt ?? null,
      source: metadata.source ?? null,
    };
    // Memory is the required last-good path. Persistence is best effort.
    memory.set(key, record);
    if (storage && typeof storage.setItem === 'function') {
      try {
        storage.setItem(prefix + key, JSON.stringify({
          t: record.t,
          v: record.value,
          dataAt: record.dataAt,
          source: record.source,
        }));
      } catch (_) {}
    }
    const publicRecord = cloneRecord(record);
    emit({ type: 'set', key, record: publicRecord });
    return publicRecord;
  };

  const subscribe = (listener) => {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { get, getRecord, set, subscribe };
}

function activeValue(isActive) {
  try {
    return typeof isActive === 'function' ? isActive() !== false : isActive !== false;
  } catch (_) {
    return false;
  }
}

function safeNow(now) {
  const value = Number(now());
  return Number.isFinite(value) ? value : Date.now();
}

/**
 * Visibility-aware scheduler.  A task's run promise is shared by duplicate
 * calls, so interval timers and manual refreshes cannot overlap.
 */
export function createScheduler(options = {}) {
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const setTimer = typeof options.setTimer === 'function' ? options.setTimer : setTimeout;
  const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout;
  const isActive = options.isActive === undefined ? () => true : options.isActive;
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  const entries = new Map();
  let started = false;

  for (const task of tasks) {
    if (!task || typeof task.key !== 'string' || !task.key || typeof task.run !== 'function') {
      throw new TypeError('Each scheduler task requires a unique key and run function');
    }
    if (entries.has(task.key)) throw new TypeError(`Duplicate scheduler task: ${task.key}`);
    const intervalMs = Number.isFinite(task.intervalMs) && task.intervalMs > 0 ? task.intervalMs : 60_000;
    const initialDelayMs = Number.isFinite(task.initialDelayMs) && task.initialDelayMs >= 0
      ? task.initialDelayMs : 0;
    entries.set(task.key, {
      task,
      intervalMs,
      nextDue: safeNow(now) + initialDelayMs,
      lastAttempt: null,
      lastSuccess: null,
      phase: 'idle',
      inFlight: false,
      error: null,
      failures: 0,
      timer: null,
      promise: null,
    });
  }

  const snapshot = (entry) => ({
    key: entry.task.key,
    phase: entry.phase,
    lastAttempt: entry.lastAttempt,
    lastSuccess: entry.lastSuccess,
    nextDue: entry.nextDue,
    inFlight: entry.inFlight,
    error: entry.error,
  });

  const emit = (entry) => {
    try { onStatus(snapshot(entry)); } catch (_) {}
  };

  const schedule = (entry) => {
    if (!started || entry.timer !== null) return;
    const delay = Math.max(0, entry.nextDue - safeNow(now));
    entry.timer = setTimer(() => {
      entry.timer = null;
      if (!started || !activeValue(isActive)) return;
      if (safeNow(now) >= entry.nextDue) {
        void run(entry.task.key).catch(() => {});
      } else {
        schedule(entry);
      }
    }, delay);
  };

  const run = (key) => {
    const entry = entries.get(key);
    if (!entry) return Promise.reject(new Error(`Unknown scheduler task: ${key}`));
    if (!started || !activeValue(isActive)) return Promise.resolve(undefined);
    if (entry.promise) return entry.promise;

    entry.inFlight = true;
    entry.phase = 'loading';
    entry.lastAttempt = safeNow(now);
    entry.error = null;
    emit(entry);

    entry.promise = Promise.resolve()
      .then(() => entry.task.run())
      .then((value) => {
        entry.failures = 0;
        entry.phase = 'available';
        entry.lastSuccess = safeNow(now);
        entry.nextDue = entry.lastSuccess + entry.intervalMs;
        entry.error = null;
        return value;
      }, (error) => {
        entry.failures += 1;
        entry.phase = 'unavailable';
        entry.error = asError(error);
        const backoff = Math.min(
          DEFAULT_BACKOFF_MS * (2 ** (entry.failures - 1)),
          MAX_BACKOFF_MS,
          entry.intervalMs,
        );
        entry.nextDue = safeNow(now) + backoff;
        throw error;
      })
      .finally(() => {
        entry.inFlight = false;
        entry.promise = null;
        emit(entry);
        if (started) schedule(entry);
      });

    return entry.promise;
  };

  const refreshDue = () => {
    if (!started || !activeValue(isActive)) return [];
    const due = [];
    for (const entry of entries.values()) {
      if (safeNow(now) >= entry.nextDue && !entry.inFlight) {
        const promise = run(entry.task.key);
        // Timer/visibility callers commonly ignore the returned list. Mark
        // the original promise handled while returning it unchanged so an
        // explicit caller can still await and observe a rejection.
        promise.catch(() => {});
        due.push(promise);
      } else {
        schedule(entry);
      }
    }
    return due;
  };

  const start = () => {
    if (started) return;
    started = true;
    for (const entry of entries.values()) schedule(entry);
    refreshDue();
  };

  const stop = () => {
    started = false;
    for (const entry of entries.values()) {
      if (entry.timer !== null) {
        clearTimer(entry.timer);
        entry.timer = null;
      }
    }
  };

  const getState = (key) => {
    if (key !== undefined) {
      const entry = entries.get(key);
      return entry ? snapshot(entry) : null;
    }
    const state = {};
    for (const [taskKey, entry] of entries) state[taskKey] = snapshot(entry);
    return state;
  };

  return { start, stop, refreshDue, run, getState };
}

export { DEFAULT_TIMEOUT_MS };
