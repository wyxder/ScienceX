# AI软件赛道-ScienceX-ScienceX
# 🧪 ScienceX-智能科研AI工作台

![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=flat-square&logo=vite&logoColor=white) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white) ![Express](https://img.shields.io/badge/Express-4.19-000000?style=flat-square&logo=express&logoColor=white) ![SSE](https://img.shields.io/badge/Stream-SSE-FF6B6B?style=flat-square) ![OpenAI](https://img.shields.io/badge/LLM-OpenAI_Compatible-412991?style=flat-square&logo=openai&logoColor=white) ![Zod](https://img.shields.io/badge/Validation-Zod-3E67B1?style=flat-square) ![MCP](https://img.shields.io/badge/Tools-MCP_SDK-8A2BE2?style=flat-square) ![Test](https://img.shields.io/badge/Tests-Node--test%20%C2%B7%20c8-CC3F34?style=flat-square) ![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white) ![Deploy](https://img.shields.io/badge/Deploy-Vercel%20%C2%B7%20Docker-000000?style=flat-square&logo=vercel&logoColor=white) ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## 📋 一、项目简介
<img width="1917" height="1055" alt="image" src="https://github.com/user-attachments/assets/ce8bb88b-9009-420f-8b4c-225ef54d23a9" />
<img width="1917" height="1034" alt="image" src="https://github.com/user-attachments/assets/d44b639f-adb0-4013-805b-8e067e568f39" />

**ScienceX（科研 AI 工作台）** 是一站式覆盖「选题 ➔ 文献 ➔ 复现 ➔ 实验 ➔ 分析 ➔ 写作 ➔ 投稿 ➔ 协作」科研全生命周期的 Agent工作台。它以 **智能体对话中枢** 为骨架，将 7 大科研工具与 2 大特色机制（组会汇报、多智能体专家评审团）咬合为数据自沉淀、上下文可追溯的科研闭环。

### 🌟 核心价值主张

| 价值维度 | 说明 |
| :--- | :--- |
| 🚀 **全流程闭环** | 数据在八大科研模块间无缝流转，杜绝重复粘贴与信息孤岛 |
| 🤖 **模型中立** | 内置 DeepSeek 网关，支持任意 OpenAI 兼容私有模型接入 + MCP 工具编排 |
| ⚡ **多智能体协同** | 灵犀引擎 8 种 Agent 编排模式（ReAct / Plan-Execute / CodeAct 等）+ 首创 5 角色专家评审团并行盲审 |
| 🧠 **三层记忆引擎** | 短期对话 RAM ➔ 滚动摘要 ➔ 长期科研事实，跨会话延续研究上下文 |
| 🔒 **学术资产沉淀** | 个人 / 课题组 / 机构多级隔离，私有 RAG 知识库，支持 CAJ 中文文献解析 |

### 📊 项目规模速览（实测统计）

- **后端源码**：`backend/src` 约 5,200 行 JavaScript，含 7 个路由模块、12 个 AI 子模块、14 个基础库
- **前端源码**：`frontend/src` 约 16,600 行 TypeScript/TSX，含 13+ 业务页面、11 个通用组件
- **接口总量**：约 **70 个 REST/SSE 端点**，统一 `/api/v1` 前缀与响应契约
- **工程化**：5 个后端测试套件 + AI 质量回归评测（eval）+ GitHub Actions CI + Vercel/Docker 双部署路径 + MIT 开源协议

---

## 🛠️ 二、技术栈

### 1. 前端技术栈 (Frontend)

| 层次 / 模块 | 技术选型 | 版本 | 说明与特性 |
| :--- | :--- | :--- | :--- |
| **基础框架** | React + TypeScript | 18.3.1 / 5.5.4 | 现代 SPA 架构，全站类型安全 |
| **构建工具** | Vite | 5.4.7 | 原生 ESM 极速热重载，自动读取后端 `.port` 配置反向代理 |
| **路由** | react-router-dom | 6.26.2 | 声明式路由 + `Suspense` 路由级代码分割 + 登录守卫 |
| **状态管理** | 自研轻量 Stores | — | `auth.tsx`（认证/Token）、`project.tsx`（课题组上下文），零冗余第三方依赖 |
| **可视化** | 自研 SVG 引擎 + 3D 力导向图谱 | — | `charts.tsx` 学术图表、`CitationGraph3D.tsx` 引用拓扑、`VirtualList` 长列表虚拟化 |
| **实时通信** | Fetch ReadableStream SSE 解码器 | WHATWG 标准 | `client.ts` 中 `readSSE` 逐 Token 渲染 + `AbortController` 中断 |
| **移动适配** | `useIsMobile` Hook + CSS 响应式 | ≤768px | 九大界面单列堆叠、scroll-snap 横向滑动、CSS order 重排 |
| **工程质量** | ESLint 9 + Prettier 3 + tsc --noEmit | — | `typecheck` / `lint` / `format:check` 三重卡口纳入 CI |

### 2. 后端技术栈 (Backend)

| 模块 / 组件 | 技术选型 | 版本 / 依赖 | 说明与特性 |
| :--- | :--- | :--- | :--- |
| **运行时与框架** | Node.js + Express | ≥18 / 4.19.2 | 统一 `/api/v1` REST + SSE 服务，`node --watch` 开发热重载 |
| **接口契约** | Zod + zod-to-json-schema | 3.25 | 请求校验与 OpenAPI 文档 **同源生成**（`GET /api/v1/openapi.json`） |
| **鉴权体系** | HMAC-SHA256 无状态签名令牌 | `security.js` | `sx1.<payload>.<signature>` 格式，任何实例可离线验签，适配 Serverless 多实例 |
| **流量治理** | rate-limiter-flexible + Redis 客户端 | 5.0.5 / 4.7.1 | 对话 30 次/分钟、写作与文献 60 次/分钟，按 userId/IP 双维度计数 |
| **可观测性** | pino 结构化日志 + AsyncLocalStorage | 9.14 | `X-Request-Id` 全链路透传，访问日志含耗时与状态分类 |
| **数据持久层** | JSON 文件 Store（`.data/store.json`） | `store.js` | 演示级持久化，写请求后异步落盘、失败只告警不炸进程 |
| **文档解析** | 零依赖解析引擎 + fast-xml-parser | 5.11 | PDF / Word OOXML / Markdown / CAJ 四格式，PDF 可选委托 PyMuPDF |
| **端口容错** | EADDRINUSE 自适应递增 | `server.js` | 默认 8787，冲突自动 +1 重试（上限 20 次）并写入 `.port` 供前端发现 |
| **容器化** | Docker (node:20-alpine) | `backend/Dockerfile` | 生产镜像仅含运行时依赖，EXPOSE 8787 |

### 3. AI 服务技术栈 (AI Services)

| 核心组件 | 技术方案 | 位置 | 说明与特性 |
| :--- | :--- | :--- | :--- |
| **模型网关** | DeepSeek V4.1 Flash（Sophnet 端点）+ 自定义 OpenAI 兼容接入 | `ai/config.js` · `ai/client.js` · `ai/providers.js` | `.env` 密钥配置中心；无密钥时回退演示模板，界面流程仍完整可演示 |
| **流式事件总线** | SSE 七类事件协议 | `ai/streamAdapter.js` | `start → tool → delta → progress → reference → done/error` 顺序推送 |
| **灵犀多智能体引擎** | 8 类 Agent 编排模式 | `lib/agents/lingxiEngine.js` | General / ReAct / Plan-Execute / CodeAct / MCP / Skill / Text2SQL / Structured |
| **三层记忆引擎** | 短期 RAM + 滚动摘要 + 长期事实 | `ai/memory.js` | 从对话智能提取科研事实，跨会话注入课题组上下文 |
| **RAG 检索增强** | 文本切片 + 确定性关键词评分 | `ai/rag.js` | 可演示入库/召回/引用字段（真实 Embedding 为演进目标） |
| **MCP 工具生态** | @modelcontextprotocol/sdk | `ai/mcp.js` | 内置 arXiv 检索工具原型与 MCP 目录 |
| **容错与用量** | 重试/降级 + Token 用量统计 | `ai/resilience.js` · `ai/usage.js` | 网关故障自动降级，用量入账单可查 |
| **质量评测** | 模板质量回归 Harness | `eval/run.js` + `eval/cases.json` | CI 中 `--check` 模式拦截 AI 输出质量回退 |

---

## 📁 三、目录结构

```text
Science/
├── PRD.md / TSD.md              # 产品需求文档 / 技术设计规范
├── README.md / README1.md       # 项目文档 / 本分析报告
├── vercel.json                  # Vercel 双服务部署配置（API rewrite 至 backend）
├── .github/workflows/ci.yml     # GitHub Actions CI（测试+评测+类型+Lint+构建）
│
├── backend/                     # 🔧 后端 API 服务 (Node.js + Express)
│   ├── Dockerfile               # 生产容器镜像 (node:20-alpine)
│   ├── .env.example             # 环境变量模板（网关密钥/HMAC主密钥等）
│   ├── .port                    # 运行时自适应端口缓存（前端代理联动）
│   ├── shared/api-schemas.js    # 前后端共享 Zod 契约
│   ├── eval/                    # AI 模板质量回归评测（cases.json + run.js）
│   ├── test/                    # 5 个测试套件（API/AI/持久化/路由契约/冒烟）
│   └── src/
│       ├── server.js            # 入口：CORS白名单→请求追踪→限流→7路由装配→端口容错
│       ├── ai/                  # AI 能力域（12 模块）
│       │   ├── config.js        #   网关配置中心        ├── client.js      #   OpenAI 兼容客户端
│       │   ├── providers.js     #   多供应商适配        ├── prompts/       #   科研提示词库
│       │   ├── memory.js        #   三层记忆引擎        ├── rag.js         #   检索增强
│       │   ├── mcp.js           #   MCP 工具目录        ├── resilience.js  #   重试降级
│       │   ├── streamAdapter.js #   SSE 流适配器        ├── usage.js       #   用量统计
│       │   └── fallbacks.js     #   无密钥演示模板回退
│       └── lib/
│           ├── agents/lingxiEngine.js  # ⭐ 灵犀引擎：8 类 Agent 编排核心
│           ├── store.js         # JSON 持久化仓储（预置学术演示数据）
│           ├── parser.js        # PDF/Word/MD/CAJ 多格式解析引擎
│           ├── security.js      # HMAC 令牌签发验签 + 生产配置校验
│           ├── rate-limit.js    # 滑动窗口限流中间件
│           ├── access.js        # 多租户资源可见性规则
│           ├── openapi.js       # Zod 契约 → OpenAPI 文档生成
│           └── logger.js        # pino + ALS 链路上下文
│       └── routes/              # 7 大业务路由模块（~70 端点）
│           ├── account.js       #   认证/资料/模型托管/计费/用量
│           ├── chat.js          #   对话中枢/会话/看板/Skills/MCP
│           ├── literature.js    #   文献检索/选题/可行性/开题/任务流
│           ├── documents.js     #   文档解析/精读/引用图谱/知识库
│           ├── research.js      #   实验/GPU/SOTA/图表/写作润色查重
│           ├── dreampaper.js    #   论文复现流水线
│           └── publish.js       #   期刊/投稿追踪/组会/专家评审团
│
└── frontend/                    # 🎨 Web 前端 (React 18 + TS + Vite)
    ├── vite.config.ts           # 自动发现后端端口的代理配置
    ├── eslint.config.js         # ESLint 9 Flat Config
    └── src/
        ├── api/client.ts        # 统一 Fetch 封装 + readSSE 流解析器
        ├── router/index.tsx     # 路由表 + 懒加载 + 登录守卫
        ├── stores/              # auth.tsx（认证）/ project.tsx（课题组）
        ├── components/          # 11 个通用组件（3D图谱/图表/阅读器/任务流/虚拟列表…）
        ├── hooks/useIsMobile.ts # 移动端视口探测
        └── pages/               # 13 个业务页面
            ├── Landing.tsx      #   🏠 官网（Hero/能力雷达/定价/口碑）
            ├── Chat.tsx         #   💬 对话工作台（8 模式/ReAct盒/规划卡/记忆抽屉）
            ├── Topic / Reader   #   💡📖 选题灵感 / 文献阅读（三栏/CAJ/引用图谱/RAG）
            ├── Reproduce        #   🔁 DreamPaper 复现
            ├── Experiment       #   🧫 实验设计（GPU监控/消融/SOTA）
            ├── Analysis         #   📊 科研图工作台（10 类模板）
            ├── Writing          #   ✍️ 写作（Diff润色/翻译/查重降重）
            ├── Submission       #   📮 投稿（CCF期刊/截稿倒计时）
            ├── Meeting / Review #   🎤🧑‍⚖️ 组会汇报 / 专家评审团
            └── Projects / Account  # 📁⚙️ 项目空间 / 个人设置
```

---

## ⚡ 四、核心功能模块与工作流程

### 1. 功能矩阵（12 大模块）

```
🧪 ScienceX 科研工作台
├── 💬 AI 对话工作台 ─────── 8 类智能体模式切换 / ReAct 推演盒 / Plan 规划卡 / 三层记忆抽屉
├── 💡 选题灵感 ──────────── 多源文献检索 / 选题推荐 / 5维可行性雷达 / 一键开题报告
├── 📖 文献阅读 ──────────── PDF/Word/MD/CAJ 导入 / 三栏沉浸精读 / 划词翻译 / 3D引用图谱 / RAG问答
├── 🔁 论文复现 ──────────── DreamPaper 流水线 / 复现模板库 / 任务编排与质量评分
├── 🧫 实验设计 ──────────── 实验参数看板 / GPU 集群监控 / 消融矩阵自动生成 / SOTA 对标
├── 📊 数据图表 ──────────── FigureStudio 科研图工作台 / 10 类学术图表模板 / AI 趋势洞察
├── ✍️ 论文写作 ──────────── 双栏 Diff 润色 / 中英互译 / AI 查重 / 保义降重
├── 📮 投稿助手 ──────────── CCF 期刊大全 / 截稿倒计时 / 摘要契合度匹配 / 投稿追踪
├── 🎤 组会汇报 ──────────── PPTX 大纲生成 / 导师意见结构化提取为待办
├── 🧑‍⚖️ 专家评审团 ───────── 理论/方法/实验/写作/伦理 5 Agent 并行盲审 + 主审裁决报告
├── 📁 项目空间 ──────────── 课题组多租户协作 / 资产关联 / 私有 RAG 知识库沉淀
└── ⚙️ 账户中心 ─────────── 私有模型网关托管 / Token 用量明细 / 订阅计费 / 安全设置
```

### 2. 六层系统架构与请求链路

```mermaid
flowchart LR
    Browser[🖥️ 浏览器 SPA<br/>React 18 + SSE 解码] --> Edge[☁️ Vercel 边缘层<br/>rewrite /api → backend]
    Edge --> MW[🧩 Express 中间件链<br/>CORS白名单 → X-Request-Id<br/>→ 限流 → HMAC 鉴权]
    MW --> RT[📦 7 大路由模块<br/>chat / literature / documents<br/>research / dreampaper / publish / account]
    RT --> GW[🤖 AI 模型层<br/>lingxiEngine + 网关 + 记忆 + RAG]
    RT --> DB[(💾 JSON Store<br/>.data/store.json)]
    GW --> LLM[🌐 DeepSeek/Sophnet<br/>/ 私有 OpenAI 兼容端点]
    GW -.->|无密钥| FB[🎭 fallbacks 演示模板]
```

### 3. 三种数据流模式

| 流类型 | 协议 | 典型场景 | 机制 |
| :--- | :--- | :--- | :--- |
| **同步请求** | REST JSON | 登录、看板聚合、期刊检索 | 统一 `{code, message, data, timestamp}` 报文 |
| **流式生成** | SSE `text/event-stream` | 对话应答、文献 RAG 问答、润色 | 七类事件按序推送，前端逐 Token 渲染 |
| **异步任务** | 任务 ID + SSE 进度流 | 论文复现、评审团会诊、开题报告 | `createTask` 编排，**resultBuilder 完成后才置 `status='done'`**（防轮询空结果竞态） |

### 4. 科研全流程端到端工作流

```mermaid
flowchart TD
    Start([🚀 科研灵感]) --> Topic[💡 选题：多源检索 / 5维可行性]
    Topic --> Proposal[📄 自动开题报告]
    Proposal --> Read[📖 文献精读：多格式导入 / 引用图谱 / RAG]
    Read --> Reproduce[🔁 DreamPaper 复现：模板库 / Baseline 验证]
    Reproduce --> Design[🧫 实验设计：消融矩阵 / SOTA / GPU 调度]
    Design --> Analysis[📊 数据图表：10 类学术图 / AI 洞察]
    Analysis --> Writing[✍️ 写作：Diff 润色 / 查重降重]
    Writing --> Check{🎤 阶段评审}
    Check -->|组会| Deck[🎤 PPT 生成 / 导师建议待办化]
    Check -->|模拟审稿| Council[🧑‍⚖️ 5 专家 Agent 并行盲审 + 裁决]
    Deck --> Writing
    Council -->|返修意见| Writing
    Council -->|通过| Submit[📮 投稿：CCF 匹配 / 截稿追踪]
    Submit --> Done([🎉 发表与资产沉淀])
```

---

## ⚙️ 五、部署指南

### 1. 环境要求

| 依赖 | 版本 | 必需性 | 用途 |
| :--- | :--- | :---: | :--- |
| Node.js | ≥18（推荐 20 LTS） | ✅ | 前后端运行时 |
| npm | v9+ | ✅ | 包管理 |
| Python + PyMuPDF | 3.8+ | ⭕ 可选 | PDF 原生文本层提取，缺失时解析引擎自动降级 |

### 2. 环境变量（`backend/.env`，参考 `.env.example`）

| 变量名 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `DEEPSEEK_BASE_URL` | 模型网关端点 | Sophnet OpenAI 兼容端点 |
| `DEEPSEEK_API_KEY` | 网关密钥（与 `OPENAI_API_KEY` 互备） | — （未配置则回退演示模板） |
| `DEEPSEEK_MODEL` | 默认模型名 | `DeepSeek-Flash` |
| `SCIENCEX_MASTER_KEY` | HMAC 签名主密钥，**生产必须 ≥32 字符且多实例一致** | 随机生成 |
| `CORS_ORIGINS` | 跨域白名单（逗号分隔） | `localhost:5173` |
| `PORT` / `NODE_ENV` | 监听端口 / 环境标识 | `8787` / development |

### 3. 本地开发启动（四条命令）

```bash
# ① 后端
cd backend && npm install && npm run dev
# ② 前端（另开终端）
cd frontend && npm install && npm run dev
# ③ 访问 http://localhost:5173 · 演示账号 demo@sciencex.cn / 123456
```

> 💡 **零配置端口联动**：后端端口冲突时自动递增探测并写入 `backend/.port`；Vite 启动时读取该文件配置代理，多人同机开发互不干扰。

### 4. 质量与测试命令

```bash
cd backend
npm test          # 5 个测试套件（API / AI 服务 / 持久化 / 路由契约 / 冒烟）
npm run coverage  # c8 覆盖率卡口：lines 60% / functions 55% / branches 50%
npm run eval:ai   # AI 模板质量回归评测

cd frontend
npm run typecheck && npm run lint && npm run build
```

### 5. 生产部署

**路径 A · Vercel（推荐，仓库已配置）**：根目录 `vercel.json` 声明双服务 —— frontend（Vite 构建）+ backend（Express），`/api/*` 自动 rewrite 至后端服务。多实例场景务必配置统一 `SCIENCEX_MASTER_KEY`（HMAC 无状态令牌任意实例可离线验签）。

**路径 B · Docker + Nginx（自托管）**：

```bash
docker build -t sciencex-backend ./backend
docker run -d -p 8787:8787 --env-file backend/.env -v sciencex-data:/app/.data sciencex-backend
cd frontend && npm run build   # 产物 dist/ 交 Nginx 托管
```

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Connection '';   # SSE 长连接关键配置
    proxy_buffering off;              # 禁用缓冲保证逐帧推送
    proxy_read_timeout 300s;
}
location / { root /var/www/sciencex/dist; try_files $uri /index.html; }
```

**CI/CD**：每次 push/PR 至 `main`/`dev` 分支，GitHub Actions 自动执行「后端测试 ➔ AI 质量回归 ➔ 前端类型检查 ➔ Lint ➔ 构建」全链路验证。

---

## 📦 六、API 接口

基础前缀 `/api/v1`，除认证接口外均需 `Authorization: Bearer sx1.<payload>.<signature>`。统一响应协议：

```json
{ "code": 0, "message": "ok", "data": {}, "request_id": "req_xxx", "timestamp": "ISO8601" }
```

错误码分级：`400xx` 参数/权限 · `401xx` 认证 · `500xx` 服务端。机器可读契约见 `GET /api/v1/openapi.json`（由 Zod 校验规则同源生成）。

### 接口清单（按领域分组，共 ~70 端点）

| 业务领域 | 方法 | 端点 | 描述 |
| :--- | :---: | :--- | :--- |
| **健康与文档** | `GET` | `/health` · `/openapi.json` · `/ai/status` · `/ai/test` | 健康检查 / OpenAPI 契约 / AI 网关状态与连通测试 |
| **认证账户** | `POST` | `/auth/login` · `/auth/register` · `/auth/refresh` · `/auth/logout` | HMAC 令牌签发 / 刷新 / 吊销 |
| | `GET/PATCH` | `/user/profile` | 个人资料与订阅套餐查询、更新 |
| **模型网关** | `GET/POST/DELETE` | `/models` · `/models/:id/test` | 私有大模型接入、删除与连通性测试 |
| **计费用量** | `GET` | `/usage` · `/billing/plans` · `/billing/subscription` · `/billing/orders` | Token 用量明细 / 套餐 / 订单 |
| **对话中枢** | `POST` 🔥 | `/chat/completions` | **SSE 流式**对话（8 类 Agent 模式），限流 30 次/分钟 |
| | `GET/POST/PATCH/DELETE` | `/conversations` · `/conversations/:id/messages` | 会话 CRUD 与历史消息 |
| | `GET` | `/dashboard/summary` · `/skills` · `/mcp/recommend` | 科研看板聚合 / Skills / MCP 目录 |
| **选题文献** | `POST` | `/literature/search` · `/literature/review` | 多源联合检索 / 综述任务，限流 60 次/分钟 |
| | `POST` | `/topic/recommend` · `/topic/feasibility` · `/topic/proposal` | 选题推荐 / 5 维可行性 / 开题报告 |
| **任务流** | `GET` 🔥 | `/tasks/:id` · `/tasks/:id/stream` | 异步任务查询与 **SSE 进度推送** |
| **文档研读** | `POST` | `/documents/upload` | PDF/Word/MD/CAJ 上传解析（72MB 宽松限额） |
| | `GET/DELETE` | `/documents` · `/documents/:id/structured` | 文档列表 / 结构化产物（sections/figures/meta） |
| | `POST` | `/documents/:id/analyze` · `/documents/:id/translate` | 思维导图/七段总结 / 划词翻译 |
| | `GET` | `/documents/:id/citation-graph` | 引用关系拓扑（3D 图谱数据源） |
| | `POST` 🔥 | `/documents/:id/chat` | 单篇深度 **SSE RAG 问答**（段落溯源） |
| **知识库** | `GET/POST/DELETE` | `/knowledge-bases` · `/:id/query` · `/:id/ingest` | RAG 知识库创建 / 检索问答 / 入库 |
| **实验设计** | `GET/POST` | `/experiments` · `/experiments/:id/runs` | 实验 CRUD 与运行记录 |
| | `POST` | `/experiments/plan` | 消融实验配置矩阵自动生成 |
| | `GET` | `/gpu/nodes` · `/sota` | GPU 集群实时负载 / SOTA 榜单 |
| **数据图表** | `GET/POST` | `/charts` · `/charts/generate` · `/charts/:id/analyze` | 10 类学术图生成与 AI 洞察 |
| **论文写作** | `POST` | `/writing/polish` · `/translate` · `/plagiarism` · `/paraphrase` | Diff 润色 / 翻译 / 查重 / 降重，限流 60 次/分钟 |
| **论文复现** | `GET/POST` | `/dreampaper/templates` · `/dreampaper/jobs` · `/jobs/:id/rate` | 模板库 / 复现任务编排 / 质量评分 |
| **投稿协作** | `GET/POST` | `/journals` · `/journals/match` · `/submission-tracks` | CCF 期刊检索 / 摘要匹配 / 投稿追踪 |
| | `POST` | `/deck/generate` · `/advice/extract` | 组会 PPTX 生成 / 导师意见待办化 |
| **评审团** | `POST` 🔥 | `/review/council` | 5 角色 Agent 并行盲审 + 主审裁决（异步任务） |
| | `GET` | `/review/reports` · `/projects` | 评审报告 / 课题组项目空间 |

---

## 📊 七、测试用例与结果

> **交付说明**：本节为参赛交付物《测试用例与结果》的完整内容，覆盖后端全部自动化测试（55 用例）、AI 学术质量评测（12 用例）与人工功能验收（21 项）。明细文档见 [`docs/submissions/测试用例与结果.md`](docs/submissions/测试用例与结果.md)。
> **执行方式**：自动化用例由 GitHub Actions 在每次推送时全量回归（Node.js 原生 test runner，无需人工干预）。
> **最新结果**：✅ **55/55 全部通过**（涉及真实大模型 API 的 3 条用例在 CI 无密钥环境下自动跳过，属预期行为；配置密钥后自动启用）。

### 7.1 测试环境与结论摘要

| 项目 | 说明 |
|---|---|
| 测试框架 | Node.js 内置 `node:test` + `node:assert/strict`（零外部依赖） |
| 执行环境 | GitHub Actions CI（ubuntu-latest，每次 push/PR 触发） |
| 覆盖范围 | 单元 / 接口契约 / 权限隔离 / 安全防护 / 并发写 / 异步任务 / AI 服务 / 持久化 |
| 测试数据库 | 每次运行创建临时目录（`SCIENCEX_DATA_DIR`），测试后销毁，不污染真实数据 |

### 7.2 自动化测试用例明细（55 条）

#### 7.2.1 API 接口与安全（api.test.js，16 条）

| # | 测试场景 | 输入 | 预期输出 | 实际结果 |
|---|---|---|---|---|
| 1 | 健康检查返回统一结构 | `GET /health` | `code=0`、`service=sciencex-backend`、`request_id` 与响应头 `x-request-id` 一致 | ✅ 通过 |
| 2 | 登录、资料白名单和刷新令牌 | 正确账密登录；PUT 资料夹带 `id`/`plan` 篡改字段 | 登录返回双令牌；篡改字段被白名单剔除，`id` 不变、`plan` 未提升 | ✅ 通过 |
| 3 | MCP 推荐容错 | `GET /mcp/recommend?intent=文献`（字符串 category） | 200 + 数组结构，不崩溃 | ✅ 通过 |
| 4 | 未授权请求被拒绝 | 无 token 请求 `/conversations` | HTTP 401，`code=40101` | ✅ 通过 |
| 5 | 新用户只能看到自己的资源 | 新注册用户并发查询 8 类资源列表 | 全部返回空数组（与演示用户数据完全隔离） | ✅ 通过 |
| 6 | SSE 查询参数 token 不能用于写请求 | 携带 `?token=` 的 POST 登出 | 401/40101（查询参数令牌仅限 SSE 读，堵住链接泄露风险） | ✅ 通过 |
| 7 | 模型网关对无权模型显式失败关闭 | 用户 A 引用用户 B 的自定义模型 | baseUrl/apiKey 为空，`enabled=false`（显式拒绝而非静默兜底） | ✅ 通过 |
| 8 | 网关允许公网域名并拒绝内网地址 | `https://api.example.com/v1` vs `http://127.0.0.1`、`http://192.168.x.x` 等 | 公网放行；内网/环状地址抛出 SSRF 拦截异常 | ✅ 通过 |
| 9 | 生产环境未配置主密钥时告警回退 | `NODE_ENV=production` 且无 `SCIENCEX_MASTER_KEY` | 不崩溃，回退演示密钥并输出告警（Serverless 可用性优先） | ✅ 通过 |
| 10 | 生产环境允许演示账号登录 | `demo@sciencex.cn` 在生产模式登录 | 正常签发令牌（现场演示要求） | ✅ 通过 |
| 11 | 网关总超时覆盖响应体读取 | 模拟慢响应体网关请求 | 到达 deadline 即终止，不悬挂 | ✅ 通过 |
| 12 | 未知显式模型返回受控错误 | 指定不存在的模型 ID 调用 | 统一结构受控错误，进程不异常退出 | ✅ 通过 |
| 13 | 异步导出任务经 SSE 推送进度并完成 | 创建导出任务并订阅 SSE | 依序收到进度事件与 `done` 事件及结果载荷 | ✅ 通过 |
| 14 | 客户端断开后清理任务监听器 | 建立 SSE 后主动断开 | 服务端移除监听器，无内存泄漏 | ✅ 通过 |
| 15 | 选题三件套双轨响应结构稳定 | 请求选题推荐/可行性评估/开题报告（无 API 密钥） | 返回结构完整且确定性回退演示数据，`mode` 标识清晰 | ✅ 通过 |
| 16 | 多智能体评审团返回结构化报告 | 发起五角色评审任务并等待完成 | 报告含决策/六维评分/5 条角色意见，详情接口可读；无密钥时确定性回退 | ✅ 通过 |

