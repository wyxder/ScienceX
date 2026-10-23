const store = require('../../lib/store');
const gateway = require('../../lib/model-gateway');
const { getLogger } = require('../../lib/logger');
const { getConfig } = require('./config');
const suites = require('./suites');
const runner = require('./runner');
const gate = require('./gate');

// 进程内活跃运行元数据：不写入 Store
// runId -> { abortController, cancelRequested, listeners: Set<(event, data, id) => void>, pingTimer }
const liveRuns = new Map();

function activeRunCount() {
  return liveRuns.size;
}

function getActiveBaseline(suiteId) {
  return store.evalBaselines.find((b) => b.suite_id === suiteId && b.active) || null;
}

function checkStaleRun(run) {
  const config = getConfig();
  if (['queued', 'running'].includes(run.status) && !liveRuns.has(run.id)) {
    const updatedAt = new Date(run.updated_at || run.created_at).getTime();
    if (Date.now() - updatedAt > config.staleMs) {
      run.status = 'error';
      run.error = { code: 'RUN_INTERRUPTED', message: '服务重启或运行超时' };
      if (!run.gate) run.gate = {};
      run.gate.status = 'skipped';
      run.finished_at = new Date().toISOString();
      run.updated_at = new Date().toISOString();
      Promise.resolve(store.persist()).catch(() => {});
    }
  }
}

async function createRun({ suite_id = 'core', mode = 'template', model = null, note = '', ownerId }) {
  const config = getConfig();

  if (!config.enabled) {
    const err = new Error('评测功能已关闭');
    err.statusCode = 400;
    err.businessCode = 40011;
    throw err;
  }

  if (mode === 'live') {
    if (!config.liveEnabled) {
      const err = new Error('服务端未开启 live 模式，请改用模板模式');
      err.statusCode = 400;
      err.businessCode = 40011;
      throw err;
    }

    if (model) {
      const resolved = gateway.resolveModel(model, ownerId);
      if (!resolved) {
        const err = new Error('所选模型不存在或无权访问');
        err.statusCode = 400;
        err.businessCode = 40011;
        throw err;
      }
    } else {
      const targetModel = config.model || undefined;
      const defaultResolved = gateway.resolveModel(targetModel, ownerId);
      if (!defaultResolved) {
        const err = new Error('没有可用模型，请先在设置中配置');
        err.statusCode = 400;
        err.businessCode = 40011;
        throw err;
      }
    }
  }

  if (activeRunCount() >= config.maxConcurrency) {
    const err = new Error('已有评测运行中，请等待完成或取消');
    err.statusCode = 429;
    err.businessCode = 42901;
    throw err;
  }

  let suite;
  try {
    suite = suites.getSuite(suite_id);
  } catch (e) {
    const err = new Error(`套件不存在: ${suite_id}`);
    err.statusCode = 404;
    err.businessCode = 40003;
    throw err;
  }

  const activeBaseline = getActiveBaseline(suite.id);
  const runId = store.id('evr');

  const gatePolicy = {
    max_failed_cases: 0,
    min_average: null,
    require_baseline: config.requireBaseline,
    regression_tolerance: config.regressionTolerance,
    live_baseline: config.liveBaseline,
    policy_version: 'v1',
  };

  const run = {
    id: runId,
    suite_id: suite.id,
    suite_version: suite.version,
    mode,
    status: 'queued',
    owner_id: ownerId,
    model: mode === 'live' ? (model || config.model || 'gateway-default') : null,
    prompt_version: suite.prompt_version,
    scorer: suite.scorer,
    total: suite.case_count,
    completed: 0,
    passed_cases: 0,
    failed_cases: 0,
    error_cases: 0,
    average_score: 0,
    template_average: 0,
    live_average: null,
    failed: [],
    case_results: [],
    gate: {
      status: 'pending',
      policy: gatePolicy,
      baseline_id: activeBaseline ? activeBaseline.id : null,
      baseline_label: activeBaseline ? activeBaseline.label : null,
      baseline_compatible: null,
      regression_count: 0,
      failed_cases: [],
      reasons: [],
      evaluated_at: null,
    },
    baseline_id: activeBaseline ? activeBaseline.id : null,
    baseline_label: activeBaseline ? activeBaseline.label : null,
    error: null,
    cancel_requested: false,
    persist_error: null,
    event_seq: 0,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    updated_at: new Date().toISOString(),
    duration_ms: null,
    note: (note || '').slice(0, 500),
  };

  // 历史运行清理：保留最近 config.runRetention 次
  if (store.evalRuns.length >= config.runRetention) {
    for (let i = store.evalRuns.length - 1; i >= 0; i--) {
      const candidate = store.evalRuns[i];
      if (['passed', 'failed', 'cancelled', 'error'].includes(candidate.status)) {
        if (!activeBaseline || activeBaseline.run_id !== candidate.id) {
          store.evalRuns.splice(i, 1);
          if (store.evalRuns.length < config.runRetention) break;
        }
      }
    }
  }

  store.evalRuns.unshift(run);

  try {
    await store.persist();
  } catch (err) {
    run.persist_error = err.message;
    try {
      getLogger().warn({ event: 'eval_persist_failed', run_id: run.id, err }, '评测运行持久化失败');
    } catch {}
  }

  try {
    getLogger().info({ event: 'eval_run_created', run_id: run.id, suite_id: suite.id, mode, owner_id: ownerId });
  } catch {}

  setImmediate(() => {
    executeRun(run.id).catch((err) => {
      try {
        getLogger().error({ event: 'eval_run_failed', run_id: run.id, error: err.message }, '异步执行异常');
      } catch {}
    });
  });

  return {
    run_id: run.id,
    suite_id: suite.id,
    mode,
    status: run.status,
  };
}

