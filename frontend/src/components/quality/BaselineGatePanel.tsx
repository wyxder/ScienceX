import { useEffect, useState } from 'react';
import { Card, EmptyState, ErrorState, LoadingBlock, ScoreRing, Tag } from '../ui';
import Icon from '../Icon';
import { evalApi } from '../../api/eval';
import type { EvalGateResponse } from '../../types/eval';

export interface BaselineGatePanelProps {
  suiteId: string;
  refreshKey: number;
  onOpenRun: (id: string) => void;
}

export function BaselineGatePanel({
  suiteId,
  refreshKey,
  onOpenRun,
}: BaselineGatePanelProps) {
  const [data, setData] = useState<EvalGateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    evalApi
      .gates(suiteId, controller.signal)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || '加载基线与门禁配置失败');
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
    return <LoadingBlock text="正在加载基线与门禁策略…" />;
  }

  if (error && !data) {
    return <ErrorState title="加载基线门禁策略失败" message={error} onRetry={loadData} />;
  }

  if (!data) return null;

  const { policy, active_baseline, baselines } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 只读策略提示 */}
      <div className="sx-quality-callout info">
        <Icon name="shield" size={16} />
        <span>
          门禁策略由部署环境变量统一决定，前端页面为严格只读展示，以保障基线一致性与历史可复现性。
        </span>
      </div>

      {/* 门禁策略卡片组 */}
      <Card pad>
        <div className="row-between items-center mb-3">
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>当前生效门禁策略</h4>
          <span className="mono text-xs text-muted">策略版本: {policy.policy_version}</span>
        </div>
        <div className="grid grid-4 g-3">
          <div style={{ padding: '12px 14px', background: 'var(--bg-deep)', borderRadius: 'var(--r-md)' }}>
            <div className="text-xs text-muted mb-1">允许失败用例上限</div>
            <div className="mono fw-bold" style={{ fontSize: 18 }}>
              {policy.max_failed_cases}
            </div>
            <div className="text-xs text-muted mt-1">
              {policy.max_failed_cases === 0 ? '零容忍硬拦截' : `允许最多 ${policy.max_failed_cases} 题失败`}
            </div>
          </div>

          <div style={{ padding: '12px 14px', background: 'var(--bg-deep)', borderRadius: 'var(--r-md)' }}>
            <div className="text-xs text-muted mb-1">基线回退容忍度</div>
            <div className="mono fw-bold" style={{ fontSize: 18 }}>
              {policy.regression_tolerance.toFixed(2)}
            </div>
            <div className="text-xs text-muted mt-1">
              {policy.regression_tolerance === 0 ? '掉落一个要点即拦截' : `允许分数下降 ≤ ${policy.regression_tolerance}`}
            </div>
          </div>

          <div style={{ padding: '12px 14px', background: 'var(--bg-deep)', borderRadius: 'var(--r-md)' }}>
            <div className="text-xs text-muted mb-1">强制要求活跃基线</div>
            <div className="mono fw-bold" style={{ fontSize: 18 }}>
              {policy.require_baseline ? '是 (强制)' : '否 (可选)'}
            </div>
            <div className="text-xs text-muted mt-1">
              {policy.require_baseline ? '无基线直接门禁失败' : '首次运行无基线正常放行'}
            </div>
          </div>

          <div style={{ padding: '12px 14px', background: 'var(--bg-deep)', borderRadius: 'var(--r-md)' }}>
            <div className="text-xs text-muted mb-1">Live 真实模型回退处理</div>
            <div className="mono fw-bold" style={{ fontSize: 18 }}>
              {policy.live_baseline === 'warn' ? '仅告警 (Warn)' : '拦截失败 (Fail)'}
            </div>
            <div className="text-xs text-muted mt-1">
              {policy.live_baseline === 'warn' ? '避免模型输出方差产生误报' : '严格阻断模型退化'}
            </div>
          </div>
        </div>
      </Card>

      {/* 当前活跃基线 */}
      <Card pad>
        <div className="row-between items-center mb-3">
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>当前活跃基线 (Active Baseline)</h4>
          <Tag color={active_baseline ? 'green' : 'gray'}>
            {active_baseline ? '已生效' : '未设定'}
          </Tag>
        </div>

        {active_baseline ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
              padding: '16px 20px',
              background: 'var(--bg-deep)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ScoreRing value={Math.round(active_baseline.average_score * 100)} size={72} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                  {active_baseline.label}
                  {active_baseline.rebuild && (
                    <Tag color="amber" style={{ marginLeft: 8 }}>
                      重建基线
                    </Tag>
                  )}
                </div>
                <div className="text-xs text-muted mt-1">
                  平均得分: <span className="mono fw-bold">{active_baseline.average_score.toFixed(3)}</span> ·
                  提示词版本: <span className="mono">{active_baseline.prompt_version}</span> ·
                  设立时间: {new Date(active_baseline.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            <button
              className="btn btn-outline btn-sm"
              onClick={() => onOpenRun(active_baseline.run_id)}
            >
              <Icon name="arrowRight" size={14} /> 查看基线来源运行
            </button>
          </div>
        ) : (
          <EmptyState
            icon="shield"
            title="尚未设立当前活跃基线"
            description="先在“运行记录”中运行一次模板模式评测，通过门禁后在详情页点击“设为基线”即可建立。"
          />
        )}
      </Card>

      {/* 历史基线列表 */}
      <Card pad>
        <div className="row-between items-center mb-3">
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>基线历史记录</h4>
          <span className="text-xs text-muted">共 {baselines.length} 条记录</span>
        </div>

        {baselines.length === 0 ? (
          <div style={{ padding: '24px 0' }}>
            <EmptyState icon="history" title="暂无历史基线记录" />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>基线 ID</th>
                  <th>标签说明</th>
                  <th>平均分</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>建立时间</th>
                </tr>
              </thead>
              <tbody>
                {baselines.map((b) => (
                  <tr key={b.id}>
                    <td className="mono text-xs">{b.id}</td>
                    <td className="fw-bold">{b.label}</td>
                    <td className="mono fw-bold">{b.average_score.toFixed(3)}</td>
                    <td>
                      {b.rebuild ? (
                        <Tag color="amber">重建</Tag>
                      ) : (
                        <Tag color="gray">标准</Tag>
                      )}
                    </td>
                    <td>
                      {b.active ? (
                        <Tag color="green">当前活跃</Tag>
                      ) : (
                        <Tag color="gray">历史存档</Tag>
                      )}
                    </td>
                    <td className="text-muted text-xs">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
