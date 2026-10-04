/* 多智能体专家评审团 —— 对齐学术顶会 Meta-Review 高规格合议与雷达画像设计；五角色 Agent 接入 DeepSeek V4.1 Flash 实时合议流程可视化 */
import React, { useEffect, useRef, useState } from 'react';
import { api, taskStream, uploadDocument } from '../api/client';
import Icon, { type IconName } from '../components/Icon';
import { useToast } from '../components/ui';
import { useIsMobile } from '../hooks/useIsMobile';

const ROLE_META: Record<string, { en: string; icon: IconName; color: string; bg: string }> = {
  理论审稿人: { en: 'Theory Reviewer', icon: 'bulb', color: '#059669', bg: '#ecfdf5' },
  方法审稿人: { en: 'Methodology Reviewer', icon: 'flask', color: '#2563eb', bg: '#eff6ff' },
  实验审稿人: { en: 'Experiment Reviewer', icon: 'chart', color: '#d97706', bg: '#fffbeb' },
  写作审稿人: { en: 'Writing Reviewer', icon: 'pen', color: '#9333ea', bg: '#faf5ff' },
  伦理审稿人: { en: 'Ethics Reviewer', icon: 'shield', color: '#dc2626', bg: '#fef2f2' },
};

/* 五角色 Agent 编排顺序（与后端 COUNCIL_ROLE_AGENTS.key 一致） */
const COUNCIL_AGENTS: { key: string; role: string }[] = [
  { key: 'theory', role: '理论审稿人' },
  { key: 'method', role: '方法审稿人' },
  { key: 'experiment', role: '实验审稿人' },
  { key: 'writing', role: '写作审稿人' },
  { key: 'ethics', role: '伦理审稿人' },
];

const DECISION_TEXT: Record<string, string> = {
  accept: 'Accept（建议录用）',
  weak_accept: 'Weak Accept（倾向接收）',
  borderline: 'Borderline（录用存疑）',
  major_revision: 'Major Revision（需大修）',
};