function broadcastEvent(runId, event, data, id) {
  const meta = liveRuns.get(runId);
  if (!meta || !meta.listeners) return;
  for (const listener of meta.listeners) {
    try {
      listener(event, data, id);
    } catch {}
  }
}

async function executeRun(runId) {
  const config = getConfig();
  const run = store.evalRuns.find((r) => r.id === runId);
  if (!run) return;
  if (run.cancel_requested || run.status === 'cancelled') return;

  const suite = suites.getSuite(run.suite_id);
  const abortController = new AbortController();

  const meta = {
    abortController,
    cancelRequested: false,
    listeners: new Set(),
  };
  liveRuns.set(runId, meta);

  run.status = 'running';
  run.started_at = new Date().toISOString();
  run.updated_at = new Date().toISOString();
  run.event_seq += 1;

  try {
    getLogger().info({ event: 'eval_run_started', run_id: run.id, total: run.total, prompt_version: run.prompt_version });
  } catch {}

  broadcastEvent(runId, 'progress', {
    run_id: run.id,
    status: 'running',
    percent: 0,
    stage: '准备运行',
    completed: 0,
    total: run.total,
    passed_cases: 0,
    failed_cases: 0,
    current_case_id: null,
    phase: 'run_start',
    elapsed_ms: 0,
  }, run.event_seq);

  const activeBaseline = run.baseline_id ? (store.evalBaselines.find((b) => b.id === run.baseline_id) || null) : null;

  try {
    let chatFn = null;
    if (run.mode === 'live') {
      chatFn = async (messages, options) => {
        const result = await gateway.complete(messages, {
          ...options,
          model: run.model || undefined,
          userId: run.owner_id,
          scene: 'harness_eval',
        });
        if (!result) {
          const error = new Error('模型未配置或不可用');
          error.code = 'MODEL_NOT_CONFIGURED';
          throw error;
        }
        return result;
      };
    }

    const runnerResult = await runner.runSuite({
      suite,
      mode: run.mode,
      chat: chatFn,
      signal: abortController.signal,
      timeoutMs: config.timeoutMs,
      onProgress: ({ completed, total, row }) => {
        run.completed = completed;
        run.case_results.push(row);
        if (row.status === 'passed') {
          run.passed_cases += 1;
        } else {
          run.failed_cases += 1;
        }
        if (row.error) {
          run.error_cases += 1;
        }

        const percent = Math.min(99, Math.round((completed / total) * 100));
        run.event_seq += 1;
        run.updated_at = new Date().toISOString();

        try {
          getLogger().info({
            event: 'eval_case_done',
            run_id: run.id,
            case_id: row.case_id,
            status: row.status,
            score: row.score,
            latency_ms: row.template?.latency_ms,
          });
        } catch {}

        broadcastEvent(runId, 'progress', {
          run_id: run.id,
          status: 'running',
          percent,
          stage: '逐题评分',
          completed,
          total,
          passed_cases: run.passed_cases,
          failed_cases: run.failed_cases,
          current_case_id: row.case_id,
          current_case_question: row.question,
          phase: 'case_done',
          elapsed_ms: Date.now() - new Date(run.started_at).getTime(),
        }, run.event_seq);
      },
    });

    if (abortController.signal.aborted || meta.cancelRequested) {
      run.status = 'cancelled';
      run.gate = gate.evaluateGate({ run, baseline: activeBaseline, policy: run.gate.policy });
    } else {
      const results = runnerResult.case_results;
      const tSum = results.reduce((s, r) => s + (r.template?.score ?? 0), 0);
      run.template_average = results.length ? Number((tSum / results.length).toFixed(3)) : 0;

      if (run.mode === 'live') {
        const lSum = results.reduce((s, r) => s + (r.live?.score ?? 0), 0);
        run.live_average = results.length ? Number((lSum / results.length).toFixed(3)) : 0;
        run.average_score = run.live_average;
      } else {
        run.live_average = null;
        run.average_score = run.template_average;
      }

      run.failed = results.filter((r) => r.status === 'failed').map((r) => r.case_id);

      run.event_seq += 1;
      broadcastEvent(runId, 'progress', {
        run_id: run.id,
        status: 'running',
        percent: 99,
        stage: '计算门禁',
        completed: run.total,
        total: run.total,
        passed_cases: run.passed_cases,
        failed_cases: run.failed_cases,
        current_case_id: null,
        phase: 'gating',
        elapsed_ms: Date.now() - new Date(run.started_at).getTime(),
      }, run.event_seq);

      const gateResult = gate.evaluateGate({
        run,
        baseline: activeBaseline,
        policy: run.gate.policy,
      });

      run.gate = gateResult;
      run.status = gateResult.status;
    }
  } catch (err) {
    if (err.name === 'AbortError' || meta.cancelRequested) {
      run.status = 'cancelled';
      run.gate = gate.evaluateGate({ run, baseline: activeBaseline, policy: run.gate.policy });
      try {
        getLogger().info({ event: 'eval_run_cancelled', run_id: run.id, completed: run.completed });
      } catch {}
    } else {
      run.status = 'error';
      run.error = { code: '60002', message: err.message || '评测执行失败' };
      run.gate = {
        status: 'skipped',
        policy: run.gate.policy,
        baseline_id: activeBaseline?.id || null,
        baseline_label: activeBaseline?.label || null,
        baseline_compatible: null,
        regression_count: 0,
        failed_cases: [],
        reasons: [{ code: 'run_error', level: 'fail', message: run.error.message }],
        evaluated_at: new Date().toISOString(),
      };
      try {
        getLogger().error({ event: 'eval_run_failed', run_id: run.id, error_code: '60002', message: err.message });
      } catch {}
    }
  }

  // 截断超长输出（防止 Store 膨胀）
  for (const c of run.case_results) {
    if (c.template?.text && c.template.text.length > config.maxOutputChars) {
      c.template.text = c.template.text.slice(0, config.maxOutputChars);
      c.template.truncated = true;
    }
    if (c.live?.text && c.live.text.length > config.maxOutputChars) {
      c.live.text = c.live.text.slice(0, config.maxOutputChars);
      c.live.truncated = true;
    }
  }

  run.finished_at = new Date().toISOString();
  run.duration_ms = Date.now() - new Date(run.started_at).getTime();
  run.updated_at = new Date().toISOString();
  run.event_seq += 1;

  try {
    await store.persist();
  } catch (err) {
    run.persist_error = err.message;
    try {
      getLogger().warn({ event: 'eval_persist_failed', run_id: run.id, err }, '评测完成持久化失败');
    } catch {}
  }

  try {
    getLogger().info({
      event: 'eval_run_finished',
      run_id: run.id,
      status: run.status,
      average_score: run.average_score,
      gate_status: run.gate?.status,
      duration_ms: run.duration_ms,
    });
  } catch {}

  if (run.status === 'error') {
    broadcastEvent(runId, 'error', {
      run_id: run.id,
      code: 60002,
      message: run.error?.message || '评测执行失败',
    }, run.event_seq);
  } else {
    broadcastEvent(runId, 'done', {
      run_id: run.id,
      status: run.status,
      gate: run.gate,
      summary: {
        passed_cases: run.passed_cases,
        failed_cases: run.failed_cases,
        average_score: run.average_score,
      },
    }, run.event_seq);
  }

  liveRuns.delete(runId);
}

