import { useCallback, useEffect, useState } from 'react';
import { Card, EmptyState, ErrorState, LoadingBlock, Tag, Toolbar } from '../ui';
import Icon from '../Icon';
import { evalApi } from '../../api/eval';
import type { EvalMode, EvalRunListItem, EvalRunStatus } from '../../types/eval';

export interface EvalRunListProps {
  suiteId: string;
  refreshKey: number;
  selectedRunId?: string;
  onSelectRun: (id: string) => void;
  onRun: () => void;
}

export function EvalRunList({
  suiteId,
  refreshKey,
  selectedRunId,
  onSelectRun,
  onRun,
}: EvalRunListProps) {
  const [items, setItems] = useState<EvalRunListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query: any = {
      suite_id: suiteId,
      page,
      page_size: pageSize,
    };
    if (statusFilter !== 'all') {
      query.status = statusFilter as EvalRunStatus;
    }
    if (modeFilter !== 'all') {
      query.mode = modeFilter as EvalMode;
    }

    evalApi
      .runs(query, controller.signal)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || '获取运行列表失败');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [suiteId, page, pageSize, statusFilter, modeFilter]);

  useEffect(() => {
    return fetchRuns();
  }, [fetchRuns, refreshKey]);

  // 运行中轮询（5秒）
  useEffect(() => {
    const hasActive = items.some((r) => r.status === 'queued' || r.status === 'running');
    if (!hasActive) return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRuns();
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [items, fetchRuns]);

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleModeChange = (val: string) => {
    setModeFilter(val);
    setPage(1);
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setModeFilter('all');
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  const renderStatusTag = (status: EvalRunStatus) => {
    switch (status) {
      case 'passed':
        return <Tag color="green">通过</Tag>;
      case 'failed':
        return <Tag color="red">未通过</Tag>;
      case 'running':
        return <Tag color="amber">运行中</Tag>;
      case 'queued':
        return <Tag color="gray">排队中</Tag>;
      case 'cancelled':
        return <Tag color="gray">已取消</Tag>;
      case 'error':
        return <Tag color="red">异常</Tag>;
      default:
        return <Tag color="gray">{status}</Tag>;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '—';
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  };

  return (
    <div>
      {/* 筛选与操作工具栏 */}
      <Toolbar
        left={
          <>
            <select
              className="input input-sm"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              <option value="all">全部状态</option>
              <option value="passed">已通过 (Passed)</option>
              <option value="failed">未通过 (Failed)</option>
              <option value="running">运行中 (Running)</option>
              <option value="queued">排队中 (Queued)</option>
              <option value="cancelled">已取消 (Cancelled)</option>
              <option value="error">运行异常 (Error)</option>
            </select>

            <select
              className="input input-sm"
              value={modeFilter}
              onChange={(e) => handleModeChange(e.target.value)}
            >
              <option value="all">全部模式</option>
              <option value="template">模板模式 (Template)</option>
              <option value="live">实时模型 (Live)</option>
            </select>
          </>
        }
        right={
          <>
            <button className="btn btn-outline btn-sm" onClick={fetchRuns} title="刷新列表">
              <Icon name="refresh" size={14} /> 刷新
            </button>
            <button className="btn btn-primary btn-sm" onClick={onRun}>
              <Icon name="play" size={14} /> 发起评测
            </button>
          </>
        }
      />

      {loading && items.length === 0 ? (
        <LoadingBlock text="正在加载运行历史…" />
      ) : error && items.length === 0 ? (
        <ErrorState title="获取运行记录失败" message={error} onRetry={fetchRuns} />
      ) : items.length === 0 ? (
        <Card pad>
          {statusFilter !== 'all' || modeFilter !== 'all' ? (
            <EmptyState
              icon="filter"
              title="没有符合条件的运行记录"
              description="尝试清除或调整筛选条件"
              action={
                <button className="btn btn-outline btn-sm" onClick={resetFilters}>
                  清除筛选
                </button>
              }
            />
          ) : (
            <EmptyState
              icon="inbox"
              title="还没有运行记录"
              description="点击下方按钮运行评测，验证科研助手质量基线。"
              action={
                <button className="btn btn-primary btn-sm" onClick={onRun}>
                  <Icon name="play" size={14} /> 运行评测
                </button>
              }
            />
          )}
        </Card>
      ) : (
        <>
          {/* 桌面端表格 */}
          <div className="sx-quality-desktop-only">
            <Card pad={false}>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>创建时间</th>
                      <th>运行 ID</th>
                      <th>模式</th>
                      <th>状态</th>
                      <th>通过用例</th>
                      <th>平均得分</th>
                      <th>耗时</th>
                      <th>门禁结论</th>
                      <th style={{ textAlign: 'right' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const isSelected = selectedRunId === item.id;
                      return (
                        <tr
                          key={item.id}
                          className={`sx-quality-case-row ${isSelected ? 'sx-quality-highlight' : ''}`}
                          onClick={() => onSelectRun(item.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="text-muted text-xs">
                            {new Date(item.created_at).toLocaleString([], {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="mono text-xs" style={{ color: 'var(--brand)' }}>
                            {item.id}
                          </td>
                          <td>
                            <Tag color={item.mode === 'live' ? 'blue' : 'gray'}>
                              {item.mode === 'live' ? 'Live' : 'Template'}
                            </Tag>
                          </td>
                          <td>{renderStatusTag(item.status)}</td>
                          <td className="mono">
                            {item.passed_cases} / {item.total}
                          </td>
                          <td className="mono fw-bold">{item.average_score.toFixed(3)}</td>
                          <td className="text-muted text-xs">{formatDuration(item.duration_ms)}</td>
                          <td>
                            {item.gate.status === 'passed' ? (
                              <span style={{ color: 'var(--brand)', fontSize: 12 }}>通过</span>
                            ) : item.gate.status === 'failed' ? (
                              <span style={{ color: 'var(--red)', fontSize: 12 }}>
                                未通过 ({item.gate.reasons_count} 条原因)
                              </span>
                            ) : item.gate.status === 'skipped' ? (
                              <span className="text-muted text-xs">已跳过</span>
                            ) : (
                              <span className="text-muted text-xs">计算中…</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRun(item.id);
                              }}
                            >
                              报告
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

          {/* 移动端卡片列表 */}
          <div className="sx-quality-mobile-only">
            {items.map((item) => (
              <div
                key={item.id}
                className="sx-quality-mobile-card"
                onClick={() => onSelectRun(item.id)}
              >
                <div className="row-between items-center">
                  <span className="mono text-xs fw-bold">{item.id}</span>
                  <div className="row g-1 items-center">
                    <Tag color={item.mode === 'live' ? 'blue' : 'gray'}>
                      {item.mode === 'live' ? 'Live' : 'Template'}
                    </Tag>
                    {renderStatusTag(item.status)}
                  </div>
                </div>
                <div className="row-between items-center text-xs text-muted">
                  <span>
                    时间:{' '}
                    {new Date(item.created_at).toLocaleString([], {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>耗时: {formatDuration(item.duration_ms)}</span>
                </div>
                <div className="row-between items-center pt-1" style={{ borderTop: '1px solid var(--line)' }}>
                  <div>
                    <span className="text-xs text-muted mr-1">通过:</span>
                    <span className="mono fw-bold">
                      {item.passed_cases}/{item.total}
                    </span>
                    <span className="text-xs text-muted ml-2 mr-1">得分:</span>
                    <span className="mono fw-bold">{item.average_score.toFixed(3)}</span>
                  </div>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRun(item.id);
                    }}
                  >
                    查看报告
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 分页控制（超过 1 页时显示） */}
          {total > pageSize && (
            <div className="row-between items-center mt-3" style={{ padding: '0 4px' }}>
              <span className="text-xs text-muted">
                共 {total} 条记录，第 {page} / {totalPages} 页
              </span>
              <div className="row g-2">
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
