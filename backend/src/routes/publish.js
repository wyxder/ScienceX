/** 投稿助手 / 组会汇报 / 专家评审团 / 项目与课题组 —— REQ-SUB-01, REQ-SPC-01/02, REQ-PRJ-01 */

const store = require('../lib/store');
const { ok, errors, asyncHandler } = require('../lib/respond');
const ai = require('../lib/ai');
const { auth } = require('./account');
const { canAccess, canAccessTeam, canManageTeam } = require('../lib/access');

const router = require('../lib/router').createRouter();

/* ---------- CCF 期刊大全 REQ-SUB-01 ---------- */
router.get('/journals', auth, (req, res) => {
  const { ccf, field, keyword } = req.query;
  let items = store.journals;
  if (ccf) items = items.filter((j) => j.ccf === ccf);
  if (field) items = items.filter((j) => j.field.includes(field));
  if (keyword) items = items.filter((j) => j.name.toLowerCase().includes(String(keyword).toLowerCase()));
  items = items.map((j) => {
    const track = store.submissionTracks.find((t) => t.journal_id === j.id && canAccess(t, req.user.id));
    const days = j.deadline ? Math.ceil((new Date(j.deadline) - Date.now()) / 86400000) : null;
    return { ...j, days_left: days, tracked: !!track, track_status: track?.status || null };
  });
  ok(res, { items, total: items.length });
});

/* ---------- 投稿追踪 REQ-SUB-01 ---------- */
router.get('/submission-tracks', auth, (req, res) => {
  const items = store.submissionTracks.filter((t) => canAccess(t, req.user.id)).map((t) => ({
    ...t, days_left: Math.ceil((new Date(t.deadline) - Date.now()) / 86400000),
  }));
  ok(res, { items });
});

router.post('/submission-tracks', auth, (req, res) => {
  const { journal_id } = req.body || {};
  const journal = store.journals.find((j) => j.id === journal_id);
  if (!journal) return errors.notFound(res, '期刊不存在');
  const track = { id: store.id('st'), user_id: req.user.id, journal_id, journal_name: journal.name, status: 'watching', deadline: journal.deadline, note: '', created_at: store.now() };
  store.submissionTracks.push(track);
  ok(res, { ...track, days_left: journal.deadline ? Math.ceil((new Date(journal.deadline) - Date.now()) / 86400000) : null }, `已关注 ${journal.name}`);
});

router.delete('/submission-tracks/:id', auth, (req, res) => {
  const idx = store.submissionTracks.findIndex((t) => t.id === req.params.id && canAccess(t, req.user.id));
  if (idx < 0) return errors.notFound(res, '追踪记录不存在');
  store.submissionTracks.splice(idx, 1);
  ok(res, {}, '已取消关注');
});

router.patch('/submission-tracks/:id', auth, (req, res) => {
  const track = store.submissionTracks.find((t) => t.id === req.params.id && canAccess(t, req.user.id));
  if (!track) return errors.notFound(res, '追踪记录不存在');
  for (const field of ['status', 'note']) {
    if (req.body?.[field] !== undefined) track[field] = req.body[field];
  }
  ok(res, track, '状态已更新');
});

/* ---------- 期刊匹配 REQ-SUB-01 ---------- */
router.post('/journals/match', auth, (req, res) => {
  const { abstract = '' } = req.body || {};
  if (!abstract) return errors.param(res, '论文摘要不能为空');
  ok(res, {
    items: [
      { journal_id: 'j3', name: 'ACM Multimedia', ccf: 'A', score: 91, reason: '主题高度契合（情感计算 + 多媒体），近三年收录 40+ 篇 MER 论文，接受率 23%', deadline: store.daysAhead(96) },
      { journal_id: 'j6', name: 'IEEE T-AFFC', ccf: 'B', score: 86, reason: '情感计算旗舰期刊，MER 工作引用率高，审稿周期约 3 个月，适合作为稳妥选择', deadline: null },
      { journal_id: 'j1', name: 'CVPR', ccf: 'A', score: 74, reason: '需要更强的通用视觉创新点，建议 UF1 达到 0.75+ 后再考虑', deadline: store.daysAhead(58) },
      { journal_id: 'j9', name: 'FG', ccf: 'C', score: 68, reason: '人脸方向专项会议，保底选择，审稿快', deadline: store.daysAhead(23) },
    ],
  });
});