function cancelRun(runId, userId) {
  const run = store.evalRuns.find((r) => r.id === runId);
  if (!run) {
    const err = new Error('运行不存在');
    err.statusCode = 404;
    err.businessCode = 40003;
    throw err;
  }

  if (run.owner_id !== userId) {
    const err = new Error('只能取消自己创建的运行');
    err.statusCode = 403;
    err.businessCode = 40009;
    throw err;
  }

  if (['passed', 'failed', 'cancelled', 'error'].includes(run.status)) {
    const err = new Error('运行已结束');
    err.statusCode = 400;
    err.businessCode = 40011;
    throw err;
  }

  run.cancel_requested = true;
  const meta = liveRuns.get(runId);
  if (meta) {
    meta.cancelRequested = true;
    meta.abortController.abort();
  }

  return { run_id: run.id, status: 'cancelling' };
}

function promoteBaseline(runId, label, rebuild = false, userId) {
  const run = store.evalRuns.find((r) => r.id === runId);
  if (!run) {
    const err = new Error('运行不存在');
    err.statusCode = 404;
    err.businessCode = 40003;
    throw err;
  }

  if (run.owner_id !== userId) {
    const err = new Error('只能将自己创建的运行提升为基线');
    err.statusCode = 403;
    err.businessCode = 40009;
    throw err;
  }

  if (['cancelled', 'error', 'queued', 'running'].includes(run.status)) {
    const err = new Error('运行尚未完成或已失败/取消');
    err.statusCode = 400;
    err.businessCode = 40011;
    throw err;
  }

  if (!rebuild) {
    if (run.status !== 'passed' || run.gate?.status !== 'passed') {
      const err = new Error('仅通过门禁的运行可设为基线；如需重建请显式 rebuild');
      err.statusCode = 400;
      err.businessCode = 40011;
      throw err;
    }
  } else {
    if (!label || !label.trim()) {
      const err = new Error('重建基线必须填写 label');
      err.statusCode = 400;
      err.businessCode = 40011;
      throw err;
    }
    const hasCaseFailure = run.case_results.some(
      (c) => c.status === 'failed' || c.template?.score < c.minimum || (c.minimum === 1 && c.status !== 'passed')
    );
    if (hasCaseFailure) {
      const err = new Error('存在单题或红线失败，不能重建基线');
      err.statusCode = 400;
      err.businessCode = 40011;
      throw err;
    }
  }

  const baselineId = store.id('evb');
  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, '');
  const finalLabel = (label && label.trim()) || `${run.suite_id}-${run.mode}-${dateStr}`;

  const baseline = {
    id: baselineId,
    suite_id: run.suite_id,
    suite_version: run.suite_version,
    label: finalLabel,
    run_id: run.id,
    mode: run.mode,
    model: run.model,
    prompt_version: run.prompt_version,
    scorer: run.scorer,
    average_score: run.average_score,
    case_scores: run.case_results.map((c) => ({
      case_id: c.case_id,
      score: c.score,
      minimum: c.minimum,
      passed: c.status === 'passed',
    })),
    gate_policy: run.gate.policy,
    gate_status_at_promotion: run.gate.status,
    rebuild: Boolean(rebuild),
    active: true,
    created_by: userId,
    created_at: now,
  };

  // 停用同套件历史 active 基线
  for (const b of store.evalBaselines) {
    if (b.suite_id === run.suite_id && b.active) {
      b.active = false;
    }
  }

  store.evalBaselines.unshift(baseline);
  Promise.resolve(store.persist()).catch(() => {});

  try {
    getLogger().info({ event: 'eval_baseline_created', baseline_id: baseline.id, run_id: run.id, suite_id: run.suite_id, label: baseline.label });
  } catch {}

  return {
    baseline_id: baseline.id,
    suite_id: baseline.suite_id,
    label: baseline.label,
    active: true,
    average_score: baseline.average_score,
    rebuild: baseline.rebuild,
  };
}

