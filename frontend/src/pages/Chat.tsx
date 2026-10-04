/* ============================================================
   ScienceX AI 对话工作台 —— 全新美学重构版
   非暗黑模式 / 明亮清爽 / 悬浮指令中枢 / 8大科研智能体范式
   ============================================================ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, chatStream, uploadDocument, type UploadProgress } from '../api/client';
import Icon, { type IconName } from '../components/Icon';
import { useToast } from '../components/ui';
import { useAuth } from '../stores/auth';
import { useIsMobile } from '../hooks/useIsMobile';
import type { AgentMode, ChatMessage, Conversation, SkillItem } from '../types';
import { ChatCommandDock, type DockTask } from './chat/ChatCommandDock';
import { ChatMessages } from './chat/ChatMessages';
import { ChatSidebar } from './chat/ChatSidebar';
import { MemoryDrawer } from './chat/MemoryDrawer';
import { AddModelModal } from './chat/AddModelModal';

interface QuickPrompt {
  id: string;
  icon: IconName;
  label: string;
  prompt: string;
}

const QUICK_PROMPTS: QuickPrompt[] = [
  { id: 'topic', icon: 'bulb', label: '选题方向推演', prompt: '帮我分析微表情识别领域 2026 年值得做的选题方向' },
  { id: 'review', icon: 'book', label: '综述大纲生成', prompt: '为「AU 先验 + Transformer」这个主题生成一份文献综述大纲' },
  { id: 'exp', icon: 'flask', label: '消融实验方案', prompt: '我的 up9 模型要做消融实验，帮我设计实验方案' },
  { id: 'polish', icon: 'pen', label: '论文学术润色', prompt: '把这段论文摘要润色成更地道的学术英语' },
  { id: 'chart', icon: 'chart', label: '科研图表生成', prompt: '帮我用 Python 生成一份多指标消融对比的学术柱状图' },
];

const DEFAULT_MODELS = {
  builtin: [
    { id: 'm-deepseek-flash', name: 'DeepSeek V4.1 Flash', model_name: 'DeepSeek-Flash', provider: 'deepseek', tag: '极速推理 · 默认推荐', context: '64K', status: 'connected' },
    { id: 'm-gpt-sol', name: 'GPT-6.1 Sol', model_name: 'gpt-6.1-sol', provider: 'openai', tag: '通用旗舰 · 深度推理', context: '128K', status: 'connected' },
    { id: 'm-claude', name: 'Claude Sonnet 5', model_name: 'claude-sonnet-5', provider: 'openai', tag: '长文写作 · 学术润色', context: '200K', status: 'connected' },
    { id: 'm-gemini', name: 'Gemini 3.8 Flash', model_name: 'gemini-3.8-flash', provider: 'openai', tag: '高速低价 · 超长上下文', context: '1M', status: 'connected' },
    { id: 'm-deepseek', name: 'DeepSeek V4 Pro', model_name: 'deepseek-v4-pro', provider: 'openai', tag: '代码 / 数学推理', context: '128K', status: 'connected' },
    { id: 'm-kimi', name: 'Kimi K2.5', model_name: 'kimi-k2.5', provider: 'openai', tag: '中文长文档精读', context: '256K', status: 'connected' },
  ],
  custom: [],
};

export default function Chat() {
  const { user } = useAuth();
  const toast = useToast();
  const isMobile = useIsMobile();
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState<{ builtin: any[]; custom: any[] }>(DEFAULT_MODELS);
  const [model, setModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('sciencex_chat_model');
      if (saved && saved !== 'DeepSeek-V3') return saved;
    } catch {}
    return 'GPT-6.1 Sol';
  });
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [recording, setRecording] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>('plan_execute');
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number>(4);
  const [sidebarOpen, setSidebarOpen] = useState(false); // 默认不显示，点击按钮才展开
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [enhanceProgress, setEnhanceProgress] = useState<DockTask | null>(null);
  const [attachedDoc, setAttachedDoc] = useState<{ docId: string; title: string; sections: number; excerpt: string } | null>(null);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const uploadHandle = useRef<{ abort: () => void } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 初始化带有精确演示数据的看板状态
  const [dashboard, setDashboard] = useState<any>({
    today_usage: { tokens: 38400, calls: 26, cost: 1.24 },
  });

  const handleSelectModel = useCallback((selectedModelName: string) => {
    setModel(selectedModelName);
    try {
      localStorage.setItem('sciencex_chat_model', selectedModelName);
    } catch {}
    toast(`已切换至模型：${selectedModelName}`, 'ok');
  }, [toast]);

  const loadData = useCallback(async () => {
    try {
      const [c, m, d, s, mem] = await Promise.all([
        api<{ items: Conversation[] } | Conversation[]>('/conversations'),
        api<{ builtin: any[]; custom: any[] }>('/models'),
        api<any>('/dashboard/summary').catch(() => null), // 看板缺数据不应阻断整个工作台首屏
        api<{ items: SkillItem[] } | SkillItem[]>('/skills'),
        api<{ total: number }>('/chat/memories').catch(() => ({ total: 4 })),
      ]);
      setConvs((c as any)?.items || (Array.isArray(c) ? c : []));
      const loadedModels = (m && m.builtin && m.builtin.length > 0) ? m : DEFAULT_MODELS;
      setModels(loadedModels);

      // 模型选择优先级：用户主动选择 > GPT-6.1 Sol 默认
      const allModelNames = [
        ...(loadedModels.builtin || []).map((x: any) => x.name),
        ...(loadedModels.custom || []).map((x: any) => x.name),
      ];
      try {
        const saved = localStorage.getItem('sciencex_chat_model');
        if (saved && saved !== 'DeepSeek-V3' && allModelNames.includes(saved)) {
          setModel(saved);
        } else {
          const defaultSol = loadedModels.builtin?.find((item: any) => item.name === 'GPT-6.1 Sol' || item.id === 'm-gpt-sol')?.name || allModelNames[0] || 'GPT-6.1 Sol';
          setModel(defaultSol);
          localStorage.setItem('sciencex_chat_model', defaultSol);
        }
      } catch {
        setModel('GPT-6.1 Sol');
      }

      if (d) setDashboard(d);
      setSkills(Array.isArray(s) ? s : ((s as any)?.items || []));
      if (mem && typeof mem.total === 'number') setMemoryCount(mem.total);
    } catch (err: any) {
      toast(err.message || '加载工作台数据失败', 'err');
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(
    () => () => {
      // 离开工作台时中断进行中的上传，避免后台回调写入已卸载组件
      uploadHandle.current?.abort();
    },
    []
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openConv = async (id: string) => {
    setActiveConv(id);
    const { items } = await api<{ items: ChatMessage[] }>(`/conversations/${id}/messages`);
    setMessages(items.map((m) => ({ ...m })));
    if (isMobile) setSidebarOpen(false); // 移动端抽屉：选中会话后自动收起
  };

  const newConv = async () => {
    const c = await api<Conversation>('/conversations', { method: 'POST', body: { title: '新的科研对话', model } });
    setConvs((x) => [c, ...(x || [])]);
    setActiveConv(c.id);
    setMessages([]);
    if (isMobile) setSidebarOpen(false); // 移动端抽屉：新建会话后自动收起
  };

  const removeConv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api(`/conversations/${id}`, { method: 'DELETE' });
    setConvs((x) => (x ? x.filter((c) => c.id !== id) : []));
    if (activeConv === id) {
      setActiveConv(null);
      setMessages([]);
    }
    toast('会话已删除');
  };

  const renameConv = async (id: string) => {
    const title = prompt('重命名会话', convs?.find((c) => c.id === id)?.title || '');
    if (title) {
      await api(`/conversations/${id}`, { method: 'PATCH', body: { title } });
      setConvs((x) => (x ? x.map((c) => (c.id === id ? { ...c, title } : c)) : []));
    }
  };

  /* 提示词增强：真实调用大模型改写，耗时期间展示衰减式进度条 */
  const enhancePrompt = async () => {
    if (!input.trim()) return toast('请先输入提示词', 'info');
    if (enhanceProgress) return;
    const startedAt = Date.now();
    const stageOf = (p: number) =>
      p < 34 ? '正在拆解原始意图与研究背景…' : p < 68 ? '大模型结构化改写中（角色 + 任务 + 约束）…' : '术语校准与学术格式润色…';
    setEnhanceProgress({ percent: 4, label: stageOf(4) });
    const timer = setInterval(() => {
      setEnhanceProgress((prev) => (prev ? { percent: Math.min(93, prev.percent + Math.max(0.7, (93 - prev.percent) * 0.09)), label: stageOf(prev.percent) } : prev));
    }, 240);
    try {
      const { enhanced, mode } = await api<{ enhanced: string; mode?: string }>('/prompt/enhance', { method: 'POST', body: { prompt: input } });
      setEnhanceProgress({ percent: 100, label: '增强完成' });
      setInput(enhanced);
      const cost = ((Date.now() - startedAt) / 1000).toFixed(1);
      toast(mode === 'live' ? `大模型已重写提示词（耗时 ${cost}s）` : '提示词已增强（模型不可用，已回退模板）', mode === 'live' ? 'ok' : 'info');
    } catch (err: any) {
      toast(err?.message || '提示词增强失败，请稍后重试', 'err');
    } finally {
      clearInterval(timer);
      setTimeout(() => setEnhanceProgress(null), 800);
    }
  };

  const voiceInput = () => {
    if (recording) {
      setRecording(false);
      setInput((v) => (v ? v + ' ' : '') + '（语音转写）帮我分析当前实验的下一步计划');
      toast('语音已转写为文字');
      return;
    }
    setRecording(true);
    toast('正在聆听…再次点击结束（演示模拟 Web Speech API）', 'info');
  };

  /* 附件上传：读取 → 上传 → 服务端版面解析全链路真实进度，完成后拉取结构化正文供大模型使用 */
  const handleUpload = (file?: File) => {
    if (!file) return;
    uploadHandle.current?.abort();
    setAttachedDoc(null);
    setUploadProgress({ stage: 'reading', percent: 0, fileName: file.name });
    const handle = uploadDocument(file, { onProgress: (p) => setUploadProgress(p) });
    uploadHandle.current = handle;
    handle.promise
      .then(async (doc: any) => {
        let excerpt = '';
        let sections = doc?.sections || 0;
        try {
          const structured = await api<{ sections: { title: string; paragraphs: string[] }[] }>(`/documents/${doc.doc_id}/structured`);
          const list = structured?.sections || [];
          sections = sections || list.length;
          excerpt = list
            .map((sec) => `## ${sec.title}\n${(sec.paragraphs || []).join('\n')}`)
            .join('\n\n')
            .slice(0, 3200);
        } catch { /* 正文拉取失败不阻断附件使用 */ }
        setAttachedDoc({ docId: doc.doc_id, title: doc.title || file.name, sections, excerpt });
        setUploadProgress(null);
        toast(`《${doc.title || file.name}》解析完成：${sections} 个章节片段，发送时随提问交给大模型`, 'ok');
      })
      .catch((err: any) => {
        setUploadProgress(null);
        if (err?.name !== 'AbortError') toast(err?.message || '文献上传失败', 'err');
      });
  };

  const abortUpload = () => {
    uploadHandle.current?.abort();
    uploadHandle.current = null;
    setUploadProgress(null);
    toast('已取消上传');
  };

  const send = async (text?: string, skillId?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    /* 附件正文以节选形式注入本轮用户消息，保证大模型真实读到文献内容 */
    const doc = attachedDoc;
    const payloadContent = doc?.excerpt
      ? `【已附文献《${doc.title}》结构化解析正文节选】\n${doc.excerpt}\n\n【我的问题】\n${content}`
      : content;
    const displayContent = doc ? `${content}\n\n📎 已关联文献：《${doc.title}》` : content;
    setInput('');
    setAttachedDoc(null);
    setStreaming(true);
    const userMsg: ChatMessage = { id: `u${Date.now()}`, role: 'user', content: displayContent };
    const aiMsg: ChatMessage = {
      id: `a${Date.now()}`,
      role: 'assistant',
      content: '',
      model,
      agent_mode: agentMode,
      streaming: true,
    };
    setMessages((m) => [...m, userMsg, aiMsg]);

    let convId = activeConv;
    if (!convId) {
      const c = await api<Conversation>('/conversations', { method: 'POST', body: { title: content.slice(0, 18) } });
      convId = c.id;
      setActiveConv(c.id);
      setConvs((x) => [c, ...(x || [])]);
    }

    await chatStream(
      {
        messages: [...messages.filter((m) => !m.streaming), { role: 'user', content: payloadContent }].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model,
        agent_mode: agentMode,
        conversation_id: convId,
        skills: skillId ? [skillId] : [],
      },
      {
        onDelta: (t) => setMessages((m) => m.map((x) => (x.id === aiMsg.id ? { ...x, content: x.content + t } : x))),
        onPlan: (plan) => setMessages((m) => m.map((x) => (x.id === aiMsg.id ? { ...x, plan } : x))),
        onStepStart: (step) =>
          setMessages((m) =>
            m.map((x) =>
              x.id === aiMsg.id && x.plan
                ? {
                    ...x,
                    plan: {
                      ...x.plan,
                      steps: x.plan.steps.map((s, idx) => (idx === step.step_index ? { ...s, status: 'running' } : s)),
                    },
                  }
                : x
            )
          ),
        onStepUpdate: (up) =>
          setMessages((m) =>
            m.map((x) =>
              x.id === aiMsg.id && x.plan
                ? {
                    ...x,
                    plan: {
                      ...x.plan,
                      steps: x.plan.steps.map((s, idx) =>
                        idx === up.step_index ? { ...s, status: up.status || s.status, output: up.output } : s
                      ),
                    },
                  }
                : x
            )
          ),
        onThought: (th) =>
          setMessages((m) =>
            m.map((x) => (x.id === aiMsg.id ? { ...x, thoughts: [...(x.thoughts || []), th] } : x))
          ),
        onToolResult: (tr) =>
          setMessages((m) =>
            m.map((x) =>
              x.id === aiMsg.id
                ? {
                    ...x,
                    chart_data: tr.chart_data || x.chart_data,
                    code: tr.code || x.code,
                    papers: tr.papers || x.papers,
                  }
                : x
            )
          ),
        onMemoryInjected: (mem) =>
          setMessages((m) => m.map((x) => (x.id === aiMsg.id ? { ...x, memory_injected: mem } : x))),
        onTool: (d) => toast(`技能「${d.name}」已调用`, 'info'),
        onDone: () => {
          setMessages((m) =>
            m.map((x) =>
              x.id === aiMsg.id
                ? {
                    ...x,
                    streaming: false,
                    plan: x.plan ? { ...x.plan, percent: 100, status: 'completed' } : undefined,
                  }
                : x
            )
          );
          setStreaming(false);
          api<any>('/conversations').then((r: any) => setConvs(r?.items || (Array.isArray(r) ? r : [])));
        },
        onFallback: (details) => toast(details.message || '已降级为演示模板', 'info'),
        onError: (msg, details) => {
          toast(`${msg}${details?.retryable ? '，可稍后重试' : ''}`, 'err');
          setStreaming(false);
          setMessages((m) => m.map((x) => x.id === aiMsg.id ? { ...x, streaming: false, content: x.content + '\n\n> 生成中断：' + msg } : x));
        },
      }
    );
  };

  const invokeSkill = (skill: SkillItem) => {
    send(`请使用「${skill.name}」技能：${skill.desc}`, skill.id);
  };

  const filteredConvs = convs?.filter((c) => c.title.includes(keyword)) || [];

  return (
    <div className="chat-workbench">
      {/* ===== 主工作区视窗 ===== */}
      <div className="chat-main-stage">
        {/* 顶部轻量状态栏 */}
        <div className="chat-stage-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <div className="chat-stage-title-group" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  flexShrink: 0,
                }}
              >
                <Icon name="flask" size={13} />
              </div>
              <span className="chat-stage-title" style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                {activeConv ? convs?.find((c) => c.id === activeConv)?.title || '科研对话' : 'AI 对话中枢'}
              </span>
            </div>

            <div className="chat-header-pill" style={{ color: '#059669', background: '#ecfdf5', borderColor: '#a7f3d0', flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              <span>{model} 在线</span>
            </div>

            <div className="chat-header-pill desktop-only" style={{ color: '#4f46e5', background: '#e0e7ff', borderColor: '#c7d2fe' }}>
              <span>灵犀 Agent 引擎</span>
            </div>
          </div>

          <div className="chat-stage-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="desktop-only" style={{ fontSize: 12, color: '#64748b' }}>
              今日已用 <strong style={{ color: '#0f172a' }}>{dashboard?.today_usage?.tokens?.toLocaleString?.() ?? '38,400'}</strong> tokens · {dashboard?.today_usage?.calls ?? 26} 次调用
            </div>

            {/* 课题记忆入口：置于历史对话按钮左侧 */}
            <button
              type="button"
              onClick={() => setShowMemoryDrawer(true)}
              title="管理课题组三层长短期记忆引擎"
              aria-label="管理课题记忆"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid #8b5cf6',
                background: '#f5f3ff',
                color: '#6d28d9',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ede9fe'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f3ff'; }}
            >
              <Icon name="spark" size={14} style={{ color: '#7c3aed' }} />
              <span>课题记忆</span>
              <span
                style={{
                  background: '#8b5cf6',
                  color: '#ffffff',
                  fontSize: 10.5,
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {memoryCount}
              </span>
            </button>

            {/* 右侧会话记录栏开关按钮：换个专属高亮颜色显示，点击才展开 */}
            <button
              type="button"
              className="chat-history-pill-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? '收起右侧历史会话' : '展开右侧历史会话'}
              aria-label="切换历史会话侧边栏"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid #10b981',
                background: sidebarOpen ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#ecfdf5',
                color: sidebarOpen ? '#ffffff' : '#047857',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: sidebarOpen ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none',
              }}
            >
              <Icon name="chat" size={14} style={{ color: sidebarOpen ? '#ffffff' : '#059669' }} />
              <span>历史对话</span>
              {convs && convs.length > 0 && (
                <span
                  style={{
                    background: sidebarOpen ? 'rgba(255, 255, 255, 0.3)' : '#10b981',
                    color: '#ffffff',
                    fontSize: 10.5,
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {convs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 内容区域：空状态（LobsterAI 风格居中 Hero + 输入卡片） 或 消息流 */}
        {messages.length === 0 ? (
          <div className="chat-hero-container">
            {/* 居中标志性 App Badge */}
            <div className="chat-hero-badge">
              <img src="/logo.png" alt="ScienceX Logo" />
            </div>

            {/* 标题与副标题 */}
            <h1 className="chat-hero-title">Science X</h1>
            <p className="chat-hero-subtitle">
              全周期 AI 科研智能体中枢 · 覆盖选题、文献、实验、写作与评审
            </p>

            {/* 核心悬浮输入中枢卡片 */}
            <ChatCommandDock
              input={input}
              onInputChange={setInput}
              onSend={() => send()}
              streaming={streaming}
              recording={recording}
              onVoiceInput={voiceInput}
              onUploadClick={handleUpload}
              onEnhancePrompt={enhancePrompt}
              model={model}
              onSelectModel={handleSelectModel}
              models={models}
              skills={skills}
              onInvokeSkill={invokeSkill}
              agentMode={agentMode}
              onSelectAgentMode={setAgentMode}
              uploadProgress={uploadProgress}
              onAbortUpload={abortUpload}
              enhanceProgress={enhanceProgress}
              attachedDoc={attachedDoc ? { title: attachedDoc.title, sections: attachedDoc.sections } : null}
              onRemoveAttachment={() => setAttachedDoc(null)}
              onAddModel={() => setAddModelOpen(true)}
            />

            {/* 下方快捷推荐指令胶囊栏 */}
            <div className="chat-quick-tags">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.id}
                  type="button"
                  className="chat-quick-tag"
                  onClick={() => send(qp.prompt)}
                  title={qp.prompt}
                >
                  <Icon name={qp.icon} size={14} style={{ color: '#059669' }} />
                  <span>{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 消息滚动流 */}
            <ChatMessages
              messages={messages}
              user={user}
              bottomRef={bottomRef}
            />

            {/* 底部悬浮吸附输入中枢卡片 */}
            <div className="chat-dock-sticky-container">
              <ChatCommandDock
                input={input}
                onInputChange={setInput}
                onSend={() => send()}
                streaming={streaming}
                recording={recording}
                onVoiceInput={voiceInput}
                onUploadClick={handleUpload}
                onEnhancePrompt={enhancePrompt}
                model={model}
                onSelectModel={handleSelectModel}
                models={models}
                skills={skills}
                onInvokeSkill={invokeSkill}
                agentMode={agentMode}
                onSelectAgentMode={setAgentMode}
                uploadProgress={uploadProgress}
                onAbortUpload={abortUpload}
                enhanceProgress={enhanceProgress}
                attachedDoc={attachedDoc ? { title: attachedDoc.title, sections: attachedDoc.sections } : null}
                onRemoveAttachment={() => setAttachedDoc(null)}
                onAddModel={() => setAddModelOpen(true)}
              />
            </div>
          </>
        )}
      </div>

      {/* ===== 右侧会话侧边栏（可折叠；移动端为覆盖式抽屉） ===== */}
      <ChatSidebar
        convs={convs}
        filteredConvs={filteredConvs}
        activeConv={activeConv}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onNewConv={newConv}
        onOpenConv={openConv}
        onRenameConv={renameConv}
        onRemoveConv={removeConv}
        collapsed={!sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 添加自定义模型（与个人设置一致：先真实测连通，通过才保存并标记已连接） */}
      <AddModelModal
        open={addModelOpen}
        onClose={() => setAddModelOpen(false)}
        onAdded={(m) => {
          setModels((x) => ({ ...x, custom: [...(x.custom || []), m] }));
          if (m?.name) handleSelectModel(m.name);
        }}
      />

      {/* 课题组三层记忆抽屉 */}
      <MemoryDrawer
        open={showMemoryDrawer}
        onClose={() => setShowMemoryDrawer(false)}
        convId={activeConv}
        onMemoryChanged={() => api<{ total: number }>('/chat/memories').then((r) => setMemoryCount(r?.total || 4))}
      />
    </div>
  );
}
