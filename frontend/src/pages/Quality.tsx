import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, EmptyState, ErrorState, LoadingBlock, Tabs, Toolbar } from '../components/ui';
import Icon from '../components/Icon';
import { evalApi } from '../api/eval';
import type { EvalSuiteSummary } from '../types/eval';
import { QualityDashboard } from '../components/quality/QualityDashboard';
import { EvalRunList } from '../components/quality/EvalRunList';
import { EvalRunDetail } from '../components/quality/EvalRunDetail';
import { BaselineGatePanel } from '../components/quality/BaselineGatePanel';
import { RunEvalModal } from '../components/quality/RunEvalModal';
import '../styles/quality.css';

type QualityTab = 'dashboard' | 'runs' | 'gates';
const TAB_KEYS: QualityTab[] = ['dashboard', 'runs', 'gates'];

export default function Quality() {
  const [params, setParams] = useSearchParams();

  const rawTab = params.get('tab') as QualityTab | null;
  const runId = params.get('run') || '';
  // 如果 URL 中有 run=evr_xxx 则自动把 tab 视为 runs
  const tab: QualityTab = runId
    ? 'runs'
    : rawTab && TAB_KEYS.includes(rawTab)
    ? rawTab
    : 'dashboard';

  const [suites, setSuites] = useState<EvalSuiteSummary[]>([]);
  const [suiteId] = useState('core');
  const [enabled, setEnabled] = useState(true);
  const [liveEnabled, setLiveEnabled] = useState(false);

  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [runModalOpen, setRunModalOpen] = useState(false);

  const loadSuites = () => {
    const controller = new AbortController();
    setBoot('loading');
    setBootError('');

    evalApi
      .suites(controller.signal)
      .then((res) => {
        setSuites(res.items);
        setEnabled(res.enabled);
        setLiveEnabled(res.live_enabled);
        setBoot('ready');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setBoot('error');
          setBootError(err.message || '加载评测套件失败');
        }
      });

    return () => controller.abort();
  };

  useEffect(() => {
    return loadSuites();
  }, []);

  const handleTabChange = (k: string) => {
    const nextTab = k as QualityTab;
    if (nextTab === 'runs' && runId) {
      setParams({ tab: nextTab, run: runId }, { replace: true });
    } else {
      setParams({ tab: nextTab }, { replace: true });
    }
  };

  const openRun = (id: string) => {
    setParams({ tab: 'runs', run: id }, { replace: true });
  };

  const closeRun = () => {
    setParams({ tab: 'runs' }, { replace: true });
  };

  if (boot === 'loading') {
    return (
      <div className="page sx-quality">
        <LoadingBlock text="正在加载评测套件元数据…" />
      </div>
    );
  }

  if (boot === 'error') {
    return (
      <div className="page sx-quality">
        <ErrorState
          title="质量中心启动失败"
          message={bootError}
          onRetry={loadSuites}
        />
      </div>
    );
  }

  const activeSuite = suites.find((s) => s.id === suiteId) || suites[0];

  const tabItems = [
    { key: 'dashboard', label: '质量看板' },
    { key: 'runs', label: '运行记录' },
    { key: 'gates', label: '基线与门禁' },
  ];

  return (
    <div className="page sx-quality">
      {/* 顶部套件说明与主要操作 */}
      <Toolbar
        left={
          <div className="sx-quality-meta">
            <span className="fw-bold" style={{ color: 'var(--ink)' }}>
              {activeSuite?.name || '核心科研质量套件'}
            </span>
            <span>·</span>
            <span>{activeSuite?.case_count || 12} 条用例</span>
            <span>·</span>
            <span>{activeSuite?.redline_count || 4} 条红线</span>
            <span>·</span>
            <span className="mono text-xs">{activeSuite?.version}</span>
          </div>
        }
        right={
          <div className="sx-quality-actions">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              title="全局刷新"
            >
              <Icon name="refresh" size={14} /> 刷新
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setRunModalOpen(true)}
              disabled={!enabled}
            >
              <Icon name="play" size={14} /> 运行评测
            </button>
          </div>
        }
      />

      {/* 三个 Tab 导航 */}
      <Tabs tabs={tabItems} active={tab} onChange={handleTabChange} />

      {/* Tab 内容区 */}
      <div style={{ marginTop: 4 }}>
        {tab === 'dashboard' && (
          <QualityDashboard
            suiteId={suiteId}
            refreshKey={refreshKey}
            onOpenRun={openRun}
            onRun={() => setRunModalOpen(true)}
          />
        )}

        {tab === 'runs' && (
          runId ? (
            <EvalRunDetail
              runId={runId}
              onClose={closeRun}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          ) : (
            <EvalRunList
              suiteId={suiteId}
              refreshKey={refreshKey}
              onSelectRun={openRun}
              onRun={() => setRunModalOpen(true)}
            />
          )
        )}

        {tab === 'gates' && (
          <BaselineGatePanel
            suiteId={suiteId}
            refreshKey={refreshKey}
            onOpenRun={openRun}
          />
        )}
      </div>

      {/* 发起运行弹窗 */}
      <RunEvalModal
        open={runModalOpen}
        suites={suites}
        defaultSuiteId={suiteId}
        enabled={enabled}
        liveEnabled={liveEnabled}
        onClose={() => setRunModalOpen(false)}
        onCreated={(newRunId) => {
          setRunModalOpen(false);
          openRun(newRunId);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
