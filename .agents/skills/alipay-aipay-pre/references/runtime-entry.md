# 支付宝 AI 付接入 Skill
## 支持范围

仅支持 AI 按量付费、AI 网页应用收款、AI 移动应用收款；“按量付费”“网站支付”“APP 支付”等旧称仅作输入别名，对客仍用新名称。明确要求当面付、付款码、订单码支付、JSAPI 支付、预授权支付或商家扣款时不得改判，按 `normal/rejection-guide.md` 受控拒绝。

AI 网页应用收款覆盖 PC 网页和手机浏览器/H5，接口固定 `alipay.trade.page.pay`，签约固定 `productType=webpay`、`salesCode=I1080300001000041203`、`appType=PC_WEB`；`PC_WEB` 不表示仅 PC。

## 执行红线

1. **流程与确认**：按 flow 顺序执行；阻塞确认只认用户对当前摘要的明确回复，不以工具超时、默认值或 Task 状态代替，不增未登记操作、材料或确认。
2. **事实与依据**：禁止编造配置、状态、结果或规则；无当前实现、实际返回或官方依据时说明无法确认。额度解限、可收款时间和产品开通问题用[支付宝商家平台](https://b.alipay.com/page/portal/home)，代码、应用创建和发布问题用[支付宝开放平台](https://open.alipay.com/)或[支付宝技术支持](https://opensupport.alipay.com/support/intelligent-services?form=payskill)。静态扫描或提交成功不等于完成。
3. **CLI/MCP 契约**：优先用动作处脚本；直调的完整方法和 JSON 仅来自已读文档或 `alipay-cli mcp list <server> --json` 实时 schema。遇到 `Server not found`、`Method not found`、`Invalid params` 立即停下核对，禁止试近似名称。
4. **联网权限**：`alipay-cli` 登录/MCP、上传、沙箱创建和下载按联网命令处理；支持显式授权时首次即申请，详见 `normal/alipay-cli-env.md`。
5. **用户文件**：只改已确认项目和范围，不清空或删除既有项目；“新建/重做/换一个”不是删除授权。具体删除仍遵守 Integration flow 的清单、二次确认和禁删边界。
6. **敏感信息**：应用公钥仅由用户生成并明确提供；禁止 Agent 请求/处理生产私钥、代为生成密钥对、补全/改写公钥或添加 PEM 头尾。预发版仅允许用户明确选择方案3后，按 Onboarding flow 打开随包的本地离线页面，由用户在浏览器内自行生成并保存密钥；禁止 Agent 点击生成、读取页面密钥、读取下载文件或把页面接入联网服务。敏感值、临时 URL 和沙箱资料遵守对应 flow/script 的白名单、权限和输出边界。
7. **沙箱结论**：真实快速沙箱配置不得用占位值，唯一例外是 AI 按量付费沙箱 `service_id=api_mock_service_id`，且生产禁用。`CREATE_PENDING|VERIFY_PENDING` 只允许继续代码实现，阻止字段使用、摘要、后置校验、联调和付款体验。字段校验不等于支付测试；仅完整 402 链路满足 flow 才可称沙箱测试通过。
8. **异步通知**：AI 网页应用收款/AI 移动应用收款必须实现通知。本地无公网 HTTPS `notify_url` 时可不传并以交易查询验收，公网通知联调列为人工待验证；生产上线前须恢复通知并完成验签、幂等、关键字段校验、`success` 回写和补偿查询，否则不宣称生产就绪。
9. **受控页面**：授权链接仅由 `auth.sh` 按固定产品/MCC 生成，只允许 `https://aipay.alipay.com/cli-auth` 及登记参数，禁用 CLI `verification_url`；公钥页和系统 opener 只走登记脚本。失败后宿主内置浏览器只可打开已交付的同一 URL 一次；仍失败才提示手动打开，再有限轮询。禁止搜索、改写或自动操作；opener/config 写失败不算业务失败。
10. **对客输出**：指定 runner/renderer/脚本时，stdout 是唯一对客正文，须原文回复且不加旁白；工具输出记录、折叠面板或日志不等于已对客发送。展示命令只执行登记单条命令，禁 `2>&1`、管道、`grep/sed/awk/tee`、临时包装或拆回 `jq/printf/renderer`。除 `self_update.mjs` 的 `SELF_UPDATE:*` stderr 终态外，内部事实行均以 `ALIPAY_AIPAY_INTERNAL:` 开头；宿主合并输出时仍整行剔除，严禁对客。`integration.start.confirm`、`onboarding.plan.confirm`、`sandbox.configuration.pending`、`sandbox.environment.summary`、`integration.safety.closeout` 和 `integration.checklist.result` 成功渲染时必须各自产生唯一 `ALIPAY_AIPAY_INTERNAL:CUSTOMER_MESSAGE_DELIVERY_REQUIRED=<messageId>`；下一动作先将剔除内部行后的 stdout 原文作为独立可见消息送达，不得以工具面板、折叠输出、进度话术或最终答复代替，也不得在送达前继续调用工具。送达后同回合按 flow 继续，不等待回复。成功沙箱准备 `READY` 时 stdout 仍按 flow 静默，不构成交付消息；只有待配置正文和后置摘要需要交付。所有 `postRenderHintType=scanReturn` 的页面消息都是交付屏障（当前为 `auth.page`、`application.key.page`）：先独立送达页面 stdout，再执行受控 opener 和有限轮询，不合并 pending/收口；不要求确认。阻塞正文后等待；剔除内部行后正文为空则直接转移。
11. **确定性转移**：固定脚本终态后立即转移；只执行动作处登记命令，禁止追加 `jq/cat/grep/curl` 或临时脚本重复解析。失败只走登记恢复；项目自检不绕过 Skill 脚本或打印敏感配置。

## 标准消息

`normal/json/customer-messages.json` 是稳定对客正文唯一目录。Integration 启动使用 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message start-confirm --root-intent "$ROOT_INTENT" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`，收口使用 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message checklist-result --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`；Onboarding 的 MCC、发现、材料、候选、收口及授权、公钥页、密钥工具、错误均用登记 runtime 动作。`process.partial_result` 必须发送 closeout 动作的完整 stdout，缺少 AI 网页应用收款上线关键点或收款限制引导即未送达。仅无托管入口时直调 renderer：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" render --schema <messageId> --variant <VARIANT> --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" render <messageId> --variant <VARIANT> --input-json "$MESSAGE_INPUT_JSON" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"
```

动态 JSON 只取本轮事实；无变量传 `{}`，禁止字符串替换或 `eval`。正常路径禁止预跑 `render --schema` 或用 `jq`/消息目录探测字段。renderer 返回 `MESSAGE_RENDER_ERROR` 时必须先复查同一 `messageId` + `variant` schema，禁止猜枚举；非 0 即停止，不手写兜底。

当前用户回复已展示的公钥获取方式时，先按 Onboarding flow Step 4 区分方式编号与应用选择；`1/2/3` 不作为 appId 或通用业务确认，加载对应 phase 后处理。该分流仍在既有用户输入计数和已授权会话采集之后，不增加计数或 stage。

阻塞点展示登记摘要后，把用户原始回复交给 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" reply confirm --reply "$USER_REPLY" --input-id "$USER_INPUT_ID" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`；仅唯一 `ALIPAY_AIPAY_INTERNAL:REPLY_DECISION=CONFIRMED` 可推进。`1`、`继续/继续推进`、`好了/已完成`、`确认/确定/同意`、`OK` 等明确肯定表达等价；否定、疑问、取消、修改或含糊回复不确认。确认只绑定当前产品、项目、主体、候选和摘要，任一变化即失效；此校验不新增操作点。

`<SKILL_DIR>` 是启动器确定的当前 Skill 规范化绝对路径占位符，不是 shell 变量。Skill 自有受控 Node、Shell 和 Python 入口必须使用文档登记的 `<SKILL_DIR>/references/...` 绝对路径单命令执行，禁止前置 `cd`、拼 `&&`、管道或退回相对路径；这些入口不新增权限确认或业务操作点。未登记命令和用户项目命令仍使用所在 Markdown 目录或已确认项目根，不得借用 Skill 权限。

## 入口路由

### 当前对话的稳定会话身份

优先复用启动器在处理内测声明选择时已取得的 `AGENT_PLATFORM` 与 `SESSION_ID`；禁止重新 resolve 或生成另一份会话身份。仅尚无该值时，在首条 bootstrap/start-run 或其他业务 runtime 命令前执行一次：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry resolve-session --agent-platform "<AGENT_PLATFORM>"
```

从唯一 `ALIPAY_AIPAY_INTERNAL:SESSION_ID=<值>` marker 取得 `SESSION_ID`，只保留在当前 Agent 对话上下文，不对客、不新增业务状态。第三方项目 ID 不是会话 ID，新会话协议不拿项目 ID 定位 run；业务 PLATFORM_ID 的项目优先规则保持不变。该只读动作沿用显式 `ALIPAY_AIPAY_SESSION_ID` 或当前可靠的宿主/通用 session 来源；没有匹配的 session 来源时生成独立 UUID，不借用其他宿主残留 ID，也不使用共享默认文件。后续本文件、flow 和模块中的每条 runtime 命令均追加 `--session-id "<SESSION_ID>"`，包括用户输入计数、stage、错误恢复和 Onboarding 衔接；占位符替换为同一个已取得的值。gateway 在读取 active run 和业务参数解析前剥离该参数，并通过 `ALIPAY_AIPAY_SESSION_ID` 传给全部子进程。

同一对话不得每条命令重新 resolve 或生成会话 ID；宿主名称变化不改变已取得的 `SESSION_ID`。中断或压缩后能可靠恢复原值时继续使用，无法恢复时重新 resolve，并重新取得正式 `RUN_ID`，不得把旧 `RUN_ID` 强行绑定到新会话；新身份没有采集授权，必须重新展示内测声明并取得选择，不得沿用旧同意事实。Full Process Worker 必须接收并使用主 Agent 的同一 `SESSION_ID`，不得自行 resolve。会话 ID 只负责状态定位，不生成 `run_id`，不改变 UUID 创建、组合复用、用户输入计数、stage 唯一性或最终 summary 关闭规则。

首次路由前，Agent 在当前上下文自行回答“当前承载我的 Agent 工具叫什么”，从宿主明确身份、系统说明或当前工具上下文取得工具名称，记为 `AGENT_PLATFORM`（例如 `WorkBuddy`），不向用户提问、不把这段判断对客输出。不得把底层模型名称、项目名称、安装目录或用户举例当作当前宿主身份；无法确认时才使用 `unknown`。该事实仅保留当前对话，不写缓存；上下文丢失时重新判断。

从首条 bootstrap/start-run 起，本文件及所有 flow 登记的每条 runtime 命令均追加 `--agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`，将两个占位符分别替换为当前工具名称和根入口已取得的同一会话 ID；不使用环境变量前缀，不依赖前一次工具调用的进程环境。gateway 在业务参数解析前剥离此公共参数，规范化后传给当前进程及子进程。业务 CLI 的 `PLATFORM` 和遥测 Yuyan `d2` 优先使用本次命令的 Agent 宿名，只有该值为 `unknown` 或非法时才检查当前进程的宿主自动识别信号；继承的通用平台变量只能作为末级兼容值。这样即使进程同时残留其他宿主的 session/thread 环境变量，也不得遮蔽本次 runtime 明确提供的当前宿主。所有来源中的 `unknown` 或非法值都继续回退，不得提前终止识别。该兜底不使用宿主名称枚举或映射表：纯 ASCII 名称统一小写并去除空格、下划线和连字符，合法 Unicode 名称保留可读原文；无法安全规范化仍为 `unknown`。该参数不改变业务确认、run_id、PLATFORM_ID 或模型字段。

根 `SKILL.md` 启动器已经在读取本文件前确定本轮有效版本、完整交付 `preview.notice` 声明并取得用户的“确认”或“仅使用服务”（含专用解析器接受的明确等价表达）有效选择，随后完成本对话所需的首次 `env refresh-alipay-cli` 或命中同路径、同版本的成功刷新事实；Windows 在识别根意图后检查其余兼容环境。声明未确认时禁止读取本文件。运行时禁止再次执行自更新、读取 `normal/self-update.md` 或切换其他副本；成功事实仍有效时不重复刷新 CLI，只按原始请求识别根意图并加载入口：

| 意图 | 判定 | 入口 | 后续按需加载 |
|---|---|---|---|
| `integration_only` | 只要求代码开发、支付集成或集成排障，未同时要求产品开通 | 执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-bootstrap --root-intent integration_only [--product-type <aipay\|webpay\|apppay>] --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"` | 当前阶段、产品和语言的契约、示例与脚本 |
| `onboarding_only` | 只要求签约、入驻或产品开通，未同时要求代码开发 | 执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-bootstrap --root-intent onboarding_only [--product-type <aipay\|webpay\|apppay>] --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"` | 当前阶段的授权、查询或写分支模块 |
| `full_process` | 明确要求完整接入、一站式，或同一请求同时要求代码开发和产品开通 | `normal/full-process-routing.md` | 先 Integration，满足衔接条件后 Onboarding |

`ROOT_INTENT` 由入口路由确定，只能取 `integration_only`、`onboarding_only` 或 `full_process`。

仅真实 Windows：按上表确定根意图后、执行 bootstrap/start-run 前，读取 `normal/windows-environment.md` 并执行一次固定入口：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" windows-entry --root-intent "<ROOT_INTENT>" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"
```

用户明确要求安装并通过 Skill 完成签约/开通或完整接入时（包括正式版保留的原任务与用户随后明确同意安装内测版的选择），当前任务已授权准备所需用户级依赖，附加 `--prepare-authorized true`；仅代码开发且未授权准备依赖时先只读检查。用户明确选择站点时才附加 `--site-selected true`。这不构成登录、签约或应用写入授权。只接受退出 0、唯一 `ALIPAY_AIPAY_INTERNAL:WINDOWS_ROUTE=<JSON>` 且 rootIntent 匹配、route 为 `READY|BLOCKED|LEGACY|CODE_ONLY`。非零、缺失或冲突按 `BLOCKED` 停止，不推定站点分支。`BLOCKED` 须说明内部结果给出的实际缺项/失败原因和有限恢复动作；用户修好依赖后先只读复检，必要且获授权时才按环境文档继续准备。只有不支持的执行映射或用户明确选择站点才进入 `LEGACY`。`integration_only/full_process` 因 Git Bash、jq、CLI 等可选工具缺失、不可运行或有限准备失败时可返回 `CODE_ONLY`，继续原生 Node 代码开发，沙箱记 `VERIFY_PENDING`；完整接入的代码部分完成后停在开通前，不宣称完整接入完成。Windows 沙箱项目配置不要求精确 ACL 白名单；CLI 登录凭据目录仅在依赖登录的动作前检查实际可写性，失败只阻断该动作。Node 不足、实际存储故障、状态异常及未知错误仍阻断，不由 Agent 自行降级。所有后续 Windows runtime 命令追加 `--windows-route "<READY|BLOCKED|LEGACY|CODE_ONLY>"`；`BLOCKED` 不进入业务 bootstrap/flow。修复后只有唯一、根意图匹配的 `WINDOWS_ROUTE=READY` 才恢复快速沙箱与本地开通；`LEGACY` 保留原独立开发/手工沙箱及站点开通分支。`CODE_ONLY` 绑定本次根意图；根意图变化必须重新执行 `windows-entry`，不得继承旧分流。用户修好依赖或明确授权准备后，按 Windows 环境文档重新检查；未取得 READY 时继续独立开发，不循环安装。实际业务执行前仍复检能力。环境、沙箱准备或业务失败不修改采集选择、SESSION_ID、run_id、用户输入计数或阶段责任方。


`integration_only` 的 `integration-bootstrap` 在产品已唯一确定时必须携带 `--product-type`，并串行执行 `telemetry start-run` 与 `flow integration entry`；产品尚未唯一确定时省略产品且不创建正式 run，后续由 `integration-message start-confirm` 首次开 run并生成 `clarify_intent`。`onboarding_only` 的 `onboarding-bootstrap` 同理：产品已唯一时携带产品并先启动 run，尚未唯一时由 `mcc resolve-plan` 或 `onboarding-message plan-confirm` 首次启动。两者均为既有无业务写入动作，执行后不得重复原子命令。Windows READY 返回本地 entry 契约；Windows LEGACY 引导渲染依次使用现有平台项目 ID、正式 run_id；两者均不存在时使用已绑定 `SESSION_ID` 的稳定匿名哈希，不提前创建 run。非 Windows 返回 entry 契约。`full_process` 不使用 `integration-bootstrap`；衔接 Onboarding 也不使用带 `start-run` 的 bootstrap，仍执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message platform-entry --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"` 后按需加载 entry，避免重复 `clarify_intent`。

若 bootstrap 阶段产品尚未唯一确定，则不会补开正式 run；首个产品确认或方案确认消息在产品已唯一确定后首次触发 `start-run` 并上报 `clarify_intent`，后续只按当前 active run 计数。

只有当前宿主会话已有明确采集授权时，`start-run` 才允许确保存在 ACTIVE conversation。未选择、拒绝或采集开关关闭时仅创建阶段 run，不创建采集会话。若已获同意但启动器遗漏了会话入口，调用方应追加 `--conversation-session-id "<SESSION_ID>" --conversation-message-id "<MESSAGE_ID>" --conversation-message-json "<SANITIZED_MESSAGE_JSON>"`，由 `start-run` 自动补建会话并采集当前消息；该兜底不改变阶段 run 的创建和计数语义。

`full_process` 识别根意图后，仅在产品已唯一确定时执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry start-run --root-intent full_process --product-type <aipay|webpay|apppay> --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`；产品尚未唯一确定时不创建正式 run，后续由首个产品确认动作触发。`integration_only` 和 `onboarding_only` 已由上表各自 bootstrap 包含同一次 `start-run` 时不得重复执行。命令创建或复用后必须从唯一 `ALIPAY_AIPAY_INTERNAL:RUN_ID=<run_id>` marker 取得 `RUN_ID`，不得自行编造；同一 active 组合复用，组合变化或旧 run 已关闭时生成新的 UUID run。触发首个新 run 的消息不计入新 run；已有 active run 时，组合切换消息按下方统一前置协议先计入旧 run，随后旧 run 关闭且不补 summary，该消息不在新 run 重计。第三方项目 ID 只保留为业务 `PLATFORM_ID` 的优先项目维度，绝不反向生成逻辑 `run_id`；缺少第三方项目 ID 时，`common.sh` 仍以当前 `run_id` 作为 `PLATFORM_ID`。

遥测默认开启。`ALIPAY_AIPAY_TELEMETRY=0|false|off|no` 时不计数，不生成 event/c4/进度，不读写 outbox/status，不上传、不启动 worker、不 flush；只允许保留 `PLATFORM_ID <- run_id` 所需的最小私有 run context；用户明确拒绝采集时，另允许保存最小拒绝状态并关闭已有采集，防止重新开启开关后旧授权复活，不保存正文或生成事件。失败静默，不改变业务、消息、确认或卡点，内部 marker 不对客。`integration_only` 由 `integration_summary` 终结；`onboarding_only` 由 `onboarding_summary` 终结；`full_process` 由 `all_summary` 终结，`full_process` 的 `integration_summary` 只是中间 event。每个 stage 先在 run state 固定唯一 event，再写 outbox并同步上传，网络硬超时 3 秒；失败保留原 event 后才尝试 detached worker，绝不延迟重算 c4。补传细节见 `normal/telemetry.md`。

对话采集在用户明确同意后，以触发 Skill 的那条用户消息为起点，按原始顺序补采授权前的完整对话（含内测声明、澄清往来等助手收口消息），每条只采集一次、不重复采集，使用独立的 `conversation_id`，不携带或关联业务 `run_id`。对话遥测环境开关默认可用，但实际采集还必须取得当前会话的明确同意；`ALIPAY_AIPAY_CONVERSATION_TELEMETRY=0|false|off|no` 时只停用对话采集，不影响阶段遥测。阶段遥测继续使用 code=1005；对话遥测默认使用独立 code=1008，可由 `ALIPAY_AIPAY_CONVERSATION_CODE` 覆盖，非法值或与 1005 相同则停用对话采集。

当前会话已明确同意、全局遥测开启且对话 code 有效时，读取 `normal/conversation-telemetry.md` 的采集规则。每轮采集本轮用户消息，以及阻塞式对客消息和最终收口助手回复；过程输出、工具结果和非阻塞阶段消息跳过。用户消息先执行原有 `count-user-input`，再采集。助手消息必须在发送前采集，采集副本仅替换随后发送正文中的凭证和个人信息，其余文字与格式保持一致；不得为满足逐字一致而上传敏感原文。

运行时命令使用 `$CONVERSATION_ID` 和 `$RUN_ID` 作为 Shell 变量；协议字段统一写为 `conversation_id` 和 `run_id`。对话采集不关联业务 run，不上传工具输出、system 消息、隐藏推理或附件内容。任务完成、明确取消或退出时，先采集最终回复，再执行 `telemetry end-conversation`。采集失败静默，不阻断 Skill。

用户输入计数是入口前置职责，只从 `clarify_intent` 之后开始，到当前 `run_id` 的 `summary` 收口为止。当前 active run 期间，聊天框里**每收到一条用户消息都必须先计一次**，再做任何 Skill 相关或非 Skill 相关处理；计数不按是否与 Skill 流程强相关筛选。只要是用户在 Agent 对话框发送的消息，就按一条计，不计宿主/系统/网页授权、扫码、Skill stage、runner、工具调用或自动轮询。文字、图片/文件、空白/短确认、材料补充、确认回复和中途插话都按一条用户消息计；同一条消息含文字和图片/文件仍只计一条。`USER_INPUT_ID` 是当前 active run 内用户消息的本地幂等键：Agent 给每条新用户消息分配对话内单调序号，同一消息重试复用同一值。`USER_INPUT_ID` 不得包含或派生自用户输入内容、文件名、路径、截图/OCR、业务材料、stage 名或工具调用序号；运行时只保存其本地 hash，不上报。

`start-run` 的 `clarify_intent` 开始生成后计数器为 0，直到当前 run 最终 summary 到达。Agent 每收到一条聊天框用户消息，都必须先分配不含消息内容的 `USER_INPUT_ID`，执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry count-user-input --run-id "$RUN_ID" --input-id "$USER_INPUT_ID" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`，再解释、分类、路由、调用 runner/tool 或回复；不论消息是否与 Skill 相关，文字、图片/文件、空白、确认、中途插话和打断后输入都执行。同一消息重试复用同一 ID，runtime 只保存 `run_id + USER_INPUT_ID` hash。无 active run、缺少/错误 run ID 或 run 已关闭时成功 no-op。runner、recovery、renderer、交互回复、tool call/result 和 stage 禁止隐式计数；它们保留的业务 `--input-id` 也不是计数兜底。宿主总入口不在仓库内，因此这是 Agent 收到消息后必须遵循的唯一显式计数动作，不增加用户操作。

每个登记 stage 动作前，Agent 回顾当前可见历史并得到 `HISTORY_COUNT`；只统计本 run `clarify_intent` 后的用户角色消息，无法可靠回顾时使用 `null`。调用能生成 stage 的业务命令时追加 `--telemetry-run-id "$RUN_ID" --telemetry-history-count "$HISTORY_COUNT"`，由统一 gateway 在业务 parser 前剥离并传给唯一 stage 责任方，Agent 不再额外调用 `telemetry stage`。首次在产品/MCC 确认命令内部新建 run 时尚无 marker，该进程使用刚创建的 active run 且本次 history 固定为 0。`c4` 只承载 `user_input_after_clarify_intent`、`history_count`、`root_intent` 和按唯一非 summary event 数计算的 `progress_pct`；正式计数始终取 runtime counter，history 只诊断、不纠偏。

三种入口均只在无法确定产品时执行 `product-clarify` runner；产品明确但缺 MCC 用 `mcc-clarify`，且必须携带当前 `ROOT_INTENT`，由 runner 先创建或复用正式 telemetry run。已有经营描述、名称或编码时只执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" mcc resolve-plan --query "$MCC_SEARCH_QUERY" --product-type "$PRODUCT_TYPE" --root-intent "$ROOT_INTENT" [--semantic-terms-json "$MCC_SEMANTIC_TERMS_JSON"] [--agent-candidate-refs-json "$MCC_AGENT_CANDIDATE_REFS_JSON"] --input-id "$USER_INPUT_ID" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`。`ROOT_INTENT` 缺失或非法时 runner 必须停止，禁止依赖跨进程环境变量静默推断或在没有正式 run 的情况下继续 MCC 查询。非精确编码时，Agent 在首次调用中最多补充 12 个有原话依据的行业概念、经营对象或同义表达；本地结果为 `NONE`、候选冲突或低置信时，runner 只发出一次目录复核 marker，携带同一次 `queryMcc` 返回的当前产品 MCC 名称、描述和稳定引用，Agent 返回最多 8 个本轮目录引用后原样重跑；目录复核不新增 MCP/网络调用且不消耗语义重试预算。语义扩充仍受同一 `run + 用户输入 + 原始 query + 产品` 最多 2 次限制，复用同一 `USER_INPUT_ID`，每次只增加有原话依据且此前未使用的概念；达到上限仍为 `NONE` 时必须按既有 no-match 对客消息要求用户重新描述经营信息。禁止通过更换 query、重置参数或重复调用绕过上限，也禁止硬编码映射、自由提交 MCC code、远程语义或手拼候选。runner 按 Onboarding entry 严格校验当前产品 `queryMcc` 目录、联合排序原话、语义证据和目录引用，只为命中且 `needSpecialQual=true` 的候选调用一次 `batchQueryMcc`，并复用有效的同 run/产品候选快照。

代码开发或完整接入缺项目位置/服务端语言时，使用 `integration.context.required` 或 `integration.project_path.required` 标准消息；框架缺失不触发补问。先区分新建/复用，`PROJECT_INPUT` 保留原话。Agent 确定两类项目的真实 `PROJECT_PATH`，以 `resolve-project --project-path "$PROJECT_PATH" --intent <existing|new>` 交 runner 校验；`PROJECT_INPUT` 不得代替路径。默认新建也先选安全路径并显式传入。现有项目位置未知时先定位候选；路径经 `resolve-project` 后再用 `framework-resolve`。补齐前不初始化、装依赖或改文件。

每轮代码开发只渲染一次非阻塞 `integration.start.confirm`，覆盖步骤 1 至步骤8：代码开发校验；对应 `CUSTOMER_MESSAGE_DELIVERY_REQUIRED` marker 唯一且 stdout 可见送达后，直接进入步骤 3，不生成或复验方案 receipt。`clarify_intent` 作为 run 起点，后续用户输入只计入 `user_input_after_clarify_intent`，前置澄清/方案不计。Onboarding 只保留一次非阻塞方案展示；同样只有 marker 唯一且 stdout 已可见送达，才允许在 MCC 唯一事实有效后执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-execute-ready --product-type "$PRODUCT_TYPE" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"`。该组合动作只串行加载 `flow onboarding execute` 并执行既有 `env check`，不跨用户输入、授权页或任何写操作；执行后不得再重复单独加载 execute phase 或重复环境检查。两类方案送达后都自动继续，不等待回复。服务修改仍保留绑定当前摘要的阻塞确认。签约材料完整后直接提交，服务创建摘要后直接创建，新建应用公钥校验成功后直接提审。

扫码页非阻塞：授权最多 12 次/间隔 5 秒，公钥最多 20 次/间隔 2 秒，成功即推进；耗尽后经统一回复判定只查一次，不重启轮询。

`full_process` 代码开发方案送达前只准备项目、语言、系统分支环境和沙箱；Windows LEGACY 未明确要求当前配置时记 `VERIFY_PENDING`，不收资料。方案送达后直接进入 Integration 步骤 3，满足条件自动进 Onboarding；仅沙箱待配置，或 READY 且只剩非阻塞人工验证时可部分通过，其他缺口停在 Integration；收口保留全部待办。用户中断后重新确认当前项目和服务端语言，从实际项目扫描恢复，不恢复旧方案状态。

仅代码开发结束时提醒仍需产品开通；仅产品开通结束时提醒仍需代码开发。机器规则、消息目录、fixture 和测试不作为默认必读内容。
