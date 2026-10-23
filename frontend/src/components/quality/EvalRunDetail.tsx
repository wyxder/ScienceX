import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Confirm, ErrorState, LoadingBlock, Modal, Progress, StatRow, Tag, useToast } from '../ui';
import Icon from '../Icon';
import { evalRunStream } from '../../api/client';
import { evalApi } from '../../api/eval';
import { useAuth } from '../../stores/auth';
import type { EvalCaseResult, EvalRunDetail as EvalRunDetailType } from '../../types/eval';

export interface EvalRunDetailProps {
  runId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function EvalRunDetail({ runId, onClose, onChanged }: EvalRunDetailProps) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<EvalRunDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 展开的用例 ID 集合
  const [expandedCases, setExpandedCases] = useState<Record<string, boolean>>({});

  // 实时 SSE 进度
  const [progress, setProgress] = useState({
    percent: 0,
    stage: '准备运行',
    completed: 0,
    total: 0,
    passed: 0,
    failed: 0,
    currentCaseId: '',
  });
  const [streamDown, setStreamDown] = useState(false);

  // 取消弹窗
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // 基线设置 / 重建弹窗
  const [baselineModalOpen, setBaselineModalOpen] = useState(false);
  const [baselineRebuildMode, setBaselineRebuildMode] = useState(false);
  const [baselineLabel, setBaselineLabel] = useState('');
  const [baselineSubmitting, setBaselineSubmitting] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  // 加载运行详情
  const loadDetail = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    evalApi
      .run(runId, controller.signal)
      .then((res) => {
        setDetail(res);
        if (res.completed > 0 && res.total > 0) {
          setProgress({
            percent: Math.min(99, Math.round((res.completed / res.total) * 100)),
            stage: ['queued', 'running'].includes(res.status) ? '评测进行中' : '评测完成',
            completed: res.completed,
            total: res.total,
            passed: res.passed_cases,
            failed: res.failed_cases,
            currentCaseId: '',
          });
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || '加载评测详情失败');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    return loadDetail();
  }, [runId]);

  // SSE 实时流监听
  useEffect(() => {
    if (!detail || !['queued', 'running'].includes(detail.status)) return;

    const stopStream = evalRunStream(runId, {
      onProgress: (p) => {
        setProgress({
          percent: p.percent,
          stage: p.stage || '评测进行中',
          completed: p.completed,
          total: p.total,
          passed: p.passed_cases,
          failed: p.failed_cases,
          currentCaseId: p.current_case_id || '',
        });
        if (p.current_case_id) {
          // 增量重新拉取或局部更新
          evalApi.run(runId).then((next) => setDetail(next)).catch(() => {});
        }
      },
      onDone: (d) => {
        setProgress((prev) => ({ ...prev, percent: 100, stage: '评测完成' }));
        evalApi.run(runId).then((next) => {
          setDetail(next);
          onChanged();
        });
      },
      onError: (_msg, details) => {
        if (details?.degraded) {
          setStreamDown(true);
        }
      },
    });

    return () => {
      stopStream();
    };
  }, [runId, detail?.status]);