function listRuns(query = {}) {
  const { suite_id = 'core', status, mode, page = 1, page_size = 20 } = query;
  let items = store.evalRuns.filter((r) => r.suite_id === suite_id);

  if (status) {
    items = items.filter((r) => r.status === status);
  }
  if (mode) {
    items = items.filter((r) => r.mode === mode);
  }

  const total = items.length;
  const startIndex = (page - 1) * page_size;
  const paged = items.slice(startIndex, startIndex + page_size);

  const listItems = paged.map((r) => {
    checkStaleRun(r);
    return {
      id: r.id,
      suite_id: r.suite_id,
      suite_version: r.suite_version,
      mode: r.mode,
      status: r.status,
      total: r.total,
      completed: r.completed,
      passed_cases: r.passed_cases,
      failed_cases: r.failed_cases,
      error_cases: r.error_cases,
      average_score: r.average_score,
      template_average: r.template_average,
      live_average: r.live_average,
      gate: {
        status: r.gate?.status || 'pending',
        reasons_count: r.gate?.reasons?.length || 0,
      },
      created_at: r.created_at,
      duration_ms: r.duration_ms,
    };
  });

  return {
    items: listItems,
    total,
    page: Number(page),
    page_size: Number(page_size),
  };
}

function getRun(runId) {
  const run = store.evalRuns.find((r) => r.id === runId);
  if (!run) {
    const err = new Error('运行不存在');
    err.statusCode = 404;
    err.businessCode = 40003;
    throw err;
  }
  checkStaleRun(run);

  let suiteInfo = null;
  try {
    const s = suites.getSuite(run.suite_id);
    suiteInfo = { id: s.id, name: s.name, version: s.version };
  } catch {
    suiteInfo = { id: run.suite_id, name: run.suite_id, version: run.suite_version };
  }

  return {
    ...run,
    suite: suiteInfo,
  };
}