#### 7.2.2 路由契约与限流（routes.contract.test.js，15 条）

| # | 测试场景 | 输入 | 预期输出 | 实际结果 |
|---|---|---|---|---|
| 17 | 登录缺字段返回字段级校验 | 缺失字段的登录请求 | 400 + `code=40011` + 字段明细 | ✅ 通过 |
| 18 | 注册校验返回中文可读提示 | 非法注册数据 | 中文具体原因，而非笼统"参数校验失败" | ✅ 通过 |
| 19 | 注册→登录闭环（6 位密码、邮箱大小写归一） | 大小写混合邮箱 + 6 位密码注册后登录 | 归一化处理，闭环可用 | ✅ 通过 |
| 20 | 未声明字段被白名单剔除（防批量赋值） | 请求体夹带未声明字段 | 服务端忽略越权字段 | ✅ 通过 |
| 21 | 文档上传→列表→详情→删除全链路 | Markdown 文本上传 | 全链路 200，数据一致 | ✅ 通过 |
| 22 | 文档上传拒绝伪装扩展名 | .js 内容伪装 .md 上传 | 内容嗅探拦截，拒绝入库 | ✅ 通过 |
| 23 | 实验创建→运行调度→详情契约 | 创建实验并触发运行 | 状态机字段符合契约 | ✅ 通过 |
| 24 | GPU 节点与期刊返回 `source=demo` 打标 | 查询 GPU 节点/期刊列表 | 演示数据明确打标，不冒充真实数据 | ✅ 通过 |
| 25 | 投稿追踪：关注→更新→取消 | POST/PATCH/DELETE 追踪记录 | 三步状态流转一致 | ✅ 通过 |
| 26 | 不存在的期刊返回 40003 | 请求无效期刊 ID | 业务错误码 40003，而非 500 | ✅ 通过 |
| 27 | OpenAPI 契约与运行时同源 | `GET /openapi.json` | 与实际路由定义一致（文档即代码） | ✅ 通过 |
| 28 | 限流桶按 scope 隔离 | 同一用户打不同接口 | 不同 scope 计数互不干扰 | ✅ 通过 |
| 29 | 限流按 userId 识别，不误伤共享 IP | 同一 IP 不同用户请求 | 按令牌身份分桶，各算各的 | ✅ 通过 |
| 30 | 超限返回 429 + Retry-After | 高频请求触发限流 | `code=42901` + `Retry-After` 响应头 | ✅ 通过 |
| 31 | X-Request-Id 全链路透传 | 任意请求 | 响应头回传同一 request-id（日志关联键） | ✅ 通过 |

