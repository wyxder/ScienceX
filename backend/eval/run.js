const fs = require('fs');
const path = require('path');

// 离线优先：未传 --live 时跳过读取本地 .env 密钥
if (!process.argv.includes('--live')) process.env.SCIENCEX_SKIP_ENV_FILE = 'true';

const { score } = require('../src/harness/eval/scorer');
const suites = require('../src/harness/eval/suites');
const runner = require('../src/harness/eval/runner');
const gate = require('../src/harness/eval/gate');
const { client, config: aiConfig } = require('../src/ai');
const { version: promptVersion } = require('../src/ai/prompts');

function parseArgs(argv) {
  const options = {
    check: false,
    live: false,
    suiteId: 'core',
    baselineRef: null,
    reportPath: null,
  };

  for (const arg of argv) {
    if (arg === '--check') options.check = true;
    else if (arg === '--live') options.live = true;
    else if (arg.startsWith('--suite=')) options.suiteId = arg.slice(8).trim();
    else if (arg.startsWith('--baseline=')) options.baselineRef = arg.slice(11).trim();
    else if (arg.startsWith('--report=')) options.reportPath = arg.slice(9).trim();
  }

  return options;
}

function loadBaseline(baselineRef) {
  if (!baselineRef) return null;
  const filePath = path.resolve(baselineRef);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      throw new Error(`基线文件解析失败: ${e.message}`);
    }
  }
  // 也可以从本地 store 查找
  try {
    const store = require('../src/lib/store');
    const found = store.evalBaselines?.find((b) => b.id === baselineRef);
    if (found) return found;
  } catch {}
  throw new Error(`找不到指定的基线: ${baselineRef}`);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const isLive = options.live;

  if (isLive && !aiConfig.hasKey()) {
    throw new Error('--live 需要配置模型密钥');
  }

  const suite = suites.getSuite(options.suiteId);
  const baseline = loadBaseline(options.baselineRef);

  let chatFn = null;
  if (isLive) {
    chatFn = async (messages, opts) => {
      return client.chatCompletion(messages, {
        temperature: opts?.temperature ?? 0,
        max_tokens: opts?.max_tokens ?? 700,
      });
    };
  }

  const { case_results } = await runner.runSuite({
    suite,
    mode: isLive ? 'live' : 'template',
    chat: chatFn,
    timeoutMs: 60000,
  });

  // 组装兼容结果列表
  const results = case_results.map((r) => ({
    id: r.case_id,
    question: r.question,
    template: {
      text: r.template.text,
      score: r.template.score,
      matched: r.template.matched,
      missing: r.template.missing,
    },
    live: r.live,
    minimum: r.minimum,
    status: r.status,
    latency_ms: r.template.latency_ms,
  }));

  const failed = results.filter(
    (r) => r.template.score < r.minimum || (isLive && (r.live.status !== 'completed' || r.live.score < r.minimum))
  );

  const templateAverage = results.length
    ? results.reduce((s, r) => s + r.template.score, 0) / results.length
    : 0;

  const runObjForGate = {
    suite_id: suite.id,
    suite_version: suite.version,
    mode: isLive ? 'live' : 'template',
    model: isLive ? (aiConfig.model || 'live-model') : null,
    prompt_version: suite.prompt_version,
    scorer: suite.scorer,
    average_score: templateAverage,
    case_results,
  };

  const gateResult = gate.evaluateGate({
    run: runObjForGate,
    baseline,
    policy: {
      max_failed_cases: 0,
      min_average: null,
      require_baseline: false,
      regression_tolerance: 0,
      live_baseline: 'warn',
    },
  });

  const report = {
    prompt_version: promptVersion,
    metric: '期望要点正则命中率；不等价于事实正确性或完整人工评审',
    cases: results.length,
    template_average: templateAverage,
    live_enabled: isLive,
    failed: failed.map((r) => r.id),
    results,
    suite_id: suite.id,
    suite_version: suite.version,
    scorer: suite.scorer,
    gate: gateResult,
    baseline: baseline
      ? { id: baseline.id, label: baseline.label, average_score: baseline.average_score }
      : null,
  };

  console.log(JSON.stringify(report, null, 2));

  if (options.reportPath) {
    const reportFile = path.resolve(options.reportPath);
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  }

  if (options.check) {
    if (failed.length > 0 || gateResult.status === 'failed') {
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  score,
  run,
};