function getOverview(suiteId = 'core') {
  const config = getConfig();
  const runs = store.evalRuns.filter((r) => r.suite_id === suiteId);
  const totalRuns = runs.length;

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const finished7d = runs.filter(
    (r) => ['passed', 'failed'].includes(r.status) && new Date(r.created_at).getTime() >= sevenDaysAgo
  );

  let passRate7d = null;
  let avgScore7d = null;

  if (finished7d.length > 0) {
    const passedCount = finished7d.filter((r) => r.status === 'passed').length;
    passRate7d = Number((passedCount / finished7d.length).toFixed(3));
    const scoreSum = finished7d.reduce((s, r) => s + (r.average_score || 0), 0);
    avgScore7d = Number((scoreSum / finished7d.length).toFixed(3));
  }

  const lastRun = runs[0]
    ? {
        id: runs[0].id,
        status: runs[0].status,
        average_score: runs[0].average_score,
        created_at: runs[0].created_at,
      }
    : null;

  const recentFinished = runs.filter((r) => ['passed', 'failed'].includes(r.status)).slice(0, 20);
  const trend = recentFinished.reverse().map((r) => ({
    run_id: r.id,
    created_at: r.created_at,
    average_score: r.average_score,
    status: r.status,
  }));

  const last10 = runs.slice(0, 10);
  const failCaseCounts = new Map();
  for (const r of last10) {
    for (const c of r.case_results || []) {
      if (c.status === 'failed') {
        failCaseCounts.set(c.case_id, (failCaseCounts.get(c.case_id) || 0) + 1);
      }
    }
  }

  const failureTop = [...failCaseCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([case_id, fail_count]) => ({ case_id, fail_count }));

  const activeBaseline = getActiveBaseline(suiteId);

  return {
    suite_id: suiteId,
    total_runs: totalRuns,
    pass_rate_7d: passRate7d,
    average_score_7d: avgScore7d,
    last_run: lastRun,
    trend,
    failure_top: failureTop,
    active_baseline: activeBaseline
      ? { id: activeBaseline.id, label: activeBaseline.label, average_score: activeBaseline.average_score }
      : null,
    enabled: config.enabled,
    live_enabled: config.liveEnabled,
    max_concurrency: config.maxConcurrency,
    generated_at: new Date().toISOString(),
  };
}