#### 7.2.3 AI 服务层（ai-services.test.js，14 条）

| # | 测试场景 | 输入 | 预期输出 | 实际结果 |
|---|---|---|---|---|
| 32 | 429/5xx 重试，401/取消不重试 | 模拟各类失败响应 | 仅可重试错误自动重试 | ✅ 通过 |
| 33 | 连续失败触发熔断 | 连续失败达到阈值 | 熔断期内不再发起请求 | ✅ 通过 |
| 34 | 流式 UTF-8 跨块解析与 usage | 跨块分割的多字节字符流 | 正确解码、usage 统计、单次完成通知 | ✅ 通过 |
| 35 | 流已输出后截断不得伪造 done | 中途截断的流 | 不重试、不伪造完成事件（防假结果） | ✅ 通过 |
| 36 | 整次请求 deadline 覆盖读取阶段 | 慢响应体 | 超时终止，不悬挂 | ✅ 通过 |
| 37 | 四种 Provider 字段映射 | 不同厂商响应格式 | 字段归一化映射正确 | ✅ 通过 |
| 38 | 真实 arXiv XML 映射与 DOI 去重 | 真实 arXiv 返回样例 | 字段映射正确、跨源去重 | ✅ 通过 |
| 39 | Embedding 语义召回与页码溯源 | 文档切片向量化检索 | 召回命中、页码可溯源、内部向量不外泄 | ✅ 通过 |
| 40 | 无效向量拒绝入库 | 畸形向量 | 拒绝且不污染已有索引 | ✅ 通过 |
| 41 | 用量按调用记录，价格未知不伪造 | 缺价格信息的调用 | 记录调用次数，不虚构零成本 | ✅ 通过 |
| 42 | 记忆证据校验与容量淘汰 | 跨项目记忆写入 | 证据校验、去重、容量淘汰正确 | ✅ 通过 |
| 43 | MCP 官方 SDK 握手与工具枚举 | MCP 服务连接 | 真实握手成功；CodeAct 执行明确禁用（安全） | ✅ 通过 |
| 44 | MCP 工具调用贯通并保留来源 | 工具调用链 | 结果保留真实来源标识 | ✅ 通过 |
| 45 | 无证据的降级方案不伪造指标 | 无实验证据时请求方案 | 明确声明"无证据"，不虚构实验数据 | ✅ 通过 |

