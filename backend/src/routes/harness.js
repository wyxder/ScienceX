const router = require('../lib/router').createRouter();
const { auth } = require('./account');
const { ok, fail } = require('../lib/respond');
const { rateLimit } = require('../lib/rate-limit');
const service = require('../harness/eval/service');
const { getConfig } = require('../harness/eval/config');

// E1: 套件列表
router.get('/harness/eval/suites', auth, (req, res) => {
  const config = getConfig();
  const items = service.listSuites();
  ok(res, {
    items,
    total: items.length,
    enabled: config.enabled,
    live_enabled: config.liveEnabled,
    max_concurrency: config.maxConcurrency,
  });
});

// E2: 套件详情
router.get('/harness/eval/suites/:id', auth, (req, res) => {
  try {
    const suite = service.getSuite(req.params.id);
    ok(res, suite);
  } catch (err) {
    if (err.code === 'SUITE_NOT_FOUND') {
      return fail(res, 404, 40003, err.message);
    }
    return fail(res, 400, 40011, err.message);
  }
});

// E3: 创建运行
router.post('/harness/eval/runs', auth, rateLimit({ scope: 'harness-eval-run', windowMs: 60000, max: 3 }), async (req, res) => {
  try {
    const result = await service.createRun({ ...req.body, ownerId: req.user.id });
    ok(res, result, '评测已创建');
  } catch (err) {
    fail(res, err.statusCode || 500, err.businessCode || 50001, err.message);
  }
});

// E4: 运行历史分页
router.get('/harness/eval/runs', auth, (req, res) => {
  const result = service.listRuns(req.query);
  ok(res, result);
});

// E5: 运行详情
router.get('/harness/eval/runs/:id', auth, (req, res) => {
  try {
    const result = service.getRun(req.params.id);
    ok(res, result);
  } catch (err) {
    fail(res, err.statusCode || 404, err.businessCode || 40003, err.message);
  }
});

// E6: SSE 进度
router.get('/harness/eval/runs/:id/stream', auth, (req, res) => {
  const lastEventId = req.headers['last-event-id'] || req.query.last_event_id;
  service.addSSEListener(req.params.id, res, req, lastEventId);
});

// E7: 取消运行
router.post('/harness/eval/runs/:id/cancel', auth, (req, res) => {
  try {
    const result = service.cancelRun(req.params.id, req.user.id);
    ok(res, result, '已请求取消');
  } catch (err) {
    fail(res, err.statusCode || 400, err.businessCode || 40011, err.message);
  }
});

// E8: 提升为基线
router.post('/harness/eval/runs/:id/baseline', auth, rateLimit({ scope: 'harness-eval-baseline', windowMs: 60000, max: 10 }), (req, res) => {
  try {
    const result = service.promoteBaseline(req.params.id, req.body.label, req.body.rebuild, req.user.id);
    ok(res, result, '已设为基线');
  } catch (err) {
    fail(res, err.statusCode || 400, err.businessCode || 40011, err.message);
  }
});

// E9: 质量看板
router.get('/harness/eval/overview', auth, (req, res) => {
  const result = service.getOverview(req.query.suite_id || 'core');
  ok(res, result);
});

// E10: 门禁与基线
router.get('/harness/eval/gates', auth, (req, res) => {
  const result = service.getGates(req.query.suite_id || 'core');
  ok(res, result);
});

module.exports = { router };
