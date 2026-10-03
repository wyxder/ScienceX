import React, { useState, useEffect, useRef } from 'react';
import Icon from '../../components/Icon';
import type { AgentMode, SkillItem } from '../../types';
import type { UploadProgress } from '../../api/client';

/** 后台耗时任务（上传解析 / 提示词增强）的真实进度呈现 */
export interface DockTask {
  percent: number;
  label: string;
}

interface ChatCommandDockProps {
  input: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  streaming: boolean;
  recording: boolean;
  onVoiceInput: () => void;
  onUploadClick: (file?: File) => void;
  onEnhancePrompt: () => void;
  model: string;
  onSelectModel: (m: string) => void;
  models: { builtin: any[]; custom: any[] };
  skills: SkillItem[];
  onInvokeSkill: (skill: SkillItem) => void;
  agentMode: AgentMode;
  onSelectAgentMode: (mode: AgentMode) => void;
  uploadProgress?: UploadProgress | null;
  onAbortUpload?: () => void;
  enhanceProgress?: DockTask | null;
  attachedDoc?: { title: string; sections: number } | null;
  onRemoveAttachment?: () => void;
  onAddModel?: () => void;
}

const AGENT_MODES: Array<{ mode: AgentMode; label: string; icon: any; desc: string }> = [
  { mode: 'plan_execute', label: '多智能体专家', icon: 'layers', desc: '分步拆解 · 自动化全流程' },
  { mode: 'general', label: '通用学术对话', icon: 'spark', desc: '记忆注入 · 学术全景分析' },
  { mode: 'react', label: 'ReAct 思维推演', icon: 'target', desc: '思维链推导 · 工具闭环检验' },
  { mode: 'codeact', label: 'CodeAct 实验代码', icon: 'chart', desc: 'Python 沙箱 · 消融图表可视化' },
  { mode: 'mcp', label: 'MCP 学术检索', icon: 'globe', desc: 'arXiv 直连 · 顶会顶刊抓取' },
  { mode: 'skill', label: '学术技能编排', icon: 'zap', desc: '综述大纲 · LaTeX · 实验向导' },
  { mode: 'text2sql', label: 'Text2SQL 数据查询', icon: 'db', desc: '指标过滤 · SOTA 聚合对比' },
  { mode: 'structured', label: '结构化产出', icon: 'grid', desc: 'LaTeX 三线表 · 审稿矩阵' },
];

/* 上传各阶段的人读提示 */
const UPLOAD_STAGE_LABEL: Record<string, string> = {
  reading: '本地读取编码',
  uploading: '上传至解析服务',
  parsing: '版面与图表解析',
  done: '解析完成',
};