/* ---------- 组会汇报：PPT 生成 REQ-SPC-01 ---------- */
router.post('/deck/generate', auth, (req, res) => {
  const { source = '', template = 'academic' } = req.body || {};
  const task = ai.createTask('deck', ['解析研究内容', '生成 PPT 大纲', '填充每页内容', '套用模板渲染', '导出 .pptx'], () => ({
    file_name: `组会汇报_${source.slice(0, 10) || 'up9实验进展'}.pptx`,
    pages: 12,
    outline: [
      { page: 1, title: '封面', note: '题目 · 汇报人 · 日期' },
      { page: 2, title: '上周工作回顾', note: 'up9 baseline 完成，UF1=0.6464' },
      { page: 3, title: '本周进展：跨层 AU 交互', note: '动机 + 架构图' },
      { page: 5, title: '消融实验结果', note: '对比表 + 柱状图' },
      { page: 8, title: '问题与讨论', note: 'OpenFace 噪声 / 种子方差' },
      { page: 10, title: '下周计划', note: 'flow-boost 训练 + SAMM 验证' },
    ],
    download_url: `/api/v1/static/decks/demo.pptx`,
  }), req.user.id);
  ok(res, { task_id: task.id }, 'PPT 生成任务已提交');
});

/* ---------- 导师建议记录 REQ-SPC-01 ---------- */
router.get('/advice', auth, (req, res) => ok(res, { items: store.adviceRecords.filter((item) => canAccess(item, req.user.id)) }));

router.post('/advice/extract', auth, (req, res) => {
  const { text = '', audio = false } = req.body || {};
  if (!text && !audio) return errors.param(res, '请提供会议记录文本或音频');
  ok(res, {
    meeting: `组会 · ${new Date().toISOString().slice(0, 10)}`,
    from: '韩老师',
    items: [
      { category: '实验', content: '补 3 个随机种子（7/13/42），报告均值±方差。', status: 'todo', todo: '补充随机种子实验' },
      { category: '写作', content: 'Introduction 贡献点用 bullet 列 3 条，避免大段文字。', status: 'todo', todo: '改写 Introduction' },
      { category: '文献', content: '关注 MER 2024 Challenge 的评测口径变化。', status: 'todo', todo: '阅读技术报告' },
    ],
    source: audio ? '语音转写 + LLM 抽取' : 'LLM 结构化抽取',
  });
});

router.patch('/advice/:id', auth, (req, res) => {
  const a = store.adviceRecords.find((x) => x.id === req.params.id && canAccess(x, req.user.id));
  if (!a) return errors.notFound(res, '建议记录不存在');
  for (const field of ['status', 'todo', 'content']) {
    if (req.body?.[field] !== undefined) a[field] = req.body[field];
  }
  ok(res, a, '已更新');
});

/* ---------- 多智能体评审团 REQ-SPC-02：DeepSeek V4.1 Flash 五角色 Agent 独立真实评审 + 主席合议，失败逐角色回退示例数据 ---------- */

const gateway = require('../lib/model-gateway');

const COUNCIL_MODEL = 'DeepSeek V4.1 Flash';
const COUNCIL_STAGES = ['论文全文解析', '五角色 Agent 并行评审', '主席合议汇总', '评审报告生成'];

/** 五个独立评审 Agent：各自只负责本角色维度的审稿边界；fallback 即界面示例数据，无密钥/调用失败时逐角色回退 */
const COUNCIL_ROLE_AGENTS = [
  { key: 'theory', role: '理论审稿人', focus: '理论推导、数学公式与符号体系、假设与适用边界，警惕公式歧义', fallback: { score: 8.2, verdict: 'accept', comments: '文章将拓扑几何与注意力矩阵结合的数学推导扎实，定理证明无明显漏洞，创新性突出。' } },
  { key: 'method', role: '方法审稿人', focus: '网络架构设计、先验注入机制、模块创新性与计算复杂度分析', fallback: { score: 7.5, verdict: 'weak_accept', comments: '架构设计优雅，跨层交互能有效缓解梯度弥散，建议对计算复杂度 O(N^2) 给出量化分析。' } },
  { key: 'experiment', role: '实验审稿人', focus: '数据集与评测协议（LOSO）、消融实验完整性、统计显著性与随机种子纪律', fallback: { score: 6.8, verdict: 'borderline', comments: 'CASME II 与 SAMM 双库指标显著提升，但对高雷诺数消融实验样本量略显不足，需补测。' } },
  { key: 'writing', role: '写作审稿人', focus: '论文组织结构、图表规范、公式符号一致性与语言质量', fallback: { score: 6.5, verdict: 'borderline', comments: '整体逻辑流畅，但公式下标符号存在个别前后不一致，建议统一排版格式规范。' } },
  { key: 'ethics', role: '伦理审稿人', focus: '数据授权与隐私脱敏、偏见风险、可复现声明与学术诚信', fallback: { score: 9.0, verdict: 'accept', comments: '数据集授权合规，面部数据脱敏充分，研究未涉及任何潜在违背伦理的偏见。' } },
];

