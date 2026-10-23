/**
 * 门禁策略与算法
 */

function isBaselineCompatible(run, baseline) {
  if (!baseline) return false;
  const sameSuite = run.suite_id === baseline.suite_id;
  const sameSuiteVersion = run.suite_version === baseline.suite_version;
  const sameMode = run.mode === baseline.mode;
  const samePromptVersion = run.prompt_version === baseline.prompt_version;
  const sameScorer = run.scorer === baseline.scorer;

  if (run.mode === 'live') {
    return sameSuite && sameSuiteVersion && sameMode && samePromptVersion && sameScorer && run.model === baseline.model;
  }
  return sameSuite && sameSuiteVersion && sameMode && samePromptVersion && sameScorer;
}

function evaluateGate({
  run,
  baseline = null,
  policy = {},
}) {
  const activePolicy = {
    max_failed_cases: policy.max_failed_cases ?? 0,
    min_average: policy.min_average ?? null,
    require_baseline: Boolean(policy.require_baseline),
    regression_tolerance: Number(policy.regression_tolerance ?? 0),
    live_baseline: policy.live_baseline === 'fail' ? 'fail' : 'warn',
    policy_version: policy.policy_version || 'v1',
  };

  const reasons = [];
  const failedCases = new Set();
  const caseResults = run.case_results || [];

  for (const item of caseResults) {
    const isLive = run.mode === 'live';
    let caseFailed = false;

    // 模板分低于门槛
    if (item.template?.score < item.minimum) {
      caseFailed = true;
      failedCases.add(item.case_id);
      reasons.push({
        code: isLive ? 'template_below_minimum' : 'case_below_minimum',
        level: 'fail',
        case_id: item.case_id,
        message: isLive
          ? `${item.case_id} 模板分 ${(item.template?.score ?? 0).toFixed(2)} 低于门槛 ${item.minimum.toFixed(2)}，live 高分不能抵消`
          : `${item.case_id} 得分 ${(item.template?.score ?? 0).toFixed(2)} 低于门槛 ${item.minimum.toFixed(2)}`,
      });
    }

    // live 模式下的特定错误与得分
    if (isLive) {
      if (item.live?.status !== 'completed') {
        caseFailed = true;
        failedCases.add(item.case_id);
        reasons.push({
          code: 'live_failed',
          level: 'fail',
          case_id: item.case_id,
          message: `${item.case_id} 模型调用失败: ${item.live?.error || 'MODEL_CALL_FAILED'}`,
        });
      } else if ((item.live?.score ?? 0) < item.minimum) {
        caseFailed = true;
        failedCases.add(item.case_id);
        reasons.push({
          code: 'live_below_minimum',
          level: 'fail',
          case_id: item.case_id,
          message: `${item.case_id} live 得分 ${(item.live?.score ?? 0).toFixed(2)} 低于门槛 ${item.minimum.toFixed(2)}`,
        });
      }
    }

    // 红线用例失败检查 (minimum === 1)
    if (item.minimum === 1 && caseFailed) {
      reasons.push({
        code: 'redline_failed',
        level: 'fail',
        case_id: item.case_id,
        message: `红线用例 ${item.case_id} 未通过，门禁不可放宽`,
      });
    }
  }

  // 平均分检查
  if (activePolicy.min_average != null && typeof run.average_score === 'number') {
    if (run.average_score < activePolicy.min_average) {
      reasons.push({
        code: 'average_below_minimum',
        level: 'fail',
        message: `平均分 ${run.average_score.toFixed(3)} 低于要求 ${activePolicy.min_average.toFixed(3)}`,
      });
    }
  }

  // 基线比较
  let baselineCompatible = null;
  let regressionCount = 0;

  if (!baseline) {
    if (activePolicy.require_baseline) {
      reasons.push({
        code: 'baseline_missing',
        level: 'fail',
        message: '未配置或未找到 active 基线，门禁要求必须有基线',
      });
    }
  } else {
    baselineCompatible = isBaselineCompatible(run, baseline);
    if (!baselineCompatible) {
      const level = run.mode === 'template' ? 'fail' : 'warn';
      reasons.push({
        code: 'baseline_incompatible',
        level,
        message: `基线版本不兼容 (${baseline.prompt_version || 'old'} vs ${run.prompt_version})，请重建基线`,
      });
    } else {
      const caseScores = baseline.case_scores || [];
      const scoreMap = new Map(caseResults.map((c) => [c.case_id, c.score]));

      for (const bCase of caseScores) {
        if (!scoreMap.has(bCase.case_id)) continue;
        const currentScore = scoreMap.get(bCase.case_id);
        const diff = bCase.score - currentScore;
        if (diff > activePolicy.regression_tolerance + 1e-6) {
          regressionCount += 1;
          const level = run.mode === 'live' ? activePolicy.live_baseline : 'fail';
          reasons.push({
            code: 'baseline_regression',
            level,
            case_id: bCase.case_id,
            message: `基线 ${bCase.score.toFixed(2)} → 当前 ${currentScore.toFixed(2)}，超过容忍值 ${activePolicy.regression_tolerance.toFixed(2)}`,
          });
        }
      }
    }
  }

  // 运行级异常
  if (run.error) {
    reasons.push({
      code: 'run_error',
      level: 'fail',
      message: run.error.message || '评测执行失败',
    });
  }

  // 取消状态判断
  if (run.status === 'cancelled' || run.cancel_requested) {
    return {
      status: 'skipped',
      policy: activePolicy,
      baseline_id: baseline?.id || null,
      baseline_label: baseline?.label || null,
      baseline_compatible: baselineCompatible,
      regression_count: regressionCount,
      failed_cases: [...failedCases],
      reasons: [
        { code: 'run_cancelled', level: 'info', message: '已取消，未产生门禁结论' },
      ],
      evaluated_at: new Date().toISOString(),
    };
  }

  const failReasons = reasons.filter((r) => r.level === 'fail');
  const isFailed = failReasons.length > 0 || failedCases.size > activePolicy.max_failed_cases;

  return {
    status: isFailed ? 'failed' : 'passed',
    policy: activePolicy,
    baseline_id: baseline?.id || null,
    baseline_label: baseline?.label || null,
    baseline_compatible: baselineCompatible,
    regression_count: regressionCount,
    failed_cases: [...failedCases],
    reasons,
    evaluated_at: new Date().toISOString(),
  };
}

module.exports = {
  isBaselineCompatible,
  evaluateGate,
};
