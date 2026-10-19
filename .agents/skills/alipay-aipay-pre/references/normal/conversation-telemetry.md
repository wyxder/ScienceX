# 对话采集：开始、持续与结束

## 开关与范围

对话遥测环境开关默认可用，实际采集必须先取得当前宿主会话的明确同意，可用独立开关 `ALIPAY_AIPAY_CONVERSATION_TELEMETRY=0|false|off|no` 关闭；未设置或为其他值时保持开启。该开关只关闭对话采集，不影响阶段遥测。默认 code 见下方上报字段表。可用 `ALIPAY_AIPAY_CONVERSATION_CODE` 覆盖（1–16 位数字，不得与阶段遥测 code 数值相同）；显式空值、非法值或与阶段遥测 code 数值相同时停用对话入口，不影响阶段遥测。全局 `ALIPAY_AIPAY_TELEMETRY=0|false|off|no` 时，两类遥测均关闭，对话采集入口不采集、不读写、不发送；用户主动拒绝仍保存最小隐私选择，明确拒绝的例外见下一段。每条保留 d1～d5，c1 为 conversation_id，c2 仅含 sequence、role、content。正文仅脱敏凭证和个人信息，不设置采集文本或消息 JSON 的人为长度上限，不截断正文；本地缓存沿用阶段遥测的现有规则。阶段遥测原有 run 创建/关闭、计数和进度不变。

明确的用户拒绝属于隐私选择：即使遥测环境开关当前关闭，preview consent 的“仅使用服务”和 telemetry opt-out 仍保存最小拒绝状态并关闭已有采集，防止开关恢复后旧授权复活；这不采集正文、不生成事件或发起上传。环境开关关闭时的同意不写授权，恢复开关后仍需有效的明确同意。

## 开始：声明后的明确同意

声明选择由 preview consent 专用解析器处理完整原文：`确认`、`同意采集` 等明确授权与 `仅使用服务`、`不要采集会话` 等明确拒绝分别复用原有同意/拒绝存储路径。`行吧`、`1` 等含糊回复、疑问、条件和相互冲突的采集选择只输出澄清，不改变授权或开始采集；Agent 不得自行将用户原文改写为授权词。

启动器先完整交付内测声明并等待用户选择。只有 `preview consent` 返回 `CONVERSATION_CONSENT=GRANTED`，才允许创建/复用会话并采集；未回复、选择“仅使用服务”、环境开关关闭或授权保存失败时均不采集。授权状态只保存宿主会话 hash、选择、授权随机 ID 和回复幂等 hash，不保存回复正文。普通业务确认、start-run、再次引用 Skill 或自更新均不能修改拒绝状态；恢复采集必须重新展示声明并取得新的明确同意。

`SESSION_ID` 复用启动器处理声明选择时一次取得的稳定身份，后续采集和业务 runtime 命令均显式携带同一个值。宿主无身份时，启动器的 resolve-session 生成一次随机身份并沿用，不能为对话与业务分别生成。无法恢复身份时重新展示声明并取得选择，不能继承旧会话同意。上传的 `conversation_id` 仍由运行时生成独立随机 UUID，不等于 SESSION_ID 或业务 RUN_ID。

首次采集以触发 Skill 的那条用户消息为起点。用户同意采集时，按原始顺序补采授权前的完整对话：触发消息为第一条（sequence=1），随后依次是内测声明、澄清往来（如有）和同意回复，每条只采集一次，不重复采集。授权前的助手收口消息（声明、澄清）与正常轮次一样带 `--final true` 采集；其 `MESSAGE_ID` 由对应用户消息的幂等键确定性派生（如 `<触发幂等键>#notice`、`<澄清回复幂等键>#clarify`），同一对话内不得与其他消息重复。授权前内容无法可靠取得（如上下文压缩）时，从可可靠取得的最早消息开始，禁止伪造。`MESSAGE_ID` 使用消息的稳定非内容型身份，同一消息重试复用。`SANITIZED_MESSAGE_JSON` 是 `{"role":"user","content":"脱敏后的消息","has_attachments":false}`；只替换凭证与个人信息，保留其余文字及格式。原文不得拼入命令或普通临时文件，使用结构化参数安全传递脱敏 JSON。无文字附件用空文本和 true；不读取附件、OCR 或文件名。运行时兼容 `{"text":"..."}`，其余非法结构静默拒绝。

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry start-conversation --session-id "<SESSION_ID>" --message-id "$MESSAGE_ID" --message-json "$SANITIZED_MESSAGE_JSON"
```

从唯一 `ALIPAY_AIPAY_INTERNAL:CONVERSATION_ID=<uuid>` 保存标识。已 ACTIVE 时沿用原 ID；正常结束后再次明确唤起且授权仍有效时可建立新 ID。`start-run` 只在已获同意时兜底，不改变阶段 run 的计数或生命周期。采集失败时继续业务，不宣称成功。

用户选择“仅使用服务”时由 preview consent 保存拒绝；中途明确停止采集时，在采集该消息之前执行：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry opt-out --session-id "<SESSION_ID>" --input-id "$MESSAGE_ID" --conversation-id "$CONVERSATION_ID"
```

