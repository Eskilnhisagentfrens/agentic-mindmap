// Map low-level / SDK error messages into actionable user-facing strings.
// Pure function — no Electron / Node-only globals — so it lives in /lib and
// gets unit-tested without spawning the main process.
//
// Returns { user, code }. The renderer surfaces `user` in the toast; callers
// should always log the original message at error level upstream.
//
// Code reference (callers can switch on these):
//   INSUFFICIENT_CREDITS  — DeepSeek balance exhausted
//   NO_KEY                — no DEEPSEEK_API_KEY / ANTHROPIC_API_KEY anywhere
//   INVALID_KEY           — auth rejected (bad / expired key)
//   RATE_LIMITED          — 429 from upstream
//   QUOTA_EXCEEDED        — quota_exceeded (different from credit balance)
//   NETWORK_TIMEOUT       — TCP timeout / reset
//   DNS_ERROR             — getaddrinfo / ENOTFOUND
//   MODEL_NOT_FOUND       — model name typo / wrong provider
//   PARSE_ERROR           — model returned non-JSON / invalid JSON
//   EMPTY_OUTPUT          — model returned no usable children
//   UNKNOWN               — fallthrough; raw message is truncated into `user`

function friendlyError(rawMsg) {
  const msg = String(rawMsg || '');
  const lo = msg.toLowerCase();
  if (lo.includes('credit balance is too low')) {
    return { user: 'DeepSeek 余额不足。请到 platform.deepseek.com 充值后重试。', code: 'INSUFFICIENT_CREDITS' };
  }
  if (lo.includes('未找到 api key') || lo.includes('not in keychain') || lo.includes('requires deepseek_api_key') || lo.includes('requires anthropic_api_key')) {
    return { user: '尚未配置 API key。在终端跑：security add-generic-password -a "$USER" -s DEEPSEEK_API_KEY -w "你的key"', code: 'NO_KEY' };
  }
  if (lo.includes('invalid api key') || lo.includes('authentication') || lo.includes('401') || lo.includes('unauthorized')) {
    return { user: 'API key 无效或已过期。请在 Keychain 或环境变量中重置。', code: 'INVALID_KEY' };
  }
  if (lo.includes('rate limit') || lo.includes('429')) {
    return { user: '请求过于频繁，请稍等几秒后重试。', code: 'RATE_LIMITED' };
  }
  if (lo.includes('quota') || lo.includes('insufficient_quota')) {
    return { user: '配额已用完，请检查账户状态或更换 provider。', code: 'QUOTA_EXCEEDED' };
  }
  if (lo.includes('timeout') || lo.includes('etimedout') || lo.includes('econnreset')) {
    return { user: '网络超时。检查 api.deepseek.com 是否可达，或稍后重试。', code: 'NETWORK_TIMEOUT' };
  }
  if (lo.includes('enotfound') || lo.includes('getaddrinfo')) {
    return { user: 'DNS 解析失败，请检查网络连接。', code: 'DNS_ERROR' };
  }
  if (lo.includes('model') && (lo.includes('not found') || lo.includes('does not exist'))) {
    return { user: '模型未找到。检查 EXPOUND_MODEL_* 环境变量是否拼写正确。', code: 'MODEL_NOT_FOUND' };
  }
  if (lo.includes('model returned non-json') || lo.includes('invalid json')) {
    return { user: 'AI 返回格式异常。如多次出现请报 Bug 并附日志。', code: 'PARSE_ERROR' };
  }
  if (lo.includes('no usable children')) {
    return { user: 'AI 没有给出有效子节点，请换个表述重试。', code: 'EMPTY_OUTPUT' };
  }
  // Generic fallback — keep raw message but truncate so the toast stays readable.
  return { user: '请求失败：' + msg.slice(0, 200), code: 'UNKNOWN' };
}

module.exports = { friendlyError };