/** 从模型返回文本中稳健提取首个 JSON 对象（容忍 Markdown 代码块与前后缀说明） */
function extractJSON(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const end = raw.lastIndexOf('}');
  if (end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 宽松评审 JSON 提取：推理型模型可能因 max_tokens 截断输出，整段 JSON.parse 失败时逐字段正则回补 */
function extractReviewFields(text) {
  const parsed = extractJSON(text);
  if (parsed) return parsed;
  if (!text) return null;
  const score = String(text).match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
  const verdict = String(text).match(/"verdict"\s*:\s*"(\w+)"/);
  const comments = String(text).match(/"comments"\s*:\s*"([\s\S]*?)(?:(?<!\\)"|$)/);
  const summary = String(text).match(/"summary"\s*:\s*"([\s\S]*?)(?:(?<!\\)"|$)/);
  if (!score && !comments && !summary) return null;
  return { score: score && score[1], verdict: verdict && verdict[1], comments: comments && comments[1], summary: summary && summary[1] };
}

const REVIEW_ROLES = COUNCIL_ROLE_AGENTS.map((a) => a.role);
const REVIEW_VERDICTS = ['accept', 'weak_accept', 'borderline', 'reject_risk'];
const REVIEW_DECISIONS = { accept: 'accept', 'weak accept': 'weak_accept', borderline: 'borderline', revision: 'major_revision', 'major revision': 'major_revision' };

const clampScore = (value, dflt) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(Math.max(0, Math.min(10, num)) * 10) / 10 : dflt;
};

/** 单角色审稿 Agent：调用 DeepSeek V4.1 Flash 产出本维度意见；偶发结构不完整时重试一次，仍失败或无密钥则回退示例意见 */
async function runRoleAgent(client, ctx, agent) {
  if (!client) return { ...agent.fallback, mode: 'fallback' };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await client.chatCompletion([
        { role: 'system', content: `你是 CCF-A 类会议（NeurIPS/CVPR/ICML）的资深「${agent.role}」，正在对论文《${ctx.title}》进行独立双盲评审。你只负责本角色维度：${agent.focus}。严禁越界评价其他维度。只输出一个合法 JSON 对象（禁止 Markdown 围栏与多余文字，思考从简，直接给出结论）：{"score": 1-10 分（可含一位小数）, "verdict": "accept|weak_accept|borderline|reject_risk 之一", "comments": "120 字以内评审意见，指出具体问题与可执行的修改建议"}` },
        { role: 'user', content: `【摘要】${ctx.abstract}\n【正文节选】\n${ctx.excerpt}` },
      ], { temperature: 0.3, max_tokens: attempt === 1 ? 1600 : 2600 });
      const parsed = extractReviewFields(res.text);
      if (!parsed || !Number.isFinite(Number(parsed.score)) || !parsed.comments) throw new Error('评审 JSON 结构不完整');
      return {
        score: clampScore(parsed.score, agent.fallback.score),
        verdict: REVIEW_VERDICTS.includes(String(parsed.verdict)) ? String(parsed.verdict) : 'borderline',
        comments: String(parsed.comments).slice(0, 400),
        mode: 'live',
      };
    } catch (error) {
      if (attempt === 2) {
        console.warn(`[ScienceX Council] ${agent.role} 真实评审失败，回退示例意见:`, error.message);
        return { ...agent.fallback, mode: 'fallback' };
      }
    }
  }
  return { ...agent.fallback, mode: 'fallback' };
}