尚无 conversation_id 时省略该参数，仍可按 SESSION_ID 保存拒绝。出现 `CONVERSATION_CONSENT=DENIED` 表示已保存拒绝并禁止后续采集；失败时调用方也立即停止传入正文，业务继续，不假报保存成功。正常 `end-conversation` 不等于 opt-out，不修改同意状态。重新同意使用新的授权 ID，旧 conversation 不能复活。

对话状态使用 schema_ver=3，持有 ACTIVE/CLOSED 与创建时的 consent_id；业务 run state 不保存采集选择、对话序号或正文。会话选择、创建、消息写入和关闭使用同一宿主会话锁，不与业务 run 的锁混用。

## 持续：从同意到结束的可见对话

当前授权仍有效且采集 ACTIVE 时，以对话轮次为单位只采集每轮的头和尾：头是本轮用户消息，逐条采集当前宿主会话内的所有用户消息；尾是本轮的阻塞对客消息与最终收口助手回复；不按是否与支付或 Skill 业务相关筛选。包括澄清、补材料和临时切换话题的用户消息；同一轮内的过程说明、进行中回复、阶段性助手回复、工具结果和轮内送达的非阻塞登记对客消息（如方案、摘要、checklist 结果）一律跳过；切换话题本身不等于取消或退出。

助手侧采集对象按 Skill 既有阻塞/非阻塞概念判定，不另设分类：凡阻塞对客消息（送达后本轮即停止、等待用户回复：上下文补问、MCC/应用/服务候选选择、材料收集、阻塞确认、授权或公钥页 pending 等）一律采集；每轮最终收口回复一律采集。阻塞消息通常同时就是本轮收口回复，按一条采集，不重复。两类都适用下方"先采集、后发送"规则：带 `--final true` 的 `conversation-message` 是送达前必须执行的采集动作（任务结束时仅允许再执行下文的 end-conversation），业务交付屏障"送达前禁止调用工具"不排除本条采集，采集内容是最终正文仅替换凭证和个人信息后的版本，不改写其他内容。正文不含 system、隐藏推理或工具输出；不能把工具 stdout 当已送达的回复。已有业务计数窗口内，先执行原有 count-user-input，再采集；窗口外采集对话不补计 counter，所有交付屏障和原计数顺序优先。后续消息执行：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry conversation-message --session-id "<SESSION_ID>" --conversation-id "$CONVERSATION_ID" --message-id "$MESSAGE_ID" --message-json "$SANITIZED_MESSAGE_JSON"
```

用户暂时离开、等待补材料或审核、澄清、遇到报错或中间阶段完成都不结束采集；之后在同一宿主对话继续时沿用原 conversation_id。自更新后保留当前标识，后续命令使用新版同一路径。产品已明确时，初始化和后续消息命令可追加 `--product-type aipay|webpay|apppay`；未知则省略，d5=UNKNOWN。不读取或关联业务 run；首次授权前的补采只在上述明确同意后按原始顺序执行，后续持续采集不回填遗漏消息。

助手最终收口回复固定采用先采集、后发送：Agent 组织好本轮最终收口回复后，先执行上述 `conversation-message` 并追加 `--final true`，`--message-json` 的 content 必须是随后发送正文的脱敏版本，仅允许替换凭证和个人信息；执行采集后发送原定回复。禁止先发送后采集、发送后补采或在脱敏之外改写采集内容。assistant 角色缺少 `--final true` 时运行时静默丢弃该条记录，过程回复不得调用 conversation-message。采集成功时 stderr 产生唯一 `ALIPAY_AIPAY_INTERNAL:CONVERSATION_MESSAGE_RECORDED=<sequence>` 内部事实行；未出现该 marker 视为采集失败，遥测失败静默、不阻断 Skill，仍正常发送回复。

MESSAGE_ID 可复用用户消息的 USER_INPUT_ID；本地按 conversation_id+role+message_id 的 hash 幂等分配 sequence，消息身份本身不上报。调用方按消息在当前会话中出现的顺序依次采集：收到用户消息后，在适用的原计数动作之后采集；最终收口回复按上述先采集后发送规则采集。不得先采集后出现的消息，再补采前面的消息。sequence 在采集时分配，从 1 开始，在同一 conversation 内加锁递增，产品变化不重置；同一消息重试和已入队消息补传均保留原序号，不重新编号。消费端按 conversation_id+sequence 去重并按 sequence 排序，不依赖网络到达先后。该序号仍表示采集顺序，不能自动纠正漏采后补采的原始位置；不上传原始消息时间。

## 结束：任务完成、取消或退出

正常流程以应用发布完成为采集结束点；仅提交审核或仍有阻塞步骤不算发布完成。用户选择的任务本来不包含应用发布（例如仅代码开发，或仅产品开通且不涉及发布）时，以该任务按对应 flow 的完成条件实际完成为结束点，不扩展任务范围。每轮助手回复说完、业务报错或输出阶段性结果本身都不是结束条件。

达到上述完成条件后，最终结果回复同样按先采集、后发送处理：先通过 conversation-message（`--final true`）完成本地状态写入和 outbox 入队，尝试记录后执行以下结束命令，再发送最终回复；任一遥测动作失败仍正常交付，不等待网络：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry end-conversation --session-id "<SESSION_ID>" --conversation-id "$CONVERSATION_ID"
```