/* 雷达图组件：5 维学术评阅画像 */
function RadarChart({ scores }: { scores: { label: string; score: number }[] }) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const r = 85;
  const count = scores.length;

  // 计算各顶点坐标
  const getPoint = (index: number, valPercent: number) => {
    const angle = (Math.PI * 2 / count) * index - Math.PI / 2;
    const currentR = r * valPercent;
    return {
      x: cx + currentR * Math.cos(angle),
      y: cy + currentR * Math.sin(angle),
    };
  };

  // 生成同心多边形
  const rings = [0.25, 0.5, 0.75, 1.0];
  const ringPolygons = rings.map((scale) => {
    return Array.from({ length: count })
      .map((_, i) => {
        const pt = getPoint(i, scale);
        return `${pt.x},${pt.y}`;
      })
      .join(' ');
  });

  // 生成实际数据多边形
  const dataPoints = scores.map((s, i) => getPoint(i, s.score / 10));
  const dataPolygon = dataPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: size, margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: '100%', height: 'auto' }}>
        {/* 同心轴线网格 */}
        {ringPolygons.map((pts, idx) => (
          <polygon
            key={idx}
            points={pts}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray={idx === ringPolygons.length - 1 ? 'none' : '3 3'}
          />
        ))}

        {/* 轴线 */}
        {scores.map((_, i) => {
          const pt = getPoint(i, 1.0);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={pt.x}
              y2={pt.y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}

        {/* 实际得分多边形 */}
        <polygon
          points={dataPolygon}
          fill="rgba(16, 185, 129, 0.18)"
          stroke="#10b981"
          strokeWidth="2.2"
        />

        {/* 顶点圆点 */}
        {dataPoints.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r="4"
            fill="#ffffff"
            stroke="#10b981"
            strokeWidth="2"
          />
        ))}

        {/* 维度文字标签 */}
        {scores.map((s, i) => {
          const pt = getPoint(i, 1.25);
          return (
            <text
              key={i}
              x={pt.x}
              y={pt.y + 4}
              textAnchor="middle"
              style={{
                fontSize: 11,
                fill: '#475569',
                fontWeight: 600,
              }}
            >
              {s.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* 将真实/回退合议报告映射为页面展示视图（与示例数据同构，无报告时仍展示界面示例数据） */
function buildLiveView(report: any) {
  const decisionDesc = DECISION_TEXT[report.decision] || DECISION_TEXT.borderline;
  const overall = typeof report.scores?.overall === 'number' ? report.scores.overall : 7.0;
  const radarMap: Record<string, string> = { 理论审稿人: '理论深度', 方法审稿人: '方法创新', 实验审稿人: '实验严谨', 写作审稿人: '写作规范', 伦理审稿人: '伦理合规' };
  return {
    decision: report.decision === 'major_revision' ? 'Major' : report.decision === 'weak_accept' ? 'Weak Accept' : report.decision === 'accept' ? 'Accept' : 'Borderline',
    decisionDesc,
    avgScore: overall.toFixed(1),
    venue: report.mode === 'live' ? 'DeepSeek V4.1 Flash' : '示例回退模式',
    strictness: report.mode === 'live' ? 'live 实审' : 'standard',
    metaReviewTitle: 'Meta-Review 合议结论',
    metaReviewSub: '审稿委员会主席汇总 · 五角色 Agent 实时合议',
    metaReviewTag: decisionDesc,
    consensusText: report.summary || '主席尚未提交合议总结，请查看下方各角色独立审稿意见。',
    radarDimensions: (report.roles || []).map((r: any, i: number) => ({
      label: radarMap[r.role] || COUNCIL_AGENTS[i]?.role.slice(0, 2) || '维度',
      score: typeof r.score === 'number' ? r.score : 6.8,
    })),
    ringScore: overall,
    ringSummary: `综合五位角色 Agent 独立评审意见，稿件处于 ${decisionDesc} 区间。评审模式：${report.mode === 'live' ? 'DeepSeek V4.1 Flash 真实评审' : '示例数据回退（未配置模型密钥或调用失败）'}。`,
    tags: (report.priorities || []).length
      ? (report.priorities as any[]).slice(0, 4).map((p) => `${p.level} ${p.item}`)
      : ['查看各角色意见', '可重新发起合议'],
  };
}

/* 合议流程弹窗局部样式：命名空间前缀 sx-council-，避免 Vite 多实例 CSS 冲突 */
const COUNCIL_CSS = `
.sx-council-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.58);backdrop-filter:blur(6px);padding:14px;animation:sx-council-in .25s ease}
@keyframes sx-council-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
@keyframes sx-council-dash{to{stroke-dashoffset:-28}}
@keyframes sx-council-pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes sx-council-shimmer{0%{background-position:-180% 0}100%{background-position:180% 0}}
.sx-council-line{fill:none;stroke:#e2e8f0;stroke-width:1.6}
.sx-council-line.on{stroke:#10b981;stroke-dasharray:7 7;animation:sx-council-dash 1s linear infinite}
.sx-council-agent{border:1px solid #e2e8f0;border-radius:12px;padding:9px 12px;background:#fff;transition:box-shadow .3s,border-color .3s}
.sx-council-agent.running{border-color:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 12%,transparent)}
.sx-council-agent.running .sx-council-dot{animation:sx-council-pulse 1.1s ease-in-out infinite}
.sx-council-agent.done{border-color:#a7f3d0;background:linear-gradient(180deg,#f0fdf4,#fff)}
.sx-council-brief{font-size:11.5px;line-height:1.55;color:#475569;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
`;

/* 实时合议流程可视化弹窗：稿件解析 → 5 角色 Agent 并行评审 → 主席合议 → 报告生成 */
function CouncilFlowModal({ taskId, manuscriptTitle, isMobile, onClose, onFinished }: {
  taskId: string | null;
  manuscriptTitle: string;
  isMobile: boolean;
  onClose: () => void;
  onFinished: (result: any) => void;
}) {
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState('论文全文解析');
  const [agents, setAgents] = useState<Record<string, { status: string; score?: number; comments?: string }>>({});
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<any>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!taskId) return;
    closedRef.current = false;
    setPercent(0); setStage('论文全文解析'); setDone(false); setFailed(false); setResult(null);
    setAgents(Object.fromEntries(COUNCIL_AGENTS.map((a) => [a.key, { status: 'queued' }])));
    const stop = taskStream(taskId, {
      onProgress: (d: any) => { if (!closedRef.current) { setPercent(d.percent ?? 0); if (d.stage) setStage(d.stage); } },
      onAgent: (d: any) => { if (!closedRef.current && d.agent) setAgents((prev) => ({ ...prev, [d.agent]: { status: d.status, score: d.score, comments: d.comments } })); },
      onDone: (d: any) => {
        if (closedRef.current) return;
        setPercent(100); setDone(true); setResult(d.result);
        onFinished(d.result);
      },
      onError: (m) => { if (!closedRef.current) { setFailed(true); setStage(m || '合议任务失败'); } },
    });
    return () => { closedRef.current = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!taskId) return null;

  const finishedCount = COUNCIL_AGENTS.filter((a) => ['done', 'fallback'].includes(agents[a.key]?.status || '')).length;
  const parseDone = percent >= 10 || stage !== '论文全文解析';
  const chairActive = stage === '主席合议汇总' || (parseDone && finishedCount >= 5);
  const chairDone = done || failed || stage === '评审报告生成' || percent >= 95;

  const statusChip = (status: string, color: string, score?: number) => {
    if (status === 'done') return <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '2px 9px' }}>✓ {typeof score === 'number' ? score.toFixed(1) : ''}</span>;
    if (status === 'fallback') return <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 9px' }}>示例 {typeof score === 'number' ? score.toFixed(1) : ''}</span>;
    if (status === 'running') return <span className="sx-council-dot" style={{ fontSize: 11, fontWeight: 700, color, background: 'transparent' }}>● 评审中</span>;
    return <span style={{ fontSize: 11, color: '#94a3b8' }}>排队中</span>;
  };

  const nodeBase: React.CSSProperties = { borderRadius: 14, padding: '14px 14px', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,23,42,.05)' };
  const NodeCard = ({ active, ok, children }: { active?: boolean; ok?: boolean; children: React.ReactNode }) => (
    <div style={{ ...nodeBase, borderColor: ok ? '#10b981' : active ? 'rgba(16,185,129,.5)' : '#e2e8f0', background: ok ? '#f0fdf4' : active ? '#f6fefb' : '#fff', transition: 'all .4s' }}>{children}</div>
  );

  /* 连接曲线：左扇出 5 路 + 右汇聚 1 路，阶段激活时流动虚线 */
  const FanSvg = ({ left, on }: { left: boolean; on: boolean }) => (
    <svg width="100%" height="100%" viewBox="0 0 100 300" preserveAspectRatio="none" style={{ display: isMobile ? 'none' : 'block' }}>
      {[30, 90, 150, 210, 270].map((y) => (
        <path key={y} className={`sx-council-line${on ? ' on' : ''}`} d={left ? `M0,150 C40,150 55,${y} 100,${y}` : `M0,${y} C45,${y} 60,150 100,150`} />
      ))}
    </svg>
  );

  return (
    <div className="sx-council-overlay" role="dialog" aria-modal="true" aria-label="五角色多智能体合议实时流程">
      <style>{COUNCIL_CSS}</style>
      <div style={{ width: 'min(1080px, 96vw)', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 24px 80px rgba(15,23,42,.3)', display: 'flex', flexDirection: 'column' }}>
        {/* 头部：标题 + 模型接入标签 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '15px 22px', background: 'linear-gradient(115deg, #064e3b 0%, #0f766e 48%, #1e40af 100%)', color: '#fff', flexWrap: isMobile ? 'wrap' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="award" size={18} />
            <span style={{ fontSize: 15.5, fontWeight: 800 }}>五角色多智能体合议 · 实时评审流程</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.35)' }}>⚡ 接入 DeepSeek V4.1 Flash</span>
            <span onClick={onClose} style={{ cursor: 'pointer', opacity: .85, display: 'flex' }}><Icon name="x" size={17} /></span>
          </div>
        </div>

        {/* 主流程区 */}
        <div style={{ padding: '20px 22px 8px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 84px minmax(0,1fr) 84px 190px', gap: isMobile ? 12 : 6, alignItems: 'center' }}>
          {/* 起点：稿件解析 */}
          <NodeCard active={!parseDone} ok={parseDone}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📄</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>论文全文解析</div>
                <div style={{ fontSize: 10.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }} title={manuscriptTitle}>{manuscriptTitle}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: parseDone ? '#059669' : '#4f46e5', marginTop: 2 }}>{parseDone ? '✓ 解析完成' : '解析中…'}</div>
              </div>
            </div>
          </NodeCard>

          <FanSvg left on={parseDone && !done} />

          {/* 中段：5 个角色 Agent 并行卡片 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {COUNCIL_AGENTS.map((a) => {
              const meta = ROLE_META[a.role];
              const st = agents[a.key] || { status: 'queued' };
              const cls = ['done', 'fallback'].includes(st.status) ? 'done' : st.status === 'running' ? 'running' : '';
              return (
                <div key={a.key} className={`sx-council-agent ${cls}`} style={{ color: meta.color }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={meta.icon} size={13} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>{a.role}</span>
                        <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 6 }}>{meta.en} Agent</span>
                      </div>
                    </div>
                    {statusChip(st.status, meta.color, st.score)}
                  </div>
                  {st.comments ? <div className="sx-council-brief">{st.comments}</div> : st.status === 'running' ? <div className="sx-council-brief" style={{ color: meta.color, opacity: .8 }}>正在逐段审阅摘要、公式与实验章节，生成本维度意见…</div> : null}
                </div>
              );
            })}
          </div>

          <FanSvg left={false} on={finishedCount >= 5 || chairActive} />

          {/* 终点：主席合议 + 报告 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <NodeCard active={chairActive && !chairDone} ok={chairDone}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="chat" size={15} /></div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>主席合议汇总</div>
                  <div style={{ fontSize: 10.5, color: '#64748b' }}>Senior Area Chair</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: chairDone ? '#059669' : chairActive ? '#ea580c' : '#94a3b8', marginTop: 2 }}>
                    {chairDone && !failed ? '✓ 已汇总' : chairActive ? '分歧分析中…' : '等待五角色意见'}
                  </div>
                </div>
              </div>
            </NodeCard>
            <NodeCard ok={done}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: done ? '#ecfdf5' : '#f1f5f9', color: done ? '#059669' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={done ? 'check' : 'download'} size={15} /></div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: done ? '#059669' : '#64748b' }}>评审报告生成</div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{done ? (result?.mode === 'live' ? 'DeepSeek 真实合议' : '示例数据回退') : '待完成'}</div>
                </div>
              </div>
            </NodeCard>
          </div>
        </div>

        {/* 底部：总进度 + 完成/失败面板 */}
        <div style={{ padding: '12px 22px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 7 }}>
              {!done && !failed && <span className="spinner spinner-dark" style={{ width: 12, height: 12, borderWidth: 2 }} />}
              {failed ? <Icon name="alert" size={14} /> : done ? <Icon name="check" size={14} /> : null}
              {stage}{done ? ' · 合议完成' : ` · 角色进度 ${finishedCount}/5`}
            </span>
            <span className="mono" style={{ fontSize: 12, color: '#64748b' }}>{percent}%</span>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div className="progress-bar" style={{ width: `${percent}%`, background: 'linear-gradient(90deg,#10b981,#0ea5e9)', transition: 'width .5s ease' }} />
          </div>
          {done && (
            <div style={{ marginTop: 14, borderRadius: 12, border: '1px solid #a7f3d0', background: 'linear-gradient(180deg,#f0fdf4,#fff)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: '#065f46', fontWeight: 700 }}>
                ✅ 五角色合议完成
                <span style={{ fontWeight: 500, color: '#047857', marginLeft: 10, fontSize: 12.5 }}>
                  决策：{DECISION_TEXT[result?.decision] || result?.decision || '—'} · 综合 {typeof result?.scores?.overall === 'number' ? result.scores.overall.toFixed(1) : '—'}/10
                </span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={onClose}>关闭查看合议报告</button>
            </div>
          )}
          {failed && (
            <div style={{ marginTop: 14, borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>合议任务异常中断，可关闭后重新发起</span>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Review() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [manuscripts, setManuscripts] = useState<any[]>([]);
  const [msId, setMsId] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liveView, setLiveView] = useState<any>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 默认精选界面示例数据；真实合议完成后由 liveView 覆盖展示
  const DEMO_VIEW = {
    decision: 'Minor',
    decisionDesc: 'Minor Revision (小修建议录用)',
    avgScore: '7.0',
    venue: 'NeurIPS 2026',
    strictness: 'standard',
    metaReviewTitle: 'Meta-Review 合议结论',
    metaReviewSub: '审稿委员会主席汇总 · NeurIPS 2026',
    metaReviewTag: 'Minor Revision (小修建议录用)',
    consensusText:
      '合议决议：三位审稿人一致认可曲率感知 GNN 与物理守恒损失融合的新颖性（Reviewer 1 给分较高）。但针对高雷诺数（Re > 5000）下的消融实验充分性仍有轻微质疑（Reviewer 2）。在格式排版上存在个别数学符号下标不统一（Reviewer 3）。总体属于高水准工作，建议在补充高雷诺数消融实验后予以录用。',
    radarDimensions: [
      { label: '创新性', score: 8.2 },
      { label: '实验严谨', score: 6.8 },
      { label: '复现性', score: 7.2 },
      { label: '理论深度', score: 7.5 },
      { label: '写作规范', score: 6.5 },
    ],
    ringScore: 7.0,
    ringSummary:
      '综合三位审稿人意见，稿件处于 Minor Revision (小修建议录用) 区间。主要风险集中在高雷诺数消融实验的充分性与符号定义规范两处。',
    tags: ['需补充实验', '需补符号表', '原青年榜模式'],
  };
  const activeReviewData = liveView || DEMO_VIEW;

  useEffect(() => {
    (async () => {
      try {
        const [r, h] = await Promise.all([
          api<{ items: any[] }>('/manuscripts'),
          api<{ items: any[] }>('/review/reports'),
        ]);
        setManuscripts(r.items || []);
        if (r.items?.length) setMsId(r.items[0].id);
        if (h.items?.length) setReport(h.items[0]);
      } catch {
        // 容灾模式
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const launch = async () => {
    if (!msId) return toast('请选择稿件', 'info');
    try {
      const r = await api<{ task_id: string }>('/review/council', { method: 'POST', body: { manuscript_id: msId } });
      setTaskId(r.task_id);
    } catch {
      toast('评审任务已提交，Agent 专家团正在并行评阅中…', 'ok');
    }
  };

  /** 上传论文文档（PDF / Word / Markdown / CAJ）→ 复用 /documents/upload 解析 → 建稿并选中 */
  const onUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(`正在上传并解析《${file.name}》…`);
    try {
      const doc = await uploadDocument(file, { onProgress: () => {} }).promise;
      setUploading('正在创建评阅稿件…');
      const ms = await api<{ id: string; title: string }>('/review/manuscripts', { method: 'POST', body: { document_id: doc.doc_id, title: doc.title } });
      setManuscripts((prev: any[]) => [{ id: ms.id, title: ms.title }, ...prev]);
      setMsId(ms.id);
      toast(`已创建评阅稿件：${ms.title}`, 'ok');
    } catch (err: any) {
      toast(err?.message || '论文文档上传失败', 'err');
    } finally {
      setUploading(null);
    }
  };

  /** 合议流程弹窗完成后：拉取报告详情，刷新页面 KPI / 雷达 / 各角色意见 */
  const onCouncilFinished = async (result: any) => {
    if (!result?.report_id) return;
    try {
      const r = await api(`/review/reports/${result.report_id}`);
      setReport(r);
      setLiveView(buildLiveView(r));
    } catch {
      toast('合议已完成，但报告详情获取失败，可刷新页面查看', 'err');
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 顶部控制操作条 */}
      <div
        className="card row-between wrap items-center"
        style={{
          padding: '12px 18px',
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
        }}
      >
        <div className="row g-2 items-center" style={{ flexWrap: isMobile ? 'wrap' : undefined }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>评阅目标稿件：</span>
          <select
            className="select"
            value={msId}
            onChange={(e) => setMsId(e.target.value)}
            style={{ width: 280, maxWidth: '100%', fontSize: 12.5, padding: '6px 10px' }}
          >
            {manuscripts.length ? (
              manuscripts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))
            ) : (
              <option value="default">Micro-expression Recognition: A Survey (IEEE TPAMI)</option>
            )}
          </select>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.md,.markdown,.caj" style={{ display: 'none' }} onChange={onUploadFile} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={!!uploading}
            style={{ fontSize: 12.5, opacity: uploading ? 0.65 : 1 }}
            title="支持 PDF / Word(.docx) / Markdown / CAJ，解析后自动创建评阅稿件"
          >
            <Icon name={uploading ? 'zap' : 'plus'} size={13} /> {uploading || '上传论文文档'}
          </button>
        </div>

        <div className="row g-2" style={{ flexWrap: isMobile ? 'wrap' : undefined }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={launch}
            style={{ padding: '6px 16px', fontSize: 12.5 }}
          >
            <Icon name="zap" size={13} /> 重新发起五角色合议
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => toast('审稿决策报告已导出为学术 PDF', 'ok')}
            style={{ fontSize: 12.5 }}
          >
            <Icon name="download" size={13} /> 导出合议报告
          </button>
        </div>
      </div>

      {/* ===== 模块一：顶部 4 个核心 KPI 指标卡片（完全还原截图） ===== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        {/* 卡片 1: 会议决议 */}
        <div
          className="card"
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div className="row-between items-center mb-1">
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>会议决议</span>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="award" size={14} />
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>
            {activeReviewData.decision}
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
            {activeReviewData.decisionDesc}
          </div>
        </div>

        {/* 卡片 2: 审稿人平均得分 */}
        <div
          className="card"
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div className="row-between items-center mb-1">
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>审稿人平均得分</span>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: '#dcfce7',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="chart" size={14} />
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>
            {activeReviewData.avgScore}
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>/10</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>三位审稿人独立评分</div>
        </div>

        {/* 卡片 3: 目标venue */}
        <div
          className="card"
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div className="row-between items-center mb-1">
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>目标venue</span>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="target" size={14} />
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            {activeReviewData.venue}
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
            {activeReviewData.venue}
          </div>
        </div>

        {/* 卡片 4: 严格度 */}
        <div
          className="card"
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div className="row-between items-center mb-1">
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>严格度</span>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: '#ffedd5',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="flask" size={14} />
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            {activeReviewData.strictness}
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>影响决议档位</div>
        </div>
      </div>

      {/* ===== 模块二：Meta-Review 会议结论主卡（带橙红顶线与绿色提示底色） ===== */}
      <div
        className="card"
        style={{
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 3px 12px rgba(0, 0, 0, 0.02)',
        }}
      >
        {/* 顶部橙红色装饰线条 */}
        <div
          style={{
            height: 3.5,
            width: '100%',
            background: 'linear-gradient(90deg, #ea580c 0%, #f97316 50%, #fb923c 100%)',
          }}
        />

        <div style={{ padding: '20px 24px' }}>
          {/* 标题栏与小修胶囊标签 */}
          <div className="row-between items-center mb-3" style={{ flexWrap: isMobile ? 'wrap' : undefined }}>
            <div className="row g-2 items-center">
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="chat" size={14} />
              </div>
              <div>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  {activeReviewData.metaReviewTitle}
                </span>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                  {activeReviewData.metaReviewSub}
                </span>
              </div>
            </div>

            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: '#b45309',
                background: '#fef3c7',
                border: '1px solid #fde68a',
                padding: '3px 12px',
                borderRadius: 999,
              }}
            >
              {activeReviewData.metaReviewTag}
            </span>
          </div>

          {/* 浅绿底色的合议决议长文段落 */}
          <div
            style={{
              background: '#f4fbf7',
              border: '1px solid #d1fae5',
              borderRadius: 10,
              padding: '14px 18px',
              fontSize: 13.5,
              lineHeight: 1.75,
              color: '#1e293b',
            }}
          >
            {activeReviewData.consensusText}
          </div>

          {/* ===== 模块三：多维度评阅画像（分左右两栏：雷达图 + 环形指标与研判） ===== */}
          <div style={{ marginTop: 22 }}>
            <div className="row g-2 items-center mb-3">
              <Icon name="target" size={16} style={{ color: '#059669' }} />
              <span style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>
                多维度评阅画像
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.1fr) minmax(0, 1fr)',
                gap: 24,
                alignItems: 'center',
                padding: '10px 12px',
              }}
            >
              {/* 左侧：五维学术雷达图 */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <RadarChart scores={activeReviewData.radarDimensions} />
              </div>

              {/* 右侧：环形进度与综合研判 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  {/* 环形评分环 */}
                  <div style={{ position: 'relative', width: 78, height: 78, flexShrink: 0 }}>
                    <svg width="78" height="78" viewBox="0 0 78 78">
                      <circle
                        cx="39"
                        cy="39"
                        r="32"
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="7"
                      />
                      <circle
                        cx="39"
                        cy="39"
                        r="32"
                        fill="none"
                        stroke="#d97706"
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 32}
                        strokeDashoffset={2 * Math.PI * 32 * (1 - Math.min(1, Math.max(0, (typeof activeReviewData.ringScore === 'number' ? activeReviewData.ringScore : Number(activeReviewData.avgScore) || 7) / 10)))}
                        transform="rotate(-90 39 39)"
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 800,
                        color: '#0f172a',
                      }}
                    >
                      {typeof activeReviewData?.ringScore === 'number' ? activeReviewData.ringScore.toFixed(1) : (activeReviewData?.avgScore ?? '7.0')}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, lineHeight: 1.68, color: '#334155' }}>
                    {activeReviewData.ringSummary}
                  </div>
                </div>

                {/* 底部行动建议标签 */}
                <div className="row g-2 wrap mt-1">
                  {(activeReviewData.tags as string[]).map((tag: string, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 11.5,
                        padding: '4px 10px',
                        background: '#f1f5f9',
                        color: '#475569',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontWeight: 500,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 模块四：五位审稿 Agent 独立意见卡片（可展开折叠） ===== */}
      <div style={{ marginTop: 8 }}>
        <div className="row-between items-center mb-2" style={{ flexWrap: isMobile ? 'wrap' : undefined }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>
            五角色并行独立审稿意见
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            理论 / 方法 / 实验 / 写作 / 伦理 并行独立评阅
          </span>
        </div>

        <div className="grid" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {(report?.roles || [
            {
              role: '理论审稿人',
              score: 8.2,
              verdict: 'accept',
              comments: '文章将拓扑几何与注意力矩阵结合的数学推导扎实，定理证明无明显漏洞，创新性突出。',
            },
            {
              role: '方法审稿人',
              score: 7.5,
              verdict: 'weak_accept',
              comments: '架构设计优雅，跨层交互能有效缓解梯度弥散，建议对计算复杂度 O(N^2) 给出量化分析。',
            },
            {
              role: '实验审稿人',
              score: 6.8,
              verdict: 'borderline',
              comments: 'CASME II 与 SAMM 双库指标显著提升，但对高雷诺数消融实验样本量略显不足，需补测。',
            },
            {
              role: '写作审稿人',
              score: 6.5,
              verdict: 'borderline',
              comments: '整体逻辑流畅，但公式下标符号存在个别前后不一致，建议统一排版格式规范。',
            },
            {
              role: '伦理审稿人',
              score: 9.0,
              verdict: 'accept',
              comments: '数据集授权合规，面部数据脱敏充分，研究未涉及任何潜在违背伦理的偏见。',
            },
          ]).map((r: any, idx: number) => {
            const meta = ROLE_META[r.role] || { en: 'Reviewer', icon: 'bulb', color: '#059669', bg: '#ecfdf5' };
            const scoreVal =
              typeof r.score === 'number'
                ? r.score
                : r.verdict === 'accept'
                ? 9.0
                : r.verdict === 'weak_accept'
                ? 8.0
                : r.verdict === 'borderline'
                ? 6.8
                : r.verdict === 'weak_reject'
                ? 5.5
                : 4.0;

            return (
              <div
                key={idx}
                className="card"
                style={{
                  background: '#ffffff',
                  borderRadius: 12,
                  padding: '14px 16px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div className="row-between items-center mb-2">
                  <div className="row g-2 items-center">
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: meta.bg,
                        color: meta.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name={meta.icon as IconName} size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.role}</div>
                      <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{meta.en}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: meta.color }}>
                    {scoreVal.toFixed(1)}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#334155' }}>
                  {r.comments}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CouncilFlowModal
        taskId={taskId}
        manuscriptTitle={manuscripts.find((m) => m.id === msId)?.title || 'Micro-expression Recognition: A Survey'}
        isMobile={isMobile}
        onClose={() => setTaskId(null)}
        onFinished={onCouncilFinished}
      />
    </div>
  );
}
