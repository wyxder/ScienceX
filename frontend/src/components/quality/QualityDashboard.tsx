import { useEffect, useState } from 'react';
import { Card, EmptyState, ErrorState, LoadingBlock, ScoreRing, StatRow, Tag } from '../ui';
import { BarChart, LineChart } from '../charts';
import Icon from '../Icon';
import { evalApi } from '../../api/eval';
import type { EvalOverview } from '../../types/eval';

export interface QualityDashboardProps {
  suiteId: string;
  refreshKey: number;
  onOpenRun: (id: string) => void;
  onRun: () => void;
}

export function QualityDashboard({
  suiteId,
  refreshKey,
  onOpenRun,
  onRun,
}: QualityDashboardProps) {
  const [data, setData] = useState<EvalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    evalApi
      .overview(suiteId, controller.signal)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || '加载质量看板失败');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    return loadData();
  }, [suiteId, refreshKey]);

  if (loading && !data) {
    return <LoadingBlock text="正在加载质量看板数据…" />;
  }

  if (error && !data) {
    return <ErrorState title="质量看板加载失败" message={error} onRetry={loadData} />;
  }

  if (!data) return null;

  if (data.total_runs === 0) {
    return (
      <div style={{ padding: '24px 0' }}>
        {!data.enabled && (
          <div className="sx-quality-callout warning mb-3">
            <Icon name="alert" size={16} />
            <span>评测功能已关闭 (HARNESS_EVAL_ENABLED=false)，当前只能查看历史数据。</span>
          </div>
        )}
        <Card pad>
          <EmptyState
            icon="gauge"
            title="还没有运行记录"
            description="模板模式不调用模型，几秒内就能完成第一次质量回归与门禁测试。"
            action={
              <button
                className="btn btn-primary"
                onClick={onRun}
                disabled={!data.enabled}
              >
                <Icon name="play" size={14} /> 运行第一次评测
              </button>
            }
          />
        </Card>
      </div>
    );
  }

  const passRateText =
    data.pass_rate_7d !== null ? `${(data.pass_rate_7d * 100).toFixed(1)}%` : '—';
  const avgScoreText =
    data.average_score_7d !== null ? data.average_score_7d.toFixed(3) : '—';
  const baselineScoreText =
    data.active_baseline !== null ? data.active_baseline.average_score.toFixed(3) : '未建立';

  const stats = [
    {
      label: '近 7 天通过率',
      value: passRateText,
      hint: data.pass_rate_7d === null ? '近 7 天无已完成运行' : '门禁全部通过率',
      color:
        data.pass_rate_7d === null
          ? undefined
          : data.pass_rate_7d >= 0.9
          ? 'var(--brand)'
          : 'var(--red)',
    },
    {
      label: '近 7 天平均分',
      value: avgScoreText,
      hint: data.average_score_7d === null ? '无完成样本' : '评分点要点命中率',
    },
    {
      label: '累计运行次数',
      value: data.total_runs,
      hint: '包含模板与 live 运行',
    },
    {
      label: '当前基线分',
      value: baselineScoreText,
      hint: data.active_baseline ? data.active_baseline.label : '尚未建立 active 基线',
      color: data.active_baseline ? 'var(--brand)' : 'var(--muted)',
    },
  ];

  const recentRuns = [...data.trend].reverse().slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!data.enabled && (
        <div className="sx-quality-callout warning">
          <Icon name="alert" size={16} />
          <span>评测功能已关闭 (HARNESS_EVAL_ENABLED=false)，当前只能查看历史数据。</span>
        </div>
      )}

      {/* 4 项核心指标 */}
      <StatRow stats={stats} />

      {/* 趋势图与当前基线卡 */}
      <div className="sx-quality-grid-2-1">
        <Card pad>
          <div className="row-between items-center mb-3">
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>平均分趋势</h4>
            <span className="text-xs text-muted">最近 {data.trend.length} 次运行</span>
          </div>
          {data.trend.length < 2 ? (
            <div style={{ padding: '24px 0' }}>
              <EmptyState
                icon="chart"
                title="暂无足够趋势数据"
                description="至少需要 2 次运行才能生成趋势折线图。"
              />
            </div>
          ) : (
            <LineChart
              height={210}
              series={[
                {
                  name: '平均分',
                  data: data.trend.map((t) => Number(t.average_score.toFixed(3))),
                  color: 'var(--brand)',
                },
              ]}
              labels={data.trend.map((t) => {
                const d = new Date(t.created_at);
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const h = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                return `${m}-${day} ${h}:${min}`;
              })}
              yFormat={(v) => v.toFixed(3)}
            />
          )}
        </Card>

        <Card pad style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="row-between items-center mb-3">
              <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>活跃基线</h4>
              <Tag color={data.active_baseline ? 'green' : 'gray'}>
                {data.active_baseline ? '已激活' : '未设定'}
              </Tag>
            </div>
            {data.active_baseline ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '14px 0' }}>
                <ScoreRing
                  value={Math.round(data.active_baseline.average_score * 100)}
                  size={64}
                />
                <div>
                  <div className="text-sm fw-bold mb-1" style={{ wordBreak: 'break-all' }}>
                    {data.active_baseline.label}
                  </div>
                  <div className="text-xs text-muted">
                    平均分: {data.active_baseline.average_score.toFixed(3)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <div className="text-sm text-muted mb-2">尚未设定当前生效基线</div>
                <div className="text-xs text-muted">
                  在通过门禁的运行报告详情中，可将通过结果提升为对比基线。
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            {data.active_baseline ? (
              <button
                className="btn btn-outline btn-sm"
                style={{ width: '100%' }}
                onClick={() => onOpenRun(data.active_baseline!.id)}
              >
                查看基线来源运行
              </button>
            ) : (
              <button
                className="btn btn-outline btn-sm"
                style={{ width: '100%' }}
                onClick={onRun}
                disabled={!data.enabled}
              >
                发起新评测
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* 失败 Top 5 与最近运行 */}
      <div className="sx-quality-grid-1-1">
        <Card pad>
          <div className="row-between items-center mb-3">
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>用例失败排行 (Top 5)</h4>
            <span className="text-xs text-muted">高频退化用例统计</span>
          </div>
          {data.failure_top.length === 0 ? (
            <div style={{ padding: '24px 0' }}>
              <EmptyState
                icon="check"
                title="暂无失败记录"
                description="近期运行中所有用例均达到或超过期望要点门槛。"
              />
            </div>
          ) : (
            <BarChart
              height={200}
              data={data.failure_top.map((f) => ({
                label: f.case_id,
                value: f.fail_count,
              }))}
              format={(v) => `${v} 次`}
              highlight={() => true}
            />
          )}
        </Card>

        <Card pad>
          <div className="row-between items-center mb-3">
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>最近运行</h4>
            <span className="text-xs text-muted">点击行跳转报告详情</span>
          </div>
          {recentRuns.length === 0 ? (
            <div style={{ padding: '24px 0' }}>
              <EmptyState icon="inbox" title="暂无最近运行" />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>状态</th>
                    <th>得分</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => {
                    const statusTag =
                      r.status === 'passed' ? (
                        <Tag color="green">通过</Tag>
                      ) : r.status === 'failed' ? (
                        <Tag color="red">未通过</Tag>
                      ) : r.status === 'running' ? (
                        <Tag color="amber">进行中</Tag>
                      ) : (
                        <Tag color="gray">{r.status}</Tag>
                      );
                    return (
                      <tr
                        key={r.run_id}
                        onClick={() => onOpenRun(r.run_id)}
                        style={{ cursor: 'pointer' }}
                        className="sx-quality-case-row"
                      >
                        <td className="text-muted text-xs">
                          {new Date(r.created_at).toLocaleString([], {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>{statusTag}</td>
                        <td className="mono fw-bold">{r.average_score.toFixed(3)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenRun(r.run_id);
                            }}
                          >
                            查看
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