  // 断线降级轮询（每 3 秒刷新）
  useEffect(() => {
    if (!streamDown || !runId) return;

    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await evalApi.run(runId);
        setDetail(next);
        if (!['queued', 'running'].includes(next.status)) {
          clearInterval(timer);
          onChanged();
        }
      } catch {
        // 保持上次数据
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [streamDown, runId, onChanged]);

  const toggleExpand = (caseId: string) => {
    setExpandedCases((prev) => ({ ...prev, [caseId]: !prev[caseId] }));
  };

  const copyText = (text: string, tip = '已复制到剪贴板') => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast(tip, 'ok'))
      .catch(() => toast('复制失败', 'err'));
  };

  // 定位到具体用例并高亮
  const locateCase = (caseId: string) => {
    const el = document.getElementById(`case-${caseId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('sx-quality-highlight');
      setTimeout(() => {
        el.classList.remove('sx-quality-highlight');
      }, 2000);
      setExpandedCases((prev) => ({ ...prev, [caseId]: true }));
    } else {
      toast(`未找到用例 ${caseId}`, 'info');
    }
  };

  // 场景复现跳转
  const handleReproduce = (c: EvalCaseResult) => {
    if (c.scene === 'workbench') {
      copyText(c.question, '问题已复制，粘贴到对话框即可');
      navigate('/chat');
    } else if (c.scene === 'document') {
      copyText(c.question, '问题已复制，粘贴到阅读器对话即可');
      navigate('/tools/reader');
    } else {
      navigate('/features/review');
    }
  };

  // 取消运行
  const handleCancelRun = async () => {
    setCancelling(true);
    try {
      await evalApi.cancel(runId);
      toast('已提交取消请求', 'ok');
      setCancelConfirmOpen(false);
      // 重新拉取
      const next = await evalApi.run(runId);
      setDetail(next);
      onChanged();
    } catch (err: any) {
      toast(err.message || '取消运行失败', 'err');
    } finally {
      setCancelling(false);
    }
  };

  // 打开设为基线弹窗
  const openPromoteModal = (rebuild: boolean) => {
    if (!detail) return;
    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const defLabel = `${detail.suite_id}-${detail.mode}-${nowStr}`;
    setBaselineLabel(defLabel);
    setBaselineRebuildMode(rebuild);
    setBaselineError(null);
    setBaselineModalOpen(true);
  };

  // 提交设为基线
  const handlePromoteBaseline = async () => {
    if (!baselineLabel.trim()) {
      setBaselineError('基线标签不能为空');
      return;
    }
    setBaselineSubmitting(true);
    setBaselineError(null);
    try {
      await evalApi.promoteBaseline(runId, baselineLabel.trim(), baselineRebuildMode);
      toast(baselineRebuildMode ? '基线已重建' : '已成功设为活跃基线', 'ok');
      setBaselineModalOpen(false);
      const next = await evalApi.run(runId);
      setDetail(next);
      onChanged();
    } catch (err: any) {
      setBaselineError(err.message || '设置基线失败');
    } finally {
      setBaselineSubmitting(false);
    }
  };

  // 导出 JSON
  const handleExportJson = () => {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eval-${detail.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('评测报告 JSON 已导出', 'ok');
  };

  if (loading && !detail) {
    return <LoadingBlock text="正在加载评测运行详情…" />;
  }

  if (error && !detail) {
    return <ErrorState title="加载评测详情失败" message={error} onRetry={loadDetail} />;
  }

  if (!detail) return null;

  const isOwner = user ? detail.owner_id === user.id : true;
  const isRunning = ['queued', 'running'].includes(detail.status);

  // 判断是否允许重建基线：
  // 必须是门禁失败，但不存在单题/红线低于 minimum 的硬失败，只有基线 regression 或 incompatible
  const hasHardFail =
    detail.failed_cases > 0 ||
    detail.case_results.some((c) => c.status === 'failed' || c.status === 'error');
  const canRebuild =
    !isRunning &&
    detail.gate.status === 'failed' &&
    !hasHardFail &&
    detail.gate.reasons.some((r) =>
      ['baseline_regression', 'baseline_incompatible', 'baseline_missing'].includes(r.code)
    );

  const stats = [
    {
      label: '用例通过情况',
      value: `${detail.passed_cases} / ${detail.total}`,
      hint: `已完成 ${detail.completed} 道`,
      color: detail.failed_cases > 0 ? 'var(--red)' : 'var(--brand)',
    },
    {
      label: '整体平均得分',
      value: detail.average_score.toFixed(3),
      hint: `模板均分: ${detail.template_average.toFixed(3)}${
        detail.live_average !== null ? ` | Live: ${detail.live_average.toFixed(3)}` : ''
      }`,
    },
    {
      label: '门禁最终结论',
      value:
        detail.gate.status === 'passed'
          ? '通过'
          : detail.gate.status === 'failed'
          ? '未通过'
          : detail.gate.status === 'skipped'
          ? '跳过'
          : '待定',
      hint:
        detail.gate.reasons.length > 0
          ? `${detail.gate.reasons.length} 条门禁拦截项`
          : '全部门禁策略达成',
      color: detail.gate.status === 'passed' ? 'var(--brand)' : 'var(--red)',
    },
    {
      label: '对比生效基线',
      value: detail.baseline_label || '未对比基线',
      hint: detail.gate.baseline_compatible === false ? '基线版本不兼容' : '基线回退阈值: 0.00',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部导航与操作栏 */}
      <div className="sx-quality-detail-top">
        <div className="sx-quality-detail-title">
          <button className="btn btn-ghost btn-sm" onClick={onClose} title="返回运行列表">
            <Icon name="arrowRight" size={16} style={{ transform: 'rotate(180deg)' }} /> 返回
          </button>
          <span className="mono fw-bold text-sm" style={{ color: 'var(--ink)' }}>
            {detail.id}
          </span>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => copyText(detail.id, '运行 ID 已复制')}
            title="复制运行 ID"
          >
            <Icon name="copy" size={14} />
          </button>
          <Tag color={detail.mode === 'live' ? 'blue' : 'gray'}>
            {detail.mode === 'live' ? 'Live' : 'Template'}
          </Tag>
          {detail.status === 'passed' ? (
            <Tag color="green">通过</Tag>
          ) : detail.status === 'failed' ? (
            <Tag color="red">未通过</Tag>
          ) : detail.status === 'running' ? (
            <Tag color="amber">运行中</Tag>
          ) : detail.status === 'queued' ? (
            <Tag color="gray">排队中</Tag>
          ) : detail.status === 'cancelled' ? (
            <Tag color="gray">已取消</Tag>
          ) : (
            <Tag color="red">异常</Tag>
          )}
        </div>

        <div className="sx-quality-actions">
          {isRunning && isOwner && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setCancelConfirmOpen(true)}
              disabled={cancelling}
            >
              <Icon name="x" size={14} /> 取消运行
            </button>
          )}

          {!isRunning && isOwner && detail.gate.status === 'passed' && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => openPromoteModal(false)}
            >
              <Icon name="shield" size={14} /> 设为基线
            </button>
          )}

          {canRebuild && isOwner && (
            <button
              className="btn btn-outline btn-sm"
              style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
              onClick={() => openPromoteModal(true)}
              title="当前仅因基线回退或版本不兼容失败，单题全部达标，可确认质量并重建基线"
            >
              <Icon name="refresh" size={14} /> 重建基线
            </button>
          )}

          <button className="btn btn-outline btn-sm" onClick={handleExportJson}>
            <Icon name="download" size={14} /> 导出 JSON
          </button>

          <button className="btn btn-ghost btn-sm" onClick={loadDetail} title="刷新详情">
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* 状态与告警 Callout */}
      {streamDown && isRunning && (
        <div className="sx-quality-callout warning">
          <Icon name="alert" size={16} />
          <div style={{ flex: 1 }}>
            实时进度连接中断，已自动降级为每 3 秒轮询刷新。
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadDetail}>
            立即刷新
          </button>
        </div>
      )}

      {detail.persist_error && (
        <div className="sx-quality-callout warning">
          <Icon name="alert" size={16} />
          <span>
            本次评测记录写入本地持久化目录失败 ({detail.persist_error})，服务重启后可能丢失。建议及时点击右上角“导出 JSON”保留报告。
          </span>
        </div>
      )}

      {detail.error && (
        <div className="sx-quality-callout danger">
          <Icon name="alert" size={16} />
          <span>
            运行异常中断 [{detail.error.code}]: {detail.error.message}
          </span>
        </div>
      )}

      {/* 运行中进度卡片 */}
      {isRunning && (
        <div className="sx-quality-progress-card">
          <div className="row-between items-center text-xs">
            <span className="fw-bold">{progress.stage}</span>
            <span className="mono">{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} />
          <div className="row-between items-center text-xs text-muted">
            <span>
              已完成 {progress.completed} / {progress.total} 道用例
              {progress.currentCaseId ? ` (正在评测: ${progress.currentCaseId})` : ''}
            </span>
            <span>
              通过: {progress.passed} · 失败: {progress.failed}
            </span>
          </div>
        </div>
      )}

      {/* 汇总指标卡 */}
      <StatRow stats={stats} />

      {/* 门禁拦截原因 Callout */}
      {detail.gate.status === 'failed' && detail.gate.reasons.length > 0 && (
        <div className="sx-quality-callout danger" style={{ flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <Icon name="alert" size={16} />
            <span>门禁未通过 · {detail.gate.reasons.length} 条拦截原因</span>
          </div>
          <div className="sx-quality-reason-list" style={{ width: '100%' }}>
            {detail.gate.reasons.map((r, idx) => (
              <div
                key={idx}
                className={`sx-quality-reason-item ${r.level === 'warn' ? 'warn' : ''}`}
              >
                <div>
                  <span className="mono fw-bold mr-2">[{r.code}]</span>
                  <span>{r.message}</span>
                </div>
                {r.case_id && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => locateCase(r.case_id!)}
                  >
                    定位到用例 →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 逐题详细报告表 (桌面端) */}
      <div className="sx-quality-desktop-only">
        <Card pad={false}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>逐题评测明细 (12 项用例)</h4>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>用例 ID</th>
                  <th>场景</th>
                  <th>门槛</th>
                  <th>模板得分</th>
                  <th>Live 得分</th>
                  <th>状态</th>
                  <th>缺失评分要点</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {detail.case_results.map((c) => {
                  const isExpanded = !!expandedCases[c.case_id];
                  const missingTags = Array.from(
                    new Set([...(c.template.missing || []), ...(c.live?.missing || [])])
                  );

                  return (
                    <tr
                      key={c.case_id}
                      id={`case-${c.case_id}`}
                      className="sx-quality-case-row"
                    >
                      <td style={{ verticalAlign: 'top' }}>
                        <div className="mono fw-bold" style={{ color: 'var(--ink)' }}>
                          {c.case_id}
                        </div>
                        {c.minimum === 1 && <Tag color="red" style={{ marginTop: 3 }}>红线</Tag>}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <Tag color="gray">{c.scene}</Tag>
                      </td>
                      <td className="mono" style={{ verticalAlign: 'top' }}>
                        {c.minimum.toFixed(2)}
                      </td>
                      <td className="mono fw-bold" style={{ verticalAlign: 'top' }}>
                        {c.template.score !== null && c.template.score !== undefined
                          ? c.template.score.toFixed(2)
                          : '—'}
                      </td>
                      <td className="mono" style={{ verticalAlign: 'top' }}>
                        {detail.mode === 'live' ? (
                          c.live.status === 'failed' ? (
                            <Tag color="red">失败</Tag>
                          ) : c.live.score !== null && c.live.score !== undefined ? (
                            c.live.score.toFixed(2)
                          ) : (
                            '—'
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        {c.status === 'passed' ? (
                          <Tag color="green">达标</Tag>
                        ) : c.status === 'failed' ? (
                          <Tag color="red">未达标</Tag>
                        ) : (
                          <Tag color="gray">{c.status}</Tag>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        {missingTags.length === 0 ? (
                          <span className="text-muted text-xs">无缺失</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {missingTags.map((m, i) => (
                              <Tag key={i} color="red">
                                缺: {m}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => toggleExpand(c.case_id)}
                        >
                          {isExpanded ? '收起' : '展开输出'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 展开的用例详细卡片 (在表格下方或移动端展开时显示) */}
      {detail.case_results.map((c) => {
        if (!expandedCases[c.case_id]) return null;

        return (
          <Card key={`detail-${c.case_id}`} pad style={{ background: 'var(--bg-deep)' }}>
            <div className="row-between items-center mb-2">
              <div className="row g-2 items-center">
                <span className="mono fw-bold">{c.case_id}</span>
                <span className="text-sm text-muted">问题: {c.question}</span>
              </div>
              <div className="row g-2">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => copyText(c.case_id, '用例 ID 已复制')}
                >
                  <Icon name="copy" size={13} /> 复制 ID
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleReproduce(c)}
                  title="复制问题并跳转到对应业务场景复现验证"
                >
                  <Icon name="arrowRight" size={13} />{' '}
                  {c.scene === 'workbench' ? '去对话复现' : '去文献阅读复现'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleExpand(c.case_id)}
                >
                  收起
                </button>
              </div>
            </div>

            {/* 匹配与缺失要点 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12 }}>
              <div>
                <span className="text-muted mr-1">命中要点:</span>
                {(c.template.matched || []).length > 0 ? (
                  c.template.matched!.map((m, i) => (
                    <Tag key={i} color="green" style={{ marginRight: 4 }}>
                      {m}
                    </Tag>
                  ))
                ) : (
                  <span className="text-muted">无</span>
                )}
              </div>
              <div>
                <span className="text-muted mr-1">缺失要点:</span>
                {(c.template.missing || []).length > 0 ? (
                  c.template.missing!.map((m, i) => (
                    <Tag key={i} color="red" style={{ marginRight: 4 }}>
                      {m}
                    </Tag>
                  ))
                ) : (
                  <span className="text-muted">全部命中</span>
                )}
              </div>
            </div>

            {/* 模板回答输出 */}
            <div>
              <div className="row-between items-center text-xs text-muted">
                <span>模板回答 (耗时: {c.template.latency_ms} ms)</span>
                {c.template.text && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '0 4px' }}
                    onClick={() => copyText(c.template.text!, '模板回答已复制')}
                  >
                    复制回答
                  </button>
                )}
              </div>
              <pre className="sx-quality-pre">
                {c.template.text || '(无模板文本输出)'}
              </pre>
              {c.template.truncated && (
                <div className="text-xs text-muted mt-1">输出已截断（上限 8000 字符）</div>
              )}
            </div>

            {/* Live 真实模型输出 (如果有) */}
            {detail.mode === 'live' && (
              <div style={{ marginTop: 12 }}>
                <div className="row-between items-center text-xs text-muted">
                  <span>
                    模型回答 ({c.live.model || 'live'} · 耗时: {c.live.latency_ms || 0} ms)
                  </span>
                  {c.live.text && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '0 4px' }}
                      onClick={() => copyText(c.live.text!, '模型回答已复制')}
                    >
                      复制回答
                    </button>
                  )}
                </div>
                {c.live.error ? (
                  <div className="sx-quality-callout danger mt-1">
                    <Icon name="alert" size={14} />
                    <span>模型调用失败: {c.live.error}（建议检查模型配置或改用模板模式）</span>
                  </div>
                ) : (
                  <pre className="sx-quality-pre">{c.live.text || '(无模型输出)'}</pre>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* 移动端卡片式展示 */}
      <div className="sx-quality-mobile-only">
        {detail.case_results.map((c) => {
          const isExpanded = !!expandedCases[c.case_id];
          const missingTags = Array.from(
            new Set([...(c.template.missing || []), ...(c.live?.missing || [])])
          );

          return (
            <div
              key={`m-${c.case_id}`}
              id={`case-${c.case_id}`}
              className="sx-quality-mobile-card"
            >
              <div className="row-between items-center">
                <div className="row g-1 items-center">
                  <span className="mono fw-bold text-xs">{c.case_id}</span>
                  {c.minimum === 1 && <Tag color="red">红线</Tag>}
                </div>
                {c.status === 'passed' ? (
                  <Tag color="green">达标</Tag>
                ) : (
                  <Tag color="red">未达标</Tag>
                )}
              </div>
              <div className="text-xs text-muted">{c.question}</div>
              <div className="row-between items-center text-xs">
                <span>模板分: {c.template.score?.toFixed(2) || '—'}</span>
                {detail.mode === 'live' && (
                  <span>Live分: {c.live.score?.toFixed(2) || '—'}</span>
                )}
                <span>门槛: {c.minimum.toFixed(2)}</span>
              </div>
              {missingTags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {missingTags.map((m, i) => (
                    <Tag key={i} color="red">
                      缺: {m}
                    </Tag>
                  ))}
                </div>
              )}
              <div className="row-between items-center pt-1" style={{ borderTop: '1px solid var(--line)' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleReproduce(c)}
                >
                  复现用例
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleExpand(c.case_id)}
                >
                  {isExpanded ? '收起详情' : '展开输出'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 取消运行确认弹窗 */}
      <Confirm
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={handleCancelRun}
        title="确认取消评测运行？"
        text="已完成的题目得分将予以保留，但本次运行不会产生基线门禁结论。"
        danger
      />

      {/* 提升 / 重建基线弹窗 */}
      <Modal
        open={baselineModalOpen}
        onClose={() => setBaselineModalOpen(false)}
        title={baselineRebuildMode ? '重建活跃基线' : '提升为活跃基线'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setBaselineModalOpen(false)}
              disabled={baselineSubmitting}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePromoteBaseline}
              disabled={baselineSubmitting}
            >
              {baselineSubmitting ? '正在提交…' : '确认生效'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {baselineError && (
            <div className="sx-quality-callout danger">
              <Icon name="alert" size={16} />
              <span>{baselineError}</span>
            </div>
          )}

          <div className="text-sm text-muted">
            {baselineRebuildMode
              ? '重建基线会将现有活跃基线置为历史状态，并以此运行作为新门禁对比基准。仅允许在单题与红线全部达标的情况下重建。'
              : '设为基线后，后续评测运行将以本次得分为基准进行回归检查与门禁判断。'}
          </div>

          <div>
            <label className="text-sm fw-bold mb-1" style={{ display: 'block' }}>
              基线标签 (Label)
            </label>
            <input
              type="text"
              className="input"
              value={baselineLabel}
              onChange={(e) => setBaselineLabel(e.target.value)}
              disabled={baselineSubmitting}
              maxLength={80}
              placeholder="例如: core-template-20261023"
              style={{ width: '100%' }}
            />
            <div className="text-xs text-muted mt-1">
              建议包含套件名称、评测模式与日期，便于版本追溯。
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