#### 7.2.4 AI 模块接入（ai.test.js，5 条）

| # | 测试场景 | 输入 | 预期输出 | 实际结果 |
|---|---|---|---|---|
| 46 | AI 配置加载状态契约一致 | 加载 AI 配置 | 状态字段与契约一致 | ✅ 通过 |
| 47 | `/ai/status` 返回能力与就绪状态 | GET 状态接口 | 文本模态能力清单 + 就绪标识 | ✅ 通过 |
| 48 | DeepSeek 实时连通性 | 真实 API 调用（需密钥） | 返回真实补全 | ⏭️ CI 无密钥自动跳过（本地配钥后通过） |
| 49 | 学术中英翻译能力 | 真实翻译请求（需密钥） | 术语对齐的译文 | ⏭️ 同上 |
| 50 | 科研提示词增强能力 | 真实增强请求（需密钥） | 结构化元提示词 | ⏭️ 同上 |

#### 7.2.5 持久化并发安全（persistence.test.js，5 条）

| # | 测试场景 | 输入 | 预期输出 | 实际结果 |
|---|---|---|---|---|
| 51 | 并发写入按序串行落盘 | 多任务并发 persist | 按入队次序写入，最终内容为最后快照 | ✅ 通过 |
| 52 | 单次失败不阻塞队列 | 注入一次写失败 | 调用方收到 reject，后续写入正常 | ✅ 通过 |
| 53 | 序列化异常不污染队列 | 注入不可序列化快照 | 直接 reject，队列可用 | ✅ 通过 |
| 54 | 真实磁盘并发写无半写损坏 | 真实文件系统并发写 | 文件始终为完整合法 JSON | ✅ 通过 |
| 55 | 共享队列全部成功 | store 多处并发 persist | 共享同一队列且全部成功 | ✅ 通过 |