/** 主席（Senior Area Chair）合议 Agent：汇总五角色意见给出最终决策；失败按均分确定性回退 */
async function runChairAgent(client, ctx, opinions) {
  const avg = Math.round((opinions.reduce((sum, o) => sum + o.score, 0) / opinions.length) * 10) / 10;
  const fallbackMeta = {
    decision: avg >= 8 ? 'accept' : avg >= 7 ? 'weak_accept' : avg >= 5.5 ? 'borderline' : 'major_revision',
    total_score: avg,
    summary: `五角色评审委员会独立评阅《${ctx.title}》，综合得分 ${avg}/10。各角色评分依次为 ${opinions.map((o) => o.score).join(' / ')}（理论/方法/实验/写作/伦理）。具体优势与风险详见各角色意见。`,
    priorities: [],
    mode: 'fallback',
  };
  if (!client) return fallbackMeta;
  try {
    const opinionBrief = JSON.stringify(opinions.map((o, i) => ({ role: COUNCIL_ROLE_AGENTS[i].role, score: o.score, verdict: o.verdict, comments: o.comments })));
    const res = await client.chatCompletion([
      { role: 'system', content: '你是顶会高级领域主席（Senior Area Chair），负责综合五位独立审稿人的意见做出 Meta-Review。需识别意见分歧点并给出优先级排序。只输出一个合法 JSON 对象（禁止 Markdown 围栏与多余文字）：{"decision": "Accept|Weak Accept|Borderline|Revision 之一", "total_score": 1-10 分, "summary": "150 字以内合议结论，先结论后依据，点名分歧与风险", "priorities": [{"level": "P0|P1|P2", "item": "100 字以内可执行修改事项"}]}，priorities 为 2-5 条' },
      { role: 'user', content: `【论文标题】${ctx.title}\n【摘要】${ctx.abstract}\n【五位审稿人意见】${opinionBrief}` },
    ], { temperature: 0.2, max_tokens: 2000 });
    const parsed = extractReviewFields(res.text);
    if (!parsed || !parsed.summary) return fallbackMeta;
    return {
      decision: REVIEW_DECISIONS[String(parsed.decision || '').trim().toLowerCase()] || fallbackMeta.decision,
      total_score: clampScore(parsed.total_score, avg),
      summary: String(parsed.summary).slice(0, 400),
      priorities: Array.isArray(parsed.priorities)
        ? parsed.priorities.slice(0, 5)
          .map((p) => ({ level: ['P0', 'P1', 'P2'].includes(String(p.level)) ? String(p.level) : 'P1', item: String(p.item || '').slice(0, 120) }))
          .filter((p) => p.item)
        : [],
      mode: 'live',
    };
  } catch (error) {
    console.warn('[ScienceX Council] 主席合议真实调用失败，回退确定性结论:', error.message);
    return fallbackMeta;
  }
}

router.get('/review/reports', auth, (req, res) => {
  const items = store.reviewReports.filter((report) => {
    const manuscript = store.manuscripts.find((item) => item.id === report.manuscript_id);
    return canAccess(store.projects.find((project) => project.id === manuscript?.project_id), req.user.id);
  });
  ok(res, { items });
});

/** 由已解析文献创建评阅稿件：前端先走 /documents/upload（72MB 限额），再以 doc_id 建稿，避免二次传文件 */
router.post('/review/manuscripts', auth, asyncHandler(async (req, res) => {
  const { document_id, title } = req.body || {};
  const doc = store.documents.find((d) => d.id === document_id && canAccess(d, req.user.id));
  if (!doc) return errors.notFound(res, '文档不存在，请先上传论文文档');
  const msTitle = String(title || doc.title || '未命名稿件').slice(0, 200);
  const sections = doc.structured?.sections || [];
  const content = [
    `# ${msTitle}`,
    doc.abstract ? `## Abstract\n${String(doc.abstract).slice(0, 4000)}` : '',
    ...sections.map((s) => `## ${s.title}\n${(s.paragraphs || []).join('\n\n')}`),
  ].filter(Boolean).join('\n\n');
  if (!content.trim()) return errors.param(res, '文档未能提取到正文内容');
  const manuscript = {
    id: store.id('ms'),
    project_id: doc.project_id || 'p1',
    title: msTitle,
    status: 'draft',
    language: 'en',
    version: 1,
    words: content.length,
    updated_at: store.now(),
    content,
    source_document_id: doc.id,
  };
  store.manuscripts.unshift(manuscript);
  await store.persist();
  ok(res, { id: manuscript.id, title: manuscript.title, words: manuscript.words }, '已从上传文档创建评阅稿件');
}));