用户明确取消或退出 Skill 时，先采集该用户消息及本次结束回复（如有，`--final true`），再执行同一结束命令，结束回复在结束命令返回后才发送；不等待新的用户确认。结束命令在独立 conversation 锁内将当前采集置为 CLOSED，成功时 stderr 产生唯一 `ALIPAY_AIPAY_INTERNAL:CONVERSATION_CLOSED=true` 内部事实行，不发送额外结束事件，不增加序号或修改业务 run。重复结束幂等，结束后旧 ID 拒绝新消息；不因普通后续聊天自动调用 start-conversation。再次明确唤起 Skill 才开始新的采集。

用户一直未返回时，采集停留在已取得的消息，不推定任务完成或取消，不因沉默设置自动结束计时器，也不额外生成结束上报。

用户明确切换为正式版 `alipay-aipay` 时，视为退出预发版，按上述结束顺序关闭当前 conversation，并停止预发采集动作；不得把正式版后续对话自动纳入旧预发采集。仅暂时切换话题不适用此规则。以后再次明确唤起预发版时，按启动器检查当前声明事实与授权，再决定是否创建新的 conversation。

业务 summary 事件本身不触发关闭，以免漏掉尚未送达的最终回复，也避免 full_process 的中间 summary 提前结束采集。关闭仅停止接收新消息，此前在有效授权下已入队的消息继续按原机制补传，不等网络成功才关闭。

## 失败与宿主执行限制

遥测失败静默，不阻断 Skill。调用方在结束边界记录当前采集已结束并停止传入消息，不能因记录或关闭失败而继续采集无关聊天。结束命令失败可对旧 ID 重试，不以 start-conversation 代替结束重试。

最终收口回复采集和结束命令都在回复发送前执行，不再依赖宿主在最终回复送达后提供执行机会。采集成功但回复被宿主中断、截断或未送达时，该条记录保留在 conversation 中，属于可接受偏差，不补发、不删除；采集失败或未授权时仍正常发送回复，不得以采集成功为业务交付条件。

## 上报字段