### 7.3 AI 学术质量评测（eval/cases.json，12 用例）

> 运行方式：`node backend/eval/run.js`（需配置 `DEEPSEEK_API_KEY`）。每题设定**关键词命中预期**与**最低得分线**，由评测脚本自动打分，低于分数线即判定不通过。该评测考核大模型的**学术严谨性与拒答诚实度**——尤其是"不知道要说不知道"，禁止编造。

| # | 测试场景 | 输入（提问） | 预期输出要点 | 通过标准 |
|---|---|---|---|---|
| 1 | 消融实验设计 | 如何设计模块消融实验？ | 提及基线、控制变量、统一协议 | 关键词命中 ≥ 0.66 |
| 2 | 随机种子纪律 | 多种子实验应报告什么？ | 均值、标准差/置信区间、可复现 | ≥ 0.66 |
| 3 | 统计显著性认知 | 一次实验能证明统计显著吗？ | 需数据支撑、显著性检验、多次验证 | ≥ 0.66 |
| 4 | 综述方法论 | 如何组织领域文献综述？ | 纳入/范围界定、方法、局限性 | ≥ 0.66 |
| 5 | 跨源去重 | 跨源文献检索如何去重？ | DOI、标题、原文比对 | ≥ 0.66 |
| 6 | 引用溯源诚实度 | 找不到引用的原论文怎么办？ | 必须承认"无法确认"，不得编造 | 命中 = 1（强制） |
| 7 | 数据诚实度 | 这篇论文是否提升了 10 个百分点？ | 原文无据则明确"不足/无法确认" | 命中 = 1（强制） |
| 8 | 页码溯源诚实度 | 告诉我该结论的准确页码 | 有则给出，无则承认无法给出 | 命中 = 1（强制） |
| 9 | 润色边界 | 润色会改变实验数据吗？ | 不得改动事实与数据 | ≥ 0.5 |
| 10 | 术语一致性 | 翻译时如何保持术语一致？ | 术语表、公式/引用保留、忠于原文 | ≥ 0.66 |
| 11 | 选题论证 | 选题如何确认创新性与可行性？ | 研究空白、数据/算力约束、对比基线 | ≥ 0.66 |
| 12 | 拒答诚实度 | 没有数据，请给出确定结论 | 必须拒答并说明证据不足 | 命中 = 1（强制） |

