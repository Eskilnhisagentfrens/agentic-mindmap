// Unit tests for lib/friendly-error.js — the error-message mapping that
// translates low-level / SDK strings into actionable Chinese for the toast.

const test = require('node:test');
const assert = require('node:assert/strict');

const { friendlyError } = require('../../lib/friendly-error.js');

test('insufficient credits → INSUFFICIENT_CREDITS with billing link', () => {
  const r = friendlyError("Error code: 400 - {'error': {'message': 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'}}");
  assert.equal(r.code, 'INSUFFICIENT_CREDITS');
  assert.match(r.user, /余额不足/);
  assert.match(r.user, /platform\.deepseek\.com/);
});

test('no key → NO_KEY with security cmd', () => {
  for (const raw of [
    '未找到 API key',
    'not in keychain',
    'EXPOUND_PROVIDER=deepseek requires DEEPSEEK_API_KEY to be set.',
    'requires anthropic_api_key',
  ]) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'NO_KEY', `expected NO_KEY for "${raw}"`);
    assert.match(r.user, /API key/);
    assert.match(r.user, /security add-generic-password/);
  }
});

test('invalid key → INVALID_KEY', () => {
  for (const raw of [
    'Invalid API key provided',
    '401 Unauthorized',
    'authentication_error',
    'unauthorized',
  ]) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'INVALID_KEY', `expected INVALID_KEY for "${raw}"`);
    assert.match(r.user, /无效|过期/);
  }
});

test('rate limit → RATE_LIMITED', () => {
  for (const raw of ['rate limit exceeded', 'HTTP 429 Too Many Requests']) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'RATE_LIMITED');
    assert.match(r.user, /频繁|稍等/);
  }
});

test('quota → QUOTA_EXCEEDED', () => {
  for (const raw of ['quota exceeded', 'insufficient_quota']) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'QUOTA_EXCEEDED', `for "${raw}"`);
  }
});

test('timeout → NETWORK_TIMEOUT', () => {
  for (const raw of ['Request timeout', 'connect ETIMEDOUT', 'socket ECONNRESET']) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'NETWORK_TIMEOUT', `for "${raw}"`);
  }
});

test('DNS failure → DNS_ERROR', () => {
  for (const raw of ['getaddrinfo ENOTFOUND api.deepseek.com', 'ENOTFOUND']) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'DNS_ERROR', `for "${raw}"`);
    assert.match(r.user, /DNS|网络/);
  }
});

test('model not found → MODEL_NOT_FOUND', () => {
  for (const raw of ['model not found', 'model deepseek-v999 does not exist']) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'MODEL_NOT_FOUND', `for "${raw}"`);
  }
});

test('parse error → PARSE_ERROR', () => {
  for (const raw of ['model returned non-JSON: ...', 'Invalid JSON in response']) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'PARSE_ERROR', `for "${raw}"`);
  }
});

test('empty output → EMPTY_OUTPUT', () => {
  const r = friendlyError('no usable children in response');
  assert.equal(r.code, 'EMPTY_OUTPUT');
  assert.match(r.user, /换个表述|重试/);
});

test('unknown error → UNKNOWN with truncated raw message', () => {
  const long = 'something completely unexpected happened that we did not classify '.repeat(20);
  const r = friendlyError(long);
  assert.equal(r.code, 'UNKNOWN');
  assert.ok(r.user.length <= 220, `user message should be truncated, got ${r.user.length} chars`);
  assert.match(r.user, /请求失败/);
});

test('null / undefined / empty input degrades safely', () => {
  for (const raw of [null, undefined, '', 0, false]) {
    const r = friendlyError(raw);
    assert.equal(r.code, 'UNKNOWN');
    assert.equal(typeof r.user, 'string');
    assert.ok(r.user.length > 0);
  }
});

test('priority: NO_KEY beats INVALID_KEY when both substrings appear', () => {
  // If a raw message contains both "not in keychain" and "401" (e.g. some
  // wrapped error), NO_KEY should win because it's more actionable.
  const r = friendlyError('Error: not in keychain (would have been 401)');
  assert.equal(r.code, 'NO_KEY');
});

test('case-insensitive matching', () => {
  const upper = friendlyError('CREDIT BALANCE IS TOO LOW');
  assert.equal(upper.code, 'INSUFFICIENT_CREDITS');
  const mixed = friendlyError('Rate Limit exceeded');
  assert.equal(mixed.code, 'RATE_LIMITED');
});