export const ChatCommandDock: React.FC<ChatCommandDockProps> = ({
  input,
  onInputChange,
  onSend,
  streaming,
  recording,
  onVoiceInput,
  onUploadClick,
  onEnhancePrompt,
  model,
  onSelectModel,
  models,
  agentMode,
  onSelectAgentMode,
  uploadProgress,
  onAbortUpload,
  enhanceProgress,
  attachedDoc,
  onRemoveAttachment,
  onAddModel,
}) => {
  const currentModeMeta = AGENT_MODES.find((m) => m.mode === agentMode) || AGENT_MODES[0];
  const uploading = !!uploadProgress;
  const enhancing = !!enhanceProgress;
  const canSend = !streaming && !uploading && input.trim().length > 0;

  /* 统一互斥菜单管理，确保每个按钮弹出的下拉菜单置于最顶层，且互不遮挡重叠 */
  const [activeMenu, setActiveMenu] = useState<'model' | 'mode' | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeMenu]);

  const openFilePicker = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onUploadClick(f);
    e.target.value = '';
  };

  return (
    <div className="chat-command-dock" ref={dockRef} style={{ overflow: 'visible', position: 'relative' }}>
      {/* 顶部主输入区域 */}
      <div className="chat-dock-main">
        <textarea
          className="chat-dock-textarea"
          placeholder="输入你的科研问题，或指派文献调研、消融实验、论文润色任务...（Enter 发送 / Shift+Enter 换行）"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          aria-label="科研任务输入框"
          rows={2}
        />

        {/* 上传真实进度条：本地读取 → 字节上传 → 服务端版面解析 */}
        {uploadProgress && (
          <div className="chat-task-tray">
            <div className="chat-task-head">
              <Icon name="upload" size={13} style={{ color: '#059669' }} />
              <span className="chat-task-title" title={uploadProgress.fileName}>{uploadProgress.fileName}</span>
              <span className="chat-task-stage">{UPLOAD_STAGE_LABEL[uploadProgress.stage]}</span>
              <span className="chat-task-percent">{uploadProgress.percent}%</span>
              <button
                type="button"
                className="chat-attach-remove"
                onClick={onAbortUpload}
                title="取消上传"
                aria-label="取消上传"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            <div className="chat-progress-bar" role="progressbar" aria-valuenow={uploadProgress.percent} aria-valuemin={0} aria-valuemax={100}>
              <span className="chat-progress-fill" style={{ width: `${uploadProgress.percent}%` }} />
            </div>
          </div>
        )}

        {/* 提示词增强进度：大模型实时改写 */}
        {enhanceProgress && (
          <div className="chat-task-tray">
            <div className="chat-task-head">
              <Icon name="spark" size={13} style={{ color: '#7c3aed' }} />
              <span className="chat-task-title">学术提示词增强</span>
              <span className="chat-task-stage">{enhanceProgress.label}</span>
              <span className="chat-task-percent">{enhanceProgress.percent}%</span>
            </div>
            <div className="chat-progress-bar violet" role="progressbar" aria-valuenow={enhanceProgress.percent} aria-valuemin={0} aria-valuemax={100}>
              <span className="chat-progress-fill" style={{ width: `${enhanceProgress.percent}%` }} />
            </div>
          </div>
        )}

        {/* 附件就绪展示条：解析完成后随下一条消息注入模型上下文 */}
        {attachedDoc && !uploadProgress && (
          <div className="chat-attach-chip">
            <Icon name="file" size={13} style={{ color: '#059669' }} />
            <span className="chat-attach-name" title={attachedDoc.title}>{attachedDoc.title}</span>
            <span className="chat-attach-size">已解析 {attachedDoc.sections} 段正文 · 发送时随提问交给大模型</span>
            <button
              type="button"
              className="chat-attach-remove"
              onClick={onRemoveAttachment}
              title="移除附件"
              aria-label="移除附件"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        )}

        {/* 输入框内置动作栏（左侧模式/模型 + 上传/增强，右侧语音与发送） */}
        <div className="chat-dock-actions" style={{ position: 'relative' }}>
          {/* 移动端为单行横向滑动容器；菜单展开时加 menu-open 解除裁剪 */}
          <div className={`chat-dock-left-tools${activeMenu ? ' menu-open' : ''}`}>
            {/* Agent 模式切换胶囊（向上展开改为向下展开顶层菜单） */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="chat-tray-pill highlight"
                aria-label="切换 Agent 模式"
                onClick={() => setActiveMenu((m) => (m === 'mode' ? null : 'mode'))}
                style={{
                  background: activeMenu === 'mode' ? '#e2e8f0' : undefined,
                }}
              >
                <Icon name={currentModeMeta.icon} size={12} />
                <span className="chat-pill-label">{currentModeMeta.label}</span>
                <Icon name="chevronDown" size={10} style={{ opacity: 0.6 }} />
              </button>

              {activeMenu === 'mode' && (
                <div
                  className="anim-pop chat-dock-menu chat-dock-mode-menu"
                  onClick={() => setActiveMenu(null)}
                >
                  <div style={{ padding: '6px 10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    8 大科研智能体范式
                  </div>
                  {AGENT_MODES.map((am) => (
                    <div
                      key={am.mode}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: agentMode === am.mode ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { if (agentMode !== am.mode) e.currentTarget.style.background = '#f1f5f9'; }}
                      onMouseLeave={(e) => { if (agentMode !== am.mode) e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => onSelectAgentMode(am.mode)}
                    >
                      <Icon name={am.icon} size={15} style={{ marginTop: 2, color: agentMode === am.mode ? '#059669' : '#64748b' }} />
                      <div>
                        <div style={{ fontWeight: agentMode === am.mode ? 700 : 600, fontSize: 12.5, color: agentMode === am.mode ? '#059669' : '#1e293b' }}>
                          {am.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{am.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 模型选择器（向下展开顶层菜单） */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="chat-model-pill"
                aria-label="选择模型"
                onClick={() => setActiveMenu((m) => (m === 'model' ? null : 'model'))}
                style={{
                  background: activeMenu === 'model' ? '#e2e8f0' : '#f8fafc',
                  borderColor: activeMenu === 'model' ? '#94a3b8' : '#e2e8f0',
                }}
              >
                <Icon name="cpu" size={13} style={{ color: '#059669' }} />
                <span className="chat-pill-label">{model}</span>
                <Icon name="chevronDown" size={11} style={{ opacity: 0.6 }} />
              </button>

              {activeMenu === 'model' && (
                <div
                  className="anim-pop chat-dock-menu chat-dock-model-menu"
                  onClick={() => setActiveMenu(null)}
                >
                  <div style={{ padding: '6px 10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    主流与专有科研大模型
                  </div>
                  {models.builtin?.map((m: any) => {
                    const isSelected = model === m.name || model === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`chat-model-row${isSelected ? ' active' : ''}`}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectModel(m.name);
                          setActiveMenu(null);
                        }}
                      >
                        <Icon name="cpu" size={13} style={{ color: isSelected ? '#059669' : '#64748b', flexShrink: 0 }} />
                        <span className="chat-model-name">{m.name}</span>
                        {m.tag && <span className="chat-model-tag">{m.tag}</span>}
                        <span className={`chat-model-state ${m.status === 'connected' ? 'ok' : 'idle'}`}>
                          <span className={`dot dot-${m.status === 'connected' ? 'green' : 'gray'}`} />
                          {m.status === 'connected' ? '已连接' : '未连通'}
                        </span>
                        {isSelected && <Icon name="check" size={13} style={{ color: '#059669' }} />}
                      </div>
                    );
                  })}
                  {models.custom?.map((m: any) => {
                    const isSelected = model === m.name || model === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`chat-model-row${isSelected ? ' active' : ''}`}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectModel(m.name);
                          setActiveMenu(null);
                        }}
                      >
                        <Icon name="key" size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                        <span className="chat-model-name">{m.name}</span>
                        <span className="chat-model-tag">自定义</span>
                        <span className={`chat-model-state ${m.status === 'connected' ? 'ok' : 'idle'}`}>
                          <span className={`dot dot-${m.status === 'connected' ? 'green' : 'gray'}`} />
                          {m.status === 'connected' ? '已连接' : '未连通'}
                        </span>
                        {isSelected && <Icon name="check" size={13} style={{ color: '#059669' }} />}
                      </div>
                    );
                  })}
                  {onAddModel && (
                    <div className="chat-dock-menu-footer" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); onAddModel(); }}>
                      <Icon name="plus" size={13} />
                      添加自定义模型（先测连通再保存）
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 文件上传（紧靠模型列表右侧，触发原生文件选择并展示附件） */}
            <button
              type="button"
              className="chat-action-pill"
              onClick={openFilePicker}
              disabled={uploading}
              title="上传论文 / 文献正文（PDF / Word / Markdown / CAJ）"
              aria-label="文件上传"
            >
              {uploading ? <span className="spinner" /> : <Icon name="upload" size={14} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.md,.markdown,.caj"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              aria-hidden="true"
              tabIndex={-1}
            />

            {/* 提示词增强（学术角色 + 结构 + 背景改写） */}
            <button
              type="button"
              className="chat-action-pill"
              onClick={onEnhancePrompt}
              disabled={enhancing}
              title="学术提示词深度增强（大模型实时改写）"
              aria-label="提示词增强"
            >
              {enhancing ? <span className="spinner" /> : <Icon name="spark" size={14} />}
            </button>
          </div>

          {/* 右侧：语音输入、圆形发送按钮 */}
          <div className="chat-dock-right-tools">
            {/* 语音输入按钮 */}
            <button
              type="button"
              className={`chat-mic-btn ${recording ? 'recording' : ''}`}
              onClick={onVoiceInput}
              title={recording ? '点击结束语音输入' : '语音输入'}
              aria-label="语音输入"
            >
              <Icon name="mic" size={16} />
            </button>

            {/* 圆形发送按钮 */}
            <button
              type="button"
              className={`chat-send-circle ${canSend ? 'active' : ''}`}
              onClick={() => { if (canSend) onSend(); }}
              disabled={!canSend}
              title={streaming ? '正在生成回复中...' : '发送指令'}
              aria-label="发送消息"
            >
              {streaming ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: '#fff' }} />
              ) : (
                <Icon name="arrowUp" size={17} strokeWidth={2.4} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