router.post('/review/council', auth, asyncHandler(async (req, res) => {
  const { manuscript_id } = req.body || {};
  const ms = store.manuscripts.find((m) => m.id === manuscript_id && canAccess(store.projects.find((project) => project.id === m.project_id), req.user.id));
  if (!ms) return errors.notFound(res, '稿件不存在');

  // 自建实时任务：区别于 createTask 的时间模拟推进，本任务的 progress/agent 事件随五个 Agent 真实调用完成度实时发出
  const task = { id: store.id('task'), owner_id: req.user.id, type: 'review', status: 'running', percent: 0, stage: COUNCIL_STAGES[0], stages: COUNCIL_STAGES, created_at: store.now(), result: null, error: null, listeners: [], event_seq: 0, events: [] };
  store.tasks.set(task.id, task);
  const emitAgent = (data) => {
    const entry = { id: ++task.event_seq, event: 'agent', data: { task_id: task.id, ...data } };
    task.events.push(entry);
    if (task.events.length > 1000) task.events.shift();
    [...task.listeners].forEach((fn) => fn(task, entry));
  };
  ai.publishTaskEvent(task, 'progress');

  (async () => {
    try {
      const abstractMatch = String(ms.content || '').match(/##\s*Abstract\s*([\s\S]*?)(?=\n##\s|$)/i);
      const ctx = {
        title: ms.title,
        abstract: (abstractMatch ? abstractMatch[1] : String(ms.content || '').slice(0, 600)).trim(),
        excerpt: String(ms.content || '').slice(0, 3500),
      };
      task.percent = 8;
      ai.publishTaskEvent(task, 'progress');
      await ai.sleep(500); // 解析阶段可视化（与前端进度节点对齐）

      let client = null;
      try {
        client = await gateway.createClient(COUNCIL_MODEL, req.user.id);
      } catch (error) {
        console.warn('[ScienceX Council] DeepSeek V4.1 Flash 客户端创建失败，全程回退示例意见:', error.message);
      }
      task.stage = COUNCIL_STAGES[1];
      ai.publishTaskEvent(task, 'progress');
      for (const agent of COUNCIL_ROLE_AGENTS) emitAgent({ agent: agent.key, role: agent.role, status: 'running' });

      let finished = 0;
      const opinions = await Promise.all(COUNCIL_ROLE_AGENTS.map(async (agent, index) => {
        const opinion = await runRoleAgent(client, ctx, agent);
        // 回退路径本地瞬时完成：错峰发出事件，让前端可视化保留并行评审的节奏感
        if (!client) await ai.sleep(600 + index * 260);
        finished += 1;
        emitAgent({ agent: agent.key, role: agent.role, status: opinion.mode === 'live' ? 'done' : 'fallback', score: opinion.score, comments: opinion.comments });
        task.percent = 10 + Math.round((finished / COUNCIL_ROLE_AGENTS.length) * 62);
        ai.publishTaskEvent(task, 'progress');
        return opinion;
      }));

      task.stage = COUNCIL_STAGES[2];
      task.percent = 84;
      ai.publishTaskEvent(task, 'progress');
      const meta = await runChairAgent(client, ctx, opinions);

      task.stage = COUNCIL_STAGES[3];
      task.percent = 95;
      ai.publishTaskEvent(task, 'progress');
      const scores = {};
      COUNCIL_ROLE_AGENTS.forEach((agent, i) => { scores[agent.key] = opinions[i].score; });
      scores.overall = meta.total_score;
      const report = {
        id: store.id('rv'),
        manuscript_id: ms.id,
        decision: meta.decision,
        created_at: store.now(),
        scores,
        roles: COUNCIL_ROLE_AGENTS.map((agent, i) => ({ role: agent.role, score: opinions[i].score, verdict: opinions[i].verdict, comments: opinions[i].comments })),
        conflicts: [],
        priorities: meta.priorities,
        summary: meta.summary,
        mode: (client && (meta.mode === 'live' || opinions.some((o) => o.mode === 'live'))) ? 'live' : 'fallback',
      };
      store.reviewReports.unshift(report);

      task.percent = 100;
      task.result = { report_id: report.id, decision: report.decision, scores: report.scores, mode: report.mode };
      task.status = 'done';
      await store.persist();
      ai.publishTaskEvent(task, 'done');
    } catch (error) {
      task.status = 'failed';
      task.error = '评审任务执行失败';
      require('../lib/logger').getLogger().error({ event: 'council_task_failed', task_id: task.id, err: error });
      ai.publishTaskEvent(task, 'error');
    }
  })();

  ok(res, { task_id: task.id, model: COUNCIL_MODEL }, '评审团已组建，5 位 Agent 并行评审中');
}));

router.get('/review/reports/:id', auth, (req, res) => {
  const report = store.reviewReports.find((r) => {
    if (r.id !== req.params.id) return false;
    const manuscript = store.manuscripts.find((item) => item.id === r.manuscript_id);
    return canAccess(store.projects.find((project) => project.id === manuscript?.project_id), req.user.id);
  });
  if (!report) return errors.notFound(res, '报告不存在');
  ok(res, report);
});

/* ---------- 项目管理 REQ-PRJ-01 ---------- */
router.get('/projects', auth, (req, res) => {
  const items = store.projects.filter((project) => canAccess(project, req.user.id));
  ok(res, { items, total: items.length });
});

router.post('/projects', auth, (req, res) => {
  const { name, type = 'research', description = '' } = req.body || {};
  if (!name) return errors.param(res, '项目名称不能为空');
  const project = {
    id: store.id('p'), name, type, description, status: 'active', owner_id: req.user.id, team_id: null,
    progress: { topic: 0, literature: 0, experiment: 0, analysis: 0, writing: 0, submission: 0 },
    created_at: store.now(), stats: { documents: 0, experiments: 0, charts: 0, manuscripts: 0 },
  };
  store.projects.unshift(project);
  ok(res, project, '项目已创建');
});

router.get('/projects/:id', auth, (req, res) => {
  const project = store.projects.find((p) => p.id === req.params.id && canAccess(p, req.user.id));
  if (!project) return errors.notFound(res, '项目不存在');
  const docs = store.documents.filter((d) => d.project_id === project.id).map(({ structured, ...m }) => m);
  const exps = store.experiments.filter((e) => e.project_id === project.id);
  const charts = store.charts.filter((c) => c.project_id === project.id);
  const ms = store.manuscripts.filter((m) => m.project_id === project.id);
  ok(res, { ...project, documents: docs, experiments: exps, charts, manuscripts: ms });
});

router.delete('/projects/:id', auth, (req, res) => {
  const idx = store.projects.findIndex((p) => p.id === req.params.id && canAccess(p, req.user.id));
  if (idx < 0) return errors.notFound(res, '项目不存在或无权删除');
  const removed = store.projects.splice(idx, 1)[0];
  ok(res, { id: removed.id, name: removed.name }, '项目已删除');
});

/* ---------- 课题组 REQ-PRJ-01 ---------- */
router.get('/teams', auth, (req, res) => {
  const items = store.teams
    .filter((team) => canAccessTeam(team, req.user.id))
    .map((team) => ({ ...team, members: team.members.map(({ email, ...member }) => member) }));
  ok(res, { items });
});

router.post('/teams/:id/members', auth, (req, res) => {
  const team = store.teams.find((t) => t.id === req.params.id && canManageTeam(t, req.user.id));
  if (!team) return errors.notFound(res, '课题组不存在');
  const { email, role = 'member' } = req.body || {};
  if (!email) return errors.param(res, '成员邮箱不能为空');
  const member = { user_id: store.id('u'), name: email.split('@')[0], role, joined_at: store.now() };
  team.members.push(member);
  team.member_count = team.members.length;
  ok(res, member, `已向 ${email} 发送邀请（演示环境直接加入）`);
});

router.delete('/teams/:id/members/:uid', auth, (req, res) => {
  const team = store.teams.find((t) => t.id === req.params.id && canManageTeam(t, req.user.id));
  if (!team) return errors.notFound(res, '课题组不存在');
  const idx = team.members.findIndex((m) => m.user_id === req.params.uid);
  if (idx >= 0) team.members.splice(idx, 1);
  team.member_count = team.members.length;
  ok(res, {}, '成员已移除');
});

module.exports = { router };
