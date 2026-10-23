const path = require('path');
const { getLogger } = require('../../lib/logger');

function parseBool(val, defaultValue, key) {
  if (val === undefined || val === '') return defaultValue;
  const str = String(val).trim().toLowerCase();
  if (str === 'true' || str === '1') return true;
  if (str === 'false' || str === '0') return false;
  try {
    getLogger().warn({ event: 'eval_config_invalid', key, value: val }, '布尔配置非法，回退默认值');
  } catch {}
  return defaultValue;
}

function parseIntGt0(val, defaultValue, key) {
  if (val === undefined || val === '') return defaultValue;
  const parsed = Number.parseInt(String(val).trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  try {
    getLogger().warn({ event: 'eval_config_invalid', key, value: val }, '正整数配置非法，回退默认值');
  } catch {}
  return defaultValue;
}

function parseNumberGte0(val, defaultValue, key) {
  if (val === undefined || val === '') return defaultValue;
  const parsed = Number.parseFloat(String(val).trim());
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  try {
    getLogger().warn({ event: 'eval_config_invalid', key, value: val }, '数值配置非法，回退默认值');
  } catch {}
  return defaultValue;
}

function parseEnum(val, allowed, defaultValue, key) {
  if (val === undefined || val === '') return defaultValue;
  const str = String(val).trim().toLowerCase();
  if (allowed.includes(str)) return str;
  try {
    getLogger().warn({ event: 'eval_config_invalid', key, value: val }, '枚举配置非法，回退默认值');
  } catch {}
  return defaultValue;
}

function getConfig() {
  return {
    enabled: parseBool(process.env.HARNESS_EVAL_ENABLED, true, 'HARNESS_EVAL_ENABLED'),
    maxCases: parseIntGt0(process.env.HARNESS_EVAL_MAX_CASES, 50, 'HARNESS_EVAL_MAX_CASES'),
    maxConcurrency: parseIntGt0(process.env.HARNESS_EVAL_MAX_CONCURRENCY, 1, 'HARNESS_EVAL_MAX_CONCURRENCY'),
    liveEnabled: parseBool(process.env.HARNESS_EVAL_LIVE_ENABLED, false, 'HARNESS_EVAL_LIVE_ENABLED'),
    model: (process.env.HARNESS_EVAL_MODEL || '').trim(),
    timeoutMs: parseIntGt0(process.env.HARNESS_EVAL_TIMEOUT_MS, 60000, 'HARNESS_EVAL_TIMEOUT_MS'),
    runRetention: parseIntGt0(process.env.HARNESS_EVAL_RUN_RETENTION, 50, 'HARNESS_EVAL_RUN_RETENTION'),
    maxOutputChars: parseIntGt0(process.env.HARNESS_EVAL_MAX_OUTPUT_CHARS, 8000, 'HARNESS_EVAL_MAX_OUTPUT_CHARS'),
    regressionTolerance: parseNumberGte0(process.env.HARNESS_EVAL_REGRESSION_TOLERANCE, 0, 'HARNESS_EVAL_REGRESSION_TOLERANCE'),
    requireBaseline: parseBool(process.env.HARNESS_EVAL_REQUIRE_BASELINE, false, 'HARNESS_EVAL_REQUIRE_BASELINE'),
    liveBaseline: parseEnum(process.env.HARNESS_EVAL_LIVE_BASELINE, ['warn', 'fail'], 'warn', 'HARNESS_EVAL_LIVE_BASELINE'),
    staleMs: parseIntGt0(process.env.HARNESS_EVAL_STALE_MS, 600000, 'HARNESS_EVAL_STALE_MS'),
    suiteDir: process.env.HARNESS_EVAL_SUITE_DIR || path.join(__dirname, '../../../eval/suites'),
  };
}

module.exports = {
  getConfig,
};