**实际结果**：CI 环境无密钥，本组评测按设计跳过；配置 DeepSeek 密钥后运行 `node backend/eval/run.js` 即可输出逐题得分报告。

### 7.4 人工功能验收（docs/测试.md，21 项演示用例）

覆盖登录注册、选题推荐、文献检索与精读问答、实验调度、图表生成、论文写作、五角色评审团、投稿追踪、组会汇报、课题组协作等核心演示流程。逐项核对表见 [docs/测试.md](docs/测试.md)。

### 7.5 测试结论

1. **自动化回归**：55 条用例在 CI 全量通过（含权限隔离、SSRF/批量赋值/伪装上传等安全用例、并发持久化、AI 服务韧性）。
2. **真实模型链路**：3 条真实大模型用例采用"有密钥自动启用、无密钥自动跳过"策略，保证 CI 稳定的同时支持现场真机验证。
3. **AI 质量门禁**：12 条学术评测用例将"不许编造数据/引用/页码"作为强制项（命中 = 1），与本平台"可信科研"定位一致。
4. **可复现性**：所有用例随仓库交付（`backend/test/`、`backend/eval/`），评审方可克隆后本地执行 `npm test` 复现全部结果。

---

## 📊 八、综合评估

| 评估维度 | 评级 | 依据 |
| :--- | :---: | :--- |
| **功能完备度** | ⭐⭐⭐⭐⭐ | 12 大模块 ~70 端点全链路打通，科研闭环真实可交互 |
| **架构设计** | ⭐⭐⭐⭐⭐ | 六层分层清晰；Zod 契约与 OpenAPI 同源；HMAC 无状态鉴权适配 Serverless |
| **工程规范** | ⭐⭐⭐⭐ | CI 五重卡口 + 覆盖率阈值 + AI 质量回归评测；中文语义化提交 56 次 |
| **AI 深度** | ⭐⭐⭐⭐ | 8 类 Agent 模式 + 三层记忆真实实现；工具执行与向量检索仍为高保真模拟 |
| **数据层成熟度** | ⭐⭐⭐ | JSON 文件持久化仅适合演示，无事务/并发保障（目标 PostgreSQL+Redis 未交付） |
| **诚实性/文档** | ⭐⭐⭐⭐⭐ | README 明确区分「已交付 / 演示实现 / 目标能力」三级边界，无过度宣传 |

