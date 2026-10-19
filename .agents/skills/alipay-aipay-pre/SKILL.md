---
name: alipay-aipay-pre
description: >-
  支付宝 AI 付接入 Skill 预发版。仅在用户明确选择预发版或点名 alipay-aipay-pre 时使用，支持 AI 按量付费、AI 网页应用收款、AI 移动应用收款的代码开发、产品开通和完整接入。普通支付宝接入请求使用正式版 alipay-aipay。
---

# 支付宝 AI 付接入 Skill 启动器

本文件负责确定本轮实际使用的 Skill 版本，展示内测版使用说明并取得用户的服务/采集选择，再刷新本机 `alipay-cli`。禁止在完成下列启动协议前读取 `references/runtime-entry.md`、任一 flow、模块、消息目录或业务脚本。声明展示前和用户选择前不得采集、缓存或上传任何会话正文。用户明确同意采集后，按原始顺序补采自触发本 Skill 的用户消息起的完整对话，包括内测声明、澄清往来等授权前的助手收口消息；每条消息只采集一次，不重复采集。

## Windows 的 Node 准备例外

首次使用 `npx.cmd -y @alipay/alipay-aipay@latest install --channel pre` 前，需要本机先有能启动 npx 的 Node.js 及配套 npm/npx；若包已下载且安装器能运行，但 Windows Node 低于 18，安装器会在加载自身依赖前复用或准备独立的官方 Node LTS 并重新执行原命令一次。npm 的严格 engines 策略或过旧运行时若在包启动前拒绝执行，此包内恢复无法运行。Skill 业务仍要求 Node >=18；Node 执行 JavaScript，npm/npx 获取并启动安装包，不能互相替代。若命令无法启动，先在已授权范围内准备官方 Node.js LTS 并重新打开终端，或按组织策略让宿主发现已有工具；此时 Skill 尚未下载，不能声称包内引导已执行。不要为运行安装命令修改 PowerShell 执行策略；有配套工具时使用 `npx.cmd`。下列引导只用于已经落盘的 Skill。

仅 Windows 首次使用当前 Skill 且尚未绑定本轮 Node 时，在下面的自更新前先尝试直接执行 PATH 中的 `node.exe -p "JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch,executable:process.execPath})"`。只有退出 0、输出为唯一 JSON 对象、`platform=win32`、`arch=x64`、版本为合法且 >=18 的 SemVer、`executable` 是本机普通文件的规范化绝对路径时，才绑定该 Node 并跳过 PowerShell 文件引导。其他结果不作为可用 Node。此只读探测不执行业务、不访问会话正文、不改变采集选择。先确定当前 Skill 的规范化绝对路径 `<SKILL_DIR>`；PATH 探测未找到合格 Node 时，再用下列固定 PowerShell 引导检查常见安装目录及此前准备的用户级 Node：

```powershell
powershell.exe -NoProfile -NonInteractive -File "<SKILL_DIR>/references/normal/scripts/windows/bootstrap-node.ps1" -Mode check
```

引导只接受唯一 stderr `ALIPAY_AIPAY_INTERNAL:NODE_BOOTSTRAP=<JSON>`。`status=READY` 且退出 0 时，校验 `nodePath` 为本机普通文件的规范化绝对路径、`version` 为合法且 >=18 的 SemVer，绑定该 Node。无论经哪个只读入口取得 Node，后续所有文档中的 `node` 均用绑定的绝对路径通过宿主进程参数数组调用。在 PowerShell 中使用 `& "<NODE_EXE>" "<SKILL_DIR>/references/normal/scripts/runtime.mjs" ...`；仅替换解释器，runtime 绝对路径及参数保持不变。不能依赖引导子进程更改父进程 PATH，不能因绑定 Node 重新执行已完成的自更新或采集选择。

仅 `NEEDS_SETUP` 且当前请求已有依赖准备授权时执行一次：

```powershell
powershell.exe -NoProfile -NonInteractive -File "<SKILL_DIR>/references/normal/scripts/windows/bootstrap-node.ps1" -Mode prepare
```

