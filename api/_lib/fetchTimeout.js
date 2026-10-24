// Drop-in replacement for the global fetch() that gives every upstream call a
// timeout. Without one, a stalled provider (NSE, Yahoo, mfapi...) would hang
// the serverless function until the platform kills it, and the person would
// wait on a spinner. A caller that passes its own `signal` keeps it.
const DEFAULT_TIMEOUT_MS = 8000;

export function fetch(url, options = {}) {
  const signal = options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  return globalThis.fetch(url, { ...options, signal });
}