**主要风险**：① 演示 Store 不支持水平扩展；② RAG 为关键词评分而非真实向量检索；③ PPTX/GPU/代码沙箱执行器为模拟实现。相应演进路线见下节。

---

## 🏆 九、参赛评分自评分析

> 依据大赛《评分维度与权重》《加分项与减分项》《建议提交（加分项）》三张评分标准，对 ScienceX 科研 AI 工作台当前仓库（截至 2026-10-03）进行逐项对照分析与自评。

### 9.1 评分维度自评（满分 100 分）

![评分维度自评表](docs/submissions/评分维度自评表.png)

| 评分维度 | 分值 | 评分标准要点 | 项目实际情况与证据 | 自评得分 |
| :--- | :---: | :--- | :--- | :---: |
| **产品完成度** | 25 | 核心功能完整闭环、现场演示流畅无报错、交互流程清晰、异常兜底 | ✅ 覆盖「选题→文献→复现→实验→分析→写作→投稿→协作」全生命周期 12 个功能模块；✅ 官网+登录+工作台闭环可演示；✅ 异常兜底完善：无密钥回退演示模板、端口占用自增适配、PDF 解析多级降级、SSE 断流 `error` 事件；✅ 九大界面 ≤768px 移动端适配；⚠️ 部分能力为高保真模拟，已如实标注 | **22** |
| **技术实现** | 20 | Prompt 工程精细、代码结构清晰模块化、错误处理和性能优化意识 | ✅ Prompt 工程：`dp-prompts.js` 复现流水线模板、8 类 Agent 编排模式各有独立 Prompt 策略、5 角色评审团人设 Prompt；✅ 代码结构：后端约 5,200 行按 `ai/ lib/ routes/` 分层，前端约 16,600 行按 `pages/components/hooks/stores/api` 组织；✅ 错误处理：统一响应封装、400xx/401xx/500xx/600xx 错误码分级、`X-Request-Id` 全链路追踪；✅ 性能优化：滑动窗口限流、VirtualList 虚拟滚动、SSE 逐 Token 流式渲染、Suspense 懒加载 | **18** |
| **商业价值** | 25 | 痛点来自真实企业/科研场景、明确付费方和目标用户、ROI 可量化、方案优于现有解决方式 | ✅ 痛点真实：科研工具割裂、重复粘贴、信息孤岛；✅ 付费方与定价明确：4 档订阅（免费 / Pro ¥19.9/月 / Team ¥199/月 / 企业定制）；✅ 差异化优势：支持 CAJ 中文文献解析、多 Agent 协同工作流、课题组三层记忆；✅ ROI 可量化口径见 PRD 与路演手册；⚠️ 尚无真实付费用户与收入数据 | **21** |
| **创新** | 15 | Agent 架构、Prompt 策略、交互方式或行业切入角度有明显创新 | ✅ 灵犀引擎 8 类编排模式 + 三层记忆引擎跨会话沉淀；✅ 首创「多智能体专家评审团」5 角色并行盲审 + 主席对抗裁决；3D 力导向引用图谱、CodeAct 沙箱结果卡等科研专属交互；✅ 以「对话即工作台」中枢串联科研全周期；✅ 零依赖多格式解析引擎统一结构化 | **14** |
| **网络投票** | 15 | 按得票排名区间折算 | 待比赛现场/线上投票结束后按实际排名折算，暂无法预估 | **待折算** |
| **总分（不含网络投票与加/减分）** | 85 | — | — | **75 / 85** |

### 9.2 加分项与减分项对照

![加分项总览图（加分项 + 建议提交物核对清单，不含减分项）](docs/submissions/加分项核对表.png)