复用 collect.alipay.com/yuyan/ 的 syncLog 通道与匿名机器维度，conversation 本地事件使用 schema_ver=5，阶段仍为 schema_ver=2。每条保留 d1～d5，沿用现有取值规则；d3 的模型归一化和 unknown 规则见 [阶段遥测说明](telemetry.md#stage-快照)，不依赖查询阶段遥测记录才获取维度。产品由明确的当前上下文传入，未知为 UNKNOWN。对话传输字段如下：

| 字段 | 消息事件 |
|---|---|
| code | 独立 code（默认 1008） |
| msg | alipay_aipay_skill_conversation |
| d1/d2/d3/d4/d5 | 系统、宿主、模型、Skill 版本、产品（可 UNKNOWN） |
| c1 | conversation_id |
| c2 | JSON 字符串，只含 sequence、role、content（脱敏正文） |

对话不携带 event_id、run_id 或 root_intent，也不生成关联记录。消费端用 c1 与 c2.sequence 组成唯一键；event_id 不再单独生成。附件和脱敏版本标志只保留在本地事件，不进入 c2；保留旧本地 schema 的 truncated 字段，新消息固定为 false。对话不上传 c3/c4，采集时间仅保留在本地事件供队列处理；统计时间窗口使用平台接收时间，补传会计入接收时段。stage 的 event_id、c1=run_id 和 c4 原白名单保持不变。模块入口为 startConversation({sessionId}, env)、recordConversationMessage(message, {conversationId, messageId, productType?}, env)、endConversation(conversationId, env)。

## 脱敏、本地缓存与共用发送

调用方仅对凭证和个人信息做语义脱敏，保留字段名、周围说明、代码结构及非敏感参数。凭证包括私钥、密码、访问 Token、API Secret/Key、授权码、验证码、认证 Cookie 或支付认证凭证；个人信息包括姓名、手机号、邮箱、身份证号、银行卡号及个人地址。自由叙述中的姓名、住址等由调用方按语义判断，脚本不能保证覆盖任意表达。

脚本在落盘和构造请求前再次过滤私钥 PEM、可解析为 PKCS#8/PKCS#1/SEC1 的无头单行 Base64 私钥、Bearer/Basic 认证值、完整 Cookie 值、带前缀的凭证字段、明确标注的个人信息字段，以及可识别的邮箱、手机号和身份证格式。普通链接、路径、代码块、应用 ID、服务 ID、MCC 编码、价格、业务状态和公钥不再整段或按长字符串过滤；其中若嵌入凭证或个人信息，仅替换敏感值。例如带 token 的 URL 保留地址和其他参数，仅遮盖 token 值。格式匹配仍可能误判或漏判，不能声称完全匿名。

采集脱敏后的完整正文，不主动截断或摘要。

独立 conversation state 只保存随机 ID、会话 hash、去重 hash、消息序号、创建时授权 ID 和 ACTIVE/CLOSED 状态；正文仅进入当前用户的 outbox。Unix/macOS/Linux 使用 `0600` 文件模式，Windows 仅检查目录实际可写，不声称已经配置 ACL。对话事件使用 .conversation 后缀保存 JSON，让只识别 .json 的旧版 worker 跳过。对话正文和解析错误不进入 stdout/stderr。code 入队时固定，后续改配置不重标旧事件。升级前未取得明确同意的旧 conversation 队列不补传；worker 只发送具有创建时授权 ID 的会话消息，后续同意不得追认旧消息。

对话上报请求不设置脚本级网络超时（timeout=0）。采集命令完成本地状态记录和入队后，尝试启动 detached 后台 worker 并立即返回，不在前台等待网络结果。后台发送也负责失败补传；若网络一直不返回结果，仅后台请求等待，不拖住 Skill 的后续命令。前台 flush-outbox 跳过对话记录，把它们留给后台 worker，避免补传重新引入前台等待。后台 worker 启动失败时保留队列，Skill 继续；后续触发时再尝试启动，不保证最终送达。操作系统、宿主和服务端仍可能中止连接；明确失败时继续按原机制保留记录补传。本地状态写入和入队仍需要少量执行时间，不能把“不等待网络”描述为完全零耗时。

除上述对话上报的超时与后台发送规则外，上传、claim 恢复、补传和队列保留/清理规则沿用 [telemetry.md 的“进度与上传”](telemetry.md#进度与上传)。state 成功但 outbox 写入失败时允许丢失且不重建，Skill 继续运行。

预发版默认遥测根目录为系统临时目录下 `alipay-aipay-telemetry/pre`，与正式版的 run、outbox、上传状态及采集授权隔离；手动设置目录/文件覆盖变量时须自行按渠道分开，不能指向同一状态位置。阶段与对话队列各自保留最多 1000 条及 7 天；对话数量不挤占阶段配额。后台先处理阶段队列，再发送对话；对话写入/启动/上传失败均不改写阶段上传状态，前台联网补传判定只统计阶段队列。对话入队外壳采用 schema_ver=2，固定采集时的 platform，跨宿主补传不改变 d2；旧 schema_ver=1 外壳仍兼容。
