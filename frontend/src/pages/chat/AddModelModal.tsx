/* 添加自定义模型弹窗 —— AI 工作台与个人设置共用：先真实测试连通性，通过后才保存启用 */
import React, { useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { Modal, useToast } from '../../components/ui';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI 兼容', hint: '/chat/completions', color: '#10b981' },
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude 原生协议', color: '#d97757' },
  { id: 'gemini', label: 'Google Gemini', hint: 'generateContent', color: '#4285f4' },
  { id: 'ollama', label: 'Ollama 本地', hint: '/api/chat', color: '#1e293b' },
];

interface AddModelModalProps {
  open: boolean;
  onClose: () => void;
  /** 连通测试通过并保存成功后回调，返回已连接的模型实体 */
  onAdded: (model: any) => void;
}

type Phase = 'idle' | 'saving' | 'testing' | 'failed';

export const AddModelModal: React.FC<AddModelModalProps> = ({ open, onClose, onAdded }) => {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', base_url: '', model_name: '', api_key: '', provider: 'openai', priority: 1 });
  const [phase, setPhase] = useState<Phase>('idle');
  const [failMsg, setFailMsg] = useState('');
  const [testSample, setTestSample] = useState('');
  const busy = phase === 'saving' || phase === 'testing';

  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (phase === 'failed') { setPhase('idle'); setFailMsg(''); }
  };

  const reset = () => {
    setForm({ name: '', base_url: '', model_name: '', api_key: '', provider: 'openai', priority: 1 });
    setPhase('idle');
    setFailMsg('');
    setTestSample('');
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  /** 保存 → 真实连通测试 → 失败自动清理残档，只有测通才最终保留 */
  const testAndSave = async () => {
    if (!form.base_url || !form.model_name) {
      setPhase('failed');
      setFailMsg('API Base URL 与模型名为必填项');
      return;
    }
    let createdId = '';
    try {
      setPhase('saving');
      const created = await api<any>('/models', {
        method: 'POST',
        body: { ...form, name: form.name || form.model_name },
      });
      createdId = created.id;
      setPhase('testing');
      const r = await api<any>(`/models/${createdId}/test`, { method: 'POST' });
      if (!r.success) throw new Error(r.sample || '上游模型未返回有效内容');
      const saved = { ...created, status: 'connected' };
      toast(`连通测试通过（${r.latency_ms}ms），模型已保存`, 'ok');
      onAdded(saved);
      reset();
      onClose();
    } catch (error: any) {
      // 测不通则回滚删除，避免未验证模型污染列表
      if (createdId) await api(`/models/${createdId}`, { method: 'DELETE' }).catch(() => {});
      setPhase('failed');
      setFailMsg(error?.message || '连通失败，请检查 Base URL / 密钥 / 模型名');
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name="cpu" size={15} style={{ color: '#059669' }} /> 添加自定义模型
        </span>
      }
      footer={
        <>
          <button className="btn btn-ghost" onClick={close} disabled={busy}>取消</button>
          <button className="btn btn-primary" onClick={testAndSave} disabled={busy} aria-label="测试连通并保存">
            {busy ? <span className="spinner" /> : <Icon name="zap" size={12} />}
            {phase === 'testing' ? '测试连通中…' : '测试连通并保存'}
          </button>
        </>
      }
    >
      {/* 协议芯片 */}
      <div className="field-label">接口协议</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {PROVIDERS.map((p) => {
          const active = form.provider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => set({ provider: p.id })}
              disabled={busy}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '9px 4px', borderRadius: 10, cursor: busy ? 'not-allowed' : 'pointer',
                border: active ? `1.5px solid ${p.color}` : '1px solid var(--line)',
                background: active ? `${p.color}10` : '#ffffff',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, opacity: active ? 1 : 0.45 }} />
              <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 500, color: active ? p.color : '#475569' }}>{p.label}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="field-label">显示名称（可选）</div>
      <input className="input mb-2" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="例：实验室私有 DeepSeek-R1" disabled={busy} />

      <div className="field-label">API Base URL <span style={{ fontWeight: 400, color: 'var(--muted)' }}>（OpenAI 兼容端点需带 /v1）</span></div>
      <input className="input mb-2 mono" value={form.base_url} onChange={(e) => set({ base_url: e.target.value })} placeholder="https://api.openai-next.com/v1" disabled={busy} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div className="field-label">模型名称</div>
          <input className="input mb-2 mono" value={form.model_name} onChange={(e) => set({ model_name: e.target.value })} placeholder="例：deepseek-chat" disabled={busy} />
        </div>
        <div>
          <div className="field-label">API Key</div>
          <input className="input mb-2 mono" type="password" value={form.api_key} onChange={(e) => set({ api_key: e.target.value })} placeholder="sk-…" disabled={busy} />
        </div>
      </div>

      {/* 测试阶段状态条 / 结果反馈 */}
      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 8 }}>
          <span className="spinner" style={{ borderColor: '#10b981', borderTopColor: 'transparent' }} />
          <span style={{ fontSize: 12.5, color: '#047857', fontWeight: 600 }}>
            {phase === 'saving' ? '正在登记模型配置…' : `正在向「${form.model_name}」发送真实连通测试请求…`}
          </span>
        </div>
      )}
      {phase === 'failed' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 8 }}>
          <Icon name="alert" size={14} style={{ color: '#dc2626', marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c' }}>连通失败，配置未保存</div>
            <div style={{ fontSize: 11.5, color: '#7f1d1d', marginTop: 2 }}>{failMsg}</div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted" style={{ marginTop: 4, marginBottom: 0, lineHeight: 1.7 }}>
        🔒 密钥经 Master Key 加密存储，仅服务端调用时解密；HTTPS 强制与内网地址拦截防 SSRF。
        只有连通测试通过的模型才会进入工作台与设置页并标记为「已连接」。
      </p>
    </Modal>
  );
};
