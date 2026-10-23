import { useEffect, useState } from 'react';
import { Modal } from '../ui';
import Icon from '../Icon';
import { api } from '../../api/client';
import { evalApi } from '../../api/eval';
import type { EvalMode, EvalSuiteSummary } from '../../types/eval';

interface ModelOption {
  id: string;
  name: string;
}

export interface RunEvalModalProps {
  open: boolean;
  suites: EvalSuiteSummary[];
  defaultSuiteId?: string;
  enabled: boolean;
  liveEnabled: boolean;
  onClose: () => void;
  onCreated: (runId: string) => void;
}

export function RunEvalModal({
  open,
  suites,
  defaultSuiteId = 'core',
  enabled,
  liveEnabled,
  onClose,
  onCreated,
}: RunEvalModalProps) {
  const [suiteId, setSuiteId] = useState(defaultSuiteId);
  const [mode, setMode] = useState<EvalMode>('template');
  const [model, setModel] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSuiteId(defaultSuiteId);
      setMode('template');
      setModel('');
      setNote('');
      setErrorMsg(null);
      setSubmitting(false);
    }
  }, [open, defaultSuiteId]);

  useEffect(() => {
    if (!open || mode !== 'live' || modelsLoaded) return;
    const controller = new AbortController();
    api<{ builtin: ModelOption[]; custom: ModelOption[] }>('/models', { signal: controller.signal })
      .then((r) => {
        const combined = [...(r.builtin || []), ...(r.custom || [])];
        setModels(combined);
      })
      .catch(() => {
        setModels([]);
      })
      .finally(() => {
        setModelsLoaded(true);
      });
    return () => controller.abort();
  }, [open, mode, modelsLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled) {
      setErrorMsg('评测功能已关闭，请联系部署管理员');
      return;
    }
    if (mode === 'live' && !liveEnabled) {
      setErrorMsg('服务端未开启 live 模式，可改用模板模式');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await evalApi.createRun({
        suite_id: suiteId,
        mode,
        model: mode === 'live' && model ? model : undefined,
        note: note.trim() || undefined,
      });
      onCreated(res.run_id);
      onClose();
    } catch (err: any) {
      const status = err.status;
      const code = err.code;
      const msg = err.message || '创建评测失败';

      if (status === 429 || code === 42901) {
        setErrorMsg('已有评测在运行，请等待完成或取消');
      } else if (status === 404 || code === 40003) {
        setErrorMsg('套件已失效，请刷新页面');
      } else if (status === 400 && msg.includes('模型未配置')) {
        setErrorMsg('没有可用模型，请先在设置中配置，或改用模板模式');
      } else if (status === 400 && msg.includes('未启用')) {
        setErrorMsg('评测功能已关闭，请联系部署管理员');
      } else if (status === 503 || code === 50003) {
        setErrorMsg('无法连接后端服务，请检查网络');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSuite = suites.find((s) => s.id === suiteId) || suites[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="发起评测运行"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !enabled}
          >
            {submitting ? '正在创建…' : '开始评测'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {errorMsg && (
          <div className="sx-quality-callout danger">
            <Icon name="alert" size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {!enabled && (
          <div className="sx-quality-callout warning">
            <Icon name="info" size={16} />
            <span>评测功能已关闭 (HARNESS_EVAL_ENABLED=false)，当前仅供只读查看。</span>
          </div>
        )}

        <div>
          <label className="text-sm fw-bold mb-1" style={{ display: 'block' }}>
            评测套件
          </label>
          <select
            className="input"
            value={suiteId}
            onChange={(e) => setSuiteId(e.target.value)}
            disabled={submitting}
            style={{ width: '100%' }}
          >
            {suites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.case_count} 条用例 · {s.redline_count} 条红线)
              </option>
            ))}
          </select>
          {selectedSuite && (
            <div className="text-xs text-muted mt-1">
              {selectedSuite.description || '核心科研回答质量基准测试'} (版本: {selectedSuite.version})
            </div>
          )}
        </div>

        <div>
          <label className="text-sm fw-bold mb-1" style={{ display: 'block' }}>
            评测模式
          </label>
          <div className="sx-quality-segmented">
            <button
              type="button"
              className={`sx-quality-segmented-btn ${mode === 'template' ? 'active' : ''}`}
              onClick={() => setMode('template')}
              disabled={submitting}
            >
              模板（推荐）
            </button>
            <button
              type="button"
              className={`sx-quality-segmented-btn ${mode === 'live' ? 'active' : ''}`}
              onClick={() => setMode('live')}
              disabled={submitting || !liveEnabled}
              title={!liveEnabled ? '服务端未启用 live 模式' : undefined}
            >
              真实模型 (Live) {!liveEnabled && '(未开启)'}
            </button>
          </div>
          <div className="text-xs text-muted mt-1">
            {mode === 'template'
              ? '不调用模型，只校验模板回答是否覆盖评分点；通常 1 秒内完成。'
              : '会调用真实模型并计入你的用量；12 题可能耗时 30–120 秒，失败会计入逐题错误。'}
          </div>
        </div>

        {mode === 'live' && (
          <div>
            <label className="text-sm fw-bold mb-1" style={{ display: 'block' }}>
              模型选择
            </label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={submitting}
              style={{ width: '100%' }}
            >
              <option value="">网关默认模型</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted mt-1">
              留空则使用服务端默认模型配置 (HARNESS_EVAL_MODEL)
            </div>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="text-sm fw-bold mb-1">备注说明 (可选)</label>
            <span className="text-xs text-muted">{note.length}/500</span>
          </div>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder="例如：发版前质量回归 / 提示词优化验证"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
      </form>
    </Modal>
  );
}