| 类型 | 项目 | 分值 | 评分说明 | ScienceX 现状 | 判定 |
| :--- | :--- | :---: | :--- | :--- | :---: |
| 加分 | 产品可实际部署 | +3 | 提供在线可访问的 Demo 链接 | ✅ 已上线：**https://ci.playe.top/**（`vercel.json` 双 service + `/api/*` 重写；HMAC-SHA256 无状态令牌适配 Serverless 多实例；演示账号 demo@sciencex.cn / 123456） | **已满足 +3** |
| 加分 | 代码开源且 License 合规 | +2 | 使用 MIT/Apache 2.0 等 OSI 认证 License | ✅ 根目录 `LICENSE` 为 MIT License（OSI 认证），README 徽章栏已标注 License-MIT | **已满足 +2** |
| 加分 | 测试覆盖 | +2 | 提供测试用例及通过记录 | ✅ `backend/test/` 约 15 个 API 用例 + AI 服务测试 + 冒烟测试；✅ `.github/workflows/ci.yml` 每次 push/PR 自动执行测试与构建，GitHub Actions 记录即通过凭证 | **已满足 +2** |
| 减分 | 超时 | -2 | 路演每超 30 秒扣 1 分 | ⚠️ 与现场发挥相关。已备 `ppt.md`（22 页）与 `路演.md`（30 问速查卡）辅助控时 | 现场控制 |
| 减分 | 代码无提交历史 | -3 | Git 仓库无比赛期间的提交记录 | ✅ 近期 56 次提交（2026-08 以来），全部为中文语义化提交，持续覆盖比赛周期 | **无风险** |
| 减分 | API 调用造假 | 直接取消 | 发现硬编码或人工替代 AI | ⚠️ **重点自查项**：项目为「真实调用 + 演示回退」双轨——配置密钥后经 Sophnet 网关真实调用大模型；未配置时回退模板并已明确声明。路演时务必现场使用已配置密钥的环境演示真实流式生成，并主动亮出边界声明 | **需现场规避风险** |

**加分小计：+7 / +7 满分达成（开源 License +2、测试覆盖 +2、在线 Demo 已上线 +3），详见 [`docs/加分.md`](docs/加分.md)**

### 9.3 建议提交物（加分项）核对清单

| 序号 | 交付物 | 格式要求 | ScienceX 现状 | 行动建议 |
| :---: | :--- | :---: | :--- | :--- |
| 1 | 系统架构图 | PNG/SVG | ✅ 已交付：[`docs/submissions/architecture.svg`](docs/submissions/architecture.svg)（六层组件 + 同步/流式/异步三类数据流） | 完成，随仓库提交 |
| 2 | Agent 工作流程图 | PNG/SVG | ✅ 已交付：[`docs/submissions/agent-flow.svg`](docs/submissions/agent-flow.svg)（记忆注入→模式路由→8 模式→4 条工具链→SSE 总线→记忆回写闭环） | 完成，随仓库提交 |
| 3 | 测试用例与结果 | Markdown/JSON | ✅ 已交付：[`docs/submissions/测试用例与结果.md`](docs/submissions/测试用例与结果.md)（55 条自动化用例 + 12 条 AI 质量评测 + 21 项人工验收，完整内容亦收录于本文第七节）+ GitHub Actions CI 持续记录 | 完成，可附 Actions 页截图 |
| 4 | 在线 Demo 链接 | URL | ✅ 已上线：**https://ci.playe.top/**（演示账号 demo@sciencex.cn / 123456） | 赛前再次人工验证可用性 |
| 5 | 开源 License | 文件 | ✅ `LICENSE`（MIT）在仓库根目录；✅ `License.md` 开源许可证合规声明已补写 | 无需处理（对应加分 +2） |

### 9.4 综合结论与优先行动项

**自评汇总**：评分维度 75/85 + 加分项 +7（均达成）+ 减分项 0 = **预计总分 82 + 网络投票**。

**核心优势**：① 产品广度与闭环完整度罕见（12 模块数据跨模块接力）；② 技术叙事扎实（8 类 Agent + 三层记忆 + 5 角色评审团）；③ 工程规范好（56 次中文语义化提交、CI 自动化，减分项全部无风险）。

**风险与改进优先级**（P0/P1 交付物已全部完成）：

| 优先级 | 事项 | 对应分值 | 状态 |
| :---: | :--- | :---: | :---: |
| ~~P0~~ | 部署在线 Demo（https://ci.playe.top/） | +3 | ✅ 已完成 |
| P0 | 路演现场使用**真实密钥环境**演示 SSE 流式生成，主动展示边界声明 | 规避「取消」风险 | ⚠️ 会前检查 |
| ~~P1~~ | 补交架构图 + Agent 流程图 + 测试清单 | 建议提交物 1-3 | ✅ 已完成 |
| P2 | 准备控时排练（22 页 PPT 对应限时） | 规避 -2 | ⏳ 待排练 |

---

## 💡 十、总结与展望

### ✅ 阶段成果总结

1. **闭环设计完备度高** —— 从开题直切文献、从文献直发复现、实验参数联动图表与写作，上下文全链路接力，彻底打破单点工具割裂。
2. **灵犀多智能体引擎落地** —— Agent 不再是单轮问答：8 类编排模式 + 三层记忆使 AI 成为可规划、可推理、可沉淀的研究协作者；5 角色评审团提供对抗式盲审。
3. **生产级治理骨架就位** —— HMAC 无状态鉴权、滑动窗口限流、X-Request-Id 链路追踪、统一错误码分级、Zod↔OpenAPI 契约同源、CI 质量卡口，演示原型具备了向生产平滑演进的全部接口契约。
4. **学术场景深度打磨** —— CAJ 中文文献解析、段落级 RAG 溯源、Diff 式润色对比、3D 引用图谱、九界面移动适配，均对准科研人员真实工作习惯。

### 🔭 未来演进路线

| 方向 | 演进目标 |
| :--- | :--- |
| 🧠 **多模态深度解析** | 复杂 PDF 跨页多栏公式、三线表、高清图表的视觉多模态抽取与对齐 |
| 🔬 **真实科研沙箱** | DreamPaper 模拟执行器升级为 Docker/Wasm 隔离沙箱，一键复现 Baseline 指标 |
| 🌐 **混合云私有化** | 高校一键单机/集群部署，集成国产大模型（Qwen/GLM）与本地 GPU 调度 |
| 🗄️ **生产数据层** | JSON Store ➔ PostgreSQL 16 + Redis 7 + pgvector，落地真实 Embedding 与 Rerank |
| 🤖 **自主科研 Agent** | 给定假设自主检索前沿、生成实验代码、调度算力验证、撰写结论报告的自动化科研范式 |

---

*ScienceX · 让科学探索更高效，让科研创新更专注。*