用户明确修复并要求重试时，最多一次使用同一入口 `-Mode repair`。该预算按用户目录保存，不随 Agent 重入清零。自动准备最多一次；只有用户明确修复并重试才额外 repair 一次。每个官方文件的临时网络故障最多请求两次，单次 30 秒；校验失败不重试下载。安装只下载官方 LTS Windows x64 ZIP 和官方 SHA-256 清单，校验后解压到用户目录；需要修复 npm/npx 工具链时，同一引导附加 `-RequireNpm`，独立验证配套 npm 和 npx 可运行；不覆盖已有 Node、不修改系统或用户 PATH、不提权、不改变执行策略。Windows PowerShell 5.1 的有效执行策略若禁止 `.ps1`，此引导在检查常见目录前就可能被阻止，不能承诺自动发现或准备 Node。此时请用户按组织策略让宿主可发现已安装的合格 Node，或从 [Node.js 官方下载页](https://nodejs.org/en/download) 安装并重启宿主；不得以 `Invoke-Expression`、执行策略覆盖、WSL 或循环安装绕过限制。脚本安装失败、版本校验失败或返回非 READY 时也停止启动并说明实际缺项。该入口用于已经存在的 Skill 目录；首次通过 npm/npx 获取 Skill 的用户仍需先有可用 Node/npm。

## 前置启动协议

本目录的 `references/normal/json/release-channel.json` 固定当前渠道；正式版为 `stable`，预发版为 `pre`。自更新只比较 npm latest 元数据中的本渠道 Skill 版本与本地 `VERSION`，不以 npm 包版本判断是否需要更新，不切换或扫描另一渠道。缺少合法渠道元数据时保留当前版本。 本地 beta 测试版本固定使用当前版本，不查询 npm、不自动升级或转正；常规版本只接收本渠道非 beta 版本。此判断由同一自更新命令完成，Agent 不自行判断或修改 VERSION。

本次 Agent 对话首次使用 `alipay-aipay-pre` 时，先把本文件所在目录解析为规范化绝对路径 `<SKILL_DIR>`，记录一次性事实 `ALIPAY_AIPAY_PRE_SELF_UPDATE_CHECKED=true`，再执行以下单条命令。`<SKILL_DIR>` 是执行时替换的路径占位符；禁止用 shell 变量赋值、命令替换或依赖特定 shell：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" self-update check --skill-dir "<SKILL_DIR>"
```

`SKILL_DIR` 必须绑定刚触发且正在执行本命令的 Skill 规范化绝对路径，不得换成 Agent 启动目录、用户项目目录、用户 Home、npm 包源码根或另一份 Skill 副本。`VERSION` 缺失/非法或 `references/runtime-entry.md` 缺失时由本命令尝试精确修复；命令失败或 marker 无法唯一解析时按 `SELF_UPDATE:CHECK_FAILED`。

stderr 只允许出现以下一个内部终态；不得向用户展示 marker 或 npm/npx 原始输出：

- `SELF_UPDATE:UPDATED=<合法 SemVer>`：当前 Skill 目录已原子切换到新版。
- `SELF_UPDATE:SESSION_READY=<合法 SemVer>`：全局目录未更新，已核验当前会话的新版本副本及路径。
- `SELF_UPDATE:CURRENT=<合法 SemVer>`：继续当前版本。
- `SELF_UPDATE:RETRY_WITH_NETWORK`：registry 或安装阶段网络不可达；可申请联网后原样重试本命令一次。
- `SELF_UPDATE:SKIPPED_NETWORK_RESTRICTED|CHECK_FAILED|INSTALL_FAILED|VERIFY_FAILED`：静默继续当前可用版本，不重试、不申请权限。

`UPDATED` 后先废弃旧 loaded 事实，禁止继续读取更新前版本的任何业务文档，后续命令使用新版同一 `SKILL_DIR`；除 `SESSION_READY` 外的其他终态继续当前可用版本，其他终态同样不再读取本启动器或 `self-update.md` 补充规则。

`SESSION_READY` 是 Windows 目录占用或权限失败的有限恢复：只有替换前的备份/暂存准备失败，安装器才从本次精确 npm 包创建并逐文件 SHA-256 复核独立副本；不混合覆盖原目录，不更新全局安装记录。必须同时取得唯一 `ALIPAY_AIPAY_INTERNAL:SELF_UPDATE_SESSION_SKILL_DIR=<JSON 字符串>`，用已核验的绝对路径重绑 `SKILL_DIR`，明确告知“全局目录未更新，当前会话使用已校验的新版本；下次会话仍可能加载旧版”。废弃旧 loaded/CLI 刷新事实，保留本渠道自更新已检查事实，立即读取新路径的 `SKILL.md` 并继续其余启动协议，禁止再次自更新。内测版仍需按新路径/版本完成声明及服务/采集选择，安装意图不得代替采集同意。路径 marker 缺失、冲突或新入口不可读时，不切换、不声称更新成功，使用仍可用的原目录或说明入口不可用。

手工 npm 安装/更新遇到同类 Windows 故障时，只有安装器返回唯一 `SKILL_SESSION_READY` 回执并给出已校验的新 `SKILL.md` 路径才可加载该副本；仍须说明全局未更新并执行新启动协议。副本位于用户目录 `.alipay-aipay/session-skills`，不在 Agent 自动发现目录内；不注册为全局版本、不扫描其他已安装副本、不在使用中自动删除。副本自更新验证本地内容后固定本次版本，后续全局更新仍需解除原目录占用/权限问题并重新安装。

版本确定后、任何 CLI 刷新、会话解析或业务入口加载前，必须先执行以下固定声明动作；除上述必要的 Windows Node 准备外，自更新检查是此前唯一允许的动作：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" preview notice
```

命令必须成功、stdout 非空且只有一个 `ALIPAY_AIPAY_INTERNAL:CUSTOMER_MESSAGE_DELIVERY_REQUIRED=preview.notice`。下一 Agent 动作必须把 stdout 按原文完整作为独立可见消息发送给用户；禁止概括、改写、删减、只留工具面板、合并业务方案或在送达前继续工具调用。完整送达后记录当前对话中与规范化 Skill 路径绑定的 `ALIPAY_AIPAY_PRE_NOTICE_DELIVERED=true`，立即结束当前回合并等待用户确认；有效选择前禁止刷新 CLI、读取业务入口、识别根意图或执行任何业务动作。失败或 marker 缺失/重复时停止启动，不能跳过声明。首次加载、切换预发版，或声明已确认事实无法确认时必须重新展示并等待确认。声明送达和确认事实都不落盘。此声明只维护在当前预发版消息目录。

收到声明后的首条用户回复时，先从宿主明确身份确定 `AGENT_PLATFORM`（无法确认时用 `unknown`），执行一次以下只读命令取得稳定 `SESSION_ID`；同一对话已有可靠的该值时直接复用，不重新生成。该身份同时用于采集选择、对话采集和后续业务命令，不使用另一份随机 `CONVERSATION_SESSION_ID`。

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry resolve-session --agent-platform "<AGENT_PLATFORM>"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" preview consent --reply "<USER_REPLY>" --input-id "<USER_INPUT_ID>" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"
```

两条命令分别执行；`USER_REPLY` 为当前回复原文，`USER_INPUT_ID` 为当前宿主对话全程唯一的非内容型幂等键，同一回复重试复用，不同回复使用新键，不随业务 run 重置，不得借用此前业务确认。必须把完整原文交给 preview consent 专用解析器，不截取关键词或由 Agent 改写为“确认”。`确认`、`同意`、`确认采集`、`同意采集`、`允许收集我的会话内容` 等明确同意表达认可采集；`仅使用服务`、`不要采集会话`、`不同意采集` 等明确拒绝采集表达表示继续服务但不采集。允许首尾空白、常见句末标点及独立选项的【】外框；规则以脚本完整声明匹配为准，不使用通用业务确认解析器。`确认，但不同意采集` 按拒绝处理；同时明确同意和拒绝采集、疑问、条件、转述、未识别组合及 `行吧`、`1`、`OK`、`继续` 等含糊表达均要求澄清。用户未回复或明确不愿继续使用时不执行后续业务。

`PREVIEW_DECISION=UNCONFIRMED` 时，命令同时输出 `preview.consent.clarify` 对客正文及唯一对应的 `CUSTOMER_MESSAGE_DELIVERY_REQUIRED`。下一条可见回复原文完整包含该澄清消息，结束回合，等待用户重新选择；不得启动业务、创建采集或改写已有选择。用户询问声明含义时可在该回复中先解释，再原文交付澄清消息，不能把问题当作授权；用户明确取消使用时停止，不要求其继续选择。用户在此阶段明确要求切回正式版时，不再追问采集选择：使用本轮渠道切换保留且仍可读取的正式版规范化路径，记录该路径的 `ALIPAY_AIPAY_CHANNEL_OFFER_RESOLVED=true`，重新读取其 `SKILL.md` 继续原任务；不能再次展示 Windows 内测推荐。没有可验证的正式版路径时，先恢复正式版安装，不猜目录或静默使用旧副本。

- `PREVIEW_DECISION=CONFIRMED` 或 `SERVICE_ONLY`：可记录与当前路径和版本绑定的 `ALIPAY_AIPAY_PRE_NOTICE_CONFIRMED=true` 并继续业务。此声明确认事实仍只保留当前对话上下文。
- 仅 `CONVERSATION_CONSENT=GRANTED` 且没有本轮采集失败事实时，先读取 `references/normal/conversation-telemetry.md`，按其中的补采规则执行：以触发本 Skill 的那条用户消息（沿用其原始输入幂等键）为第一条消息执行 `start-conversation`；取得 `CONVERSATION_ID` 后，按原始顺序用 `conversation-message` 依次补采授权前的其余消息（内测声明、澄清往来等助手收口消息带 `--final true`），最后补采本次同意回复。授权前内容因上下文压缩等原因无法可靠取得时，从可可靠取得的最早消息开始，禁止伪造。已 ACTIVE 时沿用 `CONVERSATION_ID`，不重复初始化、不重复采集。
- `CONVERSATION_CONSENT=DENIED|DISABLED|UNAVAILABLE`：当前对话停止传入会话正文，不调用采集或自动补建入口，业务照常继续；状态保存失败也按不采集处理，不宣称已保存选择。运行时的启动和消息入口还会校验持久化授权，未同意或已拒绝均不能采集。

`仅使用服务` 及等价明确拒绝的选择按宿主会话 hash 独立保存，不随业务 run 结束、再次引用 Skill 或自更新清除。用户之后明确要求重新同意采集时，重新展示本声明并等待新的 `确认` 或明确同意采集的等价回复，再执行同一 consent 命令；不得把普通业务确认当成重新授权。用户中途要求停止采集时，立即执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry opt-out --input-id "<USER_INPUT_ID>" --session-id "<SESSION_ID>"`（有 ID 时附加 `--conversation-id "<CONVERSATION_ID>"`），停止传入后续正文；只有 `CONVERSATION_CONSENT=DENIED` 才可宣称选择已保存，失败不阻断业务。

同一对话中确认事实、路径和当前预发版本均未变化时，材料回复、恢复、再次引用和子流程衔接不重复展示声明。路径或版本变化、上下文压缩导致确认事实不可用时重新展示并等待选择，但不得清除原有采集拒绝状态。会话身份无法可靠恢复时重新展示声明并取得选择，绝不根据旧确认事实自动授权新的会话身份。

版本确定后，若当前上下文没有与规范化 `SKILL_DIR`、合法 `VERSION` 绑定的 `ALIPAY_AIPAY_PRE_CLI_REFRESHED=true`，必须刷新一次 `alipay-cli`；不得因自更新已检查而跳过。仅唯一终态 `READY` 可在当前对话上下文记录该成功事实、路径和版本，不写缓存或业务状态；三者仍可用且一致时，后续根触发、确认、补材料、候选选择、恢复、中断继续和 Full Process 衔接均不重复刷新。

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" env refresh-alipay-cli
```

Windows 同样执行上述刷新命令；内部在独立系统 PowerShell 进程中设置 `ALIPAY_CLI_BIN="$HOME\.local\bin"`、`ALIPAY_CLI_SKIP_VERIFY=true`，通过 `irm https://opengw.alipay.com/alipaycli/install_ps1 | iex` 调用正式安装器，再独立验证安装的 EXE，不要求 Git Bash/jq 先就绪，不固定 CLI 版本。该跳过校验设置与 Unix/macOS/Linux 的现行安装指令一致；官方 PowerShell 安装器会尝试更新用户 PATH。Windows 其余依赖在业务入口确定根意图后按 `references/normal/windows-environment.md` 检查，不因依赖失败关闭遥测、重建会话或跳过采集选择。

stderr 只允许一个 `ALIPAY_AIPAY_INTERNAL:ALIPAY_CLI_REFRESH=<READY|RETRY_WITH_NETWORK|RETRY_WITH_LOCAL_FS_PERMISSION|FAILED|VERIFY_FAILED>`，stdout 必须为空，安装器及版本输出不得对客。前两种重试终态分别只允许取得网络权限或 `~/.local/bin` 写权限后原样重试一次；其他终态静默继续，并以之后环境检查和业务脚本的实际 CLI 可用性为准。路径或版本变化、上下文压缩导致事实不可用、用户明确要求刷新，或环境检查证明 CLI 缺失/损坏时清除旧事实并按同一预算重试；非 `READY` 不得循环。

完成本次所需刷新或命中成功事实后，只完整读取同一 `SKILL_DIR` 的 `references/runtime-entry.md`，在当前上下文记录 `ALIPAY_AIPAY_PRE_RUNTIME_ENTRY_LOADED=true` 和规范化路径，再按原请求路由。同一对话后续确认、补材料、候选选择、恢复、中断继续、重复触发和 Full Process 衔接，入口事实存在、路径未变且入口规则仍在时，跳过版本检查和入口重读。仅 `UPDATED|SESSION_READY`、路径变化或上下文压缩导致规则不可用时重读；事实不落盘。
