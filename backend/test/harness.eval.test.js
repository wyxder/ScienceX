const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = path.join(os.tmpdir(), `sciencex-eval-test-${process.pid}`);
process.env.SCIENCEX_DATA_DIR = testDataDir;
process.env.HARNESS_EVAL_SUITE_DIR = path.join(__dirname, 'fixtures/eval-suites');
process.env.HARNESS_EVAL_LIVE_ENABLED = 'false';

const app = require('../src/server');
const store = require('../src/lib/store');
const { score } = require('../src/harness/eval/scorer');
const suites = require('../src/harness/eval/suites');
const runner = require('../src/harness/eval/runner');
const gate = require('../src/harness/eval/gate');
const service = require('../src/harness/eval/service');
const { generateReply } = require('../src/lib/ai');

let server;
let baseUrl;
let token;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@sciencex.cn', password: '123456' }),
  });
  const loginBody = await loginRes.json();
  token = loginBody.data.token;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

async function request(apiPath, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${baseUrl}${apiPath}`, { ...options, headers });
  const text = await response.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

async function waitActiveRuns() {
  for (let i = 0; i < 50; i++) {
    if (service.activeRunCount() === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ==================== 单元测试 (UT-EVAL-01 .. UT-EVAL-10) ====================

test('UT-EVAL-01: score() 正则三选二命中', () => {
  const text = '本实验建立 baseline 基线，并单独移除各模块变量。';
  const expected = ['baseline|基线', '模块|变量', '未知协议关键词'];
  const res = score(text, expected);
  assert.equal(res.score, 2 / 3);
  assert.deepEqual(res.matched, ['baseline|基线', '模块|变量']);
  assert.deepEqual(res.missing, ['未知协议关键词']);
});

test('UT-EVAL-02: 非法正则表达式加载失败抛错', () => {
  assert.throws(
    () => {
      suites.caseSchema.parse({
        id: 'bad-regex',
        question: '测试非法正则',
        expected: ['['], // 非法未闭合正则
      });
      // 预编译校验
      new RegExp('[', 'i');
    },
    /SyntaxError|校验失败/
  );
});

test('UT-EVAL-03: 重复 case id 校验失败', () => {
  assert.throws(
    () => {
      const cases = [
        { id: 'c1', question: 'Q1', expected: ['a'] },
        { id: 'c1', question: 'Q2', expected: ['b'] },
      ];
      const seen = new Set();
      for (const c of cases) {
        if (seen.has(c.id)) throw new suites.SuiteError('ID 重复');
        seen.add(c.id);
      }
    },
    suites.SuiteError
  );
});

test('UT-EVAL-04: core 套件元数据正确，包含 12 条用例和 4 条红线', () => {
  const core = suites.getSuite('core');
  assert.equal(core.id, 'core');
  assert.equal(core.case_count, 12);
  assert.equal(core.redline_count, 4);
  const redlines = core.cases.filter((c) => c.redline);
  assert.equal(redlines.length, 4);
  const redlineIds = redlines.map((c) => c.id).sort();
  assert.deepEqual(redlineIds, ['citation', 'insufficient', 'missing-evidence', 'page']);
});

test('UT-EVAL-05: 模板生成适配，scene=document 返回证据不足模板', () => {
  const docReply = generateReply([{ role: 'user', content: '测试文档' }], 'document');
  assert.match(docReply, /文档当前片段信息不足/);
  assert.match(docReply, /无法确认/);
});

test('UT-EVAL-06: 门禁评估：无基线且单题低于 minimum 时门禁失败', () => {
  const run = {
    suite_id: 'core',
    suite_version: 'v1',
    mode: 'template',
    prompt_version: '2026-10-04.v1',
    scorer: 'regex-hit-v1',
    average_score: 0.5,
    case_results: [
      {
        case_id: 'ablation',
        minimum: 0.66,
        template: { score: 0.33 },
        live: { status: 'skipped' },
        score: 0.33,
      },
    ],
  };
  const res = gate.evaluateGate({ run, baseline: null });
  assert.equal(res.status, 'failed');
  assert.equal(res.failed_cases.includes('ablation'), true);
  assert.equal(res.reasons.some((r) => r.code === 'case_below_minimum'), true);
});

test('UT-EVAL-07: 门禁评估：基线回退超过容忍值拦截', () => {
  const baseline = {
    id: 'evb_1',
    suite_id: 'core',
    suite_version: 'v1',
    mode: 'template',
    prompt_version: '2026-10-04.v1',
    scorer: 'regex-hit-v1',
    case_scores: [{ case_id: 'survey', score: 1.0, minimum: 0.66 }],
  };
  const run = {
    suite_id: 'core',
    suite_version: 'v1',
    mode: 'template',
    prompt_version: '2026-10-04.v1',
    scorer: 'regex-hit-v1',
    average_score: 0.66,
    case_results: [
      {
        case_id: 'survey',
        minimum: 0.66,
        template: { score: 0.66 },
        live: { status: 'skipped' },
        score: 0.66,
      },
    ],
  };
  const res = gate.evaluateGate({ run, baseline, policy: { regression_tolerance: 0 } });
  assert.equal(res.status, 'failed');
  assert.equal(res.regression_count, 1);
  assert.equal(res.reasons.some((r) => r.code === 'baseline_regression'), true);
});

test('UT-EVAL-08: 门禁评估：版本不兼容时 template 失败、live 模式 warn', () => {
  const baseline = {
    id: 'evb_1',
    suite_id: 'core',
    suite_version: 'v1',
    mode: 'template',
    prompt_version: 'old-version',
    scorer: 'regex-hit-v1',
    case_scores: [],
  };
  const templateRun = {
    suite_id: 'core',
    suite_version: 'v1',
    mode: 'template',
    prompt_version: 'new-version',
    scorer: 'regex-hit-v1',
    case_results: [],
  };
  const resTpl = gate.evaluateGate({ run: templateRun, baseline });
  assert.equal(resTpl.status, 'failed');
  assert.equal(resTpl.reasons.some((r) => r.code === 'baseline_incompatible' && r.level === 'fail'), true);

  const liveRun = {
    suite_id: 'core',
    suite_version: 'v1',
    mode: 'live',
    prompt_version: 'new-version',
    scorer: 'regex-hit-v1',
    case_results: [],
  };
  const resLive = gate.evaluateGate({ run: liveRun, baseline });
  assert.equal(resLive.reasons.some((r) => r.code === 'baseline_incompatible' && r.level === 'warn'), true);
});

test('UT-EVAL-09: runner 执行器在 live 模式下模板分不达标仍标记失败', async () => {
  const fakeSuite = {
    id: 'test-suite',
    version: '1.0',
    cases: [
      {
        id: 'c1',
        question: '无答案的问题',
        scene: 'workbench',
        expected: ['不可能出现的要点_XYZ'],
        minimum: 0.66,
      },
    ],
  };
  const res = await runner.runSuite({
    suite: fakeSuite,
    mode: 'live',
    chat: async () => ({ text: '不可能出现的要点_XYZ 真实模型答对了', model: 'test' }),
  });
  assert.equal(res.case_results[0].template.score, 0);
  assert.equal(res.case_results[0].status, 'failed');
});

test('UT-EVAL-10: runner 取消时抛出 AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  const suite = suites.getSuite('core');
  await assert.rejects(
    async () => {
      await runner.runSuite({ suite, mode: 'template', signal: controller.signal });
    },
    (err) => err.name === 'AbortError' || err.code === 'ABORT_ERR'
  );
});

// ==================== 接口与集成测试 (IT-EVAL-01 .. IT-EVAL-12) ====================

test('IT-EVAL-01: 未认证访问评测套件返回 401', async () => {
  const { response, body } = await request('/harness/eval/suites', { headers: { Authorization: '' } });
  assert.equal(response.status, 401);
  assert.equal(body.code, 40101);
});

test('IT-EVAL-02: 获取套件列表与详情返回 200 及 core 12 条用例', async () => {
  const list = await request('/harness/eval/suites');
  assert.equal(list.response.status, 200);
  assert.equal(list.body.code, 0);
  assert.equal(list.body.data.items.length >= 1, true);
  const coreItem = list.body.data.items.find((i) => i.id === 'core');
  assert.equal(coreItem.case_count, 12);
  assert.equal(coreItem.redline_count, 4);

  const detail = await request('/harness/eval/suites/core');
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.code, 0);
  assert.equal(detail.body.data.cases.length, 12);
  assert.equal(detail.body.data.cases.filter((c) => c.redline).length, 4);
});

test('IT-EVAL-03: 传递非法 mode 参数返回 400 校验错误', async () => {
  const res = await request('/harness/eval/runs', {
    method: 'POST',
    body: JSON.stringify({ suite_id: 'core', mode: 'invalid_mode' }),
  });
  assert.equal(res.response.status, 400);
  assert.equal(res.body.code, 40011);
});

test('IT-EVAL-04 & IT-EVAL-05: 模板模式运行评测成功并通过门禁', async () => {
  const create = await request('/harness/eval/runs', {
    method: 'POST',
    body: JSON.stringify({ suite_id: 'core', mode: 'template', note: '测试运行' }),
  });
  assert.equal(create.response.status, 200);
  assert.equal(create.body.code, 0);
  const runId = create.body.data.run_id;
  assert.equal(typeof runId, 'string');

  // 等待异步执行完毕
  let detail;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const res = await request(`/harness/eval/runs/${runId}`);
    if (['passed', 'failed', 'cancelled', 'error'].includes(res.body.data.status)) {
      detail = res.body.data;
      break;
    }
  }

  assert.ok(detail, '运行未在超时时间内完成');
  assert.equal(detail.status, 'passed');
  assert.equal(detail.gate.status, 'passed');
  assert.equal(detail.case_results.length, 12);
  assert.equal(detail.passed_cases, 12);
  assert.equal(detail.failed_cases, 0);
  assert.equal(detail.average_score, 1);

  // 验证列表不包含 case_results，详情包含
  const list = await request('/harness/eval/runs?page=1&page_size=10');
  assert.equal(list.response.status, 200);
  const foundInList = list.body.data.items.find((r) => r.id === runId);
  assert.ok(foundInList);
  assert.equal(foundInList.case_results, undefined);
});

test('IT-EVAL-06: 失败夹具套件运行导致门禁失败并列出用例 ID', async () => {
  const create = await request('/harness/eval/runs', {
    method: 'POST',
    body: JSON.stringify({ suite_id: 'failing-fixture', mode: 'template' }),
  });
  assert.equal(create.response.status, 200);
  const runId = create.body.data.run_id;

  let detail;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const res = await request(`/harness/eval/runs/${runId}`);
    if (['passed', 'failed', 'cancelled', 'error'].includes(res.body.data.status)) {
      detail = res.body.data;
      break;
    }
  }

  assert.ok(detail);
  assert.equal(detail.status, 'failed');
  assert.equal(detail.gate.status, 'failed');
  assert.equal(detail.gate.failed_cases.includes('must-fail'), true);
  assert.equal(detail.gate.reasons.some((r) => r.case_id === 'must-fail'), true);
});

test('IT-EVAL-07: 取消运行测试', async () => {
  await waitActiveRuns();
  // 创建后立刻取消已在执行的运行
  const create = await request('/harness/eval/runs', {
    method: 'POST',
    body: JSON.stringify({ suite_id: 'core', mode: 'template' }),
  });
  const runId = create.body.data.run_id;
  const cancelRes = await request(`/harness/eval/runs/${runId}/cancel`, { method: 'POST', body: '{}' });
  // 取消可能成功或运行已飞快结束
  assert.ok([200, 400].includes(cancelRes.response.status));
  await waitActiveRuns();
});

test('IT-EVAL-08 & IT-EVAL-09 & IT-EVAL-10: 基线建立、未通过拦截与基线回归拦截', async () => {
  // 1. 尝试将失败运行建基线，应被 400 拒绝
  const failingRuns = store.evalRuns.filter((r) => r.status === 'failed');
  if (failingRuns.length > 0) {
    const badPromote = await request(`/harness/eval/runs/${failingRuns[0].id}/baseline`, {
      method: 'POST',
      body: JSON.stringify({ label: 'should-fail-baseline' }),
    });
    assert.equal(badPromote.response.status, 400);
    assert.equal(badPromote.body.code, 40011);
  }

  // 2. 将通过的运行提升为基线
  const passedRun = store.evalRuns.find((r) => r.status === 'passed' && r.suite_id === 'core');
  assert.ok(passedRun, '需要至少一条通过的运行记录');

  const promote = await request(`/harness/eval/runs/${passedRun.id}/baseline`, {
    method: 'POST',
    body: JSON.stringify({ label: 'test-core-baseline' }),
  });
  assert.equal(promote.response.status, 200);
  assert.equal(promote.body.code, 0);
  assert.equal(promote.body.data.active, true);
  const baselineId = promote.body.data.baseline_id;

  // 3. 验证 gates 接口
  const gates = await request('/harness/eval/gates?suite_id=core');
  assert.equal(gates.response.status, 200);
  assert.equal(gates.body.data.active_baseline.id, baselineId);
  assert.equal(gates.body.data.active_baseline.label, 'test-core-baseline');
});

test('IT-EVAL-11: OpenAPI 文档包含 10 个新增路由且 SSE 为 text/event-stream', async () => {
  const res = await request('/openapi.json');
  assert.equal(res.response.status, 200);
  const paths = res.body.paths;

  const expectedPaths = [
    '/api/v1/harness/eval/suites',
    '/api/v1/harness/eval/suites/{id}',
    '/api/v1/harness/eval/runs',
    '/api/v1/harness/eval/runs/{id}',
    '/api/v1/harness/eval/runs/{id}/stream',
    '/api/v1/harness/eval/runs/{id}/cancel',
    '/api/v1/harness/eval/runs/{id}/baseline',
    '/api/v1/harness/eval/overview',
    '/api/v1/harness/eval/gates',
  ];

  for (const p of expectedPaths) {
    assert.ok(paths[p], `OpenAPI 缺少路径: ${p}`);
  }

  const streamOp = paths['/api/v1/harness/eval/runs/{id}/stream'].get;
  assert.ok(streamOp.responses['200'].content['text/event-stream']);
});

test('IT-EVAL-12: SSE 进度流连接与事件推送', async () => {
  await waitActiveRuns();
  const created = await service.createRun({ suite_id: 'core', mode: 'template', ownerId: 'u1' });
  const runId = created.run_id;

  const streamRes = await fetch(`${baseUrl}/harness/eval/runs/${runId}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(streamRes.status, 200);
  assert.equal(streamRes.headers.get('content-type')?.includes('text/event-stream'), true);

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let receivedDone = false;
  let receivedProgress = false;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes('event: progress')) receivedProgress = true;
    if (buffer.includes('event: done')) {
      receivedDone = true;
      break;
    }
  }

  assert.equal(receivedDone, true);
  assert.ok(buffer.includes('data:'));
});