function getGates(suiteId = 'core') {
  const config = getConfig();
  const activeBaseline = getActiveBaseline(suiteId);
  const baselines = store.evalBaselines
    .filter((b) => b.suite_id === suiteId)
    .slice(0, 10)
    .map((b) => ({
      id: b.id,
      label: b.label,
      average_score: b.average_score,
      active: b.active,
      rebuild: b.rebuild,
      created_at: b.created_at,
    }));

  return {
    suite_id: suiteId,
    policy: {
      max_failed_cases: 0,
      min_average: null,
      require_baseline: config.requireBaseline,
      regression_tolerance: config.regressionTolerance,
      live_baseline: config.liveBaseline,
      policy_version: 'v1',
    },
    active_baseline: activeBaseline
      ? {
          id: activeBaseline.id,
          label: activeBaseline.label,
          run_id: activeBaseline.run_id,
          average_score: activeBaseline.average_score,
          prompt_version: activeBaseline.prompt_version,
          rebuild: activeBaseline.rebuild,
          created_at: activeBaseline.created_at,
        }
      : null,
    baselines,
    enabled: config.enabled,
    live_enabled: config.liveEnabled,
    max_concurrency: config.maxConcurrency,
  };
}

function addSSEListener(runId, res, req, lastEventId) {
  const run = store.evalRuns.find((r) => r.id === runId);
  if (!run) {
    res.status(404).json({ code: 40003, message: '运行不存在' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  try {
    getLogger().debug({ event: 'eval_stream_open', run_id: runId, owner_id: req.user?.id });
  } catch {}

  // 若运行已终止，立即发送终态并关闭
  if (['passed', 'failed', 'cancelled', 'error'].includes(run.status)) {
    if (run.status === 'error') {
      res.write(`id: ${run.event_seq}\nevent: error\ndata: ${JSON.stringify({
        run_id: run.id,
        code: 60002,
        message: run.error?.message || '评测执行失败',
      })}\n\n`);
    } else {
      res.write(`id: ${run.event_seq}\nevent: done\ndata: ${JSON.stringify({
        run_id: run.id,
        status: run.status,
        gate: run.gate,
        summary: {
          passed_cases: run.passed_cases,
          failed_cases: run.failed_cases,
          average_score: run.average_score,
        },
      })}\n\n`);
    }
    res.end();
    return;
  }

  const meta = liveRuns.get(runId);
  if (!meta) {
    // 处于非终态但未在 liveRuns 中（可能服务重启）
    checkStaleRun(run);
    res.write(`id: ${run.event_seq}\nevent: error\ndata: ${JSON.stringify({
      run_id: run.id,
      code: 60002,
      message: run.error?.message || '运行未在进行中或已中断',
    })}\n\n`);
    res.end();
    return;
  }

  // 重连/快照回放：当客户端提供的 lastEventId 小于服务端时，发送当前快照
  const nLastId = lastEventId != null ? Number(lastEventId) : -1;
  if (nLastId < run.event_seq) {
    res.write(`id: ${run.event_seq}\nevent: progress\ndata: ${JSON.stringify({
      run_id: run.id,
      status: run.status,
      percent: run.completed && run.total ? Math.min(99, Math.round((run.completed / run.total) * 100)) : 0,
      stage: run.completed === run.total ? '计算门禁' : '逐题评分',
      completed: run.completed,
      total: run.total,
      passed_cases: run.passed_cases,
      failed_cases: run.failed_cases,
      current_case_id: run.case_results[run.case_results.length - 1]?.case_id || null,
      phase: run.completed === run.total ? 'gating' : run.completed ? 'case_done' : 'run_start',
      elapsed_ms: run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0,
    })}\n\n`);
  }

  const listener = (event, data, id) => {
    if (res.writableEnded) return;
    res.write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (event === 'done' || event === 'error') {
      res.end();
    }
  };

  meta.listeners.add(listener);

  const pingTimer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(pingTimer);
      return;
    }
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(pingTimer);
    if (meta.listeners) {
      meta.listeners.delete(listener);
    }
  });
}

module.exports = {
  activeRunCount,
  getActiveBaseline,
  createRun,
  cancelRun,
  promoteBaseline,
  listRuns,
  getRun,
  getOverview,
  getGates,
  addSSEListener,
  listSuites: suites.listSuites,
  getSuite: suites.getSuite,
};
